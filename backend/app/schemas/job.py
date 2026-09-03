"""
Pydantic schemas for Reconstruction Jobs (Pydantic v2).
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict

class JobStageResponse(BaseModel):
    id: int
    stage_name: str
    stage_order: int
    status: str
    execution_time_seconds: float
    checkpoint_dir: Optional[str] = None
    metrics_json: Optional[str] = None
    error_detail: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class JobCreate(BaseModel):
    mission_id: str
    preferred_device: str = "auto" # auto, cuda, cpu
    start_from_stage: Optional[str] = None # For resuming from specific stage

class JobResponse(BaseModel):
    id: str
    mission_id: str
    status: str
    current_stage: str
    progress_percent: float
    preferred_device: str
    active_device: str
    error_message: Optional[str] = None
    error_stage: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    updated_at: datetime
    stages: List[JobStageResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
