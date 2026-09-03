"""
Stage 5: Illumination-Aware Image Preprocessing.
Goal: Reduce the effect of changing illumination, exposure and shadows between drone survey frames.

For every selected keyframe:
Detects:
  - overexposure (highlight clipping & saturation blowout)
  - underexposure (shadow clipping & crushed blacks)
  - extreme shadows (deep shadow coverage & high shadow edge contrast)
  - low contrast (dynamic range & RMS contrast)

Controlled Preprocessing (DO NOT aggressively alter images):
  - brightness normalization (gentle adaptive gamma)
  - contrast normalization (controlled luminance-only CLAHE)
  - color / exposure normalization (bounded chromatic gray-world adaptation)
  - gentle shadow fill (smooth local shadow attenuation)

Configurable:
  - mode: "normalized" (default) vs "raw" (passthrough for baseline experiments)

Rejection Policy:
  - Rejects only severely degraded frames (extreme clipping >70% or flat zero contrast).

Artifacts:
  - illumination.json (manifest containing exposure score, shadow score, contrast score,
    normalization applied, final quality status, and probabilistic disclaimer)
  - normalized/frame_*_normalized.png (preprocessed image)
  - comparison/frame_*_comparison.jpg (RAW vs NORMALIZED before/after view)

IMPORTANT:
The system reduces illumination effects, exposure variations, and shadow impact;
it does NOT completely solve or eliminate physical shadows.
"""
import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import cv2
import numpy as np

from backend.app.pipeline.base import BaseStage, StageExecutionError
from backend.app.schemas.stage import StageInput, StageOutput

logger = logging.getLogger("uav_reconstruction.stage.illumination")


def detect_illumination_metrics(
    img_bgr: np.ndarray,
    overexposure_thresh: int = 245,
    underexposure_thresh: int = 15
) -> Dict[str, Any]:
    """
    Analyzes exposure, shadow severity, and contrast on an input image.

    Returns:
        exposure_score: 0.0 to 100.0 (higher = balanced optimal exposure)
        shadow_score: 0.0 to 100.0 (higher = more severe, deep shadows)
        contrast_score: 0.0 to 100.0 (higher = richer dynamic contrast)
        overexposure_percent: float %
        underexposure_percent: float %
        mean_luminance: float (0 - 255)
        dynamic_range: float (0 - 255)
    """
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    total_pixels = float(h * w)

    # 1. Overexposure (clipping in highlights)
    overexposed_pixels = np.sum(gray >= overexposure_thresh)
    overexposure_pct = round((overexposed_pixels / total_pixels) * 100.0, 2)

    # 2. Underexposure (crushed darks)
    underexposed_pixels = np.sum(gray <= underexposure_thresh)
    underexposure_pct = round((underexposed_pixels / total_pixels) * 100.0, 2)

    # 3. Mean & median luminance
    mean_l = float(np.mean(gray))
    median_l = float(np.median(gray))

    # 4. Extreme shadows (deep shadow range 0 - 45)
    deep_shadow_pixels = np.sum(gray <= 45)
    deep_shadow_ratio = float(deep_shadow_pixels) / total_pixels
    # Shadow score: 0 = minimal shadows, 100 = severe heavy shadows
    shadow_score = round(float(np.clip((deep_shadow_ratio / 0.40) * 100.0, 0.0, 100.0)), 1)

    # 5. Contrast (percentile dynamic range & RMS)
    p02, p98 = np.percentile(gray, [2, 98])
    dynamic_range = float(p98 - p02)
    rms_contrast = float(np.std(gray))
    # Contrast score: 0 = completely flat, 100 = full dynamic range
    contrast_score = round(float(np.clip((dynamic_range / 200.0) * 100.0, 0.0, 100.0)), 1)

    # 6. Overall Exposure Score (balanced midtones, minimal clipping)
    # Ideal target luminance is ~125. Penalize over/under exposure clipping.
    dev_from_target = abs(mean_l - 125.0)
    clipping_penalty = (overexposure_pct * 1.2) + (underexposure_pct * 1.2)
    exposure_score = round(float(np.clip(100.0 - (dev_from_target * 0.4 + clipping_penalty), 0.0, 100.0)), 1)

    return {
        "exposure_score": exposure_score,
        "shadow_score": shadow_score,
        "contrast_score": contrast_score,
        "overexposure_percent": overexposure_pct,
        "underexposure_percent": underexposure_pct,
        "mean_luminance": round(mean_l, 1),
        "median_luminance": round(median_l, 1),
        "dynamic_range": round(dynamic_range, 1),
        "rms_contrast": round(rms_contrast, 2)
    }


