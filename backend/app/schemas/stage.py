"""
Pydantic contracts for Reconstruction Pipeline Stages.
Every stage consumes StageInput and returns StageOutput.
"""
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field


class CameraIntrinsics(BaseModel):
    focal_length_px: float
    principal_point_x: float
    principal_point_y: float
    distortion_coeffs: List[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0, 0.0, 0.0])
    image_width: int
    image_height: int


class StageInput(BaseModel):
    job_id: str
    mission_id: str
    stage_name: str
    checkpoint_dir: str
    previous_checkpoint_dir: Optional[str] = None
    parameters: Dict[str, Any] = Field(default_factory=dict)
    device: str = "cpu"
    hardware_info: Dict[str, Any] = Field(default_factory=dict)
    
    # Mission-level flight & camera telemetry
    video_path: Optional[str] = None
    telemetry_path: Optional[str] = None
    flight_altitude_m: float = 60.0
    focal_length_mm: float = 35.0
    sensor_width_mm: float = 35.9
    sensor_height_mm: float = 24.0
    target_gsd_cm: float = 1.5
    
    # Contextual artifacts from previous stages
    input_artifacts: Dict[str, str] = Field(default_factory=dict)


class StageOutput(BaseModel):
    stage_name: str
    status: str = "completed"  # completed, failed, skipped
    execution_time_seconds: float = 0.0
    checkpoint_dir: str
    artifacts: Dict[str, str] = Field(default_factory=dict) # artifact_name -> file_path
    metrics: Dict[str, Any] = Field(default_factory=dict)
    summary: str = ""
    error_detail: Optional[str] = None
    resumable: bool = True
