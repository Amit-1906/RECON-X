"""
Pydantic schemas for Phase 2: Frame Quality Assessment.
"""
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class FrameQualityResult(BaseModel):
    """Quality metrics for a single frame."""
    frame_id: str
    filepath: str
    timestamp_sec: float
    
    # Core Metrics (normalized 0-1.0 or similar appropriate scale before final aggregation)
    sharpness: float
    exposure: float
    contrast: float
    compression: float
    feature_score: float
    redundancy: float
    
    # Raw extracted values for UI display if needed
    laplacian_var: float
    mean_luminance: float
    feature_count: int

    # Final Aggregation
    overall_quality: int  # 0 to 100
    classification: str   # "HIGH", "MEDIUM", "LOW"
    usable: bool

    model_config = ConfigDict(from_attributes=True)


class QualityHistogramBin(BaseModel):
    bin_start: int
    bin_end: int
    count: int


class QualityReportResponse(BaseModel):
    """Full quality report returned to the frontend dashboard."""
    total_frames: int
    usable_frames: int
    high_quality_count: int
    medium_quality_count: int
    low_quality_count: int
    
    mean_overall_quality: float
    
    histogram: List[QualityHistogramBin]
    frames: List[FrameQualityResult]

    model_config = ConfigDict(from_attributes=True)
