"""
Phase 1 Tests — Video Ingestion and Frame Extraction.

Tests cover:
  - Video probe: valid file, corrupt file, unsupported extension, zero-byte file
  - Frame extraction: correct frame count, timestamp precision, JPEG files on disk
  - metadata.json: schema completeness and timestamp correctness
  - Mission status lifecycle: UPLOADED → EXTRACTING → COMPLETED / FAILED
  - API surface: upload endpoint, extract-frames endpoint, status endpoint

Run:
    python -m pytest backend/tests/test_ingestion.py -v
"""
import json
import struct
import tempfile
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# ── Project imports ────────────────────────────────────────────────────────────
from backend.app.core.database import Base, get_db
from backend.app.main import app
from backend.app.models.mission import Mission
from backend.app.models.frame import IngestionFrame
from backend.app.schemas.ingestion import ExtractFramesRequest
from backend.app.services.ingestion_service import IngestionService, IngestionStatus


# ══════════════════════════════════════════════════════════════════════════════
# Fixtures
# ══════════════════════════════════════════════════════════════════════════════

@pytest.fixture(scope="module")
def db_engine(tmp_path_factory):
    """In-memory SQLite engine for the test module."""
    db_file = tmp_path_factory.mktemp("data") / "test_ingestion.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    return engine


@pytest.fixture
def db_session(db_engine):
    """Provide a transactional DB session, roll back after each test."""
    TestingSession = sessionmaker(bind=db_engine)
    session = TestingSession()
    yield session
    session.rollback()
    session.close()


@pytest.fixture
def api_client(db_engine):
    """FastAPI TestClient wired to the test database."""
    TestingSession = sessionmaker(bind=db_engine)

    def override_get_db():
        session = TestingSession()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture
def test_mission(db_session):
    """Create a minimal Mission row for use in ingestion tests."""
    mission = Mission(name="Phase1 Test Mission")
    db_session.add(mission)
    db_session.commit()
    db_session.refresh(mission)
    return mission


def make_synthetic_video(path: Path, fps: float = 30.0, duration_sec: float = 3.0,
                          width: int = 640, height: int = 480) -> Path:
    """
    Write a real, decodable MP4 video using cv2.VideoWriter.
    Frames are simple gradients so there is no dependency on external footage.
    """
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(str(path), fourcc, fps, (width, height))
    n_frames = int(fps * duration_sec)
    for i in range(n_frames):
        # Create a gradient image that changes per-frame (simple but decodable)
        val = int((i / n_frames) * 255)
        frame = np.full((height, width, 3), val, dtype=np.uint8)
        writer.write(frame)
    writer.release()
    return path


# ══════════════════════════════════════════════════════════════════════════════
# 1. Video Probe Tests
# ══════════════════════════════════════════════════════════════════════════════

class TestVideoProbe:
    def test_probe_valid_video(self, tmp_path):
        """Probing a synthetic decodable video returns correct metadata."""
        video_path = make_synthetic_video(tmp_path / "flight.mp4", fps=30.0, duration_sec=3.0)
        result = IngestionService.probe_video(video_path, "flight.mp4")

        assert result.valid is True, f"Expected valid=True, got error: {result.error}"
        assert result.fps == pytest.approx(30.0, abs=1.0)
        assert result.width == 640
        assert result.height == 480
        assert result.total_frames == pytest.approx(90, abs=5)
        assert result.duration_sec == pytest.approx(3.0, abs=0.5)
        assert result.file_size_bytes > 0
        assert result.video_name == "flight.mp4"

    def test_probe_corrupt_video(self, tmp_path):
        """Probing a corrupt (random bytes) file returns valid=False with an error message."""
        corrupt = tmp_path / "corrupt.mp4"
        corrupt.write_bytes(b"\x00\xff\xab" * 100)
        result = IngestionService.probe_video(corrupt, "corrupt.mp4")

        assert result.valid is False
        assert result.error is not None
        assert len(result.error) > 0

    def test_probe_zero_byte_file(self, tmp_path):
        """A zero-byte file must fail gracefully."""
        empty = tmp_path / "empty.mp4"
        empty.write_bytes(b"")
        result = IngestionService.probe_video(empty, "empty.mp4")

        assert result.valid is False
        assert result.error is not None

    def test_probe_returns_fps_and_resolution(self, tmp_path):
        """FPS and resolution fields are populated and match the source."""
        video_path = make_synthetic_video(tmp_path / "hd.mp4", fps=25.0, duration_sec=2.0,
                                          width=1280, height=720)
        result = IngestionService.probe_video(video_path, "hd.mp4")

        assert result.valid is True
        assert result.fps == pytest.approx(25.0, abs=1.0)
        assert result.width == 1280
        assert result.height == 720


