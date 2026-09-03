"""
Stage 1: Preprocessing
Extracts frames from UAV video at target sampling rate, performs color space normalization,
resolution downscaling, and CLAHE contrast equalization.
"""
import json
import logging
from pathlib import Path
from typing import List, Dict, Any
import cv2
import numpy as np

from backend.app.pipeline.base import BaseStage, StageExecutionError
from backend.app.schemas.stage import StageInput, StageOutput

logger = logging.getLogger("uav_reconstruction.stage.preprocessing")


class PreprocessingStage(BaseStage):
    stage_name = "preprocessing"
    stage_order = 1
    description = "Video ingestion, frame extraction, resolution scaling, and CLAHE color equalization."

    def execute(self, input_data: StageInput) -> StageOutput:
        video_path_str = input_data.video_path or input_data.input_artifacts.get("video_path")
        frames_dir = Path(input_data.checkpoint_dir) / "frames"
        frames_dir.mkdir(parents=True, exist_ok=True)

        params = input_data.parameters
        target_fps = float(params.get("target_fps", 2.0))
        max_dim = int(params.get("max_dimension", 1920))
        apply_clahe = bool(params.get("apply_clahe", True))
        clahe_clip = float(params.get("clahe_clip_limit", 2.0))

        frame_records: List[Dict[str, Any]] = []

        if not video_path_str or not Path(video_path_str).exists():
            raise StageExecutionError(
                self.stage_name,
                f"Video file not found or path is empty: '{video_path_str}'."
            )

        cap = cv2.VideoCapture(video_path_str)
        if not cap.isOpened():
            raise StageExecutionError(
                self.stage_name,
                f"Could not open video file via OpenCV: '{video_path_str}'."
            )

        original_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        frame_step = max(1, int(round(original_fps / target_fps)))
        
        clahe = cv2.createCLAHE(clipLimit=clahe_clip, tileGridSize=(8, 8)) if apply_clahe else None

        frame_idx = 0
        saved_count = 0
        final_w, final_h = orig_w, orig_h

        logger.info(f"Extracting frames from video: {orig_w}x{orig_h} @ {original_fps:.1f}fps. Step={frame_step}")

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % frame_step == 0:
                h, w = frame.shape[:2]
                scale = 1.0
                if max(h, w) > max_dim:
                    scale = max_dim / float(max(h, w))
                    new_w = int(round(w * scale))
                    new_h = int(round(h * scale))
                    frame = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)
                    final_w, final_h = new_w, new_h

                if clahe is not None:
                    # Convert to LAB, apply CLAHE on L-channel for perceptual luminance normalization
                    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
                    l, a, b = cv2.split(lab)
                    l2 = clahe.apply(l)
                    lab = cv2.merge((l2, a, b))
                    frame = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

                frame_filename = f"frame_{saved_count:05d}.jpg"
                frame_out_path = frames_dir / frame_filename
                cv2.imwrite(str(frame_out_path), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 95])

                timestamp_sec = round(frame_idx / original_fps, 3)
                frame_records.append({
                    "frame_id": saved_count,
                    "filename": frame_filename,
                    "filepath": str(frame_out_path),
                    "video_frame_index": frame_idx,
                    "timestamp_sec": timestamp_sec,
                    "width": final_w,
                    "height": final_h
                })
                saved_count += 1

            frame_idx += 1

        cap.release()

        if saved_count == 0:
            raise StageExecutionError(
                self.stage_name,
                f"Zero frames could be extracted from '{video_path_str}'. Verify video format and codec."
            )

        manifest_path = Path(input_data.checkpoint_dir) / "manifest.json"
        manifest_data = {
            "total_extracted": saved_count,
            "original_resolution": [orig_w, orig_h],
            "processed_resolution": [final_w, final_h],
            "original_fps": original_fps,
            "target_fps": target_fps,
            "frames": frame_records
        }
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest_data, f, indent=2)

        return StageOutput(
            stage_name=self.stage_name,
            status="completed",
            checkpoint_dir=input_data.checkpoint_dir,
            artifacts={
                "frames_dir": str(frames_dir),
                "manifest_json": str(manifest_path),
                "metadata_json": str(manifest_path)
            },
            metrics={
                "extracted_frames_count": saved_count,
                "video_total_frames": total_frames,
                "original_resolution": f"{orig_w}x{orig_h}",
                "processed_resolution": f"{final_w}x{final_h}",
                "sampling_fps": target_fps
            },
            summary=f"Extracted and preprocessed {saved_count} frames at {final_w}x{final_h}."
        )
