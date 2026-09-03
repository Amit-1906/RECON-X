"""
Phase 1 Ingestion Service — Video validation, probing, and frame extraction.

Responsibilities:
  1. Validate file extension and decodability.
  2. Probe video metadata (FPS, resolution, frame count, duration, codec).
  3. Check available disk storage before extraction.
  4. Extract frames at a configurable interval using cv2.VideoCapture.
  5. Write metadata.json manifest to the frames directory.
  6. Update Mission DB record with live progress (every 10 frames).
  7. Manage the ingestion_status lifecycle:
       UPLOADED → VALIDATING → EXTRACTING → COMPLETED | FAILED
"""
import json
import logging
import shutil
from pathlib import Path
from typing import Optional

import cv2
from fastapi import UploadFile, HTTPException
from sqlalchemy.orm import Session

from backend.app.core.config import PROJECT_ROOT
from backend.app.models.frame import IngestionFrame
from backend.app.models.mission import Mission
from backend.app.schemas.ingestion import VideoProbeResult, ExtractFramesRequest

logger = logging.getLogger(__name__)

# ── Allowed formats ────────────────────────────────────────────────────────────
ALLOWED_VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".ts", ".mts"}
ALLOWED_TELEMETRY_EXTS = {".srt", ".csv", ".gpx", ".txt", ".json"}

# Minimum free disk space (bytes) required before extraction starts
MIN_FREE_BYTES = 500 * 1024 * 1024  # 500 MB