def controlled_illumination_preprocessing(
    img_bgr: np.ndarray,
    metrics: Dict[str, Any],
    clahe_clip_limit: float = 1.8,
    tile_grid_size: Tuple[int, int] = (8, 8),
    enable_gamma: bool = True,
    enable_color_balance: bool = True,
    enable_shadow_lift: bool = True
) -> Tuple[np.ndarray, List[str]]:
    """
    Applies gentle, controlled photometric normalization without aggressively altering images.

    Steps:
      1. Bounded chromatic balance (stabilizes inter-frame color temperature shifts)
      2. Gentle adaptive gamma (corrects global exposure drift without blown highlights)
      3. Soft shadow attenuation (lifts deep occluded shadows to reveal ground texture)
      4. Controlled luminance-only CLAHE (optimizes feature contrast in LAB space)

    Returns:
        processed_bgr: normalized image
        applied_operations: list of strings describing the normalizations applied
    """
    applied: List[str] = []
    out_bgr = img_bgr.copy()

    # 1. Bounded Chromatic Balance (Gray-World Assumption with strict clamp)
    if enable_color_balance:
        # Calculate mean per channel on valid midtone pixels to avoid highlight bias
        gray = cv2.cvtColor(out_bgr, cv2.COLOR_BGR2GRAY)
        valid_mask = (gray > 20) & (gray < 240)
        if np.any(valid_mask):
            b_mean = float(np.mean(out_bgr[:, :, 0][valid_mask]))
            g_mean = float(np.mean(out_bgr[:, :, 1][valid_mask]))
            r_mean = float(np.mean(out_bgr[:, :, 2][valid_mask]))
            k_mean = (b_mean + g_mean + r_mean) / 3.0

            # Strictly clamp gains within [0.92, 1.08] to avoid unnatural color shifts
            b_gain = np.clip(k_mean / (b_mean + 1e-5), 0.92, 1.08)
            g_gain = np.clip(k_mean / (g_mean + 1e-5), 0.92, 1.08)
            r_gain = np.clip(k_mean / (r_mean + 1e-5), 0.92, 1.08)

            if abs(b_gain - 1.0) > 0.01 or abs(g_gain - 1.0) > 0.01 or abs(r_gain - 1.0) > 0.01:
                channels = list(cv2.split(out_bgr))
                channels[0] = np.uint8(np.clip(channels[0] * b_gain, 0, 255))
                channels[1] = np.uint8(np.clip(channels[1] * g_gain, 0, 255))
                channels[2] = np.uint8(np.clip(channels[2] * r_gain, 0, 255))
                out_bgr = cv2.merge(channels)
                applied.append("color_balance")

    # Convert to CIELAB space to operate strictly on Luminance (L channel)
    # This guarantees color hues and saturation are preserved.
    lab = cv2.cvtColor(out_bgr, cv2.COLOR_BGR2LAB)
    l_chan, a_chan, b_chan = cv2.split(lab)
    l_float = l_chan.astype(np.float32)

    # 2. Gentle Adaptive Gamma (Brightness Normalization)
    median_l = metrics.get("median_luminance", 128.0)
    if enable_gamma:
        # To brighten dark frames: exponent < 1.0 (e.g. 0.82) lifts shadows and midtones
        # To gently pull down overexposed frames: exponent > 1.0 (e.g. 1.18)
        if median_l < 105.0:
            exp_factor = max(0.80, float((median_l / 125.0) ** 0.45))
            l_float = 255.0 * (np.clip(l_float / 255.0, 0.0, 1.0) ** exp_factor)
            applied.append(f"adaptive_gamma_{exp_factor:.2f}")
        elif median_l > 145.0:
            exp_factor = min(1.20, float((median_l / 125.0) ** 0.35))
            l_float = 255.0 * (np.clip(l_float / 255.0, 0.0, 1.0) ** exp_factor)
            applied.append(f"adaptive_gamma_{exp_factor:.2f}")

    # 3. Soft Shadow Attenuation (Reduce effects of harsh shadows)
    if enable_shadow_lift and metrics.get("shadow_score", 0.0) > 20.0:
        # Soft mask identifying deep shadows (< 50 intensity)
        shadow_weight = np.clip((50.0 - l_float) / 50.0, 0.0, 1.0)
        # Gentle boost: max 12 levels in deep shadows
        l_float = l_float + shadow_weight * 12.0
        applied.append("shadow_attenuation")

    l_uint8 = np.uint8(np.clip(l_float, 0, 255))

    # 4. Controlled Contrast Normalization (Luminance CLAHE)
    clahe = cv2.createCLAHE(clipLimit=clahe_clip_limit, tileGridSize=tile_grid_size)
    l_clahe = clahe.apply(l_uint8)
    applied.append(f"clahe_contrast_limit_{clahe_clip_limit}")

    # Merge back to BGR
    lab_out = cv2.merge([l_clahe, a_chan, b_chan])
    out_bgr = cv2.cvtColor(lab_out, cv2.COLOR_LAB2BGR)

    if not applied:
        applied.append("balanced_identity")

    return out_bgr, applied


