"""
Stage 8: Dense Depth and Dense Point Cloud Reconstruction (Phase 8).

Inputs:
  - registered keyframes (keyframes.json)
  - camera poses (camera_poses.json from Phase 7)
  - camera intrinsics (camera_intrinsics.json)
  - sparse point cloud (sparse_point_cloud.ply from Phase 7)

Execution:
  1. Computes multi-view dense depth maps using MultiViewStereoEngine (or experimental DUSt3R).
  2. Generates per-pixel photometric and geometric confidence maps.
  3. Fuses multi-view depth observations into a unified 3D Cartesian point cloud.
  4. Filters invalid depths, low-confidence observations, and statistical outliers.
  5. Computes quantitative density metrics (points count, depth confidence, density per m^3, runtime).

Artifacts Generated:
  - dense_point_cloud.ply (and backward-compatible dense.ply)
  - depth_maps/ (per-view .npy metric depth + color-mapped .jpg visualizations)
  - dense_confidence/ (per-view .png 8-bit confidence maps)
  - dense_metrics.json
"""
import json
import logging
import time
from pathlib import Path
from typing import List, Dict, Any, Optional
import cv2
import numpy as np

from backend.app.pipeline.base import BaseStage, StageExecutionError
from backend.app.schemas.stage import StageInput, StageOutput
from backend.app.pipeline.stages.dense_engine import (
    BaseDenseDepthEngine,
    MultiViewStereoEngine,
    DUSt3RGeometricPriorEngine,
    DenseDepthFusion,
    write_ply,
    CUDA_AVAILABLE
)

logger = logging.getLogger("uav_reconstruction.stage.dense")


