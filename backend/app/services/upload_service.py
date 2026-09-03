"""
Upload service handling UAV video and telemetry ingestion with metadata inspection,
magic-byte validation, path sanitization, and maximum file-size enforcement.
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
MAX_UPLOAD_SIZE_BYTES = 2048 * 1024 * 1024  # 2 GB Maximum Upload Size
CHUNK_SIZE = 1024 * 1024  # 1 MB chunk streaming


class UploadService:
    @staticmethod
    def validate_video_magic_bytes(header_bytes: bytes, ext: str) -> bool:
        """
        Validates binary magic bytes to ensure file matches declared video format
        and is not a renamed malicious payload.
        """
        if len(header_bytes) < 8:
            return False

        if ext in (".mp4", ".mov"):
            # ISO Base Media File Format: bytes 4-8 usually contain 'ftyp'
            return b"ftyp" in header_bytes[:16] or b"moov" in header_bytes[:32] or b"wide" in header_bytes[:16]
        elif ext == ".avi":
            # RIFF container with AVI chunk
            return header_bytes.startswith(b"RIFF") and b"AVI " in header_bytes[:16]
        elif ext == ".mkv":
            # Matroska EBML ID: 0x1A 0x45 0xDF 0xA3
            return header_bytes.startswith(b"\x1a\x45\xdf\xa3")

        return True

    @staticmethod
    def inspect_video(file_path: Path) -> Dict[str, Any]:
        """Inspects video stream properties via OpenCV."""
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

        # 1. Path sanitization (prevent directory traversal)
        safe_filename = Path(file.filename or "uav_flight_video.mp4").name
        ext = Path(safe_filename).suffix.lower()

        if ext not in ALLOWED_VIDEO_EXTS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid video format '{ext}'. Supported: {', '.join(ALLOWED_VIDEO_EXTS)}"
            )

        mission_upload_dir = PROJECT_ROOT / "storage" / "uploads" / mission_id
        mission_upload_dir.mkdir(parents=True, exist_ok=True)
        target_file = mission_upload_dir / f"uav_flight_video{ext}"

        # 2. Stream chunks with size enforcement and magic-byte validation
        total_uploaded = 0
        first_chunk = True

        with open(target_file, "wb") as buffer:
            while True:
                chunk = await file.read(CHUNK_SIZE)
                if not chunk:
                    break

                if first_chunk:
                    # Validate magic bytes on initial bytes
                    if not UploadService.validate_video_magic_bytes(chunk, ext):
                        target_file.unlink(missing_ok=True)
                        raise HTTPException(
                            status_code=400,
                            detail="Security Check Failed: File binary signature does not match declared video container."
                        )
                    first_chunk = False

                total_uploaded += len(chunk)
                if total_uploaded > MAX_UPLOAD_SIZE_BYTES:
                    target_file.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=413,
                        detail=f"Payload Too Large: Video exceeds maximum allowed size of {MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)} MB."
                    )

                buffer.write(chunk)

        # 3. OpenCV video stream validation
        video_meta = UploadService.inspect_video(target_file)
        if not video_meta.get("valid", False):
            target_file.unlink(missing_ok=True)
            raise HTTPException(
                status_code=400,
                detail=f"Corrupt or unreadable video file: {video_meta.get('error', 'Decode error')}"
            )

        mission.video_filename = safe_filename
        mission.video_path = str(target_file)
        mission.video_size_bytes = float(total_uploaded)
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

        safe_filename = Path(file.filename or "telemetry.csv").name
        ext = Path(safe_filename).suffix.lower()
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
