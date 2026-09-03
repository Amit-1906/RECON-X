"""
Integration tests for FastAPI REST API endpoints.
"""
from pathlib import Path
import pytest


def test_system_endpoints(client):
    # Health check
    res = client.get("/api/v1/system/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"

    # Hardware status
    res = client.get("/api/v1/system/hardware")
    assert res.status_code == 200
    data = res.json()
    assert "device_capabilities" in data
    assert "configured_preferred_device" in data


def test_stages_api(client):
    # List all 13 stages
    res = client.get("/api/v1/stages")
    assert res.status_code == 200
    stages = res.json()
    assert len(stages) == 13
    assert "preprocessing" in stages
    assert "dynamic_masking" in stages
    assert "illumination_preprocessing" in stages
    assert "validation" in stages

    # Stage info
    res = client.get("/api/v1/stages/illumination_preprocessing/info")
    assert res.status_code == 200
    info = res.json()
    assert info["stage_name"] == "illumination_preprocessing"
    assert info["stage_order"] == 5


def test_mission_and_upload_flow(client, sample_uav_video):
    # 1. Create mission
    mission_payload = {
        "name": "Survey Mission Alpha",
        "description": "Photogrammetric mapping over industrial site",
        "drone_model": "DJI Matrice 300 RTK",
        "camera_model": "Zenmuse P1",
        "flight_altitude_m": 50.0,
        "focal_length_mm": 35.0,
        "target_gsd_cm": 1.2
    }
    res = client.post("/api/v1/missions", json=mission_payload)
    assert res.status_code == 201
    mission = res.json()
    mission_id = mission["id"]
    assert mission["name"] == "Survey Mission Alpha"
    assert mission["status"] == "draft"

    # 2. Get mission
    res = client.get(f"/api/v1/missions/{mission_id}")
    assert res.status_code == 200
    assert res.json()["id"] == mission_id

    # 3. Upload video
    with open(sample_uav_video, "rb") as vf:
        files = {"file": ("flight.mp4", vf, "video/mp4")}
        res = client.post(f"/api/v1/uploads/missions/{mission_id}/video", files=files)
        assert res.status_code == 200
        updated = res.json()
        assert updated["status"] == "ready"
        assert updated["video_filename"] == "flight.mp4"
        assert updated["video_duration_seconds"] > 0

    # 4. Create Job
    job_payload = {
        "mission_id": mission_id,
        "preferred_device": "cpu"
    }
    res = client.post("/api/v1/jobs", json=job_payload)
    assert res.status_code == 202
    job = res.json()
    assert job["mission_id"] == mission_id
    assert len(job["stages"]) == 13