# ══════════════════════════════════════════════════════════════════════════════
# 2. Frame Extraction Tests
# ══════════════════════════════════════════════════════════════════════════════

class TestFrameExtraction:
    def _prepare_mission_with_video(self, db_session, tmp_path, duration_sec=4.0, fps=30.0):
        """Helper: create a mission and synthetic video, populate probe fields."""
        video_path = make_synthetic_video(
            tmp_path / "flight.mp4", fps=fps, duration_sec=duration_sec
        )
        mission = Mission(
            name="Extraction Test",
            video_filename="flight.mp4",
            video_path=str(video_path),
            video_fps=fps,
            video_width=640,
            video_height=480,
            video_total_frames=int(fps * duration_sec),
            video_duration_seconds=duration_sec,
            ingestion_status=IngestionStatus.UPLOADED,
        )
        db_session.add(mission)
        db_session.commit()
        db_session.refresh(mission)
        return mission

    def test_extraction_produces_jpeg_files(self, db_session, tmp_path):
        """Frame extraction must write real .jpg files to disk."""
        with patch("backend.app.services.ingestion_service.PROJECT_ROOT", tmp_path):
            mission = self._prepare_mission_with_video(db_session, tmp_path, duration_sec=3.0)
            config = ExtractFramesRequest(interval_sec=1.0, max_dimension=640, jpeg_quality=85)

            IngestionService.extract_frames(db_session, mission.id, config)

            db_session.refresh(mission)
            assert mission.ingestion_status == IngestionStatus.COMPLETED
            assert mission.extracted_frame_count >= 2  # at t=0, t=1, t=2

            frames_dir = Path(mission.frames_dir)
            jpgs = list(frames_dir.glob("*.jpg"))
            assert len(jpgs) == mission.extracted_frame_count
            # Verify each file is non-empty and is a valid JPEG
            for jpg in jpgs:
                assert jpg.stat().st_size > 0
                assert jpg.read_bytes()[:2] == b"\xff\xd8"  # JPEG magic bytes

    def test_extraction_timestamp_precision(self, db_session, tmp_path):
        """
        Timestamps stored in IngestionFrame must be within 1/fps of the expected value.
        """
        fps = 30.0
        with patch("backend.app.services.ingestion_service.PROJECT_ROOT", tmp_path):
            mission = self._prepare_mission_with_video(db_session, tmp_path, duration_sec=4.0, fps=fps)
            config = ExtractFramesRequest(interval_sec=1.0, max_dimension=0, jpeg_quality=90)

            IngestionService.extract_frames(db_session, mission.id, config)

            frames = (
                db_session.query(IngestionFrame)
                .filter(IngestionFrame.mission_id == mission.id)
                .order_by(IngestionFrame.frame_index)
                .all()
            )
            tolerance = 1.0 / fps  # one frame's worth of timing error
            for frame in frames:
                expected_ts = frame.frame_index / fps
                assert abs(frame.timestamp_sec - expected_ts) <= tolerance, (
                    f"Frame {frame.frame_index}: expected ts={expected_ts:.4f}, got {frame.timestamp_sec:.4f}"
                )

    def test_extraction_frame_count_matches_interval(self, db_session, tmp_path):
        """
        For a 6-second video at interval=1.0s, we expect ~6 frames (within ±1 for rounding).
        """
        with patch("backend.app.services.ingestion_service.PROJECT_ROOT", tmp_path):
            mission = self._prepare_mission_with_video(db_session, tmp_path, duration_sec=6.0, fps=30.0)
            config = ExtractFramesRequest(interval_sec=1.0, max_dimension=0)

            IngestionService.extract_frames(db_session, mission.id, config)
            db_session.refresh(mission)

            assert abs(mission.extracted_frame_count - 6) <= 1

    def test_extraction_writes_db_rows(self, db_session, tmp_path):
        """Every extracted frame must have a corresponding IngestionFrame DB row."""
        with patch("backend.app.services.ingestion_service.PROJECT_ROOT", tmp_path):
            mission = self._prepare_mission_with_video(db_session, tmp_path, duration_sec=3.0)
            config = ExtractFramesRequest(interval_sec=1.0, max_dimension=0)

            IngestionService.extract_frames(db_session, mission.id, config)

            frames = (
                db_session.query(IngestionFrame)
                .filter(IngestionFrame.mission_id == mission.id)
                .all()
            )
            db_session.refresh(mission)
            assert len(frames) == mission.extracted_frame_count
            for f in frames:
                assert f.frame_id.startswith("frame_")
                assert f.timestamp_sec >= 0.0
                assert Path(f.file_path).exists()
                assert f.file_size_bytes > 0

    def test_extraction_idempotent_rerun(self, db_session, tmp_path):
        """
        Running extract_frames twice on the same mission should overwrite previous
        frames and produce a clean, correct count without duplicates.
        """
        with patch("backend.app.services.ingestion_service.PROJECT_ROOT", tmp_path):
            mission = self._prepare_mission_with_video(db_session, tmp_path, duration_sec=3.0)
            config = ExtractFramesRequest(interval_sec=1.0, max_dimension=0)

            IngestionService.extract_frames(db_session, mission.id, config)
            first_count = mission.extracted_frame_count

            IngestionService.extract_frames(db_session, mission.id, config)
            db_session.refresh(mission)

            frame_count = db_session.query(IngestionFrame).filter(
                IngestionFrame.mission_id == mission.id
            ).count()
            assert frame_count == mission.extracted_frame_count == first_count

    def test_extraction_missing_video_sets_failed(self, db_session, tmp_path):
        """If the video file is missing on disk, ingestion_status must become FAILED."""
        with patch("backend.app.services.ingestion_service.PROJECT_ROOT", tmp_path):
            mission = Mission(
                name="Missing Video",
                video_path="/nonexistent/path/flight.mp4",
                ingestion_status=IngestionStatus.UPLOADED,
            )
            db_session.add(mission)
            db_session.commit()

            config = ExtractFramesRequest(interval_sec=1.0)
            IngestionService.extract_frames(db_session, mission.id, config)
            db_session.refresh(mission)

            assert mission.ingestion_status == IngestionStatus.FAILED
            assert mission.extraction_error is not None


