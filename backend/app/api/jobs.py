"""
Reconstruction Job management and execution API.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.schemas.job import JobCreate, JobResponse
from backend.app.services.job_service import JobService

from backend.app.api.system import get_system_hardware_status

router = APIRouter(prefix="/jobs", tags=["Jobs"])


@router.post("", response_model=JobResponse, status_code=202)
def create_job(job_in: JobCreate, db: Session = Depends(get_db)):
    return JobService.create_and_dispatch_job(db, job_in)


@router.get("/{job_id}", response_model=JobResponse)
def get_job_status(job_id: str, db: Session = Depends(get_db)):
    job = JobService.get_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")
    
    # Enrich with live hardware utilization
    resp = JobResponse.model_validate(job)
    resp.system_status = get_system_hardware_status()
    return resp


@router.post("/{job_id}/resume", response_model=JobResponse)
def resume_job(
    job_id: str,
    from_stage: Optional[str] = Query(None, description="Stage name to resume from"),
    db: Session = Depends(get_db)
):
    return JobService.resume_job(db, job_id, start_from_stage=from_stage)


@router.post("/{job_id}/cancel", response_model=JobResponse)
def cancel_job(job_id: str, db: Session = Depends(get_db)):
    """Cancels an ongoing reconstruction job."""
    return JobService.cancel_job(db, job_id)


@router.get("/mission/{mission_id}", response_model=List[JobResponse])
def list_mission_jobs(mission_id: str, db: Session = Depends(get_db)):
    return JobService.list_jobs_for_mission(db, mission_id)

