"""
Mission management API endpoints.
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.schemas.mission import MissionCreate, MissionUpdate, MissionResponse
from backend.app.services.mission_service import MissionService

router = APIRouter(prefix="/missions", tags=["Missions"])


@router.post("", response_model=MissionResponse, status_code=201)
def create_mission(mission_in: MissionCreate, db: Session = Depends(get_db)):
    return MissionService.create_mission(db, mission_in)


@router.get("", response_model=List[MissionResponse])
def list_missions(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return MissionService.list_missions(db, skip, limit)


@router.get("/{mission_id}", response_model=MissionResponse)
def get_mission(mission_id: str, db: Session = Depends(get_db)):
    mission = MissionService.get_mission(db, mission_id)
    if not mission:
        raise HTTPException(status_code=404, detail=f"Mission '{mission_id}' not found.")
    return mission


@router.patch("/{mission_id}", response_model=MissionResponse)
def update_mission(mission_id: str, update_in: MissionUpdate, db: Session = Depends(get_db)):
    updated = MissionService.update_mission(db, mission_id, update_in)
    if not updated:
        raise HTTPException(status_code=404, detail=f"Mission '{mission_id}' not found.")
    return updated


@router.delete("/{mission_id}", status_code=204)
def delete_mission(mission_id: str, db: Session = Depends(get_db)):
    success = MissionService.delete_mission(db, mission_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Mission '{mission_id}' not found.")
    return None