class DensePointCloudStage(BaseStage):
    stage_name = "dense_point_cloud"
    stage_order = 8
    description = (
        "Phase 8 Dense Reconstruction: computes per-view stereo depth and confidence maps, "
        "fuses depth observations into a unified metric dense point cloud, and filters outliers."
    )

    def execute(self, input_data: StageInput) -> StageOutput:
        start_time = time.time()
        ckpt_dir = Path(input_data.checkpoint_dir)
        ckpt_dir.mkdir(parents=True, exist_ok=True)
        prev_dir = Path(input_data.previous_checkpoint_dir or input_data.checkpoint_dir)

        # ── 1. Create Output Directories ─────────────────────────────────
        depth_maps_dir = ckpt_dir / "depth_maps"
        depth_maps_dir.mkdir(parents=True, exist_ok=True)

        confidence_dir = ckpt_dir / "dense_confidence"
        confidence_dir.mkdir(parents=True, exist_ok=True)

        # ── 2. Resolve Input Artifacts ───────────────────────────────────
        poses_path = input_data.input_artifacts.get("camera_poses")
        if not poses_path or not Path(poses_path).exists():
            for cname in ["camera_poses.json", "trajectory.json"]:
                cand = prev_dir / cname
                if cand.exists():
                    poses_path = str(cand)
                    break

        intrinsics_path = input_data.input_artifacts.get("camera_intrinsics")
        if not intrinsics_path or not Path(intrinsics_path).exists():
            cand = prev_dir / "camera_intrinsics.json"
            if cand.exists():
                intrinsics_path = str(cand)

        sparse_ply_path = input_data.input_artifacts.get("sparse_point_cloud_ply") or input_data.input_artifacts.get("sparse_ply")
        if not sparse_ply_path or not Path(sparse_ply_path).exists():
            for cname in ["sparse_point_cloud.ply", "sparse.ply"]:
                cand = prev_dir / cname
                if cand.exists():
                    sparse_ply_path = str(cand)
                    break

        if not poses_path or not Path(poses_path).exists():
            raise StageExecutionError(self.stage_name, "Missing camera_poses.json artifact from Phase 7.")
        if not intrinsics_path or not Path(intrinsics_path).exists():
            raise StageExecutionError(self.stage_name, "Missing camera_intrinsics.json artifact.")

        with open(poses_path, "r", encoding="utf-8") as f:
            poses_data = json.load(f)
        with open(intrinsics_path, "r", encoding="utf-8") as f:
            intrinsics_data = json.load(f)

        poses = poses_data.get("poses", poses_data if isinstance(poses_data, list) else [])
        if len(poses) < 2:
            raise StageExecutionError(self.stage_name, "At least 2 registered camera poses required for dense reconstruction.")

        K = np.array(intrinsics_data["K"], dtype=np.float64)
        flight_alt = float(input_data.flight_altitude_m or 50.0)

        # Count sparse points if available
        sparse_points_count = 0
        if sparse_ply_path and Path(sparse_ply_path).exists():
            try:
                with open(sparse_ply_path, "r", encoding="utf-8") as f:
                    for line in f:
                        if line.startswith("element vertex"):
                            sparse_points_count = int(line.split()[-1])
                            break
            except Exception:
                pass

        # ── 3. Initialize Dense Reconstruction Engine ────────────────────
        use_learned_prior = bool(input_data.parameters.get("enable_learned_prior", False))
        mvs_engine = MultiViewStereoEngine(use_gpu=True)
        if use_learned_prior:
            logger.info("Using DUSt3RGeometricPriorEngine with geometric verification...")
            dense_engine: BaseDenseDepthEngine = DUSt3RGeometricPriorEngine(fallback_engine=mvs_engine)
        else:
            dense_engine = mvs_engine

        device_used = "cuda" if CUDA_AVAILABLE else "cpu"
        logger.info(f"Computing per-view dense depth maps across {len(poses)} views (Device: {device_used})...")

        # ── 4. Compute Per-View Depth & Confidence Maps ──────────────────
        views_data: List[Dict[str, Any]] = []
        depth_artifact_files: List[str] = []
        conf_artifact_files: List[str] = []
        confidences_all: List[float] = []

        for i in range(len(poses)):
            ref_cam = poses[i]
            # Select adjacent camera for baseline stereo
            src_idx = i + 1 if i + 1 < len(poses) else i - 1
            src_cam = poses[src_idx]

            ref_img_path = ref_cam.get("filepath")
            src_img_path = src_cam.get("filepath")
            if not ref_img_path or not Path(ref_img_path).exists():
                continue
            if not src_img_path or not Path(src_img_path).exists():
                continue

            ref_img = cv2.imread(ref_img_path)
            src_img = cv2.imread(src_img_path)
            if ref_img is None or src_img is None:
                continue

            R1 = np.array(ref_cam["R"], dtype=np.float64)
            t1 = np.array(ref_cam["t"], dtype=np.float64).reshape(3, 1)
            R2 = np.array(src_cam["R"], dtype=np.float64)
            t2 = np.array(src_cam["t"], dtype=np.float64).reshape(3, 1)

            R_rel = R2 @ R1.T
            t_rel = t2 - R_rel @ t1

            # Estimate depth & confidence
            depth_map, conf_map = dense_engine.estimate_depth_and_confidence(
                ref_img_bgr=ref_img,
                src_img_bgr=src_img,
                K=K,
                R_rel=R_rel,
                t_rel=t_rel,
                flight_altitude_m=flight_alt,
                params=input_data.parameters
            )

            frame_id = ref_cam.get("frame_id", f"frame_{i:04d}")

            # Save raw metric depth as float32 .npy
            depth_npy_path = depth_maps_dir / f"depth_{frame_id}.npy"
            np.save(str(depth_npy_path), depth_map)

            # Save normalized color-mapped visualization for inspection
            valid_d = depth_map[depth_map > 0]
            if len(valid_d) > 0:
                d_min, d_max = np.percentile(valid_d, 5), np.percentile(valid_d, 95)
                norm_d = np.clip((depth_map - d_min) / max(d_max - d_min, 1e-3), 0.0, 1.0)
                d_vis = cv2.applyColorMap((norm_d * 255).astype(np.uint8), cv2.COLORMAP_TURBO)
                d_vis[depth_map <= 0] = 0
            else:
                d_vis = np.zeros_like(ref_img)

            depth_vis_path = depth_maps_dir / f"depth_vis_{frame_id}.jpg"
            cv2.imwrite(str(depth_vis_path), d_vis)
            depth_artifact_files.append(str(depth_vis_path))

            # Save 8-bit confidence map
            conf_uint8 = (conf_map * 255.0).astype(np.uint8)
            conf_png_path = confidence_dir / f"conf_{frame_id}.png"
            cv2.imwrite(str(conf_png_path), conf_uint8)
            conf_artifact_files.append(str(conf_png_path))

            if np.any(conf_map > 0):
                confidences_all.extend(conf_map[conf_map > 0].tolist())

            views_data.append({
                "frame_id": frame_id,
                "depth_map": depth_map,
                "confidence_map": conf_map,
                "image_bgr": ref_img,
                "R": R1,
                "t": t1
            })

        # ── 5. Fuse Multi-View Depth into Unified Point Cloud ─────────────
        logger.info(f"Fusing multi-view depth maps from {len(views_data)} camera viewpoints...")
        fused_pts, fused_clrs, fused_confs = DenseDepthFusion.fuse_views(
            views_data=views_data,
            intrinsics_K=K,
            params=input_data.parameters
        )

        # Integrity check: Ensure adequate dense point generation
        if len(fused_pts) < 100:
            raise StageExecutionError(
                self.stage_name,
                f"Dense depth fusion generated only {len(fused_pts)} points. Check image overlap, baseline, and scene texture."
            )

        # ── 6. Write Required Artifacts ──────────────────────────────────
        dense_ply_main = ckpt_dir / "dense_point_cloud.ply"
        dense_ply_compat = ckpt_dir / "dense.ply"
        write_ply(dense_ply_main, fused_pts, fused_clrs)
        write_ply(dense_ply_compat, fused_pts, fused_clrs)

        elapsed_sec = round(time.time() - start_time, 2)
        mean_conf = round(float(np.mean(fused_confs)), 3) if len(fused_confs) > 0 else 0.75
        median_conf = round(float(np.median(fused_confs)), 3) if len(fused_confs) > 0 else 0.75

        # Point Density Calculation: points per cubic meter of bounding volume
        pt_span = np.ptp(fused_pts, axis=0)
        volume_m3 = max(1.0, float(pt_span[0] * pt_span[1] * pt_span[2]))
        density_pts_m3 = round(float(len(fused_pts) / volume_m3), 1)

        density_gain = round(float(len(fused_pts) / max(1, sparse_points_count)), 1) if sparse_points_count > 0 else 1.0

        metrics_manifest = {
            "mission_id": input_data.mission_id,
            "job_id": input_data.job_id,
            "number_of_dense_points": len(fused_pts),
            "sparse_points_count": sparse_points_count,
            "density_multiplier": f"{density_gain}x denser than sparse SfM",
            "depth_confidence": {
                "mean": mean_conf,
                "median": median_conf,
                "distribution": {
                    "high_confidence_pct": round(float(np.mean(fused_confs >= 0.70) * 100), 1) if len(fused_confs) > 0 else 0,
                    "medium_confidence_pct": round(float(np.mean((fused_confs >= 0.45) & (fused_confs < 0.70)) * 100), 1) if len(fused_confs) > 0 else 0
                }
            },
            "point_density": {
                "points_per_m3": density_pts_m3,
                "bounding_box_meters": {
                    "span_x": round(float(pt_span[0]), 2),
                    "span_y": round(float(pt_span[1]), 2),
                    "span_z": round(float(pt_span[2]), 2)
                }
            },
            "processing_time_sec": elapsed_sec,
            "hardware_acceleration": {
                "device": device_used,
                "cuda_available": CUDA_AVAILABLE
            },
            "experimental_learned_prior": {
                "enabled": use_learned_prior,
                "engine": "DUSt3RGeometricPriorEngine" if use_learned_prior else "MultiViewStereoEngine"
            },
            "views_processed": len(views_data)
        }

        dense_metrics_path = ckpt_dir / "dense_metrics.json"
        with open(dense_metrics_path, "w", encoding="utf-8") as f:
            json.dump(metrics_manifest, f, indent=2)

        # Backward compatibility for mesh generation
        legacy_meta_path = ckpt_dir / "dense_metadata.json"
        with open(legacy_meta_path, "w", encoding="utf-8") as f:
            json.dump({
                "dense_points_count": len(fused_pts),
                "bounding_box_min": np.min(fused_pts, axis=0).tolist(),
                "bounding_box_max": np.max(fused_pts, axis=0).tolist()
            }, f, indent=2)

        return StageOutput(
            stage_name=self.stage_name,
            status="completed",
            checkpoint_dir=input_data.checkpoint_dir,
            artifacts={
                "dense_point_cloud_ply": str(dense_ply_main),
                "dense_ply": str(dense_ply_compat),
                "depth_maps_dir": str(depth_maps_dir),
                "dense_confidence_dir": str(confidence_dir),
                "dense_metrics": str(dense_metrics_path),
                "dense_metadata": str(legacy_meta_path)
            },
            metrics={
                "number_of_dense_points": len(fused_pts),
                "depth_confidence": mean_conf,
                "point_density_pts_m3": density_pts_m3,
                "processing_time_sec": elapsed_sec,
                "device": device_used
            },
            summary=(
                f"Generated {len(fused_pts):,} dense points ({density_gain}x sparse density) in {elapsed_sec}s "
                f"(Device: {device_used}). Mean Depth Confidence: {mean_conf}."
            )
        )


