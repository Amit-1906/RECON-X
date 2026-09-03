"""
System Hardware Monitoring API.
Exposes real-time CPU, RAM, and GPU VRAM resource utilization metrics, health check, and hardware configuration.
"""
from typing import Dict, Any
from fastapi import APIRouter
import psutil

from backend.app.core.config import settings
from backend.app.core.device import device_manager

router = APIRouter(prefix="/system", tags=["System"])


@router.get("/health")
def get_health() -> Dict[str, str]:
    """Health check endpoint."""
    return {"status": "healthy"}


@router.get("/hardware")
def get_hardware_info() -> Dict[str, Any]:
    """Hardware capability and configuration endpoint."""
    return {
        "device_capabilities": device_manager.capabilities.to_dict(),
        "configured_preferred_device": settings.hardware.preferred_device
    }


@router.get("/status")
def get_system_hardware_status() -> Dict[str, Any]:
    """
    Returns real, measurable hardware utilization:
      - CPU % and core count
      - System RAM used, available, total (GB), and percentage
      - GPU / CUDA VRAM used, total (GB), and percentage
      - Active device type
    """
    # 1. CPU
    cpu_pct = psutil.cpu_percent(interval=None)
    cpu_phys = psutil.cpu_count(logical=False) or 1
    cpu_log = psutil.cpu_count(logical=True) or 1

    # 2. RAM
    mem = psutil.virtual_memory()
    ram_total_gb = round(mem.total / (1024 ** 3), 2)
    ram_used_gb = round(mem.used / (1024 ** 3), 2)
    ram_available_gb = round(mem.available / (1024 ** 3), 2)
    ram_pct = mem.percent

    # 3. GPU / CUDA
    caps = device_manager.capabilities
    gpu_available = caps.cuda_available
    gpu_name = caps.device_name
    vram_total_gb = caps.vram_total_gb
    vram_used_gb = 0.0
    vram_pct = 0.0

    if gpu_available:
        try:
            import torch
            allocated = torch.cuda.memory_allocated(0)
            reserved = torch.cuda.memory_reserved(0)
            vram_used_gb = round(max(allocated, reserved) / (1024 ** 3), 2)
            if vram_total_gb > 0:
                vram_pct = round((vram_used_gb / vram_total_gb) * 100.0, 1)
        except Exception:
            pass

    return {
        "cpu_percent": cpu_pct,
        "cpu_cores_physical": cpu_phys,
        "cpu_cores_logical": cpu_log,
        "ram_total_gb": ram_total_gb,
        "ram_used_gb": ram_used_gb,
        "ram_available_gb": ram_available_gb,
        "ram_percent": ram_pct,
        "gpu_available": gpu_available,
        "gpu_name": gpu_name,
        "vram_total_gb": vram_total_gb,
        "vram_used_gb": vram_used_gb,
        "vram_percent": vram_pct,
        "active_device": caps.device_type
    }
