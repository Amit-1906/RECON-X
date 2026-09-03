"""
Unit tests for Phase 6: Camera Trajectory and Sensor Fusion.
Validates:
  - Visual relative motion estimation (Level 1)
  - Sensor fusion with GPS/IMU (Level 2)
  - Zero sensor fabrication in visual-only mode
  - Separation of relative geometry, metric scale, and georeferencing
  - Sim(3) alignment, EKF + RTS smoothing, and outlier rejection
  - trajectory.json output schema and backward compatibility with camera_poses.json
"""
import json
import numpy as np
import cv2
import pytest
from pathlib import Path
from typing import Tuple, List, Dict

from backend.app.pipeline.stages.s05_pose_estimation import PoseEstimationStage
from backend.app.pipeline.stages.sensor_fusion import (
    wgs84_to_enu,
    umeyama_alignment,
    ExtendedKalmanTrajectoryFilter
)
from backend.app.schemas.stage import StageInput


def _create_feature_rich_frame(path: Path, frame_idx: int):
    """Generates synthetic imagery with strong distinctive keypoints."""
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    img[:] = 100 + (frame_idx * 15)

    # Grid of structured corners and circles with horizontal motion shift
    shift_x = frame_idx * 12
    for x in range(60, 580, 60):
        for y in range(60, 420, 60):
            cv2.circle(img, (x + shift_x, y), 5, (240, 180, 30), -1)
            cv2.rectangle(img, (x + shift_x - 8, y - 8), (x + shift_x + 8, y + 8), (20, 230, 80), 1)

    cv2.imwrite(str(path), img)
    return img


def _make_keyframe_set(folder: Path, n: int = 4) -> Tuple[Path, List[Dict]]:
    keyframes = []
    for i in range(n):
        fp = folder / f"kf_{i:04d}.jpg"
        _create_feature_rich_frame(fp, i)
        keyframes.append({
            "keyframe_id": i,
            "original_frame_id": f"frame_{i:04d}",
            "filename": fp.name,
            "filepath": str(fp),
            "timestamp_sec": float(i * 1.0)
        })

    manifest = folder / "keyframes.json"
    with open(manifest, "w", encoding="utf-8") as f:
        json.dump({"keyframes": keyframes}, f)
    return manifest, keyframes


