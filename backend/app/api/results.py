"""
Artifact and Quality Report API endpoints.
"""
from pathlib import Path
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.schemas.result import ArtifactResponse, QualityReportResponse
from backend.app.services.result_service import ResultService

router = APIRouter(prefix="/results", tags=["Results & Artifacts"])


@router.get("/{job_id}/artifacts", response_model=List[ArtifactResponse])
def get_job_artifacts(job_id: str, db: Session = Depends(get_db)):
    return ResultService.get_artifacts_for_job(db, job_id)


@router.get("/{job_id}/quality-report", response_model=QualityReportResponse)
def get_job_quality_report(job_id: str, db: Session = Depends(get_db)):
    return ResultService.get_quality_report(db, job_id)


@router.get("/{job_id}/download/{artifact_type}")
def download_artifact(job_id: str, artifact_type: str, db: Session = Depends(get_db)):
    artifact = ResultService.get_artifact_by_type(db, job_id, artifact_type)
    if not artifact or not Path(artifact.file_path).exists():
        raise HTTPException(
            status_code=404,
            detail=f"Artifact '{artifact_type}' for job '{job_id}' not found."
        )

    p = Path(artifact.file_path)
    media_types = {
        ".ply": "application/octet-stream",
        ".obj": "text/plain",
        ".mtl": "text/plain",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".json": "application/json"
    }
    media_type = media_types.get(p.suffix.lower(), "application/octet-stream")
    return FileResponse(path=str(p), media_type=media_type, filename=p.name)

@router.get("/{job_id}/frame-quality")
def get_frame_quality_report(job_id: str, db: Session = Depends(get_db)):
    """Fetch the Phase 2 detailed frame quality report."""
    from backend.app.models.job import Job
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")
    
    quality_json_path = Path(job.checkpoint_dir) / "frame_quality.json"
    if not quality_json_path.exists():
        raise HTTPException(status_code=404, detail="Frame quality report not found yet.")
        
    import json
    with open(quality_json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    return data

@router.get("/{job_id}/keyframes")
def get_keyframes_report(job_id: str, db: Session = Depends(get_db)):
    """Fetch the Phase 3 keyframes selection report."""
    from backend.app.models.job import Job
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")
    
    keyframes_json_path = Path(job.checkpoint_dir) / "keyframes.json"
    if not keyframes_json_path.exists():
        raise HTTPException(status_code=404, detail="Keyframes report not found yet.")
        
    import json
    with open(keyframes_json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    return data
