"""
Pytest configuration and test fixtures.
Generates synthetic UAV flight video with textured geometrical targets for real CV testing.
"""
import os
from pathlib import Path
import tempfile
import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.core.database import Base, get_db
from backend.app.main import app

TEST_DB_FILE = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
TEST_SQLALCHEMY_URL = f"sqlite:///{TEST_DB_FILE.name}"

engine = create_engine(TEST_SQLALCHEMY_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    if os.path.exists(TEST_DB_FILE.name):
        try:
            os.remove(TEST_DB_FILE.name)
        except Exception:
            pass


@pytest.fixture
def db_session():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture(scope="session")
def sample_uav_video(tmp_path_factory):
    """
    Generates a realistic synthetic UAV survey flight video:
    Simulates a drone flying forward over ground terrain with high-contrast calibration targets and structures.
    """
    video_dir = tmp_path_factory.mktemp("uav_data")
    video_path = video_dir / "flight_test.mp4"

    w, h = 640, 480
    fps = 10.0
    duration_sec = 2.0
    n_frames = int(fps * duration_sec)

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(str(video_path), fourcc, fps, (w, h))

    # Pre-generate ground texture map (large canvas)
    canvas_w, canvas_h = 1600, 1200
    canvas = np.zeros((canvas_h, canvas_w, 3), dtype=np.uint8)
    canvas[:] = (85, 125, 95)

    # Seed random for deterministic reproducible textures
    rng = np.random.RandomState(42)

    # 1. Background noise & road network
    noise = rng.randint(0, 30, (canvas_h, canvas_w, 3), dtype=np.uint8)
    canvas = cv2.add(canvas, noise)
    # Roads
    cv2.line(canvas, (0, 300), (canvas_w, 300), (60, 60, 60), 20)
    cv2.line(canvas, (0, 700), (canvas_w, 700), (60, 60, 60), 20)
    cv2.line(canvas, (500, 0), (500, canvas_h), (60, 60, 60), 20)
    cv2.line(canvas, (1100, 0), (1100, canvas_h), (60, 60, 60), 20)

    # 2. Buildings, roofs, parking lots, and high-frequency corners
    for gx in range(50, canvas_w - 100, 70):
        for gy in range(50, canvas_h - 100, 65):
            # Building roof
            c_roof = (int(rng.randint(150, 240)), int(rng.randint(120, 200)), int(rng.randint(120, 200)))
            cv2.rectangle(canvas, (gx, gy), (gx + 40, gy + 35), c_roof, -1)
            cv2.rectangle(canvas, (gx, gy), (gx + 40, gy + 35), (20, 20, 20), 2)
            # Center target marker
            cv2.drawMarker(canvas, (gx + 20, gy + 17), (0, 0, 0), cv2.MARKER_CROSS, 8, 2)
            cv2.circle(canvas, (gx + 20, gy + 17), 3, (255, 255, 255), -1)

    # UAV flight path: moves along X axis with smooth altitude
    for frame_idx in range(n_frames):
        cam_x = int(60 + frame_idx * 25)
        cam_y = int(80 + frame_idx * 6)
        crop = canvas[cam_y:cam_y + h, cam_x:cam_x + w]
        if crop.shape[0] != h or crop.shape[1] != w:
            crop = cv2.resize(crop, (w, h))
        out.write(crop)

    out.release()
    return str(video_path)
