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
        ".json": "application/json",
        ".glb": "model/gltf-binary",
        ".gltf": "model/gltf+json",
        ".pdf": "application/pdf"
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


@router.get("/{job_id}/dynamic-objects")
def get_dynamic_objects_report(job_id: str, db: Session = Depends(get_db)):
    """Fetch the Phase 4 dynamic object detection & masking report."""
    from backend.app.models.job import Job
    from backend.app.core.config import PROJECT_ROOT
    import json

    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")
    
    candidates = []
    if job.checkpoint_dir:
        candidates.append(Path(job.checkpoint_dir) / "dynamic_objects.json")
    candidates.append(PROJECT_ROOT / "storage" / "artifacts" / job_id / "dynamic_masking" / "dynamic_objects.json")
    candidates.append(PROJECT_ROOT / "storage" / "artifacts" / job_id / "dynamic_objects.json")

    json_path = None
    for cand in candidates:
        if cand.exists():
            json_path = cand
            break

    if not json_path or not json_path.exists():
        raise HTTPException(status_code=404, detail="Dynamic objects report not found yet.")
        
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    return data


@router.get("/{job_id}/dynamic-analytics")
def get_dynamic_analytics_report(job_id: str, db: Session = Depends(get_db)):
    """Fetch the Phase 4 Dynamic Object Layer analytics."""
    report = get_dynamic_objects_report(job_id, db)
    return report.get("analytics_layer", {})


@router.get("/{job_id}/illumination")
def get_illumination_report(job_id: str, db: Session = Depends(get_db)):
    """Fetch the Phase 5 illumination-aware preprocessing report."""
    from backend.app.models.job import Job
    from backend.app.core.config import PROJECT_ROOT
    import json

    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")
    
    candidates = []
    if job.checkpoint_dir:
        candidates.append(Path(job.checkpoint_dir) / "illumination.json")
    candidates.append(PROJECT_ROOT / "storage" / "artifacts" / job_id / "illumination_preprocessing" / "illumination.json")
    candidates.append(PROJECT_ROOT / "storage" / "artifacts" / job_id / "illumination.json")

    json_path = None
    for cand in candidates:
        if cand.exists():
            json_path = cand
            break

    if not json_path or not json_path.exists():
        raise HTTPException(status_code=404, detail="Illumination report not found yet.")
        
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    return data

@router.get("/{job_id}/camera-poses")
def get_camera_poses_report(job_id: str, db: Session = Depends(get_db)):
    """Fetch the Phase 6 camera poses estimation report."""
    from backend.app.models.job import Job
    from backend.app.core.config import PROJECT_ROOT
    import json

    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")
    
    candidates = []
    if job.checkpoint_dir:
        candidates.append(Path(job.checkpoint_dir) / "camera_poses.json")
    candidates.append(PROJECT_ROOT / "storage" / "artifacts" / job_id / "pose_estimation" / "camera_poses.json")
    candidates.append(PROJECT_ROOT / "storage" / "artifacts" / job_id / "camera_poses.json")

    json_path = next((c for c in candidates if c.exists()), None)
    if not json_path:
        raise HTTPException(status_code=404, detail="Camera poses report not found yet.")
        
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    return data


@router.get("/{job_id}/trajectory")
def get_trajectory_report(job_id: str, db: Session = Depends(get_db)):
    """Fetch the Phase 6 UAV Camera Trajectory & Sensor Fusion report (trajectory.json)."""
    from backend.app.models.job import Job
    from backend.app.core.config import PROJECT_ROOT
    import json

    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")
    
    candidates = []
    if job.checkpoint_dir:
        candidates.append(Path(job.checkpoint_dir) / "trajectory.json")
    candidates.append(PROJECT_ROOT / "storage" / "artifacts" / job_id / "pose_estimation" / "trajectory.json")
    candidates.append(PROJECT_ROOT / "storage" / "artifacts" / job_id / "trajectory.json")

    json_path = next((c for c in candidates if c.exists()), None)
    if not json_path:
        raise HTTPException(status_code=404, detail="Trajectory report not found yet.")
        
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    return data


