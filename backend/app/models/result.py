"""
SQLAlchemy models for Reconstruction Artifacts and Quality Metrics.
"""
from datetime import datetime
from sqlalchemy import Column, String, Float, DateTime, Text, Integer, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

class ArtifactRegistry(Base):
    __tablename__ = "artifact_registry"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(String(36), ForeignKey("jobs.id"), nullable=False)
    
    artifact_type = Column(String(100), nullable=False) # sparse_ply, dense_ply, mesh_obj, mesh_mtl, texture_png, quality_report, poses_json
    stage_name = Column(String(100), nullable=False)
    
    file_path = Column(String(512), nullable=False)
    file_size_bytes = Column(Integer, default=0)
    metadata_json = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)

    job = relationship("Job", back_populates="artifacts")
