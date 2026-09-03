"""
Pydantic schemas for Missions (Pydantic v2).
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict


class MissionBase(BaseModel):
    name: str
    description: Optional[str] = None
    drone_model: str = "DJI Matrice 300 RTK"
    camera_model: str = "Zenmuse P1"
    sensor_width_mm: float = 35.9
    sensor_height_mm: float = 24.0
    focal_length_mm: float = 35.0
    flight_altitude_m: float = 60.0
    target_gsd_cm: float = 1.5
    overlap_forward_percent: float = 80.0
    overlap_side_percent: float = 70.0


class MissionCreate(MissionBase):
    pass


class MissionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    flight_altitude_m: Optional[float] = None
    focal_length_mm: Optional[float] = None
    target_gsd_cm: Optional[float] = None


class MissionResponse(MissionBase):
    id: str
    status: str

    # Upload info
    video_filename: Optional[str] = None
    video_path: Optional[str] = None
    video_size_bytes: float = 0.0
    video_duration_seconds: float = 0.0
    telemetry_path: Optional[str] = None
    telemetry_type: Optional[str] = None

    # Phase 1: ingestion lifecycle
    ingestion_status: Optional[str] = None
    extraction_error: Optional[str] = None

    # Phase 1: video probe data
    video_fps: Optional[float] = None
    video_width: Optional[int] = None
    video_height: Optional[int] = None
    video_total_frames: Optional[int] = None
    video_codec: Optional[str] = None

    # Phase 1: frame extraction results
    extraction_interval_sec: float = 0.5
    extraction_max_dimension: int = 1920
    extracted_frame_count: int = 0
    frames_dir: Optional[str] = None
    metadata_json_path: Optional[str] = None

    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
