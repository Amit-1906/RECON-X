"""
Unit tests for PipelineRunner execution, checkpointing, and resumption.
"""
from pathlib import Path
import pytest
from backend.app.pipeline.runner import PipelineRunner
from backend.app.pipeline.registry import ORDERED_STAGES


def test_pipeline_runner_full_run(sample_uav_video, tmp_path, monkeypatch):
    # Route storage to tmp_path
    monkeypatch.setattr("backend.app.pipeline.runner.PROJECT_ROOT", tmp_path)

    runner = PipelineRunner(
        job_id="runner-full-test",
        mission_id="mission-full-test",
        video_path=sample_uav_video,
        flight_altitude_m=40.0,
        focal_length_mm=24.0,
        sensor_width_mm=35.9,
        target_gsd_cm=2.0
    )

    started_stages = []
    completed_stages = []

    def on_start(name, order):
        started_stages.append(name)

    def on_complete(name, order, output):
        completed_stages.append(name)

    runner.on_stage_start = on_start
    runner.on_stage_complete = on_complete

    result = runner.run()
    assert result["status"] == "completed"
    assert len(completed_stages) == len(ORDERED_STAGES)
    assert "dense_ply" in result["artifacts"]
    assert "mesh_textured_obj" in result["artifacts"]
    assert "quality_report_json" in result["artifacts"]


def test_pipeline_runner_resume_from_checkpoint(sample_uav_video, tmp_path, monkeypatch):
    monkeypatch.setattr("backend.app.pipeline.runner.PROJECT_ROOT", tmp_path)

    job_id = "runner-resume-test"
    runner1 = PipelineRunner(
        job_id=job_id,
        mission_id="mission-resume-test",
        video_path=sample_uav_video,
        flight_altitude_m=40.0,
        focal_length_mm=24.0,
        sensor_width_mm=35.9
    )

    # First run: let it run completely
    res1 = runner1.run()
    assert res1["status"] == "completed"

    # Second run: resume from Stage 7 ("mesh_generation")
    started_in_resume = []
    runner2 = PipelineRunner(
        job_id=job_id,
        mission_id="mission-resume-test",
        video_path=sample_uav_video,
        on_stage_start=lambda name, order: started_in_resume.append(name)
    )

    res2 = runner2.run(start_from_stage="mesh_generation")
    assert res2["status"] == "completed"
    # Earlier stages (preprocessing, frame_quality, keyframe_selection, pose_estimation, geometry, dense_point_cloud) should NOT have been re-executed
    assert "preprocessing" not in started_in_resume
    assert "dense_point_cloud" not in started_in_resume
    assert "mesh_generation" in started_in_resume
    assert "texture_mapping" in started_in_resume
    assert "validation" in started_in_resume
