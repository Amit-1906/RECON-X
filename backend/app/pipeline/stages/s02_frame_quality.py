"""
Stage 2: Frame Quality Assessment
Computes sharpness via Laplacian variance, evaluates exposure/contrast distribution,
estimates feature richness via ORB, assesses compression quality, and flags redundancy
using inter-frame SSIM/MSE.
Outputs a normalized quality score (0-100) and HIGH/MEDIUM/LOW classification.
"""
import json
import logging
from pathlib import Path
from typing import List, Dict, Any
import cv2
import numpy as np

from backend.app.pipeline.base import BaseStage, StageExecutionError
from backend.app.schemas.stage import StageInput, StageOutput

logger = logging.getLogger("uav_reconstruction.stage.quality")


class FrameQualityStage(BaseStage):
    stage_name = "frame_quality"
    stage_order = 2
    description = "Evaluates per-frame Laplacian variance, exposure, contrast, ORB features, and inter-frame redundancy."

    def execute(self, input_data: StageInput) -> StageOutput:
        # Resolve frame metadata.json from Phase 1
        # In Phase 1, the manifest is saved to mission.metadata_json_path
        # If passed via pipeline kwargs/artifacts, use it. Otherwise, we assume it's in the storage/frames dir.
        
        # We need to find metadata.json
        # The runner provides input_artifacts. We should look for metadata_json
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
        
        # We need a directory to resolve relative frame paths
        frames_dir = Path(manifest_path_str).parent

        # Initialize ORB for feature richness
        orb = cv2.ORB_create(nfeatures=2000)

        quality_records: List[Dict[str, Any]] = []
        overall_scores = []
        
        prev_gray_small = None

        for idx, item in enumerate(frames):
            fpath_val = item.get("file") or item.get("filepath") or item.get("filename")
            if not fpath_val:
                continue
            fpath = Path(fpath_val)
            if not fpath.is_absolute():
                fpath = frames_dir / fpath_val
            
            if not fpath.exists():
                logger.warning(f"Frame file missing: {fpath}")
                continue

            img = cv2.imread(str(fpath))
            if img is None:
                continue

            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            h, w = gray.shape

            # 1. Blur / Sharpness (Laplacian Variance)
            # Typical acceptable variance is > 100 for sharp images, but depends on content/resolution.
            laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
            # Normalize sharpness score (0 to 1.0)
            # Assuming 500 is very sharp, 50 is blurry
            sharpness_norm = min(1.0, max(0.0, (laplacian_var - 20) / 400.0))

            # 2. Exposure
            mean_lum = float(np.mean(gray))
            # Optimal exposure is around 128. Penalize extremes.
            # Map 0 -> 0, 128 -> 1.0, 255 -> 0
            if mean_lum <= 128:
                exposure_norm = mean_lum / 128.0
            else:
                exposure_norm = (255.0 - mean_lum) / 127.0
            
            # Dampen exposure penalty slightly so it doesn't drop too fast near the edges
            exposure_norm = exposure_norm ** 0.5 

            # 3. Contrast (RMS Contrast)
            contrast_std = float(np.std(gray))
            # Typical contrast std dev is 40-80.
            contrast_norm = min(1.0, contrast_std / 70.0)

            # 4. Feature Richness
            # Detect ORB keypoints
            keypoints = orb.detect(gray, None)
            feature_count = len(keypoints)
            # Normalize (assume 1000 features is excellent)
            feature_norm = min(1.0, feature_count / 1000.0)

            # 5. Compression Quality (Blockiness / Artifacts proxy)
            # Simple proxy: difference between pixels across 8x8 block boundaries vs internal
            # For speed, we'll just use a small high-frequency edge proxy, or just assume 1.0 for now if too slow.
            # A quick gradient calculation:
            sobelx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
            sobely = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
            grad_mag = np.sqrt(sobelx**2 + sobely**2)
            # Images with severe compression artifacts have artificially high gradients at block edges but low elsewhere.
            # We will use the 90th percentile gradient magnitude.
            grad_90 = float(np.percentile(grad_mag, 90))
            compression_norm = min(1.0, max(0.0, grad_90 / 250.0))
            if np.isnan(compression_norm):
                compression_norm = 0.5

            # 6. Redundancy (Difference from previous frame)
            # To speed up, we downscale to 64x64 and compute MSE.
            gray_small = cv2.resize(gray, (64, 64), interpolation=cv2.INTER_AREA)
            redundancy_norm = 0.0 # 0 means completely redundant (identical), 1 means completely different
            if prev_gray_small is not None:
                mse = np.mean((gray_small.astype("float") - prev_gray_small.astype("float")) ** 2)
                # MSE of 0 is identical. MSE > 500 is quite different.
                redundancy_norm = min(1.0, mse / 500.0)
            else:
                redundancy_norm = 1.0 # First frame is 100% novel
            
            prev_gray_small = gray_small

            # ── Final Score Calculation (0 - 100) ──
            # Weights:
            # Sharpness: 35%
            # Exposure: 15%
            # Contrast: 15%
            # Features: 20%
            # Compression: 5%
            # Redundancy: 10%
            
            raw_score = (
                (sharpness_norm * 35.0) +
                (exposure_norm * 15.0) +
                (contrast_norm * 15.0) +
                (feature_norm * 20.0) +
                (compression_norm * 5.0) +
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

            quality_records.append({
                "frame_id": item["frame_id"],
                "filepath": str(fpath),
                "timestamp_sec": item.get("timestamp_sec", 0.0),
                "sharpness": round(sharpness_norm, 4),
                "exposure": round(exposure_norm, 4),
                "contrast": round(contrast_norm, 4),
                "compression": round(compression_norm, 4),
                "feature_score": round(feature_norm, 4),
                "redundancy": round(redundancy_norm, 4),
                "laplacian_var": round(laplacian_var, 2),
                "mean_luminance": round(mean_lum, 2),
                "feature_count": feature_count,
                "overall_quality": overall_quality,
                "classification": classification,
                "usable": usable
            })
            
            overall_scores.append(overall_quality)

        if not quality_records:
            raise StageExecutionError(self.stage_name, "Failed to analyze any frame images.")

        usable_count = sum(1 for q in quality_records if q["usable"])
        high_count = sum(1 for q in quality_records if q["classification"] == "HIGH")
        medium_count = sum(1 for q in quality_records if q["classification"] == "MEDIUM")
        low_count = sum(1 for q in quality_records if q["classification"] == "LOW")
        mean_quality = float(np.mean(overall_scores)) if overall_scores else 0.0

        # Create histogram (10 bins from 0 to 100)
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
                "quality_json": str(out_json_path)
            },
            metrics={
                "total_frames_evaluated": len(quality_records),
                "high_quality_frames": high_count,
                "low_quality_frames": low_count,
                "mean_quality_score": round(mean_quality, 2)
            },
            summary=f"Evaluated {len(quality_records)} frames: {high_count} HIGH, {medium_count} MEDIUM, {low_count} LOW."
        )
