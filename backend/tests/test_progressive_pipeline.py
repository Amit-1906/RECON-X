"""
Unit and Integration Tests for Phase 13: Progressive Reconstruction Pipeline.

Verifies:
  1. Level 1 — Rapid Model generation (rapid_model.glb, rapid_model.ply, rapid_model_summary.json)
     immediately upon coarse 3D / sparse Structure-from-Motion completion.
  2. Level 2 — Refined Model availability upon full pipeline completion.
  3. Real-time hardware utilization endpoint (/api/v1/system/status).
  4. Non-fake measurable progress calculation and real-time stage metrics extraction.
"""
import json
from pathlib import Path
import numpy as np
import pytest
import trimesh

from backend.app.schemas.stage import StageInput
from backend.app.pipeline.stages.s06_geometry import GeometryStage
from backend.app.api.system import get_system_hardware_status
from backend.app.models.job import Job, JobStage


def test_system_hardware_status_endpoint():
    """Verifies that actual system resource metrics (CPU, RAM, GPU) are reported."""
    status = get_system_hardware_status()
    assert isinstance(status, dict)
    assert "cpu_percent" in status
    assert "cpu_cores_physical" in status
    assert "cpu_cores_logical" in status
    assert "ram_total_gb" in status
    assert "ram_used_gb" in status
    assert "ram_percent" in status
    assert "gpu_available" in status
    assert "active_device" in status

    assert status["cpu_cores_logical"] >= 1
    assert status["ram_total_gb"] > 0.0
    assert 0.0 <= status["ram_percent"] <= 100.0


def test_rapid_model_generation_in_stage6(tmp_path):
    """Verifies that Stage 6 generates Level 1 Rapid Model artifacts immediately."""
    import cv2
    kf_dir = tmp_path / "keyframes"
    kf_dir.mkdir(parents=True)
    ckpt_dir = tmp_path / "checkpoint"
    ckpt_dir.mkdir(parents=True)

    keyframes = []
    poses = []
    np.random.seed(42)

    # Synthesize imagery with distinct visual features
    base_canvas = np.zeros((480, 640, 3), dtype=np.uint8)
    base_canvas[:] = (55, 60, 70)
    for idx in range(25):
        lx = 100 + (idx % 5) * 90
        ly = 80 + (idx // 5) * 80
        color = ((idx * 37) % 255, (idx * 67) % 255, 230)
        cv2.circle(base_canvas, (lx, ly), 12, color, -1)
        cv2.rectangle(base_canvas, (lx - 15, ly - 15), (lx + 15, ly + 15), (200, 200, 50), 1)

    for i in range(3):
        fp = kf_dir / f"kf_{i:04d}.jpg"
        shift_x = i * 16
        M = np.float32([[1, 0, -shift_x], [0, 1, 0]])
        img = cv2.warpAffine(base_canvas, M, (640, 480), borderMode=cv2.BORDER_REPLICATE)
        cv2.imwrite(str(fp), img)

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
            "t": [-i * 0.8, 0.0, 0.0]
        })

    kf_manifest = kf_dir / "keyframes.json"
    with open(kf_manifest, "w", encoding="utf-8") as f:
        json.dump({"keyframes": keyframes}, f)

    intrinsics_path = kf_dir / "camera_intrinsics.json"
    with open(intrinsics_path, "w", encoding="utf-8") as f:
        json.dump({
            "K": [[600.0, 0.0, 320.0], [0.0, 600.0, 240.0], [0.0, 0.0, 1.0]],
            "image_width": 640,
            "image_height": 480
        }, f)

    poses_path = kf_dir / "camera_poses.json"
    with open(poses_path, "w", encoding="utf-8") as f:
        json.dump({"poses": poses}, f)

    stage_input = StageInput(
        mission_id="mission_phase13",
        job_id="job_phase13",
        stage_name="geometry",
        checkpoint_dir=str(ckpt_dir),
        previous_checkpoint_dir=str(kf_dir),
        input_artifacts={
            "keyframes_manifest": str(kf_manifest),
            "camera_intrinsics": str(intrinsics_path),
            "camera_poses": str(poses_path)
        },
        parameters={"max_reprojection_error_px": 4.0}
    )

    stage = GeometryStage()
    output = stage.execute(stage_input)

    assert output.status == "completed"

    # Verify Level 1 Rapid Model artifacts exist
    assert "rapid_model_glb" in output.artifacts
    assert "rapid_model_ply" in output.artifacts
    assert "rapid_model_summary" in output.artifacts

    glb_path = Path(output.artifacts["rapid_model_glb"])
    ply_path = Path(output.artifacts["rapid_model_ply"])
    summary_path = Path(output.artifacts["rapid_model_summary"])

    assert glb_path.exists() and glb_path.stat().st_size > 100
    assert ply_path.exists()
    assert summary_path.exists()

    # Verify binary glTF header
    with open(glb_path, "rb") as f:
        assert f.read(4) == b"glTF", "rapid_model.glb must be valid binary glTF"

    # Verify summary metadata
    with open(summary_path, "r") as f:
        summary = json.load(f)
    assert summary["level"] == 1
    assert summary["model_type"] == "rapid_situational_awareness"
    assert summary["registered_cameras"] == 3


def test_job_progressive_status_and_metrics():
    """Verifies Job model properties for rapid and refined model readiness."""
    job = Job(id="test_job_prog", mission_id="test_mission", status="running")

    # Initially before geometry completes:
    stage_prep = JobStage(job_id=job.id, stage_name="preprocessing", stage_order=1, status="completed",
                          metrics_json=json.dumps({"extracted_frames_count": 1250}))
    stage_kf = JobStage(job_id=job.id, stage_name="keyframe_selection", stage_order=3, status="completed",
                        metrics_json=json.dumps({"selected_keyframes_count": 184}))
    stage_geom = JobStage(job_id=job.id, stage_name="geometry", stage_order=7, status="running")

    job.stages = [stage_prep, stage_kf, stage_geom]

    # Rapid model not ready yet
    assert job.rapid_model_ready is False
    assert job.refined_model_ready is False

    # Mark geometry completed
    stage_geom.status = "completed"
    stage_geom.metrics_json = json.dumps({"successful_image_registrations": 184, "number_of_reconstructed_points": 45000})

    # Rapid model is now READY!
    assert job.rapid_model_ready is True
    assert job.refined_model_ready is False

    # Extract real-time metrics
    metrics = job.real_time_metrics
    assert metrics["frames_extracted"] == 1250
    assert metrics["keyframes_selected"] == 184
    assert metrics["cameras_registered"] == 184

    # Finally, job completed
    job.status = "completed"
    assert job.refined_model_ready is True
