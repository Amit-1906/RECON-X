#!/usr/bin/env python3
"""
Autonomous End-to-End UAV 3D Reconstruction Demo Workflow.

Demonstrates the complete photogrammetry pipeline:
  VIDEO UPLOAD -> PREPROCESSING -> KEYFRAME SELECTION -> DYNAMIC MASKING ->
  TRAJECTORY -> SfM -> DENSE RECONSTRUCTION -> POINT CLOUD -> MESH ->
  TEXTURE -> GEOREFERENCING -> CONFIDENCE -> DIGITAL TWIN -> VALIDATION & BENCHMARKING.

Executes autonomously and verifies all 3D digital twin deliverables.
"""
import json
import logging
import sys
import time
from pathlib import Path
import cv2
import numpy as np

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.core.config import PROJECT_ROOT as BACKEND_ROOT
from backend.app.core.database import SessionLocal
from backend.app.models.mission import Mission
from backend.app.models.job import Job
from backend.app.pipeline.runner import PipelineRunner
from backend.app.services.job_service import JobService

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] [%(levelname)s] %(message)s")
logger = logging.getLogger("demo_reconstruction")


def create_synthetic_uav_survey_video(output_path: Path, num_frames: int = 40) -> Path:
    """Generates synthetic UAV aerial video with textured ground features and moving objects."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(str(output_path), fourcc, 10.0, (640, 480))

    # Base terrain canvas with geometric structure
    canvas = np.zeros((480, 640, 3), dtype=np.uint8)
    canvas[:] = (50, 55, 65)  # Dark ground

    # Static ground features
    for idx in range(36):
        gx = 60 + (idx % 6) * 95
        gy = 50 + (idx // 6) * 70
        cv2.rectangle(canvas, (gx - 20, gy - 20), (gx + 20, gy + 20), (120, 140, 100), -1)
        cv2.circle(canvas, (gx, gy), 12, (200, 180, 90), -1)

    for f_idx in range(num_frames):
        frame = canvas.copy()

        # Simulated drone forward translation
        shift_x = int(f_idx * 3.5)
        M = np.float32([[1, 0, -shift_x % 100], [0, 1, 0]])
        frame = cv2.warpAffine(frame, M, (640, 480), borderMode=cv2.BORDER_REFLECT)

        # Dynamic moving vehicle (to exercise Stage 4 YOLOv8 dynamic masking)
        car_x = 100 + (f_idx * 12) % 450
        car_y = 240
        cv2.rectangle(frame, (car_x - 22, car_y - 12), (car_x + 22, car_y + 12), (30, 40, 220), -1)

        out.write(frame)

    out.release()
    logger.info(f"Generated synthetic UAV survey video: {output_path} ({num_frames} frames)")
    return output_path


def run_reproducible_demo():
    print("=" * 76)
    print("      UAV 3D DIGITAL TWIN PLATFORM: REPRODUCIBLE DEMO WORKFLOW      ")
    print("=" * 76)

    demo_dir = PROJECT_ROOT / "storage" / "demo_run"
    demo_dir.mkdir(parents=True, exist_ok=True)
    video_path = demo_dir / "uav_flight_survey.mp4"

    # Step 1: Generate Video
    create_synthetic_uav_survey_video(video_path, num_frames=30)

    # Step 2: Ingest into Database & Create Mission
    db = SessionLocal()
    try:
        mission = Mission(
            name="Autonomous Demonstration Survey Alpha",
            description="End-to-End 13-Stage Photogrammetry Pipeline Demo",
            flight_altitude_m=45.0,
            target_gsd_cm=1.8,
            video_path=str(video_path),
            video_filename=video_path.name,
            video_size_bytes=float(video_path.stat().st_size),
            video_duration_seconds=3.0,
            status="ready"
        )
        db.add(mission)
        db.commit()
        db.refresh(mission)
        logger.info(f"Mission registered: ID={mission.id}, Name='{mission.name}'")

        # Step 3: Instantiate and Execute Pipeline
        job_id = f"demo_job_{int(time.time())}"
        logger.info(f"Launching PipelineRunner for Job ID={job_id}...")

        runner = PipelineRunner(
            job_id=job_id,
            mission_id=mission.id,
            video_path=str(video_path),
            flight_altitude_m=45.0,
            target_gsd_cm=1.8,
            preferred_device="auto"
        )

        t_start = time.time()
        results = runner.run()
        total_time = round(time.time() - t_start, 2)

        # Step 4: Verify Core Deliverables Exist
        art_dir = BACKEND_ROOT / "storage" / "artifacts" / job_id
        expected_artifacts = [
            ("Level 1 Rapid Model (GLB)", art_dir / "geometry" / "rapid_model.glb"),
            ("Level 2 Georeferenced Model (GLB)", art_dir / "georeferencing" / "georeferenced_model.glb"),
            ("Photorealistic Textured Model (GLB)", art_dir / "texture_mapping" / "textured_model.glb"),
            ("Evidence-Based Confidence Map (GLB)", art_dir / "confidence_estimation" / "confidence_map.glb"),
            ("Watertight Surface Mesh (PLY)", art_dir / "mesh_generation" / "model_clean.ply"),
            ("Dense MVS Point Cloud (PLY)", art_dir / "dense_point_cloud" / "dense_point_cloud.ply"),
            ("Scientific Benchmark Report (PDF)", art_dir / "validation" / "benchmark_report.pdf"),
            ("Benchmark Evaluation (JSON)", art_dir / "validation" / "benchmark_report.json"),
            ("Quality Certification (JSON)", art_dir / "validation" / "quality_report.json")
        ]

        print("\n" + "-" * 76)
        print("                  VERIFICATION OF DIGITAL TWIN DELIVERABLES         ")
        print("-" * 76)

        all_ok = True
        for name, path in expected_artifacts:
            exists = path.exists() and path.stat().st_size > 0
            size_kb = round(path.stat().st_size / 1024.0, 1) if exists else 0
            status_str = f"PASS ({size_kb} KB)" if exists else "MISSING"
            print(f"  [✓] {name:<42} : {status_str}")
            if not exists:
                all_ok = False

        print("-" * 76)
        if all_ok:
            print(f"SUCCESS: Complete workflow executed in {total_time}s with 100% deliverables.")
            print(f"Interactive 3D Digital Twin ready for inspection at http://localhost:5173/")
        else:
            print("WARNING: Some deliverables were not generated.")

    finally:
        db.close()


if __name__ == "__main__":
    run_reproducible_demo()