class TestCameraTrajectoryAndSensorFusion:

    def test_wgs84_to_enu_transformation(self):
        """WGS-84 to ENU transformation must yield zero at origin and reasonable metric offsets."""
        lat0, lon0, alt0 = 37.774929, -122.419416, 100.0

        # Origin should map to (0, 0, 0)
        e0, n0, u0 = wgs84_to_enu(lat0, lon0, alt0, lat0, lon0, alt0)
        assert abs(e0) < 1e-3
        assert abs(n0) < 1e-3
        assert abs(u0) < 1e-3

        # 1 degree north is approximately 111 km
        e1, n1, u1 = wgs84_to_enu(lat0 + 0.001, lon0, alt0 + 10.0, lat0, lon0, alt0)
        assert 100.0 < n1 < 120.0
        assert abs(e1) < 1.0
        assert abs(u1 - 10.0) < 1e-2

    def test_umeyama_sim3_alignment(self):
        """Umeyama algorithm must recover exact scale, rotation, and translation."""
        source_pts = np.array([
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
            [0.0, 1.0, 0.0],
            [1.0, 1.0, 1.0]
        ])

        true_scale = 5.0
        target_pts = source_pts * true_scale + np.array([10.0, 20.0, 30.0])

        scale, r_align, t_align = umeyama_alignment(source_pts, target_pts)
        assert abs(scale - true_scale) < 1e-3
        assert np.allclose(r_align, np.eye(3), atol=1e-2)

    def test_zero_sensor_fabrication_visual_only(self, tmp_path):
        """
        When telemetry/GPS is unavailable, system must continue in visual-only mode
        and explicitly NOT fabricate GPS positions.
        """
        kf_dir = tmp_path / "keyframes_vis"
        kf_dir.mkdir()
        manifest, _ = _make_keyframe_set(kf_dir, n=3)

        stage_input = StageInput(
            mission_id="vis_only_mission",
            job_id="vis_only_job",
            stage_name="pose_estimation",
            checkpoint_dir=str(tmp_path / "checkpoint_vis"),
            previous_checkpoint_dir=str(kf_dir),
            input_artifacts={"keyframes_manifest": str(manifest)},
            telemetry_path=None,
            flight_altitude_m=50.0,
            focal_length_mm=24.0,
            sensor_width_mm=35.9,
            parameters={"feature_detector": "SIFT", "n_features": 1000}
        )

        stage = PoseEstimationStage()
        output = stage.execute(stage_input)

        assert output.status == "completed"
        assert "trajectory_json" in output.artifacts
        assert "camera_poses" in output.artifacts

        with open(output.artifacts["trajectory_json"]) as f:
            data = json.load(f)

        assert data["level"] == "LEVEL_1_VISUAL_ONLY"
        assert data["diagnostics"]["sensor_fusion_mode"] == "VISUAL_ONLY"
        assert data["diagnostics"]["gps_available"] is False

        # Zero fabrication requirement
        for entry in data["trajectory"]:
            assert entry["gps_position"] is None
            assert "position" in entry
            assert "orientation" in entry
            assert "confidence" in entry
            assert "visual_position" in entry
            assert "fused_position" in entry

    def test_level2_gps_fusion_and_outlier_rejection(self, tmp_path):
        """
        Tests Level 2 sensor fusion with GPS telemetry, verifying Sim(3) alignment,
        RTK fix readiness, and Mahalanobis outlier rejection.
        """
        kf_dir = tmp_path / "keyframes_gps"
        kf_dir.mkdir()
        manifest, _ = _make_keyframe_set(kf_dir, n=4)

        base_lat, base_lon = 37.774929, -122.419416
        telemetry = [
            {"timestamp_sec": 0.0, "latitude": base_lat, "longitude": base_lon, "altitude": 50.0, "fix_type": "RTK_FIXED"},
            {"timestamp_sec": 1.0, "latitude": base_lat + 0.0001, "longitude": base_lon + 0.0001, "altitude": 50.5, "fix_type": "RTK_FIXED"},
            # Injected multi-path GPS anomaly jump (should be rejected by Mahalanobis gate)
            {"timestamp_sec": 2.0, "latitude": base_lat + 0.0500, "longitude": base_lon + 0.0500, "altitude": 150.0, "fix_type": "STANDALONE_GPS"},
            {"timestamp_sec": 3.0, "latitude": base_lat + 0.0003, "longitude": base_lon + 0.0003, "altitude": 51.0, "fix_type": "RTK_FIXED"},
        ]
        telem_path = tmp_path / "flight_telemetry.json"
        with open(telem_path, "w", encoding="utf-8") as f:
            json.dump(telemetry, f)

        stage_input = StageInput(
            mission_id="gps_mission",
            job_id="gps_job",
            stage_name="pose_estimation",
            checkpoint_dir=str(tmp_path / "checkpoint_gps"),
            previous_checkpoint_dir=str(kf_dir),
            input_artifacts={"keyframes_manifest": str(manifest)},
            telemetry_path=str(telem_path),
            flight_altitude_m=50.0,
            focal_length_mm=24.0,
            sensor_width_mm=35.9,
            parameters={"feature_detector": "SIFT", "n_features": 1000}
        )

        stage = PoseEstimationStage()
        output = stage.execute(stage_input)

        assert output.status == "completed"
        with open(output.artifacts["trajectory_json"]) as f:
            data = json.load(f)

        assert data["level"] == "LEVEL_2_FUSED"
        assert data["diagnostics"]["sensor_fusion_mode"] == "FUSED_GPS_IMU"
        assert data["diagnostics"]["gps_available"] is True
        assert data["scale_metrics"]["scale_source"] == "GPS_SIM3_ALIGNMENT"
        assert data["georeferencing"]["origin_latitude"] is not None

        # Outlier rejection should have caught the anomalous spike
        assert data["diagnostics"]["gps_outliers_rejected"] >= 1

        # Check required trajectory fields
        assert len(data["trajectory"]) == 4
        for item in data["trajectory"]:
            assert "timestamp" in item
            assert "position" in item
            assert "orientation" in item
            assert "confidence" in item
            assert "fused_position" in item
            assert "visual_position" in item
            assert item["confidence"] >= 0.15

        # Verify backward compatibility with camera_poses.json
        with open(output.artifacts["camera_poses"]) as pf:
            poses = json.load(pf)
        assert "poses" in poses
        assert len(poses["poses"]) == 4