# ══════════════════════════════════════════════════════════════════════════════
# 3. Metadata JSON Tests
# ══════════════════════════════════════════════════════════════════════════════

class TestMetadataJSON:
    def test_metadata_json_schema(self, db_session, tmp_path):
        """metadata.json must contain all required top-level keys and a non-empty frames list."""
        with patch("backend.app.services.ingestion_service.PROJECT_ROOT", tmp_path):
            video_path = make_synthetic_video(tmp_path / "meta_test.mp4", duration_sec=3.0, fps=30.0)
            mission = Mission(
                name="Meta Test",
                video_filename="meta_test.mp4",
                video_path=str(video_path),
                video_fps=30.0,
                video_width=640,
                video_height=480,
                video_total_frames=90,
                video_duration_seconds=3.0,
                ingestion_status=IngestionStatus.UPLOADED,
            )
            db_session.add(mission)
            db_session.commit()

            config = ExtractFramesRequest(interval_sec=1.0)
            IngestionService.extract_frames(db_session, mission.id, config)
            db_session.refresh(mission)

            assert mission.metadata_json_path is not None
            meta_path = Path(mission.metadata_json_path)
            assert meta_path.exists()

            with open(meta_path) as fh:
                meta = json.load(fh)

            # Required top-level keys
            for key in ("video_name", "fps", "resolution", "duration_sec",
                        "total_frames", "extracted_frame_count",
                        "extraction_interval_sec", "frames"):
                assert key in meta, f"metadata.json is missing key '{key}'"

            assert isinstance(meta["frames"], list)
            assert len(meta["frames"]) > 0

            # Per-frame schema
            for entry in meta["frames"]:
                for fkey in ("frame_id", "frame_index", "timestamp_sec", "file", "file_size_bytes"):
                    assert fkey in entry, f"Frame entry missing key '{fkey}'"
                assert entry["timestamp_sec"] >= 0.0
                assert entry["frame_index"] >= 0


