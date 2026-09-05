#!/usr/bin/env python3
"""
Custom UAV Video Ingestion & Pipeline Runner for Development / Coding.

Use this script to attach and run any drone video through the photogrammetry
reconstruction pipeline during coding and experimentation.

Usage:
  # Auto-detects video in test_videos/ folder:
  python scripts/process_custom_video.py

  # Or specify a custom video path:
  python scripts/process_custom_video.py --video path/to/your/flight_video.mp4

  # Run with specific telemetry parameters:
  python scripts/process_custom_video.py --video test_videos/flight.mp4 --altitude 50 --gsd 1.2
"""

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import cv2
from backend.app.core.config import PROJECT_ROOT as BACKEND_ROOT
from backend.app.core.database import SessionLocal
from backend.app.models.mission import Mission
from backend.app.pipeline.runner import PipelineRunner

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("custom_video_runner")

SUPPORTED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".ts", ".mts"}


def find_default_video() -> Path:
    """Finds the first supported video file in test_videos or storage/test_videos."""
    search_dirs = [
        PROJECT_ROOT / "test_videos",
        PROJECT_ROOT / "storage" / "test_videos",
        PROJECT_ROOT / "storage" / "demo_run"
    ]
    for directory in search_dirs:
        if directory.exists():
            for f in sorted(directory.iterdir()):
                if f.is_file() and f.suffix.lower() in SUPPORTED_EXTENSIONS:
                    return f
    return None


def probe_video(video_path: Path) -> dict:
    """Extracts resolution, FPS, total frames, and duration from video using OpenCV."""
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise ValueError(f"Unable to open video file: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0.0
    cap.release()

    size_bytes = video_path.stat().st_size
    size_mb = size_bytes / (1024 * 1024)

    return {
        "width": width,
        "height": height,
        "fps": round(fps, 2),
        "total_frames": total_frames,
        "duration_sec": round(duration, 2),
        "size_mb": round(size_mb, 2)
    }


def main():
    parser = argparse.ArgumentParser(description="Process Custom UAV Flight Video for Pipeline Coding")
    parser.add_argument(
        "--video",
        type=str,
        default=None,
        help="Path to the video file (defaults to first video found in test_videos/)"
    )
    parser.add_argument(
        "--altitude",
        type=float,
        default=45.0,
        help="Flight altitude in meters AGL (default: 45.0)"
    )
    parser.add_argument(
        "--gsd",
        type=float,
        default=1.5,
        help="Target ground sample distance in cm/pixel (default: 1.5)"
    )
    parser.add_argument(
        "--device",
        type=str,
        default="auto",
        choices=["auto", "cuda", "cpu"],
        help="Compute device (default: auto)"
    )
    parser.add_argument(
        "--mission-name",
        type=str,
        default=None,
        help="Optional custom mission name"
    )

    args = parser.parse_args()

    # 1. Resolve video file path
    if args.video:
        video_path = Path(args.video).resolve()
        if not video_path.exists():
            logger.error(f"Provided video file does not exist: {video_path}")
            sys.exit(1)
    else:
        video_path = find_default_video()
        if not video_path:
            logger.error(
                "No video file found! Please place a drone video (e.g., input_video.mp4) inside:\n"
                f"  -> {PROJECT_ROOT / 'test_videos'}\n"
                "Or specify the path using: python scripts/process_custom_video.py --video <path>"
            )
            sys.exit(1)

    print("=" * 78)
    print("      UAV 3D RECONSTRUCTION PIPELINE: CUSTOM VIDEO DEV RUNNER       ")
    print("=" * 78)

    # 2. Probe video metadata
    logger.info(f"Target Video: {video_path}")
    meta = probe_video(video_path)
    logger.info(
        f"Specs: {meta['width']}x{meta['height']} @ {meta['fps']} FPS | "
        f"{meta['total_frames']} frames | {meta['duration_sec']}s duration | {meta['size_mb']} MB"
    )

    # 3. Create or attach Mission in database
    mission_name = args.mission_name or f"Dev Survey — {video_path.stem}"
    db = SessionLocal()
    try:
        mission = Mission(
            name=mission_name,
            description=f"Local development video: {video_path.name}",
            flight_altitude_m=args.altitude,
            target_gsd_cm=args.gsd,
            video_path=str(video_path),
            video_filename=video_path.name,
            video_size_bytes=float(video_path.stat().st_size),
            video_duration_seconds=meta["duration_sec"],
            status="ready"
        )
        db.add(mission)
        db.commit()
        db.refresh(mission)
        logger.info(f"Registered Dev Mission: ID={mission.id} ('{mission.name}')")

        # 4. Launch Pipeline Execution
        job_id = f"dev_job_{int(time.time())}"
        logger.info(f"Starting Pipeline execution (Job ID={job_id})...")

        runner = PipelineRunner(
            job_id=job_id,
            mission_id=mission.id,
            video_path=str(video_path),
            flight_altitude_m=args.altitude,
            target_gsd_cm=args.gsd,
            preferred_device=args.device
        )

        t_start = time.time()
        results = runner.run()
        elapsed = round(time.time() - t_start, 2)

        # 5. Report deliverables
        art_dir = BACKEND_ROOT / "storage" / "artifacts" / job_id
        print("\n" + "=" * 78)
        print(f"PIPELINE RUN COMPLETED in {elapsed}s | JOB ID: {job_id}")
        print("=" * 78)
        print(f"Artifacts output directory: {art_dir}")
        print("\nGenerated deliverables:")
        for stage_name, art_dict in results.items():
            print(f"  • Stage: {stage_name}")
            if isinstance(art_dict, dict):
                for k, v in art_dict.items():
                    p = Path(v) if isinstance(v, str) else None
                    size_str = f"({round(p.stat().st_size / 1024, 1)} KB)" if p and p.exists() else ""
                    print(f"      - {k}: {v} {size_str}")

        print("\nYou can also view this mission and 3D digital twin in the UI at:")
        print("  -> http://localhost:5173/")
        print("=" * 78)

    finally:
        db.close()


if __name__ == "__main__":
    main()
