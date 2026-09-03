"""
SQLAlchemy model for IngestionFrame — one row per extracted video frame.
"""
from datetime import datetime
import uuid
from sqlalchemy import Column, String, Float, Integer, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.core.database import Base


class IngestionFrame(Base):
    """
    Stores metadata for each frame extracted from a drone video during Phase 1 ingestion.
    The actual image is stored at `file_path` on disk as a JPEG.
    """
    __tablename__ = "ingestion_frames"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    mission_id = Column(String(36), ForeignKey("missions.id", ondelete="CASCADE"), nullable=False, index=True)

    # Position in the original video
    frame_index = Column(Integer, nullable=False)          # source frame number in the video
    frame_id = Column(String(64), nullable=False)          # e.g. "frame_000120"
    timestamp_sec = Column(Float, nullable=False)          # wall-clock position = frame_index / fps

    # Storage
    file_path = Column(String(512), nullable=False)        # absolute path to .jpg on disk
    file_size_bytes = Column(Integer, default=0)           # size of the JPEG file

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    mission = relationship("Mission", back_populates="frames")