def generate_before_after_comparison(
    raw_bgr: np.ndarray,
    norm_bgr: np.ndarray,
    frame_id: str,
    metrics: Dict[str, Any],
    applied: List[str]
) -> np.ndarray:
    """
    Creates a side-by-side Before (RAW) vs After (NORMALIZED) comparison banner with metrics overlay.
    """
    h, w = raw_bgr.shape[:2]
    comp_w = 640
    comp_h = int(h * (comp_w / float(w)))

    raw_resized = cv2.resize(raw_bgr, (comp_w, comp_h))
    norm_resized = cv2.resize(norm_bgr, (comp_w, comp_h))

    # Combine horizontally
    combined = np.hstack([raw_resized, norm_resized])

    # Add header banner
    banner_h = 48
    banner = np.zeros((banner_h, comp_w * 2, 3), dtype=np.uint8)
    banner[:] = (18, 24, 38)  # dark slate

    # Left: RAW / Before
    cv2.putText(
        banner,
        f"RAW: {frame_id} (Exp: {metrics['exposure_score']} | Shadow: {metrics['shadow_score']} | Contrast: {metrics['contrast_score']})",
        (16, 30),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.55,
        (255, 200, 100),
        1,
        cv2.LINE_AA
    )

    # Right: NORMALIZED / After
    norm_text = f"NORMALIZED: {', '.join(applied[:2])}"
    cv2.putText(
        banner,
        norm_text,
        (comp_w + 16, 30),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.55,
        (100, 230, 150),
        1,
        cv2.LINE_AA
    )

    return np.vstack([banner, combined])


