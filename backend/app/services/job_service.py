"""
Job service managing reconstruction job lifecycles, background execution,
resumption from checkpoints, and stage progress synchronization.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import json
import logging
from pathlib import Path
from typing import Optional, List
from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.app.core.database import SessionLocal
from backend.app.core.device import device_manager
from backend.app.models.mission import Mission
from backend.app.models.job import Job, JobStage
from backend.app.models.result import ArtifactRegistry
from backend.app.pipeline.registry import ORDERED_STAGES
from backend.app.pipeline.runner import PipelineRunner
from backend.app.schemas.job import JobCreate
from backend.app.schemas.stage import StageOutput

logger = logging.getLogger("uav_reconstruction.job_service")
executor = ThreadPoolExecutor(max_workers=2)
_cancelled_jobs = set()


class JobService:
    @staticmethod
    def cancel_job(db: Session, job_id: str) -> Job:
        """Cancels a pending or running reconstruction job."""
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

        if job.status in ("completed", "cancelled"):
            return job

        _cancelled_jobs.add(job_id)
        job.status = "cancelled"
        job.error_message = "Job execution was cancelled by user request."
        mission = db.query(Mission).filter(Mission.id == job.mission_id).first()
        if mission:
            mission.status = "failed"

        db.commit()
        db.refresh(job)
        logger.info(f"Job {job_id} marked as cancelled by user request.")
        return job

    @staticmethod
    def create_and_dispatch_job(db: Session, job_in: JobCreate) -> Job:
        mission = db.query(Mission).filter(Mission.id == job_in.mission_id).first()
        if not mission:
            raise HTTPException(status_code=404, detail=f"Mission {job_in.mission_id} not found.")

        if not mission.video_path:
            raise HTTPException(status_code=400, detail="Mission has no uploaded video to reconstruct.")

        # Create Job
        job = Job(
            mission_id=mission.id,
            status="pending",
            current_stage=job_in.start_from_stage or ORDERED_STAGES[0],
            preferred_device=job_in.preferred_device,
            active_device=device_manager.resolve_device(job_in.preferred_device)
        )
        db.add(job)
        db.flush()

        # Initialize the 11 stages
        for idx, s_name in enumerate(ORDERED_STAGES):
            j_stage = JobStage(
                job_id=job.id,
                stage_name=s_name,
                stage_order=idx + 1,
                status="pending"
            )
            db.add(j_stage)

        mission.status = "processing"
        db.commit()
        db.refresh(job)

        # Dispatch background thread
        executor.submit(
            JobService._execute_job_background,
            job.id,
            mission.id,
            job_in.start_from_stage
        )

        return job

    @staticmethod
    def resume_job(db: Session, job_id: str, start_from_stage: Optional[str] = None) -> Job:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

        mission = db.query(Mission).filter(Mission.id == job.mission_id).first()
        if not mission:
            raise HTTPException(status_code=404, detail="Associated mission not found.")

        # If no stage specified, find the first failed or pending stage
        resume_stage = start_from_stage
        if not resume_stage:
            if job.error_stage:
                resume_stage = job.error_stage
            else:
                for s in job.stages:
                    if s.status in ("failed", "pending"):
                        resume_stage = s.stage_name
                        break
        
        if not resume_stage:
            resume_stage = ORDERED_STAGES[0]

        job.status = "resumed"
        job.error_message = None
        job.error_stage = None
        job.current_stage = resume_stage
        mission.status = "processing"
        db.commit()
        db.refresh(job)

        logger.info(f"Resuming job {job_id} starting at stage '{resume_stage}'")
        executor.submit(
            JobService._execute_job_background,
            job.id,
            mission.id,
            resume_stage
        )
        return job

    @staticmethod
    def _execute_job_background(job_id: str, mission_id: str, start_from_stage: Optional[str]):
        db = SessionLocal()
        try:
            job = db.query(Job).filter(Job.id == job_id).first()
            mission = db.query(Mission).filter(Mission.id == mission_id).first()
            if not job or not mission:
                return

            job.status = "running"
            job.started_at = datetime.utcnow()
            db.commit()

            def on_start(stage_name: str, stage_order: int):
                sub_db = SessionLocal()
                try:
                    s_rec = sub_db.query(JobStage).filter(
                        JobStage.job_id == job_id, JobStage.stage_name == stage_name
                    ).first()
                    j_rec = sub_db.query(Job).filter(Job.id == job_id).first()
                    if s_rec:
                        s_rec.status = "running"
                        s_rec.started_at = datetime.utcnow()
                    if j_rec:
                        j_rec.current_stage = stage_name
                        # Progress based on completed stages
                        j_rec.progress_percent = round(((stage_order - 1) / float(len(ORDERED_STAGES))) * 100.0, 1)
                    sub_db.commit()
                finally:
                    sub_db.close()

            def on_complete(stage_name: str, stage_order: int, output: StageOutput):
                sub_db = SessionLocal()
                try:
                    s_rec = sub_db.query(JobStage).filter(
                        JobStage.job_id == job_id, JobStage.stage_name == stage_name
                    ).first()
                    j_rec = sub_db.query(Job).filter(Job.id == job_id).first()
                    if s_rec:
                        s_rec.status = "completed"
                        s_rec.completed_at = datetime.utcnow()
                        s_rec.execution_time_seconds = output.execution_time_seconds
                        s_rec.checkpoint_dir = output.checkpoint_dir
                        s_rec.metrics_json = json.dumps(output.metrics)
                    if j_rec:
                        j_rec.progress_percent = round((stage_order / float(len(ORDERED_STAGES))) * 100.0, 1)

                    # Register generated artifacts
                    for art_type, art_path in output.artifacts.items():
                        path_obj = Path(art_path)
                        f_size = path_obj.stat().st_size if path_obj.exists() else 0
                        reg = ArtifactRegistry(
                            job_id=job_id,
                            artifact_type=art_type,
                            stage_name=stage_name,
                            file_path=str(art_path),
                            file_size_bytes=f_size,
                            metadata_json=json.dumps({"stage_order": stage_order})
                        )
                        sub_db.add(reg)

                    sub_db.commit()
                finally:
                    sub_db.close()

            def on_failed(stage_name: str, stage_order: int, error_msg: str):
                sub_db = SessionLocal()
                try:
                    s_rec = sub_db.query(JobStage).filter(
                        JobStage.job_id == job_id, JobStage.stage_name == stage_name
                    ).first()
                    j_rec = sub_db.query(Job).filter(Job.id == job_id).first()
                    m_rec = sub_db.query(Mission).filter(Mission.id == mission_id).first()
                    if s_rec:
                        s_rec.status = "failed"
                        s_rec.completed_at = datetime.utcnow()
                        s_rec.error_detail = error_msg
                    if j_rec:
                        j_rec.status = "failed"
                        j_rec.error_stage = stage_name
                        j_rec.error_message = error_msg
                    if m_rec:
                        m_rec.status = "failed"
                    sub_db.commit()
                finally:
                    sub_db.close()

            runner = PipelineRunner(
                job_id=job_id,
                mission_id=mission_id,
                video_path=mission.video_path,
                telemetry_path=mission.telemetry_path,
                flight_altitude_m=mission.flight_altitude_m,
                focal_length_mm=mission.focal_length_mm,
                sensor_width_mm=mission.sensor_width_mm,
                target_gsd_cm=mission.target_gsd_cm,
                preferred_device=job.preferred_device,
                on_stage_start=on_start,
                on_stage_complete=on_complete,
                on_stage_failed=on_failed,
                cancellation_check=lambda: job_id in _cancelled_jobs
            )

            result = runner.run(start_from_stage=start_from_stage)

            if job_id in _cancelled_jobs:
                job.status = "cancelled"
                job.error_message = "Job execution cancelled by user request."
                mission.status = "failed"
            else:
                # Finalize completed job
                job.status = "completed"
                job.progress_percent = 100.0
                job.completed_at = datetime.utcnow()
                mission.status = "completed"
            db.commit()

        except Exception as e:
            if job_id in _cancelled_jobs:
                job.status = "cancelled"
                job.error_message = "Job execution cancelled by user request."
            else:
                logger.exception(f"Job execution failed for job {job_id}: {e}")
                job.status = "failed"
                job.error_message = str(e)
            mission.status = "failed"
            db.commit()
        finally:
            _cancelled_jobs.discard(job_id)
            db.close()

    @staticmethod
    def get_job(db: Session, job_id: str) -> Optional[Job]:
        return db.query(Job).filter(Job.id == job_id).first()

    @staticmethod
    def list_jobs_for_mission(db: Session, mission_id: str) -> List[Job]:
        return db.query(Job).filter(Job.mission_id == mission_id).order_by(Job.started_at.desc()).all()
