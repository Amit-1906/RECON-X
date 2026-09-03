"""
Unit & Integration Tests for Phase 7: Sparse 3D Reconstruction using Structure-from-Motion (SfM).
Tests:
  1. Engine abstraction & OpenCVIncrementalSfMEngine execution.
  2. Respecting dynamic-object masks (moving objects excluded from 3D points).
  3. Artifact generation: sparse_point_cloud.ply, camera_poses.json, feature_matches.json, reconstruction_metrics.json.
  4. Metric validation: cameras, points, reprojection error, track lengths, confidence.
  5. Zero fabrication on failure: ensures clear failure reporting without dummy point clouds.
"""
import json
import pytest
import numpy as np
import cv2
from pathlib import Path
from typing import Tuple, List, Dict, Any

from backend.app.schemas.stage import StageInput
from backend.app.pipeline.base import StageExecutionError
from backend.app.pipeline.stages.s06_geometry import GeometryStage
from backend.app.pipeline.stages.sfm_engine import (
    BaseSfMEngine,
    OpenCVIncrementalSfMEngine,
    SfMReconstructionError
)


class TestSparseReconstructionSfM:

    @pytest.fixture
    def setup_sfm_data(self, tmp_path):
        """Generates synthetic multi-view keyframes with textured 3D features and dynamic masks."""
        kf_dir = tmp_path / "keyframes"
        kf_dir.mkdir(parents=True)
        ckpt_dir = tmp_path / "checkpoint_geometry"
        ckpt_dir.mkdir(parents=True)

        np.random.seed(42)
        base_canvas = np.zeros((480, 640, 3), dtype=np.uint8)
        base_canvas[:] = (60, 65, 75)

        # 30 unique textured feature landmarks
        for idx in range(30):
            lx = 100 + (idx % 6) * 80 + (idx * 3 % 17)
            ly = 80 + (idx // 6) * 70 + (idx * 5 % 19)
            color = ((idx * 37) % 255, (idx * 67) % 255, 230)
            cv2.circle(base_canvas, (lx, ly), 10 + (idx % 5), color, -1)
            cv2.putText(base_canvas, str(idx + 1), (lx - 8, ly + 5), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
            cv2.rectangle(base_canvas, (lx - 15, ly - 15), (lx + 15, ly + 15), (200, 200, 50), 1)

        keyframes = []
        poses = []
        masks_dir = tmp_path / "masks"
        masks_dir.mkdir(parents=True)
        dynamic_frames_list = []

        for i in range(4):
            fp = kf_dir / f"kf_{i:04d}.jpg"
            shift_x = i * 16
            M = np.float32([[1, 0, -shift_x], [0, 1, 0]])
            img = cv2.warpAffine(base_canvas, M, (640, 480), borderMode=cv2.BORDER_REPLICATE)

            # Draw a simulated dynamic object (car/person) in the lower right corner
            cv2.rectangle(img, (450, 320), (580, 440), (0, 0, 255), -1)
            cv2.imwrite(str(fp), img)

            # Create static mask that masks out the dynamic object (0 = dynamic/masked, 255 = static scene)
            static_mask = np.full((480, 640), 255, dtype=np.uint8)
            static_mask[310:450, 440:590] = 0
            mask_path = masks_dir / f"frame_{i:04d}_static.png"
            cv2.imwrite(str(mask_path), static_mask)

            keyframes.append({
                "keyframe_id": i,
                "original_frame_id": f"frame_{i:04d}",
                "filename": fp.name,
                "filepath": str(fp),
                "timestamp_sec": float(i * 1.0)
            })

            poses.append({
                "keyframe_id": i,
                "filename": fp.name,
                "filepath": str(fp),
                "R": np.eye(3).tolist(),
                "t": [-i * 0.7, 0.0, 0.0]
            })

            dynamic_frames_list.append({
                "keyframe_id": i,
                "static_mask_path": str(mask_path)
            })

        # Manifests
        kf_manifest = kf_dir / "keyframes.json"
        with open(kf_manifest, "w", encoding="utf-8") as f:
            json.dump({"keyframes": keyframes}, f)

        dyn_manifest = kf_dir / "dynamic_objects.json"
        with open(dyn_manifest, "w", encoding="utf-8") as f:
            json.dump({"frames": dynamic_frames_list}, f)

        intrinsics_path = kf_dir / "camera_intrinsics.json"
        K = [
            [600.0, 0.0, 320.0],
            [0.0, 600.0, 240.0],
            [0.0, 0.0, 1.0]
        ]
        with open(intrinsics_path, "w", encoding="utf-8") as f:
            json.dump({"K": K, "image_width": 640, "image_height": 480}, f)

        poses_path = kf_dir / "camera_poses.json"
        with open(poses_path, "w", encoding="utf-8") as f:
            json.dump({"poses": poses}, f)

        return {
            "tmp_path": tmp_path,
            "kf_manifest": str(kf_manifest),
            "dyn_manifest": str(dyn_manifest),
            "intrinsics_path": str(intrinsics_path),
            "poses_path": str(poses_path),
            "ckpt_dir": str(ckpt_dir),
            "kf_dir": str(kf_dir)
        }

    def test_engine_abstraction(self):
        """Verifies clean engine abstraction interface."""
        assert issubclass(OpenCVIncrementalSfMEngine, BaseSfMEngine)
        engine = OpenCVIncrementalSfMEngine()
        assert hasattr(engine, "reconstruct")

    def test_sfm_stage_execution_and_artifacts(self, setup_sfm_data):
        """Verifies complete GeometryStage execution and required artifact outputs."""
        data = setup_sfm_data
        stage = GeometryStage()

        stage_input = StageInput(
            mission_id="mission_sfm_001",
            job_id="job_sfm_001",
            stage_name="geometry",
            checkpoint_dir=data["ckpt_dir"],
            previous_checkpoint_dir=data["kf_dir"],
            input_artifacts={
                "keyframes_manifest": data["kf_manifest"],
                "dynamic_objects_json": data["dyn_manifest"],
                "camera_intrinsics": data["intrinsics_path"],
                "camera_poses": data["poses_path"]
            },
            parameters={"max_reprojection_error_px": 4.5, "enable_bundle_adjustment": True}
        )

        output = stage.execute(stage_input)
        assert output.status == "completed"

        # Check required artifacts exist
        ply_main = Path(output.artifacts["sparse_point_cloud_ply"])
        ply_compat = Path(output.artifacts["sparse_ply"])
        poses_file = Path(output.artifacts["camera_poses"])
        matches_file = Path(output.artifacts["feature_matches"])
        metrics_file = Path(output.artifacts["reconstruction_metrics"])

        assert ply_main.exists()
        assert ply_compat.exists()
        assert poses_file.exists()
        assert matches_file.exists()
        assert metrics_file.exists()

        # Check PLY structure
        with open(ply_main, "r", encoding="utf-8") as f:
            header_lines = [f.readline() for _ in range(8)]
            header_text = "".join(header_lines)
            assert "ply" in header_text
            assert "element vertex" in header_text
            assert "property float x" in header_text

        # Check reconstruction_metrics.json schema
        with open(metrics_file, "r", encoding="utf-8") as f:
            metrics = json.load(f)

        assert "number_of_cameras" in metrics
        assert "number_of_reconstructed_points" in metrics
        assert "successful_image_registrations" in metrics
        assert "reprojection_error" in metrics
        assert "track_length_statistics" in metrics
        assert "reconstruction_confidence" in metrics

        assert metrics["number_of_cameras"] == 4
        assert metrics["successful_image_registrations"] == 4
        assert metrics["number_of_reconstructed_points"] >= 20
        assert metrics["reprojection_error"]["mean_px"] <= 4.5
        assert 0.0 <= metrics["reconstruction_confidence"] <= 1.0

        # Check feature_matches.json schema
        with open(matches_file, "r", encoding="utf-8") as f:
            match_data = json.load(f)
            assert "total_matched_pairs" in match_data
            assert match_data["total_matched_pairs"] > 0
            first_pair = match_data["pairs"][0]
            assert "raw_matches" in first_pair
            assert "verified_inliers" in first_pair

    def test_dynamic_masks_respected(self, setup_sfm_data):
        """Verifies that features are not extracted inside dynamic exclusion masks."""
        data = setup_sfm_data
        engine = OpenCVIncrementalSfMEngine()

        with open(data["kf_manifest"]) as f:
            keyframes = json.load(f)["keyframes"]
        with open(data["dyn_manifest"]) as f:
            dyn_data = json.load(f)
            static_masks = {f["keyframe_id"]: f["static_mask_path"] for f in dyn_data["frames"]}
        with open(data["intrinsics_path"]) as f:
            K = np.array(json.load(f)["K"])
        with open(data["poses_path"]) as f:
            poses = json.load(f)["poses"]

        result = engine.reconstruct(
            keyframes=keyframes,
            static_masks=static_masks,
            intrinsics_K=K,
            initial_poses=poses,
            params={"max_reprojection_error_px": 4.5}
        )

        # Dynamic region was in pixel region [450, 320] to [580, 440]
        # Colors of dynamic object was pure red (0, 0, 255)
        # Verify that none of the reconstructed points have pure red dynamic colors
        pure_red_count = 0
        for color in result.colors_rgb:
            # Check if RGB matches pure red
            if color[0] > 200 and color[1] < 40 and color[2] < 40:
                pure_red_count += 1

        assert pure_red_count == 0, "No 3D points should be triangulated from the dynamic object."

    def test_zero_fabrication_on_failure(self, tmp_path):
        """Verifies that the system raises an explicit error and NEVER fabricates points when reconstruction fails."""
        kf_dir = tmp_path / "blank_keyframes"
        kf_dir.mkdir()
        ckpt_dir = tmp_path / "blank_ckpt"
        ckpt_dir.mkdir()

        keyframes = []
        # Create completely blank / uniform images with 0 texture
        for i in range(2):
            fp = kf_dir / f"blank_{i}.jpg"
            img = np.zeros((480, 640, 3), dtype=np.uint8) + 128
            cv2.imwrite(str(fp), img)
            keyframes.append({
                "keyframe_id": i,
                "original_frame_id": f"frame_{i}",
                "filename": fp.name,
                "filepath": str(fp)
            })

        kf_manifest = kf_dir / "keyframes.json"
        with open(kf_manifest, "w") as f:
            json.dump({"keyframes": keyframes}, f)

        intrinsics_path = kf_dir / "camera_intrinsics.json"
        with open(intrinsics_path, "w") as f:
            json.dump({"K": [[500, 0, 320], [0, 500, 240], [0, 0, 1]]}, f)

        stage = GeometryStage()
        stage_input = StageInput(
            mission_id="fail_mission",
            job_id="fail_job",
            stage_name="geometry",
            checkpoint_dir=str(ckpt_dir),
            previous_checkpoint_dir=str(kf_dir),
            input_artifacts={
                "keyframes_manifest": str(kf_manifest),
                "camera_intrinsics": str(intrinsics_path)
            }
        )

        with pytest.raises(StageExecutionError) as exc_info:
            stage.execute(stage_input)

        # Verify failure message is informative and explicitly stated
        err_msg = str(exc_info.value)
        assert "SfM Reconstruction Failed" in err_msg or "Failed" in err_msg
        # Verify no dummy PLY was fabricated
        assert not (ckpt_dir / "sparse_point_cloud.ply").exists()