class IlluminationPreprocessingStage(BaseStage):
    stage_name = "illumination_preprocessing"
    stage_order = 5
    description = (
        "Illumination-aware preprocessing: detects over/underexposure, shadows, and low contrast; "
        "applies controlled brightness/contrast/exposure normalization without aggressive alteration; "
        "supports RAW vs NORMALIZED comparison."
    )

    def execute(self, input_data: StageInput) -> StageOutput:
        # ── 1. Resolve keyframes manifest ───────────────────────────────
        kf_manifest_path = input_data.input_artifacts.get("keyframes_manifest")
        if not kf_manifest_path or not Path(kf_manifest_path).exists():
            prev_dir = input_data.previous_checkpoint_dir or input_data.checkpoint_dir
            for candidate_name in ["keyframes.json", "keyframes_manifest.json"]:
                candidate = Path(prev_dir) / candidate_name
                if candidate.exists():
                    kf_manifest_path = str(candidate)
                    break

        if not kf_manifest_path or not Path(kf_manifest_path).exists():
            raise StageExecutionError(
                self.stage_name,
                "Missing keyframes.json from Phase 3 keyframe selection stage."
            )

        with open(kf_manifest_path, "r", encoding="utf-8") as f:
            kf_data = json.load(f)

        keyframes = kf_data.get("keyframes", [])
        if not keyframes:
            raise StageExecutionError(self.stage_name, "No keyframes available for illumination preprocessing.")

        # ── 2. Parameters & Mode (RAW vs NORMALIZED) ────────────────────
        params = input_data.parameters
        mode = params.get("mode", "normalized").lower()  # "normalized" or "raw"
        clahe_clip_limit = float(params.get("clahe_clip_limit", 1.8))
        enable_gamma = bool(params.get("enable_gamma", True))
        enable_color_balance = bool(params.get("enable_color_balance", True))
        enable_shadow_lift = bool(params.get("enable_shadow_lift", True))
        
        # Severe degradation rejection thresholds
        rejection_overexp = float(params.get("rejection_overexposure_percent", 70.0))
        rejection_underexp = float(params.get("rejection_underexposure_percent", 75.0))
        rejection_contrast_min = float(params.get("rejection_contrast_min", 12.0))

        # ── 3. Output Directories ────────────────────────────────────────
        ckpt_dir = Path(input_data.checkpoint_dir)
        norm_dir = ckpt_dir / "normalized"
        norm_dir.mkdir(parents=True, exist_ok=True)

        comp_dir = ckpt_dir / "comparison"
        comp_dir.mkdir(parents=True, exist_ok=True)

        # ── 4. Process Each Keyframe ─────────────────────────────────────
        frame_records: List[Dict[str, Any]] = []
        exposure_scores: List[float] = []
        shadow_scores: List[float] = []
        contrast_scores: List[float] = []
        rejected_count = 0
        normalized_count = 0

        for kf in keyframes:
            frame_id = str(kf.get("original_frame_id", f"frame_{kf.get('keyframe_id', 0):04d}"))
            kf_id = int(kf.get("keyframe_id", 0))
            raw_img_path = kf["filepath"]

            raw_bgr = cv2.imread(raw_img_path)
            if raw_bgr is None:
                logger.warning(f"Could not read keyframe image: {raw_img_path}. Skipping.")
                continue

            # Step 1: Detect overexposure, underexposure, extreme shadows, and contrast
            metrics = detect_illumination_metrics(raw_bgr)
            exposure_scores.append(metrics["exposure_score"])
            shadow_scores.append(metrics["shadow_score"])
            contrast_scores.append(metrics["contrast_score"])

            # Step 2: Severe Degradation Check
            is_severely_degraded = (
                metrics["overexposure_percent"] >= rejection_overexp or
                metrics["underexposure_percent"] >= rejection_underexp or
                metrics["dynamic_range"] <= rejection_contrast_min
            )

            if is_severely_degraded:
                final_status = "REJECTED"
                rejected_count += 1
            elif metrics["exposure_score"] >= 72.0 and metrics["shadow_score"] <= 30.0 and metrics["contrast_score"] >= 50.0:
                final_status = "OPTIMAL"
            else:
                final_status = "ACCEPTABLE"

            # Step 3: Controlled Preprocessing (if mode is normalized, else passthrough raw)
            if mode == "raw":
                processed_bgr = raw_bgr.copy()
                applied_ops = ["raw_passthrough"]
            else:
                processed_bgr, applied_ops = controlled_illumination_preprocessing(
                    raw_bgr,
                    metrics=metrics,
                    clahe_clip_limit=clahe_clip_limit,
                    enable_gamma=enable_gamma,
                    enable_color_balance=enable_color_balance,
                    enable_shadow_lift=enable_shadow_lift
                )
                normalized_count += 1

            # Save processed image (Original is preserved untouched)
            processed_filename = f"frame_{kf_id:04d}_normalized.png"
            processed_path = norm_dir / processed_filename
            cv2.imwrite(str(processed_path), processed_bgr)

            # Generate Before / After Comparison Banner
            comp_img = generate_before_after_comparison(raw_bgr, processed_bgr, frame_id, metrics, applied_ops)
            comp_filename = f"frame_{kf_id:04d}_comparison.jpg"
            comp_path = comp_dir / comp_filename
            cv2.imwrite(str(comp_path), comp_img)

            frame_entry = {
                "frame_id": frame_id,
                "keyframe_id": kf_id,
                "timestamp_sec": float(kf.get("timestamp_sec", 0.0)),
                "original_image_path": str(raw_img_path),
                "processed_image_path": str(processed_path),
                "comparison_path": str(comp_path),
                "exposure_score": metrics["exposure_score"],
                "shadow_score": metrics["shadow_score"],
                "contrast_score": metrics["contrast_score"],
                "overexposure_percent": metrics["overexposure_percent"],
                "underexposure_percent": metrics["underexposure_percent"],
                "mean_luminance": metrics["mean_luminance"],
                "dynamic_range": metrics["dynamic_range"],
                "normalization_applied": applied_ops,
                "final_quality_status": final_status
            }
            frame_records.append(frame_entry)

            logger.info(
                f"  [{frame_id}] Exp: {metrics['exposure_score']} | Shadow: {metrics['shadow_score']} | "
                f"Contrast: {metrics['contrast_score']} -> {final_status} ({', '.join(applied_ops)})"
            )

        if not frame_records:
            raise StageExecutionError(self.stage_name, "No frames could be processed.")

        # ── 5. Generate illumination.json ────────────────────────────────
        avg_exp = round(float(np.mean(exposure_scores)), 1) if exposure_scores else 0.0
        avg_shadow = round(float(np.mean(shadow_scores)), 1) if shadow_scores else 0.0
        avg_contrast = round(float(np.mean(contrast_scores)), 1) if contrast_scores else 0.0

        illumination_json_path = ckpt_dir / "illumination.json"
        out_data = {
            "total_keyframes": len(frame_records),
            "normalized_count": normalized_count,
            "rejected_count": rejected_count,
            "mode": mode,
            "average_exposure_score": avg_exp,
            "average_shadow_score": avg_shadow,
            "average_contrast_score": avg_contrast,
            "note": (
                "Illumination-aware preprocessing reduces sensor exposure drift, non-uniform illumination, "
                "and deep shadows across drone frames. It does NOT completely solve or eliminate physical shadows."
            ),
            "config": {
                "mode": mode,
                "clahe_clip_limit": clahe_clip_limit,
                "enable_gamma": enable_gamma,
                "enable_color_balance": enable_color_balance,
                "enable_shadow_lift": enable_shadow_lift
            },
            "frames": frame_records
        }

        with open(illumination_json_path, "w", encoding="utf-8") as f:
            json.dump(out_data, f, indent=2)

        return StageOutput(
            stage_name=self.stage_name,
            status="completed",
            checkpoint_dir=input_data.checkpoint_dir,
            artifacts={
                "illumination_json": str(illumination_json_path),
                "normalized_dir": str(norm_dir),
                "comparison_dir": str(comp_dir)
            },
            metrics={
                "total_keyframes": len(frame_records),
                "normalized_frames": normalized_count,
                "rejected_frames": rejected_count,
                "average_exposure_score": avg_exp,
                "average_shadow_score": avg_shadow,
                "average_contrast_score": avg_contrast,
                "mode": mode
            },
            summary=(
                f"Processed {len(frame_records)} keyframes under '{mode}' mode. "
                f"Avg Exposure Score: {avg_exp}, Avg Shadow Score: {avg_shadow}, "
                f"Rejected: {rejected_count} severely degraded frames."
            )
        )


