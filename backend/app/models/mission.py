"""
SQLAlchemy models for Missions.
"""
from datetime import datetime
import uuid
from sqlalchemy import Column, String, Float, Integer, DateTime, Text
from sqlalchemy.orm import relationship
from backend.app.core.database import Base


class Mission(Base):
    __tablename__ = "missions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), default="draft")  # draft, ready, processing, completed, failed

    # UAV & Camera specifications
    drone_model = Column(String(100), default="DJI Matrice 300 RTK")
    camera_model = Column(String(100), default="Zenmuse P1")
    sensor_width_mm = Column(Float, default=35.9)   # Full-frame 35mm equivalent or custom sensor
    sensor_height_mm = Column(Float, default=24.0)
    focal_length_mm = Column(Float, default=35.0)
    flight_altitude_m = Column(Float, default=60.0)
    target_gsd_cm = Column(Float, default=1.5)
    overlap_forward_percent = Column(Float, default=80.0)
    overlap_side_percent = Column(Float, default=70.0)

    # Input Files
    video_filename = Column(String(255), nullable=True)
    video_path = Column(String(512), nullable=True)
    video_size_bytes = Column(Float, default=0.0)
    video_duration_seconds = Column(Float, default=0.0)
    telemetry_path = Column(String(512), nullable=True)
    telemetry_type = Column(String(50), nullable=True)  # SRT, CSV, GPX

    # ── Phase 1: Video Ingestion ───────────────────────────────────────────────
    # Status lifecycle: UPLOADED → VALIDATING → EXTRACTING → COMPLETED | FAILED
    ingestion_status = Column(String(50), nullable=True)

    # Real video probe data (populated after upload + OpenCV inspection)
    video_fps = Column(Float, nullable=True)
    video_width = Column(Integer, nullable=True)
    video_height = Column(Integer, nullable=True)
    video_total_frames = Column(Integer, nullable=True)
    video_codec = Column(String(50), nullable=True)

    # Frame extraction configuration and results
    extraction_interval_sec = Column(Float, default=0.5)
    extraction_max_dimension = Column(Integer, default=1920)  # longest-axis cap; 0 = no resize
    extracted_frame_count = Column(Integer, default=0)
    frames_dir = Column(String(512), nullable=True)           # path to storage/frames/{id}/
    metadata_json_path = Column(String(512), nullable=True)   # path to metadata.json

    # Error details when ingestion_status == FAILED
    extraction_error = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    jobs = relationship("Job", back_populates="mission", cascade="all, delete-orphan")
    frames = relationship("IngestionFrame", back_populates="mission", cascade="all, delete-orphan")

