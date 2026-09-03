"""
Stage 12: Confidence-Aware 3D Reconstruction (Phase 12).

Assigns an evidence-based confidence level to every reconstructed region of the 3D digital twin.

Inputs:
  - Frame visibility (unoccluded projection into calibrated cameras)
  - Number of observations (redundancy)
  - Camera viewing angles (orthogonality to surface normal)
  - Feature / matching quality (reprojection residuals)
  - Depth / disparity confidence
  - Point density (local surface sampling density)
  - Texture quality (sharpness, exposure)
  - Reconstruction consistency (stereo intersection parallax)

Three-Tier Classification:
  - HIGH CONFIDENCE (>= 0.70): Strong visual evidence & multi-view rays (Green: #22c55e)
  - MEDIUM CONFIDENCE (0.35 - 0.70): Partial or weak observations (Yellow: #eab308)
  - UNKNOWN (< 0.35 or N_obs = 0): Insufficient or zero direct visual evidence (Slate: #64748b)

CRITICAL REQUIREMENT:
  UNKNOWN regions must NOT be replaced with invented geometry.
  Reconstructed geometry is strictly distinguished from estimated/unobserved regions.
"""
import json
import logging
import time
from pathlib import Path
from typing import Dict, Any, List

import numpy as np

from backend.app.pipeline.base import BaseStage, StageExecutionError
from backend.app.schemas.stage import StageInput, StageOutput
from backend.app.pipeline.stages.confidence_engine import ConfidenceEstimationEngine

logger = logging.getLogger("uav_reconstruction.stage.confidence")


class ConfidenceEstimationStage(BaseStage):
    stage_name = "confidence_estimation"
    stage_order = 12
    description = (
        "Phase 12: Fuses 8 photogrammetric evidence streams to classify 3D geometry into "
        "High Confidence, Medium Confidence, and Unknown tiers without inventing synthetic geometry."
    )

    def execute(self, input_data: StageInput) -> StageOutput:
        start_time = time.time()
        ckpt_dir = Path(input_data.checkpoint_dir)
        ckpt_dir.mkdir(parents=True, exist_ok=True)
        prev_dir = Path(input_data.previous_checkpoint_dir or input_data.checkpoint_dir)

        # ── 1. Resolve 3D Mesh Artifact ─────────────────────────────────
        mesh_path = (
            input_data.input_artifacts.get("georeferenced_model_glb") or
            input_data.input_artifacts.get("textured_model_glb") or
            input_data.input_artifacts.get("model_glb") or
            input_data.input_artifacts.get("model_clean_ply") or
            input_data.input_artifacts.get("dense_ply") or
            input_data.input_artifacts.get("sparse_ply")
        )

        if not mesh_path or not Path(mesh_path).exists():
            for cname in [
                "georeferenced_model.glb", "textured_model.glb", "model.glb",
                "model_clean.ply", "mesh_textured.obj", "mesh.obj", "dense.ply"
            ]:
                cand = prev_dir / cname
                if cand.exists():
                    mesh_path = str(cand)
                    break

        if not mesh_path or not Path(mesh_path).exists():
            raise StageExecutionError(
                self.stage_name,
                "Missing 3D model artifact (georeferenced_model.glb or model_clean.ply)."
            )

        # ── 2. Resolve Camera Poses Artifact ─────────────────────────────
        poses_path = input_data.input_artifacts.get("camera_poses")
        if not poses_path or not Path(poses_path).exists():
            for cname in ["camera_poses.json", "trajectory.json"]:
                for search_dir in [prev_dir, prev_dir.parent / "georeferencing", prev_dir.parent / "texture_mapping"]:
                    cand = search_dir / cname
                    if cand.exists():
                        poses_path = str(cand)
                        break
                if poses_path and Path(poses_path).exists():
                    break

        if not poses_path or not Path(poses_path).exists():
            raise StageExecutionError(self.stage_name, "Missing camera_poses.json artifact.")

        # ── 3. Resolve Optional Dense Point Cloud ────────────────────────
        dense_ply = (
            input_data.input_artifacts.get("dense_point_cloud_ply") or
            input_data.input_artifacts.get("dense_ply")
        )
        dense_path = Path(dense_ply) if dense_ply and Path(dense_ply).exists() else None

        # ── 4. Execute Confidence Estimation Engine ──────────────────────
        try:
            results = ConfidenceEstimationEngine.execute_pipeline(
                mesh_path=Path(mesh_path),
                poses_path=Path(poses_path),
                output_dir=ckpt_dir,
                dense_points_path=dense_path,
                parameters=input_data.parameters
            )
        except Exception as e:
            logger.error(f"ConfidenceEstimationEngine failed: {e}", exc_info=True)
            raise StageExecutionError(self.stage_name, f"Confidence estimation failed: {str(e)}")

        artifacts = results["artifacts"]
        report = results["report"]
        stats = report["tier_statistics"]
        area_m2 = report["surface_area_metrics_m2"]
        elapsed_sec = round(time.time() - start_time, 2)

        return StageOutput(
            stage_name=self.stage_name,
            status="completed",
            checkpoint_dir=input_data.checkpoint_dir,
            artifacts=artifacts,
            metrics={
                "high_confidence_percentage": stats["high_confidence_percentage"],
                "medium_confidence_percentage": stats["medium_confidence_percentage"],
                "unknown_percentage": stats["unknown_percentage"],
                "directly_measured_percentage": report["measured_vs_estimated_breakdown"]["directly_measured_percentage"],
                "total_surface_area_m2": area_m2["total_surface_area_m2"],
                "high_confidence_area_m2": area_m2["high_confidence_area_m2"],
                "unknown_area_m2": area_m2["unknown_area_m2"],
                "zero_geometry_invented": True,
                "processing_time_sec": elapsed_sec
            },
            summary=(
                f"Evaluated multi-factor evidence confidence: {stats['high_confidence_percentage']:.1f}% High, "
                f"{stats['medium_confidence_percentage']:.1f}% Medium, {stats['unknown_percentage']:.1f}% Unknown. "
                f"Zero geometry invented for unobserved regions. Exported confidence_map.glb and confidence_report.json."
            )
        )


