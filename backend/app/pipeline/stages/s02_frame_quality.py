"""
Stage 2: Frame Quality Assessment — Optimized
Computes sharpness via Laplacian variance, evaluates exposure/contrast distribution,
estimates feature richness via ORB, assesses compression quality, and flags redundancy
using inter-frame SSIM/MSE.
Multi-threaded parallel execution across CPU cores for maximum speed.
Outputs a normalized quality score (0-100) and HIGH/MEDIUM/LOW classification.

KEY OPTIMIZATION (v2):
  - ORB detector is instantiated once per thread using thread-local storage,
    avoiding massive overhead of creating ORB object for every single frame.
  - Image reads and metric calculations are parallelized safely.
"""
from concurrent.futures import ThreadPoolExecutor
import json
import logging
import os
import threading
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional
import cv2
import numpy as np

from backend.app.pipeline.base import BaseStage, StageExecutionError
from backend.app.schemas.stage import StageInput, StageOutput

logger = logging.getLogger("uav_reconstruction.stage.quality")

# Thread-local storage to hold a reusable ORB detector per thread
_thread_local = threading.local()

def get_thread_local_orb():
    if not hasattr(_thread_local, "orb"):
        # nfeatures=1500 is good for quality check
        _thread_local.orb = cv2.ORB_create(nfeatures=1500)
    return _thread_local.orb


def _analyze_single_frame(
    idx: int,
    item: Dict[str, Any],
    frames_dir: Path
) -> Optional[Dict[str, Any]]:
    """Evaluates per-frame sharpness, exposure, contrast, and feature count."""
    fpath_val = item.get("file") or item.get("filepath") or item.get("filename")
    if not fpath_val:
        return None
    fpath = Path(fpath_val)
    if not fpath.is_absolute():
        fpath = frames_dir / fpath_val
    if not fpath.exists():
        return None

    img = cv2.imread(str(fpath))
    if img is None:
        return None

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape

    # 1. Blur / Sharpness (Laplacian Variance)
    laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    sharpness_norm = min(1.0, max(0.0, (laplacian_var - 20) / 400.0))

    # 2. Exposure
    mean_lum = float(np.mean(gray))
    if mean_lum <= 128:
        exposure_norm = mean_lum / 128.0
    else:
        exposure_norm = (255.0 - mean_lum) / 127.0
    exposure_norm = exposure_norm ** 0.5

    # 3. Contrast (RMS Contrast)
    contrast_std = float(np.std(gray))
    contrast_norm = min(1.0, contrast_std / 70.0)

    # 4. Feature Richness (ORB / FAST) using thread-local detector
    orb = get_thread_local_orb()
    keypoints = orb.detect(gray, None)
    feature_count = len(keypoints)
    feature_norm = min(1.0, feature_count / 1000.0)

    # 5. Compression Quality (Gradient distribution)
    sobelx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
    sobely = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
    grad_mag = np.sqrt(sobelx**2 + sobely**2)
    grad_90 = float(np.percentile(grad_mag, 90))
    compression_norm = min(1.0, max(0.0, grad_90 / 250.0))
    if np.isnan(compression_norm):
        compression_norm = 0.5

    # Small thumbnail for fast inter-frame redundancy check
    gray_small = cv2.resize(gray, (64, 64), interpolation=cv2.INTER_AREA)

    return {
        "idx": idx,
        "frame_id": item["frame_id"],
        "filepath": str(fpath),
        "timestamp_sec": item.get("timestamp_sec", 0.0),
        "sharpness": round(sharpness_norm, 4),
        "exposure": round(exposure_norm, 4),
        "contrast": round(contrast_norm, 4),
        "compression": round(compression_norm, 4),
        "feature_score": round(feature_norm, 4),
        "laplacian_var": round(laplacian_var, 2),
        "mean_luminance": round(mean_lum, 2),
        "feature_count": feature_count,
        "gray_small": gray_small
    }


