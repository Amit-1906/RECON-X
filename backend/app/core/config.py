"""
Application and Pipeline configuration loader.
"""
from pathlib import Path
from typing import Dict, Any, Optional
import os
import yaml
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
CONFIG_DIR = PROJECT_ROOT / "config"
CONFIG_FILE = CONFIG_DIR / "pipeline_config.yaml"


class SystemSettings(BaseModel):
    environment: str = "development"
    storage_root: str = "./storage"
    temp_root: str = "./storage/tmp"
    artifacts_root: str = "./storage/artifacts"
    uploads_root: str = "./storage/uploads"
    database_url: str = "sqlite:///./storage/uav_reconstruction.db"


class HardwareSettings(BaseModel):
    preferred_device: str = "auto"
    cuda_device_id: int = 0
    num_threads: int = 4
    max_vram_gb: float = 8.0
    allow_cpu_fallback: bool = True
    enable_opencv_cuda: bool = False


class PipelineSettings(BaseSettings):
    system: SystemSettings = SystemSettings()
    hardware: HardwareSettings = HardwareSettings()
    stages: Dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def load(cls, config_path: Optional[Path] = None) -> "PipelineSettings":
        cfg_path = config_path or CONFIG_FILE
        data: Dict[str, Any] = {}
        if cfg_path.exists():
            with open(cfg_path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}

        # Resolve paths relative to PROJECT_ROOT
        storage_root = PROJECT_ROOT / data.get("system", {}).get("storage_root", "./storage")
        temp_root = storage_root / "tmp"
        artifacts_root = storage_root / "artifacts"
        uploads_root = storage_root / "uploads"
        logs_root = storage_root / "logs"

        for p in [storage_root, temp_root, artifacts_root, uploads_root, logs_root]:
            p.mkdir(parents=True, exist_ok=True)

        return cls(**data)


# Global settings instance
settings = PipelineSettings.load()
