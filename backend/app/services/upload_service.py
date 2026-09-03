"""
Upload service handling UAV video and telemetry ingestion with metadata inspection.
"""
from pathlib import Path
import shutil
from typing import Dict, Any, Tuple
import cv2
from fastapi import UploadFile, HTTPException
from sqlalchemy.orm import Session

from backend.app.core.config import PROJECT_ROOT
from backend.app.models.mission import Mission

ALLOWED_VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv"}
ALLOWED_TELEMETRY_EXTS = {".srt", ".csv", ".gpx", ".txt", ".json"}


class UploadService:
    @staticmethod
    def inspect_video(file_path: Path) -> Dict[str, Any]:
        cap = cv2.VideoCapture(str(file_path))
        if not cap.isOpened():
            return {"valid": False, "error": "Unable to decode video format."}
        
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        duration = round(frame_count / fps, 2) if fps > 0 else 0.0
        cap.release()

        return {
            "valid": True,
            "width": w,
            "height": h,
            "fps": round(fps, 2),
            "frame_count": frame_count,
            "duration_seconds": duration
        }

    @staticmethod
    async def handle_video_upload(db: Session, mission_id: str, file: UploadFile) -> Mission:
        mission = db.query(Mission).filter(Mission.id == mission_id).first()
        if not mission:
            raise HTTPException(status_code=404, detail=f"Mission {mission_id} not found.")

        ext = Path(file.filename).suffix.lower()
        if ext not in ALLOWED_VIDEO_EXTS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid video format '{ext}'. Supported: {', '.join(ALLOWED_VIDEO_EXTS)}"
            )

        mission_upload_dir = PROJECT_ROOT / "storage" / "uploads" / mission_id
        mission_upload_dir.mkdir(parents=True, exist_ok=True)

        target_file = mission_upload_dir / f"uav_flight_video{ext}"
        with open(target_file, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        size_bytes = target_file.stat().st_size
        video_meta = UploadService.inspect_video(target_file)

        mission.video_filename = file.filename
        mission.video_path = str(target_file)
        mission.video_size_bytes = float(size_bytes)
        mission.video_duration_seconds = video_meta.get("duration_seconds", 0.0)
        mission.status = "ready"

        db.commit()
        db.refresh(mission)
        return mission

    @staticmethod
    async def handle_telemetry_upload(db: Session, mission_id: str, file: UploadFile) -> Mission:
        mission = db.query(Mission).filter(Mission.id == mission_id).first()
        if not mission:
            raise HTTPException(status_code=404, detail=f"Mission {mission_id} not found.")

        ext = Path(file.filename).suffix.lower()
        if ext not in ALLOWED_TELEMETRY_EXTS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid telemetry format '{ext}'. Supported: {', '.join(ALLOWED_TELEMETRY_EXTS)}"
            )

        mission_upload_dir = PROJECT_ROOT / "storage" / "uploads" / mission_id
        mission_upload_dir.mkdir(parents=True, exist_ok=True)

        target_file = mission_upload_dir / f"telemetry{ext}"
        with open(target_file, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        mission.telemetry_path = str(target_file)
        mission.telemetry_type = ext.replace(".", "").upper()

        db.commit()
        db.refresh(mission)
        return mission
