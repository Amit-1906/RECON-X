"""
SQLAlchemy models for Reconstruction Jobs and Stages.
"""
from datetime import datetime
import uuid
from sqlalchemy import Column, String, Float, DateTime, Text, Integer, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

class Job(Base):
    __tablename__ = "jobs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    mission_id = Column(String(36), ForeignKey("missions.id"), nullable=False)
    
    status = Column(String(50), default="pending") # pending, running, paused, completed, failed, resumed
    current_stage = Column(String(100), default="preprocessing")
    progress_percent = Column(Float, default=0.0)
    
    preferred_device = Column(String(20), default="auto") # auto, cuda, cpu
    active_device = Column(String(50), default="cpu")
    
    error_message = Column(Text, nullable=True)
    error_stage = Column(String(100), nullable=True)
    
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    mission = relationship("Mission", back_populates="jobs")
    stages = relationship("JobStage", back_populates="job", cascade="all, delete-orphan", order_by="JobStage.stage_order")
    artifacts = relationship("ArtifactRegistry", back_populates="job", cascade="all, delete-orphan")


class JobStage(Base):
    __tablename__ = "job_stages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(String(36), ForeignKey("jobs.id"), nullable=False)
    
    stage_name = Column(String(100), nullable=False)
    stage_order = Column(Integer, nullable=False)
    status = Column(String(50), default="pending") # pending, running, completed, failed, skipped
    
    execution_time_seconds = Column(Float, default=0.0)
    checkpoint_dir = Column(String(512), nullable=True)
    metrics_json = Column(Text, nullable=True)
    error_detail = Column(Text, nullable=True)
    
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    job = relationship("Job", back_populates="stages")
