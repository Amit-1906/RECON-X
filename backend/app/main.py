"""
FastAPI Application Entrypoint for the UAV 3D Reconstruction Platform.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from backend.app.core.config import settings, PROJECT_ROOT
from backend.app.core.database import engine, Base
from backend.app.core.logging import setup_logging
from backend.app.api import api_router

# Initialize structured logging
setup_logging()

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="UAV Single-Pass 3D Reconstruction Platform",
    description="Production-quality photogrammetric & computer vision reconstruction engine for UAV video and telemetry.",
    version="1.0.0"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to configured domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static artifacts directory for direct 3D model / texture asset serving
storage_dir = PROJECT_ROOT / "storage"
storage_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static/storage", StaticFiles(directory=str(storage_dir)), name="storage")

# Include API endpoints
app.include_router(api_router)


@app.get("/")
def root():
    return {
        "platform": "UAV Single-Pass 3D Reconstruction Platform",
        "status": "online",
        "docs_url": "/docs",
        "api_v1": "/api/v1"
    }
