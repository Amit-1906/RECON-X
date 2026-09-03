"""
Mission service handling CRUD operations and flight specifications.
"""
from typing import List, Optional
from sqlalchemy.orm import Session

from backend.app.models.mission import Mission
from backend.app.schemas.mission import MissionCreate, MissionUpdate


class MissionService:
    @staticmethod
    def create_mission(db: Session, mission_in: MissionCreate) -> Mission:
        mission = Mission(**mission_in.model_dump())
        db.add(mission)
        db.commit()
        db.refresh(mission)
        return mission

    @staticmethod
    def get_mission(db: Session, mission_id: str) -> Optional[Mission]:
        return db.query(Mission).filter(Mission.id == mission_id).first()

    @staticmethod
    def list_missions(db: Session, skip: int = 0, limit: int = 100) -> List[Mission]:
        return db.query(Mission).order_by(Mission.created_at.desc()).offset(skip).limit(limit).all()

    @staticmethod
    def update_mission(db: Session, mission_id: str, update_in: MissionUpdate) -> Optional[Mission]:
        mission = db.query(Mission).filter(Mission.id == mission_id).first()
        if not mission:
            return None
        update_data = update_in.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(mission, key, value)
        db.commit()
        db.refresh(mission)
        return mission

    @staticmethod
    def delete_mission(db: Session, mission_id: str) -> bool:
        mission = db.query(Mission).filter(Mission.id == mission_id).first()
        if not mission:
            return False
        db.delete(mission)
        db.commit()
        return True
