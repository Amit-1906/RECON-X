"""
Pydantic schemas for Results and Artifacts (Pydantic v2).
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict

class ArtifactResponse(BaseModel):
    id: int
    job_id: str
    artifact_type: str
    stage_name: str
    file_path: str
    file_size_bytes: int
    metadata_json: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class QualityReportResponse(BaseModel):
    job_id: str
    mission_id: str
    status: str
    total_frames_extracted: int
    keyframes_selected: int
    keyframe_reduction_ratio: float
    reconstructed_3d_points: int
    mesh_triangles_count: int
    mean_reprojection_error_px: float
    estimated_gsd_cm: float
    georeferenced_bounds: Dict[str, Any] = Field(default_factory=dict)
    confidence_score_mean: float
    artifacts: Dict[str, str] = Field(default_factory=dict)
    stages_metrics: Dict[str, Any] = Field(default_factory=dict)
