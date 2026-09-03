"""
System and Hardware status API.
"""
from fastapi import APIRouter
from backend.app.core.device import device_manager
from backend.app.core.config import settings

router = APIRouter(prefix="/system", tags=["System & Hardware"])


@router.get("/hardware")
def get_hardware_status():
    """Returns detected GPU/CUDA acceleration, VRAM, and CPU specs."""
    return {
        "device_capabilities": device_manager.capabilities.to_dict(),
        "configured_preferred_device": settings.hardware.preferred_device,
        "resolved_active_device": device_manager.resolve_device(settings.hardware.preferred_device)
    }


@router.get("/health")
def health_check():
    """Service health check."""
    return {
        "status": "healthy",
        "service": "uav-3d-reconstruction-platform",
        "version": "1.0.0"
    }
