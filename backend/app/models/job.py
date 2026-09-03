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

    @property
    def rapid_model_ready(self) -> bool:
        """True if Level 1 Rapid Model is available (Stage 6 geometry completed)."""
        for s in self.stages:
            if s.stage_name == "geometry" and s.status == "completed":
                return True
        return False

    @property
    def refined_model_ready(self) -> bool:
        """True if Level 2 Refined Model is fully completed."""
        return self.status == "completed"

    @property
    def real_time_metrics(self) -> dict:
        """Extracts real verified stage counts for honest progress reporting."""
        import json
        summary = {
            "frames_extracted": None,
            "keyframes_selected": None,
            "dynamic_objects_masked": None,
            "cameras_registered": None,
            "dense_points": None,
            "triangles": None,
            "confidence_high_pct": None,
        }
        for s in self.stages:
            if s.status == "completed" and s.metrics_json:
                try:
                    m = json.loads(s.metrics_json)
                    if s.stage_name == "preprocessing":
                        summary["frames_extracted"] = m.get("extracted_frames_count") or m.get("frames_extracted")
                    elif s.stage_name == "keyframe_selection":
                        summary["keyframes_selected"] = m.get("selected_keyframes_count") or m.get("keyframes_selected")
                    elif s.stage_name == "dynamic_masking":
                        summary["dynamic_objects_masked"] = m.get("total_dynamic_objects_detected") or m.get("dynamic_masks_count")
                    elif s.stage_name == "geometry":
                        summary["cameras_registered"] = m.get("successful_image_registrations") or m.get("number_of_cameras")
                    elif s.stage_name == "dense_point_cloud":
                        summary["dense_points"] = m.get("dense_points_count") or m.get("number_of_points")
                    elif s.stage_name == "mesh_generation":
                        summary["triangles"] = m.get("triangles") or m.get("faces")
                    elif s.stage_name == "confidence_estimation":
                        summary["confidence_high_pct"] = m.get("high_confidence_percentage")
                except Exception:
                    pass
        return summary


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
