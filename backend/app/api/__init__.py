from fastapi import APIRouter
from backend.app.api.missions import router as missions_router
from backend.app.api.uploads import router as uploads_router
from backend.app.api.jobs import router as jobs_router
from backend.app.api.stages import router as stages_router
from backend.app.api.results import router as results_router
from backend.app.api.system import router as system_router
from backend.app.api.ingestion import router as ingestion_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(missions_router)
api_router.include_router(uploads_router)
api_router.include_router(jobs_router)
api_router.include_router(stages_router)
api_router.include_router(results_router)
api_router.include_router(system_router)
api_router.include_router(ingestion_router)