class FrameQualityStage(BaseStage):
    stage_name = "frame_quality"
    stage_order = 2
    description = "Evaluates per-frame Laplacian variance, exposure, contrast, ORB features, and inter-frame redundancy."

    def execute(self, input_data: StageInput) -> StageOutput:
        manifest_path_str = input_data.input_artifacts.get("metadata_json") or input_data.input_artifacts.get("manifest_json")
        if not manifest_path_str or not Path(manifest_path_str).exists():
            prev_dir = input_data.previous_checkpoint_dir or input_data.checkpoint_dir
            if prev_dir:
                for cand_name in ["manifest.json", "metadata.json"]:
                    cand = Path(prev_dir) / cand_name
                    if cand.exists():
                        manifest_path_str = str(cand)
                        break

        if not manifest_path_str or not Path(manifest_path_str).exists():
            raise StageExecutionError(
                self.stage_name,
                f"Missing metadata.json. Path provided: {manifest_path_str}"
            )

        with open(manifest_path_str, "r", encoding="utf-8") as f:
            manifest = json.load(f)

        frames = manifest.get("frames", [])
        if not frames:
            raise StageExecutionError(self.stage_name, "Manifest contains no frames to evaluate.")

        params = input_data.parameters
        frames_dir = Path(manifest_path_str).parent
        num_workers = int(params.get("parallel_workers", min(8, os.cpu_count() or 4)))

        # Parallelize per-frame feature and sharpness metrics across worker pool
        logger.info("Evaluating quality for %d frames using %d worker threads...", len(frames), num_workers)
        with ThreadPoolExecutor(max_workers=num_workers) as pool:
            futures = [
                pool.submit(_analyze_single_frame, i, f_item, frames_dir)
                for i, f_item in enumerate(frames)
            ]
            raw_results = [f.result() for f in futures]

        raw_records = [r for r in raw_results if r is not None]
        raw_records.sort(key=lambda x: x["idx"])

        if not raw_records:
            raise StageExecutionError(self.stage_name, "Failed to analyze any frame images.")

        # Compute sequential redundancy metrics & final scores
        quality_records: List[Dict[str, Any]] = []
        overall_scores = []
        prev_gray_small = None

        for rec in raw_records:
            gray_small = rec.pop("gray_small")
            redundancy_norm = 1.0
            if prev_gray_small is not None:
                mse = float(np.mean((gray_small.astype("float") - prev_gray_small.astype("float")) ** 2))
                redundancy_norm = min(1.0, mse / 500.0)
            prev_gray_small = gray_small

            # Final score calculation (0 - 100)
            raw_score = (
                (rec["sharpness"] * 35.0) +
                (rec["exposure"] * 15.0) +
                (rec["contrast"] * 15.0) +
                (rec["feature_score"] * 20.0) +
                (rec["compression"] * 5.0) +
                (redundancy_norm * 10.0)
            )
            overall_quality = int(round(max(0.0, min(100.0, raw_score))))

            if overall_quality >= 80:
                classification = "HIGH"
                usable = True
            elif overall_quality >= 60:
                classification = "MEDIUM"
                usable = True
            else:
                classification = "LOW"
                usable = False

            rec["redundancy"] = round(redundancy_norm, 4)
            rec["overall_quality"] = overall_quality
            rec["classification"] = classification
            rec["usable"] = usable
            rec.pop("idx", None)

            quality_records.append(rec)
            overall_scores.append(overall_quality)

        usable_count = sum(1 for q in quality_records if q["usable"])
        high_count = sum(1 for q in quality_records if q["classification"] == "HIGH")
        medium_count = sum(1 for q in quality_records if q["classification"] == "MEDIUM")
        low_count = sum(1 for q in quality_records if q["classification"] == "LOW")
        mean_quality = float(np.mean(overall_scores)) if overall_scores else 0.0

        hist, bin_edges = np.histogram(overall_scores, bins=10, range=(0, 100))
        histogram = [
            {
                "bin_start": int(bin_edges[i]),
                "bin_end": int(bin_edges[i+1]),
                "count": int(hist[i])
            }
            for i in range(10)
        ]

        out_json_path = Path(input_data.checkpoint_dir) / "frame_quality.json"
        report_data = {
            "total_frames": len(quality_records),
            "usable_frames": usable_count,
            "high_quality_count": high_count,
            "medium_quality_count": medium_count,
            "low_quality_count": low_count,
            "mean_overall_quality": round(mean_quality, 2),
            "histogram": histogram,
            "frames": quality_records
        }

        with open(out_json_path, "w", encoding="utf-8") as f:
            json.dump(report_data, f, indent=2)

        return StageOutput(
            stage_name=self.stage_name,
            status="completed",
            checkpoint_dir=input_data.checkpoint_dir,
            artifacts={
                "quality_json": str(out_json_path),
                "frame_quality_report": str(out_json_path)
            },
            metrics={
                "total_frames_evaluated": len(quality_records),
                "high_quality_frames": high_count,
                "low_quality_frames": low_count,
                "mean_quality_score": round(mean_quality, 2)
            },
            summary=f"Evaluated {len(quality_records)} frames: {high_count} HIGH, {medium_count} MEDIUM, {low_count} LOW."
        )
