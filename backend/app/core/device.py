"""
Hardware acceleration manager.
Detects GPU/CUDA capabilities, VRAM, CPU resources, and handles fallback logic.
"""
from dataclasses import dataclass, asdict
import os
import psutil
import logging

logger = logging.getLogger("uav_reconstruction.device")

@dataclass
class DeviceCapabilities:
    device_type: str  # "cuda" | "cpu"
    device_name: str
    cuda_available: bool
    cuda_device_count: int
    active_device_index: int
    vram_total_gb: float
    vram_free_gb: float
    cpu_cores_physical: int
    cpu_cores_logical: int
    ram_total_gb: float
    ram_available_gb: float
    opencv_cuda_supported: bool

    def to_dict(self):
        return asdict(self)


class DeviceManager:
    _instance = None

    def __init__(self):
        self._capabilities = self._detect_hardware()

    @property
    def capabilities(self) -> DeviceCapabilities:
        return self._capabilities

    def _detect_hardware(self) -> DeviceCapabilities:
        # PyTorch CUDA detection
        cuda_available = False
        cuda_count = 0
        device_name = "CPU"
        vram_total = 0.0
        vram_free = 0.0

        try:
            import torch
            cuda_available = torch.cuda.is_available()
            if cuda_available:
                cuda_count = torch.cuda.device_count()
                device_name = torch.cuda.get_device_name(0)
                mem_props = torch.cuda.get_device_properties(0)
                vram_total = round(mem_props.total_memory / (1024 ** 3), 2)
                # Free memory estimation
                allocated = torch.cuda.memory_allocated(0)
                vram_free = round((mem_props.total_memory - allocated) / (1024 ** 3), 2)
        except Exception as e:
            logger.debug(f"PyTorch CUDA detection error: {e}")

        # OpenCV CUDA detection
        cv_cuda = False
        try:
            import cv2
            if hasattr(cv2, 'cuda') and hasattr(cv2.cuda, 'getCudaEnabledDeviceCount'):
                cv_cuda = cv2.cuda.getCudaEnabledDeviceCount() > 0
        except Exception as e:
            logger.debug(f"OpenCV CUDA detection error: {e}")

        # System resources
        ram = psutil.virtual_memory()
        cpu_phys = psutil.cpu_count(logical=False) or 1
        cpu_log = psutil.cpu_count(logical=True) or 1

        selected_device = "cuda" if cuda_available else "cpu"
        if not cuda_available:
            device_name = f"Host CPU ({cpu_log} Threads)"

        caps = DeviceCapabilities(
            device_type=selected_device,
            device_name=device_name,
            cuda_available=cuda_available,
            cuda_device_count=cuda_count,
            active_device_index=0 if cuda_available else -1,
            vram_total_gb=vram_total,
            vram_free_gb=vram_free,
            cpu_cores_physical=cpu_phys,
            cpu_cores_logical=cpu_log,
            ram_total_gb=round(ram.total / (1024 ** 3), 2),
            ram_available_gb=round(ram.available / (1024 ** 3), 2),
            opencv_cuda_supported=cv_cuda
        )
        logger.info(f"Initialized DeviceManager: Type={caps.device_type}, Device='{caps.device_name}', CUDA={caps.cuda_available}")
        return caps

    def resolve_device(self, preferred: str = "auto") -> str:
        """
        Resolves device string based on user preference and hardware capability.
        """
        if preferred == "cuda":
            if self._capabilities.cuda_available:
                return "cuda"
            logger.warning("CUDA requested but not available. Falling back to CPU.")
            return "cpu"
        elif preferred == "cpu":
            return "cpu"
        else:  # auto
            return "cuda" if self._capabilities.cuda_available else "cpu"

    def get_torch_device(self, preferred: str = "auto"):
        import torch
        resolved = self.resolve_device(preferred)
        return torch.device(resolved)


# Global singleton
device_manager = DeviceManager()