# ── Ingestion Status Constants ─────────────────────────────────────────────────
class IngestionStatus:
    UPLOADED = "UPLOADED"
    VALIDATING = "VALIDATING"
    EXTRACTING = "EXTRACTING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class IngestionService:

    # ── Video Upload & Probe ───────────────────────────────────────────────────

    @staticmethod
    def probe_video(file_path: Path, original_filename: str) -> VideoProbeResult:
        """
        Open video with OpenCV and read header metadata.
        Returns VideoProbeResult with valid=False and an error string on any failure.
        """
        try:
            cap = cv2.VideoCapture(str(file_path))
            if not cap.isOpened():
                return VideoProbeResult(valid=False, error="OpenCV could not open the file — it may be corrupted or use an unsupported codec.")

            fps = cap.get(cv2.CAP_PROP_FPS)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

            # Attempt to read the first frame to confirm the stream is decodable
            ret, _ = cap.read()
            cap.release()

            if not ret:
                return VideoProbeResult(valid=False, error="Video header is readable but frame decoding failed — stream may be truncated or corrupted.")

            if fps <= 0 or width == 0 or height == 0:
                return VideoProbeResult(valid=False, error=f"Invalid video properties: FPS={fps}, resolution={width}x{height}.")

            duration_sec = round(total_frames / fps, 4) if fps > 0 else 0.0
            codec_fourcc = int(cap.get(cv2.CAP_PROP_FOURCC) if cap.isOpened() else 0)
            codec = "".join([chr((codec_fourcc >> (8 * i)) & 0xFF) for i in range(4)]).strip("\x00") or "unknown"

            return VideoProbeResult(
                valid=True,
                video_name=original_filename,
                fps=round(fps, 4),
                width=width,
                height=height,
                total_frames=total_frames,
                duration_sec=duration_sec,
                file_size_bytes=file_path.stat().st_size,
                codec=codec,
            )

        except Exception as exc:
            logger.exception("Video probe error for %s", file_path)
            return VideoProbeResult(valid=False, error=f"Unexpected error during video probe: {exc}")

    @staticmethod
    async def handle_video_upload(db: Session, mission_id: str, file: UploadFile) -> Mission:
        """
        Save an uploaded drone video to disk, probe it with OpenCV, and persist metadata.
        Sets ingestion_status = UPLOADED on success.
        Raises HTTPException on validation failures.
        """
        mission = db.query(Mission).filter(Mission.id == mission_id).first()
        if not mission:
            raise HTTPException(status_code=404, detail=f"Mission '{mission_id}' not found.")

        # ── Extension check ────────────────────────────────────────────────────
        ext = Path(file.filename).suffix.lower()
        if ext not in ALLOWED_VIDEO_EXTS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported video format '{ext}'. Allowed: {', '.join(sorted(ALLOWED_VIDEO_EXTS))}."
            )

        # ── Storage availability check ─────────────────────────────────────────
        upload_dir = PROJECT_ROOT / "storage" / "uploads" / mission_id
        upload_dir.mkdir(parents=True, exist_ok=True)

        try:
            usage = shutil.disk_usage(str(upload_dir))
            if usage.free < MIN_FREE_BYTES:
                raise HTTPException(
                    status_code=507,
                    detail=f"Insufficient storage: only {usage.free // (1024**2)} MB free, need at least {MIN_FREE_BYTES // (1024**2)} MB."
                )
        except HTTPException:
            raise
        except Exception:
            pass  # Non-critical; proceed with upload

        # ── Save file to disk ──────────────────────────────────────────────────
        target_path = upload_dir / f"uav_flight_video{ext}"
        try:
            with open(target_path, "wb") as buf:
                shutil.copyfileobj(file.file, buf)
        except OSError as exc:
            raise HTTPException(status_code=500, detail=f"Failed to write video to disk: {exc}")

        # ── Probe video ────────────────────────────────────────────────────────
        mission.ingestion_status = IngestionStatus.VALIDATING
        db.commit()

        probe = IngestionService.probe_video(target_path, file.filename)
        if not probe.valid:
            # Clean up the invalid file so storage is not wasted
            target_path.unlink(missing_ok=True)
            mission.ingestion_status = IngestionStatus.FAILED
            mission.extraction_error = probe.error
            db.commit()
            raise HTTPException(status_code=422, detail=f"Video validation failed: {probe.error}")

        # ── Persist probe data ─────────────────────────────────────────────────
        mission.video_filename = file.filename
        mission.video_path = str(target_path)
        mission.video_size_bytes = float(probe.file_size_bytes or 0)
        mission.video_duration_seconds = probe.duration_sec or 0.0
        mission.video_fps = probe.fps
        mission.video_width = probe.width
        mission.video_height = probe.height
        mission.video_total_frames = probe.total_frames
        mission.video_codec = probe.codec
        mission.ingestion_status = IngestionStatus.UPLOADED
        mission.extraction_error = None
        mission.status = "ready"

        db.commit()
        db.refresh(mission)
        logger.info("Video uploaded and probed for mission %s: %s %dx%d @ %.2f fps, %d frames",
                    mission_id, file.filename, probe.width, probe.height, probe.fps, probe.total_frames)
        return mission

    # ── Frame Extraction ───────────────────────────────────────────────────────

    @staticmethod
    def extract_frames(db: Session, mission_id: str, config: ExtractFramesRequest) -> None:
        """
        Synchronous frame extraction — run via asyncio.to_thread() from the API layer.

        Algorithm:
          1. Compute target frame indices from interval_sec and video FPS.
          2. Seek to each target frame using CAP_PROP_POS_FRAMES (exact seek).
          3. Optionally downscale the longest axis to config.max_dimension.
          4. Write JPEG to storage/frames/{mission_id}/frame_NNNNNN.jpg.
          5. Create an IngestionFrame DB row for each written frame.
          6. Update mission.extracted_frame_count every 10 frames (live progress).
          7. Write metadata.json after all frames are extracted.
          8. Set ingestion_status = COMPLETED (or FAILED on error).
        """
        mission = db.query(Mission).filter(Mission.id == mission_id).first()
        if not mission:
            logger.error("extract_frames: mission %s not found", mission_id)
            return

        if not mission.video_path or not Path(mission.video_path).exists():
            _set_failed(db, mission, "Video file not found on disk. Please re-upload.")
            return

        # ── Persist extraction config ──────────────────────────────────────────
        mission.extraction_interval_sec = config.interval_sec
        mission.extraction_max_dimension = config.max_dimension
        mission.ingestion_status = IngestionStatus.EXTRACTING
        mission.extracted_frame_count = 0
        mission.extraction_error = None

        # Delete previous frames for this mission (idempotent re-run)
        db.query(IngestionFrame).filter(IngestionFrame.mission_id == mission_id).delete()
        db.commit()

        # ── Prepare output directory ───────────────────────────────────────────
        frames_dir = PROJECT_ROOT / "storage" / "frames" / mission_id
        frames_dir.mkdir(parents=True, exist_ok=True)
        mission.frames_dir = str(frames_dir)
        db.commit()

        try:
            cap = cv2.VideoCapture(str(mission.video_path))
            if not cap.isOpened():
                _set_failed(db, mission, "OpenCV could not re-open video for extraction.")
                return

            fps = mission.video_fps or cap.get(cv2.CAP_PROP_FPS) or 30.0
            total_frames = mission.video_total_frames or int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

            # Compute the set of source frame indices to extract
            interval_frames = max(1, round(fps * config.interval_sec))
            target_indices = list(range(0, total_frames, interval_frames))

            logger.info("Extracting %d frames from %d total (interval=%.2fs, every %d frames)",
                        len(target_indices), total_frames, config.interval_sec, interval_frames)

            written_frames = []
            batch_size = 10

            for i, frame_idx in enumerate(target_indices):
                timestamp_sec = round(frame_idx / fps, 6)
                frame_id = f"frame_{frame_idx:06d}"
                out_path = frames_dir / f"{frame_id}.jpg"

                # Exact seek to target frame
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
                ret, frame = cap.read()
                if not ret or frame is None:
                    logger.warning("Frame %d could not be decoded — skipping.", frame_idx)
                    continue

                # Optional downscale
                if config.max_dimension > 0:
                    h, w = frame.shape[:2]
                    longest = max(h, w)
                    if longest > config.max_dimension:
                        scale = config.max_dimension / longest
                        new_w, new_h = int(w * scale), int(h * scale)
                        frame = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)

                # Write JPEG
                encode_params = [cv2.IMWRITE_JPEG_QUALITY, config.jpeg_quality]
                success = cv2.imwrite(str(out_path), frame, encode_params)
                if not success:
                    logger.warning("cv2.imwrite failed for frame %d — skipping.", frame_idx)
                    continue

                file_size = out_path.stat().st_size
                written_frames.append({
                    "frame_id": frame_id,
                    "frame_index": frame_idx,
                    "timestamp_sec": timestamp_sec,
                    "file": out_path.name,
                    "file_path": str(out_path),
                    "file_size_bytes": file_size,
                })

                # Create DB row
                db_frame = IngestionFrame(
                    mission_id=mission_id,
                    frame_index=frame_idx,
                    frame_id=frame_id,
                    timestamp_sec=timestamp_sec,
                    file_path=str(out_path),
                    file_size_bytes=file_size,
                )
                db.add(db_frame)

                # Flush progress to DB every batch_size frames
                if (i + 1) % batch_size == 0:
                    mission.extracted_frame_count = len(written_frames)
                    db.commit()
                    logger.debug("Extraction progress: %d/%d frames written", len(written_frames), len(target_indices))

            cap.release()

            # Final DB flush
            mission.extracted_frame_count = len(written_frames)
            db.commit()

            # ── Write metadata.json ────────────────────────────────────────────
            metadata = {
                "video_name": mission.video_filename,
                "fps": mission.video_fps,
                "resolution": [mission.video_width, mission.video_height],
                "duration_sec": mission.video_duration_seconds,
                "total_frames": mission.video_total_frames,
                "codec": mission.video_codec,
                "extracted_frame_count": len(written_frames),
                "extraction_interval_sec": config.interval_sec,
                "extraction_max_dimension": config.max_dimension,
                "jpeg_quality": config.jpeg_quality,
                "frames": [
                    {
                        "frame_id": f["frame_id"],
                        "frame_index": f["frame_index"],
                        "timestamp_sec": f["timestamp_sec"],
                        "file": f["file"],
                        "file_size_bytes": f["file_size_bytes"],
                    }
                    for f in written_frames
                ],
            }

            meta_path = frames_dir / "metadata.json"
            with open(meta_path, "w", encoding="utf-8") as fh:
                json.dump(metadata, fh, indent=2)

            mission.metadata_json_path = str(meta_path)
            mission.ingestion_status = IngestionStatus.COMPLETED
            db.commit()

            logger.info("Frame extraction COMPLETED for mission %s: %d frames written to %s",
                        mission_id, len(written_frames), frames_dir)

        except Exception as exc:
            logger.exception("Frame extraction FAILED for mission %s", mission_id)
            _set_failed(db, mission, str(exc))

    # ── Telemetry Upload ───────────────────────────────────────────────────────

    @staticmethod
    async def handle_telemetry_upload(db: Session, mission_id: str, file: UploadFile) -> Mission:
        """Save a companion telemetry file (SRT/CSV/GPX) for the mission."""
        mission = db.query(Mission).filter(Mission.id == mission_id).first()
        if not mission:
            raise HTTPException(status_code=404, detail=f"Mission '{mission_id}' not found.")

        ext = Path(file.filename).suffix.lower()
        if ext not in ALLOWED_TELEMETRY_EXTS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported telemetry format '{ext}'. Allowed: {', '.join(sorted(ALLOWED_TELEMETRY_EXTS))}."
            )

        upload_dir = PROJECT_ROOT / "storage" / "uploads" / mission_id
        upload_dir.mkdir(parents=True, exist_ok=True)

        target_path = upload_dir / f"telemetry{ext}"
        with open(target_path, "wb") as buf:
            shutil.copyfileobj(file.file, buf)

        mission.telemetry_path = str(target_path)
        mission.telemetry_type = ext.replace(".", "").upper()
        db.commit()
        db.refresh(mission)
        return mission


# ── Helpers ────────────────────────────────────────────────────────────────────

def _set_failed(db: Session, mission: Mission, error: str) -> None:
    """Mark a mission's ingestion as FAILED with an error message."""
    mission.ingestion_status = IngestionStatus.FAILED
    mission.extraction_error = error
    try:
        db.commit()
    except Exception:
        db.rollback()
    logger.error("Ingestion FAILED for mission %s: %s", mission.id, error)
