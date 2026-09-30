"""
Pydantic v2 schemas for Phase 1 Video Ingestion and Frame Extraction.
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field


# ── Video Probe ────────────────────────────────────────────────────────────────

class VideoProbeResult(BaseModel):
    """Raw metadata extracted from the video file via OpenCV."""
    valid: bool
    error: Optional[str] = None

    # Populated when valid=True
    video_name: Optional[str] = None
    fps: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    total_frames: Optional[int] = None
    duration_sec: Optional[float] = None
    file_size_bytes: Optional[int] = None
    codec: Optional[str] = None


# ── Extraction Config ──────────────────────────────────────────────────────────

class ExtractFramesRequest(BaseModel):
    """
    Request body for POST /missions/{id}/extract-frames.
    Controls how densely frames are sampled and whether they are downscaled.
    """
    interval_sec: float = Field(
        default=0.5,
        ge=0.1,
        le=60.0,
        description="Base sampling interval. Range: 0.1s – 60.0s."
    )
    max_dimension: int = Field(
        default=1920,
        ge=0,
        le=7680,
        description="Downscale longest image axis to this pixel count. 0 = no resize."
    )
    jpeg_quality: int = Field(
        default=90,
        ge=50,
        le=100,
        description="JPEG compression quality for stored frames. Range: 50–100."
    )
    adaptive_sampling: bool = Field(
        default=True,
        description="Enable motion-aware and quality-aware adaptive frame selection."
    )
    frame_min_interval: float = Field(
        default=0.2,
        ge=0.05,
        le=10.0,
        description="Minimum seconds between sampled frames during high-motion segments."
    )
    frame_max_interval: float = Field(
        default=2.5,
        ge=0.2,
        le=30.0,
        description="Maximum seconds between sampled frames during low-motion/hover segments."
    )
    blur_threshold: float = Field(
        default=35.0,
        ge=0.0,
        description="Laplacian variance threshold below which blurry frames are discarded."
    )
    frame_similarity_threshold: float = Field(
        default=0.92,
        ge=0.5,
        le=1.0,
        description="Threshold above which duplicate or near-duplicate frames are skipped."
    )
    min_feature_count: int = Field(
        default=40,
        ge=0,
        description="Minimum feature points required to consider a frame informative."
    )
    max_keyframes: int = Field(
        default=300,
        ge=2,
        le=2000,
        description="Upper ceiling on keyframes extracted to bound downstream compute."
    )



# ── Frame Metadata ─────────────────────────────────────────────────────────────

class FrameResponse(BaseModel):
    """Metadata for a single extracted frame."""
    id: str
    mission_id: str
    frame_index: int
    frame_id: str                   # e.g. "frame_000120"
    timestamp_sec: float            # exact wall-clock position = frame_index / fps
    file_path: str
    file_size_bytes: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Ingestion Status ───────────────────────────────────────────────────────────

class IngestionStatusResponse(BaseModel):
    """
    Full snapshot of a mission's Phase 1 ingestion state.
    Returned by GET /missions/{id}/status — used by the frontend polling loop.
    """
    mission_id: str
    mission_name: str

    # Lifecycle status
    ingestion_status: Optional[str] = None   # UPLOADED | VALIDATING | EXTRACTING | COMPLETED | FAILED
    extraction_error: Optional[str] = None

    # Video probe data
    video_filename: Optional[str] = None
    video_size_bytes: float = 0.0
    video_fps: Optional[float] = None
    video_width: Optional[int] = None
    video_height: Optional[int] = None
    video_total_frames: Optional[int] = None
    video_duration_seconds: float = 0.0
    video_codec: Optional[str] = None

    # Extraction configuration
    extraction_interval_sec: float = 0.5
    extraction_max_dimension: int = 1920

    # Extraction results
    extracted_frame_count: int = 0
    estimated_frame_count: Optional[int] = None  # computed from duration / interval
    frames_dir: Optional[str] = None
    metadata_json_path: Optional[str] = None

    # Extracted frames (populated after COMPLETED)
    frames: List[FrameResponse] = []

    model_config = ConfigDict(from_attributes=True)
