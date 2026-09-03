"""
BaseStage abstract class and checkpointing logic for 3D reconstruction stages.
"""
from abc import ABC, abstractmethod
from datetime import datetime
import json
import logging
import os
from pathlib import Path
import time
from typing import Optional, Dict, Any

from backend.app.schemas.stage import StageInput, StageOutput

logger = logging.getLogger("uav_reconstruction.pipeline")


class StageExecutionError(Exception):
    """Raised when a reconstruction stage encounters an unrecoverable algorithmic or data error."""
    def __init__(self, stage_name: str, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(f"Stage [{stage_name}] failed: {message}")
        self.stage_name = stage_name
        self.message = message
        self.details = details or {}


class BaseStage(ABC):
    """
    Abstract base class for all single-pass UAV 3D reconstruction stages.
    Enforces strict input/output contracts, automatic timing, and checkpoint persistence.
    """

    stage_name: str = "base"
    stage_order: int = 0
    description: str = "Base reconstruction stage"

    def run(self, input_data: StageInput) -> StageOutput:
        """
        Wrapper that handles directory preparation, execution timing,
        logging, error trapping, and atomic checkpoint persistence.
        """
        checkpoint_path = Path(input_data.checkpoint_dir)
        checkpoint_path.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"===> Starting Stage {self.stage_order}: {self.stage_name}")
        start_time = time.time()

        try:
            output = self.execute(input_data)
            elapsed = round(time.time() - start_time, 3)
            output.execution_time_seconds = elapsed
            output.checkpoint_dir = str(checkpoint_path)
            
            # Save atomic checkpoint
            self.save_checkpoint(checkpoint_path, output, input_data)
            logger.info(f"<=== Completed Stage {self.stage_order}: {self.stage_name} in {elapsed}s")
            return output
        except StageExecutionError:
            raise
        except Exception as e:
            elapsed = round(time.time() - start_time, 3)
            err_msg = f"Unexpected failure in {self.stage_name}: {str(e)}"
            logger.exception(err_msg)
            fail_output = StageOutput(
                stage_name=self.stage_name,
                status="failed",
                execution_time_seconds=elapsed,
                checkpoint_dir=str(checkpoint_path),
                summary=err_msg,
                error_detail=str(e),
                resumable=True
            )
            self.save_checkpoint(checkpoint_path, fail_output, input_data)
            raise StageExecutionError(self.stage_name, err_msg)

    @abstractmethod
    def execute(self, input_data: StageInput) -> StageOutput:
        """
        Subclasses must implement actual algorithmic logic here.
        Must NOT return mock/hardcoded fake success if real data fails.
        """
        pass

    def save_checkpoint(self, checkpoint_path: Path, output: StageOutput, input_data: StageInput):
        """
        Persists stage output metadata, artifact paths, and metrics to checkpoint.json
        """
        cp_file = checkpoint_path / "checkpoint.json"
        data = {
            "stage_name": self.stage_name,
            "stage_order": self.stage_order,
            "status": output.status,
            "timestamp": datetime.utcnow().isoformat(),
            "execution_time_seconds": output.execution_time_seconds,
            "device": input_data.device,
            "artifacts": output.artifacts,
            "metrics": output.metrics,
            "summary": output.summary,
            "error_detail": output.error_detail,
            "resumable": output.resumable
        }
        with open(cp_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    @classmethod
    def load_checkpoint(cls, checkpoint_dir: str) -> Optional[StageOutput]:
        """
        Attempts to load a prior successful checkpoint from disk to allow resuming without recomputation.
        """
        cp_file = Path(checkpoint_dir) / "checkpoint.json"
        if not cp_file.exists():
            return None
        try:
            with open(cp_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("status") == "completed":
                return StageOutput(
                    stage_name=data["stage_name"],
                    status=data["status"],
                    execution_time_seconds=data.get("execution_time_seconds", 0.0),
                    checkpoint_dir=checkpoint_dir,
                    artifacts=data.get("artifacts", {}),
                    metrics=data.get("metrics", {}),
                    summary=data.get("summary", ""),
                    resumable=data.get("resumable", True)
                )
        except Exception as e:
            logger.warning(f"Could not load checkpoint from {cp_file}: {e}")
        return None