def standalone_test():
    """
    Independently testable routine for Phase 8 Dense Reconstruction.
    Creates synthetic multi-view keyframes, runs DensePointCloudStage,
    and verifies all required artifacts and metrics.
    """
    import tempfile
    import shutil

    test_dir = Path(tempfile.mkdtemp(prefix="phase8_dense_test_"))
    try:
        kf_dir = test_dir / "keyframes"
        kf_dir.mkdir(parents=True)
        ckpt_dir = test_dir / "checkpoint_dense"
        ckpt_dir.mkdir(parents=True)

        keyframes = []
        poses = []
        np.random.seed(42)

        # Textured background canvas with multiple objects for dense stereo
        canvas = np.zeros((360, 480, 3), dtype=np.uint8)
        canvas[:] = (50, 60, 70)

        for idx in range(25):
            cx = 60 + (idx % 5) * 80
            cy = 50 + (idx // 5) * 60
            cv2.circle(canvas, (cx, cy), 15, ((idx * 45) % 255, (idx * 65) % 255, 220), -1)
            cv2.putText(canvas, f"O{idx}", (cx - 10, cy + 5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)

        for i in range(3):
            fp = kf_dir / f"kf_{i:04d}.jpg"
            # Horizontal baseline translation
            shift_x = i * 14
            M = np.float32([[1, 0, -shift_x], [0, 1, 0]])
            img = cv2.warpAffine(canvas, M, (480, 360), borderMode=cv2.BORDER_REPLICATE)
            cv2.imwrite(str(fp), img)

            keyframes.append({
                "keyframe_id": i,
                "frame_id": f"frame_{i:04d}",
                "filename": fp.name,
                "filepath": str(fp)
            })

            poses.append({
                "keyframe_id": i,
                "frame_id": f"frame_{i:04d}",
                "filename": fp.name,
                "filepath": str(fp),
                "R": np.eye(3).tolist(),
                "t": [-i * 0.8, 0.0, 0.0],
                "position": [i * 0.8, 0.0, 0.0]
            })

        kf_manifest = kf_dir / "keyframes.json"
        with open(kf_manifest, "w", encoding="utf-8") as f:
            json.dump({"keyframes": keyframes}, f)

        poses_path = kf_dir / "camera_poses.json"
        with open(poses_path, "w", encoding="utf-8") as f:
            json.dump({"poses": poses}, f)

        intrinsics_path = kf_dir / "camera_intrinsics.json"
        K = [
            [450.0, 0.0, 240.0],
            [0.0, 450.0, 180.0],
            [0.0, 0.0, 1.0]
        ]
        with open(intrinsics_path, "w", encoding="utf-8") as f:
            json.dump({"K": K, "image_width": 480, "image_height": 360}, f)

        stage_input = StageInput(
            mission_id="test_dense_mission",
            job_id="test_dense_job",
            stage_name="dense_point_cloud",
            checkpoint_dir=str(ckpt_dir),
            previous_checkpoint_dir=str(kf_dir),
            input_artifacts={
                "keyframes_manifest": str(kf_manifest),
                "camera_poses": str(poses_path),
                "camera_intrinsics": str(intrinsics_path)
            },
            flight_altitude_m=35.0,
            parameters={"num_disparities": 32, "block_size": 5, "min_confidence_score": 0.30}
        )

        stage = DensePointCloudStage()
        print("[Standalone Test] Executing DensePointCloudStage (Phase 8)...")
        output = stage.execute(stage_input)

        assert output.status == "completed"

        # Check required output artifacts
        dense_ply = Path(output.artifacts["dense_point_cloud_ply"])
        depth_dir = Path(output.artifacts["depth_maps_dir"])
        conf_dir = Path(output.artifacts["dense_confidence_dir"])
        metrics_file = Path(output.artifacts["dense_metrics"])

        assert dense_ply.exists(), "dense_point_cloud.ply must exist"
        assert depth_dir.exists(), "depth_maps/ directory must exist"
        assert conf_dir.exists(), "dense_confidence/ directory must exist"
        assert metrics_file.exists(), "dense_metrics.json must exist"

        # Verify depth maps and confidence maps were created
        depth_files = list(depth_dir.glob("*.npy"))
        conf_files = list(conf_dir.glob("*.png"))
        assert len(depth_files) > 0, "Must generate per-view depth maps"
        assert len(conf_files) > 0, "Must generate per-view confidence maps"

        with open(metrics_file) as f:
            met = json.load(f)

        assert "number_of_dense_points" in met
        assert "depth_confidence" in met
        assert "point_density" in met
        assert "processing_time_sec" in met
        assert met["number_of_dense_points"] > 100

        print(f"[Standalone Test] Success! Generated {met['number_of_dense_points']} dense points in {met['processing_time_sec']}s.")
        print(f"Mean Confidence: {met['depth_confidence']['mean']}, Density: {met['point_density']['points_per_m3']} pts/m^3")
    finally:
        shutil.rmtree(test_dir, ignore_errors=True)


if __name__ == "__main__":
    standalone_test()
