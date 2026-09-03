"""
Phase 1 Ingestion API endpoints.

Routes:
  POST /missions/{id}/upload          — Upload drone video, validate + probe
  POST /missions/{id}/telemetry       — Upload companion telemetry file
  POST /missions/{id}/extract-frames  — Trigger background frame extraction
  GET  /missions/{id}/status          — Full ingestion status + probe data
  GET  /missions/{id}/frames          — Paginated list of extracted frames
  GET  /missions/{id}/frames/{idx}    — Single frame metadata by frame_index
"""
import asyncio
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.models.frame import IngestionFrame
from backend.app.models.mission import Mission
from backend.app.schemas.ingestion import (
    ExtractFramesRequest,
    FrameResponse,
    IngestionStatusResponse,
)
from backend.app.schemas.mission import MissionResponse
from backend.app.services.ingestion_service import IngestionService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/missions", tags=["Phase1 Ingestion"])


# ── Upload ─────────────────────────────────────────────────────────────────────

@router.post("/{mission_id}/upload", response_model=MissionResponse)
async def upload_mission_video(
    mission_id: str,
    file: UploadFile = File(..., description="Drone flight video (.mp4, .mov, .avi, .mkv, .webm, .ts, .mts)"),
    db: Session = Depends(get_db),
):
    """
    Upload a drone video for a mission.

    - Validates file extension
    - Saves video to `storage/uploads/{mission_id}/`
    - Probes video with OpenCV: FPS, resolution, frame count, duration, codec
    - Sets ingestion_status = UPLOADED on success
    - Returns full mission record with probe data

    Raises 400 for unsupported format, 422 for corrupted/undecodable video,
    507 if storage is insufficient.
    """
    return await IngestionService.handle_video_upload(db, mission_id, file)


@router.post("/{mission_id}/telemetry", response_model=MissionResponse)
async def upload_mission_telemetry(
    mission_id: str,
    file: UploadFile = File(..., description="GPS telemetry log (.srt, .csv, .gpx, .txt, .json)"),
    db: Session = Depends(get_db),
):
    """Upload a companion GPS/telemetry file for the mission."""
    return await IngestionService.handle_telemetry_upload(db, mission_id, file)


# ── Frame Extraction ───────────────────────────────────────────────────────────

@router.post("/{mission_id}/extract-frames", status_code=202)
async def extract_frames(
    mission_id: str,
    config: ExtractFramesRequest = ExtractFramesRequest(),
    db: Session = Depends(get_db),
):
    """
    Trigger asynchronous frame extraction for an uploaded mission video.

    - Runs in a background thread (non-blocking) via asyncio.to_thread
    - Returns 202 Accepted immediately; poll GET /missions/{id}/status for progress
    - ingestion_status transitions: EXTRACTING → COMPLETED | FAILED

    Body (all optional, defaults shown):
      interval_sec: 0.5     — extract one frame every N seconds
      max_dimension: 1920   — downscale longest axis to this limit (0 = no resize)
      jpeg_quality: 90      — JPEG compression quality (50–100)
    """
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail=f"Mission '{mission_id}' not found.")

    if not mission.video_path:
        raise HTTPException(
            status_code=400,
            detail="No video uploaded for this mission. POST /missions/{id}/upload first."
        )

    # Guard: don't allow re-extraction while one is running
    if mission.ingestion_status == "EXTRACTING":
        raise HTTPException(
            status_code=409,
            detail="Frame extraction is already in progress for this mission."
        )

    # Spawn extraction in a background thread — does not block the HTTP response
    asyncio.get_event_loop().run_in_executor(
        None,  # default ThreadPoolExecutor
        lambda: IngestionService.extract_frames(db, mission_id, config),
    )

    return {
        "message": "Frame extraction started.",
        "mission_id": mission_id,
        "interval_sec": config.interval_sec,
        "max_dimension": config.max_dimension,
        "jpeg_quality": config.jpeg_quality,
        "status_url": f"/api/v1/missions/{mission_id}/status",
    }


# ── Status ─────────────────────────────────────────────────────────────────────

@router.get("/{mission_id}/status", response_model=IngestionStatusResponse)
def get_mission_ingestion_status(
    mission_id: str,
    include_frames: bool = Query(default=False, description="Include full frame list in response"),
    db: Session = Depends(get_db),
):
    """
    Return the full Phase 1 ingestion status for a mission.

    Includes video probe data, ingestion lifecycle status, extracted frame count,
    and optionally the full list of IngestionFrame records.

    Poll this endpoint at ~1.5s intervals while ingestion_status == EXTRACTING.
    """
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail=f"Mission '{mission_id}' not found.")

    # Estimate total frame count from duration + interval
    estimated = None
    if mission.video_duration_seconds and mission.extraction_interval_sec:
        estimated = max(1, int(mission.video_duration_seconds / mission.extraction_interval_sec))

    frames: List[IngestionFrame] = []
    if include_frames:
        frames = (
            db.query(IngestionFrame)
            .filter(IngestionFrame.mission_id == mission_id)
            .order_by(IngestionFrame.frame_index)
            .all()
        )

    return IngestionStatusResponse(
        mission_id=mission.id,
        mission_name=mission.name,
        ingestion_status=mission.ingestion_status,
        extraction_error=mission.extraction_error,
        video_filename=mission.video_filename,
        video_size_bytes=mission.video_size_bytes or 0.0,
        video_fps=mission.video_fps,
        video_width=mission.video_width,
        video_height=mission.video_height,
        video_total_frames=mission.video_total_frames,
        video_duration_seconds=mission.video_duration_seconds or 0.0,
        video_codec=mission.video_codec,
        extraction_interval_sec=mission.extraction_interval_sec or 0.5,
        extraction_max_dimension=mission.extraction_max_dimension or 1920,
        extracted_frame_count=mission.extracted_frame_count or 0,
        estimated_frame_count=estimated,
        frames_dir=mission.frames_dir,
        metadata_json_path=mission.metadata_json_path,
        frames=[FrameResponse.model_validate(f) for f in frames],
    )


# ── Frame List ─────────────────────────────────────────────────────────────────

@router.get("/{mission_id}/frames", response_model=List[FrameResponse])
def list_mission_frames(
    mission_id: str,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """
    Return a paginated list of extracted frames for a mission.
    Ordered by frame_index ascending.
    """
    mission = db.query(Mission).filter(Mission.id == mission_id).first()
    if not mission:
        raise HTTPException(status_code=404, detail=f"Mission '{mission_id}' not found.")

    frames = (
        db.query(IngestionFrame)
        .filter(IngestionFrame.mission_id == mission_id)
        .order_by(IngestionFrame.frame_index)
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [FrameResponse.model_validate(f) for f in frames]


@router.get("/{mission_id}/frames/{frame_index}", response_model=FrameResponse)
def get_mission_frame(
    mission_id: str,
    frame_index: int,
    db: Session = Depends(get_db),
):
    """Return metadata for a single frame by its source frame_index."""
    frame = (
        db.query(IngestionFrame)
        .filter(
            IngestionFrame.mission_id == mission_id,
            IngestionFrame.frame_index == frame_index,
        )
        .first()
    )
    if not frame:
        raise HTTPException(
            status_code=404,
            detail=f"Frame at index {frame_index} not found for mission '{mission_id}'."
        )
    return FrameResponse.model_validate(frame)