@router.get("/{job_id}/reconstruction")
def get_sparse_reconstruction_report(job_id: str, db: Session = Depends(get_db)):
    """Fetch the Phase 7 Structure-from-Motion sparse 3D reconstruction report."""
    from backend.app.models.job import Job
    from backend.app.core.config import PROJECT_ROOT
    import json

    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")
    
    candidates_metrics = []
    if job.checkpoint_dir:
        candidates_metrics.append(Path(job.checkpoint_dir) / "reconstruction_metrics.json")
    candidates_metrics.append(PROJECT_ROOT / "storage" / "artifacts" / job_id / "geometry" / "reconstruction_metrics.json")
    candidates_metrics.append(PROJECT_ROOT / "storage" / "artifacts" / job_id / "reconstruction_metrics.json")

    metrics_path = next((c for c in candidates_metrics if c.exists()), None)
    if not metrics_path:
        raise HTTPException(status_code=404, detail="Reconstruction metrics not found yet.")
        
    with open(metrics_path, "r", encoding="utf-8") as f:
        metrics_data = json.load(f)

    # Check for camera poses and matches in the same checkpoint directory
    geom_dir = metrics_path.parent
    poses_path = geom_dir / "camera_poses.json"
    matches_path = geom_dir / "feature_matches.json"
    ply_path = geom_dir / "sparse_point_cloud.ply"
    if not ply_path.exists():
        ply_path = geom_dir / "sparse.ply"

    poses_data = {}
    if poses_path.exists():
        try:
            with open(poses_path, "r", encoding="utf-8") as f:
                poses_data = json.load(f)
        except Exception:
            pass

    matches_data = {}
    if matches_path.exists():
        try:
            with open(matches_path, "r", encoding="utf-8") as f:
                matches_data = json.load(f)
        except Exception:
            pass

    return {
        "job_id": job_id,
        "metrics": metrics_data,
        "camera_poses": poses_data.get("poses", []),
        "feature_matches": matches_data,
        "ply_available": ply_path.exists(),
        "ply_filename": ply_path.name if ply_path.exists() else None
    }


@router.get("/{job_id}/dense")
def get_dense_reconstruction_report(job_id: str, db: Session = Depends(get_db)):
    """Fetch the Phase 8 Dense Depth and Dense Point Cloud report."""
    from backend.app.models.job import Job
    from backend.app.core.config import PROJECT_ROOT
    import json

    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

    candidates = []
    if job.checkpoint_dir:
        candidates.append(Path(job.checkpoint_dir) / "dense_metrics.json")
    candidates.append(PROJECT_ROOT / "storage" / "artifacts" / job_id / "dense_point_cloud" / "dense_metrics.json")
    candidates.append(PROJECT_ROOT / "storage" / "artifacts" / job_id / "dense_metrics.json")

    metrics_path = next((c for c in candidates if c.exists()), None)
    if not metrics_path:
        raise HTTPException(status_code=404, detail="Dense reconstruction metrics not found yet.")

    with open(metrics_path, "r", encoding="utf-8") as f:
        metrics_data = json.load(f)

    dense_dir = metrics_path.parent
    depth_maps_dir = dense_dir / "depth_maps"
    conf_dir = dense_dir / "dense_confidence"
    ply_path = dense_dir / "dense_point_cloud.ply"
    if not ply_path.exists():
        ply_path = dense_dir / "dense.ply"

    # List depth map visualization images
    depth_maps = []
    if depth_maps_dir.exists():
        for jpg in sorted(depth_maps_dir.glob("depth_vis_*.jpg")):
            frame_id = jpg.stem.replace("depth_vis_", "")
            depth_maps.append({
                "frame_id": frame_id,
                "filename": jpg.name,
                "url": f"/api/v1/results/{job_id}/depth-maps/{jpg.name}"
            })

    # List confidence maps
    conf_maps = []
    if conf_dir.exists():
        for png in sorted(conf_dir.glob("conf_*.png")):
            frame_id = png.stem.replace("conf_", "")
            conf_maps.append({
                "frame_id": frame_id,
                "filename": png.name,
                "url": f"/api/v1/results/{job_id}/dense-confidence/{png.name}"
            })

    return {
        "job_id": job_id,
        "metrics": metrics_data,
        "depth_maps": depth_maps,
        "confidence_maps": conf_maps,
        "ply_available": ply_path.exists(),
        "ply_filename": ply_path.name if ply_path.exists() else None
    }


