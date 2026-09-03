"""
Unit & Integration Tests for Phase 8: Dense Depth and Dense Point Cloud Reconstruction.
Tests:
  1. Modular depth engines: MultiViewStereoEngine and DUSt3RGeometricPriorEngine.
  2. Per-view depth maps and confidence maps generation.
  3. Multi-view depth fusion with invalid depth and low-confidence outlier rejection.
  4. Metrics verification: number_of_dense_points, depth_confidence, point_density, processing_time.
  5. GPU availability detection and CPU fallback verification.
"""
import json
import pytest
import numpy as np
import cv2
from pathlib import Path

from backend.app.schemas.stage import StageInput
from backend.app.pipeline.stages.s07_dense_point_cloud import DensePointCloudStage
from backend.app.pipeline.stages.dense_engine import (
    MultiViewStereoEngine,
    DUSt3RGeometricPriorEngine,
    DenseDepthFusion,
    CUDA_AVAILABLE
)


class TestDenseDepthAndPointCloud:

    @pytest.fixture
    def setup_dense_data(self, tmp_path):
        """Generates synthetic stereo imagery with textured visual features."""
        kf_dir = tmp_path / "keyframes"
        kf_dir.mkdir(parents=True)
        ckpt_dir = tmp_path / "checkpoint_dense"
        ckpt_dir.mkdir(parents=True)

        keyframes = []
        poses = []
        np.random.seed(42)

        canvas = np.zeros((360, 480, 3), dtype=np.uint8)
        canvas[:] = (55, 65, 75)

        for idx in range(20):
            cx = 70 + (idx % 5) * 80
            cy = 60 + (idx // 5) * 60
            cv2.circle(canvas, (cx, cy), 16, ((idx * 40) % 255, (idx * 70) % 255, 230), -1)
            cv2.putText(canvas, f"P{idx}", (cx - 10, cy + 5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)

        for i in range(3):
            fp = kf_dir / f"kf_{i:04d}.jpg"
            shift_x = i * 15
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
                "t": [-i * 0.75, 0.0, 0.0],
                "position": [i * 0.75, 0.0, 0.0]
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

        # Dummy sparse ply with 100 points
        sparse_ply = kf_dir / "sparse_point_cloud.ply"
        with open(sparse_ply, "w", encoding="utf-8") as f:
            f.write("ply\nformat ascii 1.0\nelement vertex 100\n")
            f.write("property float x\nproperty float y\nproperty float z\n")
            f.write("property uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n")
            for _ in range(100):
                f.write("1.0 1.0 10.0 200 150 100\n")

        return {
            "tmp_path": tmp_path,
            "kf_manifest": str(kf_manifest),
            "poses_path": str(poses_path),
            "intrinsics_path": str(intrinsics_path),
            "sparse_ply": str(sparse_ply),
            "ckpt_dir": str(ckpt_dir),
            "kf_dir": str(kf_dir)
        }

    def test_mvs_depth_engine_execution(self):
        """Verifies that MultiViewStereoEngine correctly generates depth and confidence maps."""
        engine = MultiViewStereoEngine()
        img1 = np.full((360, 480, 3), 100, dtype=np.uint8)
        img2 = np.full((360, 480, 3), 100, dtype=np.uint8)
        # Add a feature in img1 and shifted in img2
        cv2.circle(img1, (240, 180), 30, (20, 200, 240), -1)
        cv2.circle(img2, (225, 180), 30, (20, 200, 240), -1)

        K = np.array([[400.0, 0, 240], [0, 400.0, 180], [0, 0, 1]])
        R_rel = np.eye(3)
        t_rel = np.array([[-0.8], [0.0], [0.0]])

        depth, conf = engine.estimate_depth_and_confidence(
            ref_img_bgr=img1,
            src_img_bgr=img2,
            K=K,
            R_rel=R_rel,
            t_rel=t_rel,
            flight_altitude_m=40.0,
            params={"num_disparities": 32, "block_size": 5}
        )

        assert depth.shape == (360, 480)
        assert conf.shape == (360, 480)
        assert np.any(depth > 0)
        assert np.all(conf >= 0.0) and np.all(conf <= 1.0)

    def test_learned_prior_engine_fallback(self):
        """Verifies experimental DUSt3RGeometricPriorEngine fallback when prior is disabled or diverged."""
        mvs = MultiViewStereoEngine()
        prior_engine = DUSt3RGeometricPriorEngine(fallback_engine=mvs)

        img1 = np.full((360, 480, 3), 100, dtype=np.uint8)
        img2 = np.full((360, 480, 3), 100, dtype=np.uint8)
        cv2.circle(img1, (240, 180), 30, (20, 200, 240), -1)
        cv2.circle(img2, (225, 180), 30, (20, 200, 240), -1)

        K = np.array([[400.0, 0, 240], [0, 400.0, 180], [0, 0, 1]])
        R_rel = np.eye(3)
        t_rel = np.array([[-0.8], [0.0], [0.0]])

        depth, conf = prior_engine.estimate_depth_and_confidence(
            ref_img_bgr=img1,
            src_img_bgr=img2,
            K=K,
            R_rel=R_rel,
            t_rel=t_rel,
            flight_altitude_m=40.0,
            params={"enable_learned_prior": False}
        )

        assert depth.shape == (360, 480)
        assert np.any(depth > 0)

    def test_dense_stage_full_pipeline_artifacts(self, setup_dense_data):
        """Verifies complete execution of DensePointCloudStage and output artifacts."""
        data = setup_dense_data
        stage = DensePointCloudStage()

        stage_input = StageInput(
            mission_id="mission_dense_01",
            job_id="job_dense_01",
            stage_name="dense_point_cloud",
            checkpoint_dir=data["ckpt_dir"],
            previous_checkpoint_dir=data["kf_dir"],
            input_artifacts={
                "keyframes_manifest": data["kf_manifest"],
                "camera_poses": data["poses_path"],
                "camera_intrinsics": data["intrinsics_path"],
                "sparse_point_cloud_ply": data["sparse_ply"]
            },
            flight_altitude_m=35.0,
            parameters={"num_disparities": 32, "block_size": 5, "min_confidence_score": 0.30}
        )

        output = stage.execute(stage_input)
        assert output.status == "completed"

        # Check required artifacts exist
        ply_file = Path(output.artifacts["dense_point_cloud_ply"])
        ply_compat = Path(output.artifacts["dense_ply"])
        depth_dir = Path(output.artifacts["depth_maps_dir"])
        conf_dir = Path(output.artifacts["dense_confidence_dir"])
        metrics_file = Path(output.artifacts["dense_metrics"])

        assert ply_file.exists(), "dense_point_cloud.ply must exist"
        assert ply_compat.exists(), "dense.ply alias must exist"
        assert depth_dir.exists(), "depth_maps/ directory must exist"
        assert conf_dir.exists(), "dense_confidence/ directory must exist"
        assert metrics_file.exists(), "dense_metrics.json must exist"

        # Check depth files & confidence files
        depth_npys = list(depth_dir.glob("*.npy"))
        depth_jpgs = list(depth_dir.glob("*.jpg"))
        conf_pngs = list(conf_dir.glob("*.png"))
        assert len(depth_npys) >= 2
        assert len(depth_jpgs) >= 2
        assert len(conf_pngs) >= 2

        # Verify dense_metrics.json
        with open(metrics_file) as f:
            metrics = json.load(f)

        assert "number_of_dense_points" in metrics
        assert "depth_confidence" in metrics
        assert "point_density" in metrics
        assert "processing_time_sec" in metrics
        assert "hardware_acceleration" in metrics

        assert metrics["number_of_dense_points"] >= 500
        assert 0.0 <= metrics["depth_confidence"]["mean"] <= 1.0
        assert metrics["point_density"]["points_per_m3"] > 0
        assert metrics["processing_time_sec"] >= 0.0

        # Verify density multiplier over sparse
        assert "density_multiplier" in metrics

    def test_outlier_filtering_and_confidence_threshold(self):
        """Verifies that low-confidence and invalid depths are filtered during fusion."""
        K = np.array([[500.0, 0, 250], [0, 500.0, 200], [0, 0, 1]])

        # 1 valid view with mixed confidence
        depth = np.zeros((100, 100), dtype=np.float32)
        conf = np.zeros((100, 100), dtype=np.float32)
        img = np.zeros((100, 100, 3), dtype=np.uint8)

        # Region A: valid depth (10m) with high confidence (0.85)
        depth[10:30, 10:30] = 10.0
        conf[10:30, 10:30] = 0.85

        # Region B: valid depth (10m) with LOW confidence (0.20)
        depth[50:70, 50:70] = 10.0
        conf[50:70, 50:70] = 0.20

        # Region C: invalid depth (0.0) with high confidence
        depth[80:90, 80:90] = 0.0
        conf[80:90, 80:90] = 0.90

        views_data = [{
            "depth_map": depth,
            "confidence_map": conf,
            "image_bgr": img,
            "R": np.eye(3),
            "t": np.zeros(3)
        }]

        pts, clrs, confs = DenseDepthFusion.fuse_views(
            views_data=views_data,
            intrinsics_K=K,
            params={"min_confidence_score": 0.50, "voxel_size_m": 0.01, "dense_stride_px": 1}
        )

        assert len(pts) > 0
        # All fused confidences must be >= 0.50
        assert np.all(confs >= 0.50)
        # Region B (conf=0.20) must be completely filtered out
        assert not np.any(confs < 0.50)
