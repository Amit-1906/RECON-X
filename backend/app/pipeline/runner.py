"""
Resumable Reconstruction Pipeline Runner.
Executes stages sequentially, handles intermediate checkpoint loading,
resumes failed jobs, and records artifact metadata.
"""
from datetime import datetime
import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional, Callable

from backend.app.core.config import settings, PROJECT_ROOT
from backend.app.core.device import device_manager
from backend.app.core.logging import get_job_logger
from backend.app.pipeline.base import BaseStage, StageExecutionError
from backend.app.pipeline.registry import STAGE_REGISTRY, ORDERED_STAGES, get_stage_instance
from backend.app.schemas.stage import StageInput, StageOutput

logger = logging.getLogger("uav_reconstruction.runner")


class PipelineRunner:
    def __init__(
        self,
        job_id: str,
        mission_id: str,
        video_path: Optional[str] = None,
        telemetry_path: Optional[str] = None,
        flight_altitude_m: float = 60.0,
        focal_length_mm: float = 35.0,
        sensor_width_mm: float = 35.9,
        target_gsd_cm: float = 1.5,
        preferred_device: str = "auto",
        on_stage_start: Optional[Callable[[str, int], None]] = None,
        on_stage_complete: Optional[Callable[[str, int, StageOutput], None]] = None,
        on_stage_failed: Optional[Callable[[str, int, str], None]] = None,
        cancellation_check: Optional[Callable[[], bool]] = None
    ):
        self.job_id = job_id
        self.mission_id = mission_id
        self.video_path = video_path
        self.telemetry_path = telemetry_path
        self.flight_altitude_m = flight_altitude_m
        self.focal_length_mm = focal_length_mm
        self.sensor_width_mm = sensor_width_mm
        self.target_gsd_cm = target_gsd_cm
        self.preferred_device = preferred_device

        self.on_stage_start = on_stage_start
        self.on_stage_complete = on_stage_complete
        self.on_stage_failed = on_stage_failed
        self.cancellation_check = cancellation_check

        self.job_logger = get_job_logger(job_id)

        # Storage directory layout: storage/artifacts/<job_id>/<stage_name>/
        self.base_artifacts_dir = PROJECT_ROOT / "storage" / "artifacts" / self.job_id
        self.base_artifacts_dir.mkdir(parents=True, exist_ok=True)

    def run(self, start_from_stage: Optional[str] = None) -> Dict[str, Any]:
        """
        Executes the pipeline. If start_from_stage is specified, stages prior to it
        will be checked for existing valid checkpoints and skipped.
        """
        resolved_device = device_manager.resolve_device(self.preferred_device)
        self.job_logger.info(f"Starting Job {self.job_id} on device: {resolved_device}")

        accumulated_artifacts: Dict[str, str] = {
            "video_path": self.video_path or "",
            "telemetry_path": self.telemetry_path or ""
        }

        # Determine start index
        start_idx = 0
        if start_from_stage and start_from_stage in ORDERED_STAGES:
            start_idx = ORDERED_STAGES.index(start_from_stage)
            self.job_logger.info(f"Resuming pipeline starting at stage {start_idx + 1}: '{start_from_stage}'")

        # Accumulate checkpoints from previous completed stages
        for i in range(start_idx):
            prev_stage_name = ORDERED_STAGES[i]
            prev_stage_dir = self.base_artifacts_dir / prev_stage_name
            cp_data = BaseStage.load_checkpoint(str(prev_stage_dir))
            if cp_data:
                accumulated_artifacts.update(cp_data.artifacts)
                self.job_logger.info(f"Loaded existing checkpoint from prior stage '{prev_stage_name}'")
            else:
                self.job_logger.warning(
                    f"Prior stage '{prev_stage_name}' has no valid checkpoint. Must restart from '{prev_stage_name}'."
                )
                start_idx = i
                break

        total_stages = len(ORDERED_STAGES)
        stage_outputs: Dict[str, StageOutput] = {}

        for idx in range(start_idx, total_stages):
            if self.cancellation_check and self.cancellation_check():
                self.job_logger.warning("Pipeline execution cancelled by user request.")
                raise StageExecutionError("Job execution was cancelled by user.")

            stage_name = ORDERED_STAGES[idx]
            stage_order = idx + 1
            stage_instance = get_stage_instance(stage_name)

            checkpoint_dir = self.base_artifacts_dir / stage_name
            checkpoint_dir.mkdir(parents=True, exist_ok=True)

            prev_dir = str(self.base_artifacts_dir / ORDERED_STAGES[idx - 1]) if idx > 0 else None

            # Get stage parameters from pipeline_config
            stage_params = settings.stages.get(stage_name, {})

            stage_input = StageInput(
                job_id=self.job_id,
                mission_id=self.mission_id,
                stage_name=stage_name,
                checkpoint_dir=str(checkpoint_dir),
                previous_checkpoint_dir=prev_dir,
                parameters=stage_params,
                device=resolved_device,
                hardware_info=device_manager.capabilities.to_dict(),
                video_path=self.video_path,
                telemetry_path=self.telemetry_path,
                flight_altitude_m=self.flight_altitude_m,
                focal_length_mm=self.focal_length_mm,
                sensor_width_mm=self.sensor_width_mm,
                target_gsd_cm=self.target_gsd_cm,
                input_artifacts=accumulated_artifacts
            )

            if self.on_stage_start:
                self.on_stage_start(stage_name, stage_order)

            try:
                output = stage_instance.run(stage_input)
                stage_outputs[stage_name] = output
                accumulated_artifacts.update(output.artifacts)

                if self.on_stage_complete:
                    self.on_stage_complete(stage_name, stage_order, output)

            except StageExecutionError as e:
                self.job_logger.error(f"Stage '{stage_name}' failed: {e.message}")
                if self.on_stage_failed:
                    self.on_stage_failed(stage_name, stage_order, e.message)
                raise
            except Exception as e:
                err_msg = f"Unexpected runtime error: {str(e)}"
                self.job_logger.exception(err_msg)
                if self.on_stage_failed:
                    self.on_stage_failed(stage_name, stage_order, err_msg)
                raise StageExecutionError(stage_name, err_msg)

        self.job_logger.info(f"Pipeline successfully completed all {total_stages} stages.")
        return {
            "job_id": self.job_id,
            "status": "completed",
            "artifacts": accumulated_artifacts,
            "stage_outputs": {k: v.model_dump() for k, v in stage_outputs.items()}
        }
