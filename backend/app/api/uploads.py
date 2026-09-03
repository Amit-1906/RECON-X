"""
File upload API endpoints for UAV video and telemetry files.
"""
from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.schemas.mission import MissionResponse
from backend.app.services.upload_service import UploadService

router = APIRouter(prefix="/uploads", tags=["Uploads"])


@router.post("/missions/{mission_id}/video", response_model=MissionResponse)
async def upload_mission_video(
    mission_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    return await UploadService.handle_video_upload(db, mission_id, file)


@router.post("/missions/{mission_id}/telemetry", response_model=MissionResponse)
async def upload_mission_telemetry(
    mission_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    return await UploadService.handle_telemetry_upload(db, mission_id, file)