def standalone_test():
    """
    Independently testable routine for Phase 5 Illumination-Aware Preprocessing.
    Generates synthetic frames with varying illumination conditions (bright highlight, dark shadow, low contrast),
    runs IlluminationPreprocessingStage, and verifies outputs and illumination.json.
    """
    import tempfile
    import shutil

    test_dir = Path(tempfile.mkdtemp(prefix="phase5_illum_test_"))
    try:
        kf_dir = test_dir / "keyframes"
        kf_dir.mkdir(parents=True)
        ckpt_dir = test_dir / "checkpoint"
        ckpt_dir.mkdir(parents=True)

        keyframes = []
        # Create 3 frames with simulated lighting challenges:
        # Frame 0: Balanced normal frame
        # Frame 1: Underexposed with extreme shadows
        # Frame 2: Overexposed highlights
        for i in range(3):
            fp = kf_dir / f"keyframe_{i:04d}.jpg"
            img = np.zeros((480, 640, 3), dtype=np.uint8)

            if i == 0:
                # Balanced
                img[:] = 128
                cv2.rectangle(img, (100, 100), (300, 300), (180, 160, 140), -1)
            elif i == 1:
                # Deep shadows / underexposed
                img[:] = 35
                cv2.rectangle(img, (50, 50), (250, 250), (10, 10, 10), -1)
            else:
                # Overexposed highlights
                img[:] = 230
                cv2.circle(img, (320, 240), 120, (255, 255, 255), -1)

            cv2.imwrite(str(fp), img)
            keyframes.append({
                "keyframe_id": i,
                "original_frame_id": f"frame_{i:04d}",
                "filepath": str(fp),
                "timestamp_sec": float(i * 0.5)
            })

        manifest_path = kf_dir / "keyframes.json"
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump({"keyframes": keyframes}, f)

        stage_input = StageInput(
            mission_id="test_illum_mission",
            job_id="test_illum_job",
            stage_name="illumination_preprocessing",
            checkpoint_dir=str(ckpt_dir),
            previous_checkpoint_dir=str(kf_dir),
            input_artifacts={"keyframes_manifest": str(manifest_path)},
            parameters={"mode": "normalized"}
        )

        stage = IlluminationPreprocessingStage()
        print("[Standalone Test] Executing IlluminationPreprocessingStage...")
        output = stage.execute(stage_input)

        assert output.status == "completed"
        ill_json = Path(output.artifacts["illumination_json"])
        assert ill_json.exists(), "illumination.json must exist"

        with open(ill_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        assert "total_keyframes" in data
        assert "average_exposure_score" in data
        assert "average_shadow_score" in data
        assert "average_contrast_score" in data
        assert "frames" in data
        assert len(data["frames"]) == 3

        for frame in data["frames"]:
            assert "exposure_score" in frame
            assert "shadow_score" in frame
            assert "contrast_score" in frame
            assert "normalization_applied" in frame
            assert "final_quality_status" in frame
            assert Path(frame["processed_image_path"]).exists()
            assert Path(frame["comparison_path"]).exists()

        print("[Standalone Test] Success! illumination.json and normalized images generated.")
        print(f"Summary: {output.summary}")
    finally:
        shutil.rmtree(test_dir, ignore_errors=True)


if __name__ == "__main__":
    standalone_test()