# ══════════════════════════════════════════════════════════════════════════════
# 4. API Endpoint Tests
# ══════════════════════════════════════════════════════════════════════════════

class TestIngestionAPI:
    def test_upload_unsupported_extension_returns_400(self, api_client):
        """Uploading a .exe file must return HTTP 400."""
        # Create a mission first
        res = api_client.post("/api/v1/missions", json={"name": "API Test Mission"})
        assert res.status_code == 201
        mission_id = res.json()["id"]

        fake_content = b"PK\x03\x04 fake exe content"
        res = api_client.post(
            f"/api/v1/missions/{mission_id}/upload",
            files={"file": ("payload.exe", fake_content, "application/octet-stream")},
        )
        assert res.status_code == 400
        assert "Unsupported" in res.json()["detail"]

    def test_upload_corrupt_video_returns_422(self, api_client):
        """Uploading random bytes as .mp4 must return HTTP 422 after probe failure."""
        res = api_client.post("/api/v1/missions", json={"name": "Corrupt Video Test"})
        assert res.status_code == 201
        mission_id = res.json()["id"]

        garbage = b"\x00\xff\xab\xcd" * 256
        res = api_client.post(
            f"/api/v1/missions/{mission_id}/upload",
            files={"file": ("flight.mp4", garbage, "video/mp4")},
        )
        assert res.status_code == 422

    def test_upload_valid_video_returns_probe_data(self, api_client, tmp_path):
        """Uploading a valid synthetic video returns FPS, resolution, and duration."""
        video_path = make_synthetic_video(tmp_path / "api_test.mp4", fps=25.0, duration_sec=2.0)

        res = api_client.post("/api/v1/missions", json={"name": "API Upload Test"})
        assert res.status_code == 201
        mission_id = res.json()["id"]

        with open(video_path, "rb") as vf:
            res = api_client.post(
                f"/api/v1/missions/{mission_id}/upload",
                files={"file": ("api_test.mp4", vf, "video/mp4")},
            )

        assert res.status_code == 200, res.text
        data = res.json()
        assert data["ingestion_status"] == "UPLOADED"
        assert data["video_fps"] == pytest.approx(25.0, abs=1.0)
        assert data["video_width"] == 640
        assert data["video_height"] == 480
        assert data["video_total_frames"] > 0

    def test_status_endpoint_returns_ingestion_state(self, api_client, tmp_path):
        """GET /missions/{id}/status returns IngestionStatusResponse with correct fields."""
        video_path = make_synthetic_video(tmp_path / "status_test.mp4", fps=30.0, duration_sec=2.0)

        res = api_client.post("/api/v1/missions", json={"name": "Status Test"})
        mission_id = res.json()["id"]

        with open(video_path, "rb") as vf:
            api_client.post(
                f"/api/v1/missions/{mission_id}/upload",
                files={"file": ("status_test.mp4", vf, "video/mp4")},
            )

        res = api_client.get(f"/api/v1/missions/{mission_id}/status")
        assert res.status_code == 200
        status = res.json()

        assert status["mission_id"] == mission_id
        assert status["ingestion_status"] == "UPLOADED"
        assert status["video_fps"] is not None
        assert status["video_width"] == 640
        assert status["video_height"] == 480

    def test_status_404_for_unknown_mission(self, api_client):
        """Status endpoint returns 404 for a non-existent mission."""
        res = api_client.get("/api/v1/missions/nonexistent-id/status")
        assert res.status_code == 404

    def test_extract_frames_requires_uploaded_video(self, api_client):
        """Calling extract-frames on a mission with no video must return 400."""
        res = api_client.post("/api/v1/missions", json={"name": "No Video Mission"})
        mission_id = res.json()["id"]

        res = api_client.post(
            f"/api/v1/missions/{mission_id}/extract-frames",
            json={"interval_sec": 1.0},
        )
        assert res.status_code == 400
        assert "No video" in res.json()["detail"]