def standalone_test():
    """
    Independently testable verification routine for Phase 12: Confidence-Aware 3D Reconstruction.
    """
    import tempfile
    import shutil
    import trimesh

    test_dir = Path(tempfile.mkdtemp(prefix="phase12_conf_test_"))
    try:
        prev_dir = test_dir / "georef_stage_checkpoint"
        prev_dir.mkdir(parents=True)
        ckpt_dir = test_dir / "confidence_checkpoint"
        ckpt_dir.mkdir(parents=True)

        # 1. Synthesize 3D mesh model
        box = trimesh.creation.box(extents=[10.0, 10.0, 3.0])
        mesh_glb_path = prev_dir / "georeferenced_model.glb"
        box.export(str(mesh_glb_path), file_type="glb")

        # 2. Synthesize camera poses
        n_cams = 4
        poses = []
        for i in range(n_cams):
            pos = [float(i * 4.0 - 6.0), -12.0, 15.0]
            # Looking towards center
            fwd = np.array([0.0, 0.0, 0.0]) - np.array(pos)
            fwd = fwd / np.linalg.norm(fwd)
            right = np.array([1.0, 0.0, 0.0])
            down = np.cross(fwd, right)
            down = down / np.linalg.norm(down)
            right = np.cross(down, fwd)
            R = np.vstack([right, down, fwd])
            t = (-R @ np.array(pos)).tolist()

            poses.append({
                "camera_id": i,
                "frame_id": f"cam_{i:03d}",
                "position": pos,
                "R": R.tolist(),
                "t": t,
                "K": [[400.0, 0.0, 320.0], [0.0, 400.0, 240.0], [0.0, 0.0, 1.0]],
                "width": 640,
                "height": 480,
                "sharpness": 85.0,
                "quality_score": 0.90
            })

        poses_path = prev_dir / "camera_poses.json"
        with open(poses_path, "w", encoding="utf-8") as f:
            json.dump({"poses": poses}, f)

        stage_input = StageInput(
            mission_id="test_conf_mission",
            job_id="test_conf_job",
            stage_name="confidence_estimation",
            checkpoint_dir=str(ckpt_dir),
            previous_checkpoint_dir=str(prev_dir),
            input_artifacts={
                "georeferenced_model_glb": str(mesh_glb_path),
                "camera_poses": str(poses_path)
            },
            flight_altitude_m=35.0
        )

        stage = ConfidenceEstimationStage()
        print("[Standalone Test] Executing ConfidenceEstimationStage (Phase 12)...")
        output = stage.execute(stage_input)

        assert output.status == "completed"

        # Check required artifacts
        glb_file = Path(output.artifacts["confidence_map_glb"])
        ply_file = Path(output.artifacts["confidence_ply"])
        report_file = Path(output.artifacts["confidence_report_json"])
        atlas_file = Path(output.artifacts["confidence_atlas_png"])

        assert glb_file.exists() and glb_file.stat().st_size > 500, "confidence_map.glb must exist"
        assert ply_file.exists(), "confidence_map.ply must exist"
        assert report_file.exists(), "confidence_report.json must exist"
        assert atlas_file.exists(), "confidence_atlas.png must exist"

        # Check GLB magic header
        with open(glb_file, "rb") as f:
            assert f.read(4) == b"glTF", "Must have glTF header"

        # Check report data
        with open(report_file, "r") as f:
            rep = json.load(f)

        assert "tier_statistics" in rep
        assert "surface_area_metrics_m2" in rep
        assert "measured_vs_estimated_breakdown" in rep
        assert rep["scientific_integrity_guarantee"]["invented_geometry_for_unknown"] is False

        print(f"[Standalone Test] Success! High Confidence: {rep['tier_statistics']['high_confidence_percentage']}%")
        print(f"Medium Confidence: {rep['tier_statistics']['medium_confidence_percentage']}%")
        print(f"Unknown: {rep['tier_statistics']['unknown_percentage']}%")
        print(f"Invented Geometry: {rep['scientific_integrity_guarantee']['invented_geometry_for_unknown']}")
    finally:
        shutil.rmtree(test_dir, ignore_errors=True)


if __name__ == "__main__":
    standalone_test()