@router.get("/{job_id}/depth-maps/{filename}")
def get_depth_map_file(job_id: str, filename: str, db: Session = Depends(get_db)):
    """Serve depth map visualization image."""
    from backend.app.models.job import Job
    from backend.app.core.config import PROJECT_ROOT

    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

    candidates = []
    if job.checkpoint_dir:
        candidates.append(Path(job.checkpoint_dir) / "depth_maps" / filename)
    candidates.append(PROJECT_ROOT / "storage" / "artifacts" / job_id / "dense_point_cloud" / "depth_maps" / filename)
    candidates.append(PROJECT_ROOT / "storage" / "artifacts" / job_id / "depth_maps" / filename)

    target_path = next((c for c in candidates if c.exists()), None)
    if not target_path:
        raise HTTPException(status_code=404, detail="Depth map file not found.")

    return FileResponse(str(target_path), media_type="image/jpeg")


@router.get("/{job_id}/dense-confidence/{filename}")
def get_dense_confidence_file(job_id: str, filename: str, db: Session = Depends(get_db)):
    """Serve per-view depth confidence map image."""
    from backend.app.models.job import Job
    from backend.app.core.config import PROJECT_ROOT

    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

    candidates = []
    if job.checkpoint_dir:
        candidates.append(Path(job.checkpoint_dir) / "dense_confidence" / filename)
    candidates.append(PROJECT_ROOT / "storage" / "artifacts" / job_id / "dense_point_cloud" / "dense_confidence" / filename)
    candidates.append(PROJECT_ROOT / "storage" / "artifacts" / job_id / "dense_confidence" / filename)

    target_path = next((c for c in candidates if c.exists()), None)
    if not target_path:
        raise HTTPException(status_code=404, detail="Confidence map file not found.")

    return FileResponse(str(target_path), media_type="image/png")


@router.get("/{job_id}/benchmark")
def get_benchmark_report(job_id: str, db: Session = Depends(get_db)):
    """Fetch the Phase 15 Scientific Benchmarking & Validation Report JSON."""
    from backend.app.models.job import Job
    from backend.app.core.config import PROJECT_ROOT
    from backend.app.services.result_service import ResultService
    import json

    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

    candidates = []
    artifact = ResultService.get_artifact_by_type(db, job_id, "benchmark_report_json")
    if artifact and Path(artifact.file_path).exists():
        candidates.append(Path(artifact.file_path))

    candidates.append(PROJECT_ROOT / "storage" / "artifacts" / job_id / "validation" / "benchmark_report.json")
    candidates.append(PROJECT_ROOT / "storage" / "artifacts" / job_id / "benchmark_report.json")

    target_path = next((c for c in candidates if c.exists()), None)
    if not target_path:
        raise HTTPException(status_code=404, detail="Benchmark report not found for this job.")

    with open(target_path, "r", encoding="utf-8") as f:
        return json.load(f)


@router.get("/{job_id}/export-bundle")
def export_mission_bundle(job_id: str, db: Session = Depends(get_db)):
    """
    Creates and streams a comprehensive ZIP archive containing all 3D digital twin deliverables:
      - 3D Models (GLB, PLY)
      - Point Clouds (Dense, Sparse)
      - Survey Reports (Coordinates, Accuracy, Confidence, Scale)
      - Benchmark Deliverables (PDF & JSON)
    """
    import zipfile
    from backend.app.models.job import Job
    from backend.app.core.config import PROJECT_ROOT

    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

    artifacts = ResultService.get_artifacts_for_job(db, job_id)
    if not artifacts:
        raise HTTPException(status_code=404, detail="No artifacts registered for this job.")

    export_dir = PROJECT_ROOT / "storage" / "exports" / job_id
    export_dir.mkdir(parents=True, exist_ok=True)
    zip_path = export_dir / f"reconstruction_bundle_{job_id[:8]}.zip"

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for art in artifacts:
            fp = Path(art.file_path)
            if fp.exists() and fp.is_file():
                arcname = f"{art.stage_name}/{fp.name}"
                zf.write(fp, arcname=arcname)

    return FileResponse(
        path=str(zip_path),
        media_type="application/zip",
        filename=f"uav_digital_twin_bundle_{job_id[:8]}.zip"
    )



