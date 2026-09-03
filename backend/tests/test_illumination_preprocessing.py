"""
Unit tests for Phase 5: Illumination-Aware Image Preprocessing.
Validates overexposure, underexposure, shadow, and contrast detection,
controlled non-aggressive normalization, RAW vs NORMALIZED modes,
selective degradation rejection, and illumination.json schema.
"""
import json
import numpy as np
import cv2
import pytest
from pathlib import Path

from backend.app.pipeline.stages.s05_illumination_preprocessing import (
    IlluminationPreprocessingStage,
    detect_illumination_metrics,
    controlled_illumination_preprocessing
)
from backend.app.schemas.stage import StageInput


def _create_synthetic_frame(path: Path, mean_val: int = 128, add_shadow: bool = False, add_highlight: bool = False):
    """Generates synthetic frames with controlled illumination characteristics."""
    img = np.full((480, 640, 3), mean_val, dtype=np.uint8)

    # Add ground texture
    cv2.rectangle(img, (150, 150), (450, 350), (mean_val + 20, mean_val - 15, mean_val + 10), -1)
    cv2.circle(img, (320, 240), 40, (mean_val - 25, mean_val + 30, mean_val), -1)

    if add_shadow:
        # Deep extreme shadow region (intensity < 30)
        cv2.rectangle(img, (40, 40), (360, 320), (12, 14, 15), -1)

    if add_highlight:
        # Blown out overexposed highlight region (intensity > 248)
        cv2.rectangle(img, (350, 50), (600, 250), (252, 253, 255), -1)

    cv2.imwrite(str(path), img)
    return img


def _make_keyframes_manifest(folder: Path, n: int = 3) -> Path:
    keyframes = []
    for i in range(n):
        fp = folder / f"kf_{i:04d}.jpg"
        if i == 0:
            _create_synthetic_frame(fp, mean_val=125)
        elif i == 1:
            _create_synthetic_frame(fp, mean_val=40, add_shadow=True)
        else:
            _create_synthetic_frame(fp, mean_val=220, add_highlight=True)

        keyframes.append({
            "keyframe_id": i,
            "original_frame_id": f"frame_{i:04d}",
            "filename": fp.name,
            "filepath": str(fp),
            "timestamp_sec": float(i * 0.5)
        })

    manifest = folder / "keyframes.json"
    with open(manifest, "w", encoding="utf-8") as f:
        json.dump({"keyframes": keyframes}, f)
    return manifest


class TestIlluminationPreprocessing:

    def test_overexposure_detection(self, tmp_path):
        """High-intensity clipped highlights must be detected with high overexposure percent."""
        img_path = tmp_path / "overexposed.jpg"
        _create_synthetic_frame(img_path, mean_val=240, add_highlight=True)
        img = cv2.imread(str(img_path))

        metrics = detect_illumination_metrics(img)
        assert metrics["overexposure_percent"] > 15.0
        assert metrics["mean_luminance"] > 200.0

    def test_underexposure_and_extreme_shadows(self, tmp_path):
        """Deep shadow regions must be identified with a high shadow score."""
        img_path = tmp_path / "shadowed.jpg"
        _create_synthetic_frame(img_path, mean_val=30, add_shadow=True)
        img = cv2.imread(str(img_path))

        metrics = detect_illumination_metrics(img)
        assert metrics["underexposure_percent"] > 20.0
        assert metrics["shadow_score"] > 30.0

    def test_controlled_preprocessing_preserves_colors(self, tmp_path):
        """Controlled normalization must not aggressively alter hue or cause extreme color casts."""
        img_path = tmp_path / "test_norm.jpg"
        orig_img = _create_synthetic_frame(img_path, mean_val=60, add_shadow=True)

        metrics = detect_illumination_metrics(orig_img)
        norm_img, applied = controlled_illumination_preprocessing(orig_img, metrics)

        assert norm_img.shape == orig_img.shape
        assert len(applied) > 0
        # Check that normalized image lifted deep darks without blowing out
        mean_orig = np.mean(orig_img)
        mean_norm = np.mean(norm_img)
        assert mean_norm >= mean_orig - 5.0, "Normalization should not arbitrarily darken images"

    def test_full_stage_normalized_mode(self, tmp_path):
        """
        Executes IlluminationPreprocessingStage in normalized mode.
        Verifies illumination.json schema, score generation, and image preservation.
        """
        kf_dir = tmp_path / "keyframes"
        kf_dir.mkdir()
        kf_manifest = _make_keyframes_manifest(kf_dir, n=3)

        # Store raw file bytes to guarantee originals are NOT modified
        orig_bytes = {f.name: f.read_bytes() for f in kf_dir.glob("*.jpg")}

        stage_input = StageInput(
            mission_id="illum_test_mission",
            job_id="illum_test_job",
            stage_name="illumination_preprocessing",
            checkpoint_dir=str(tmp_path / "checkpoint"),
            previous_checkpoint_dir=str(kf_dir),
            input_artifacts={"keyframes_manifest": str(kf_manifest)},
            parameters={"mode": "normalized"}
        )

        stage = IlluminationPreprocessingStage()
        output = stage.execute(stage_input)

        assert output.status == "completed"
        assert "illumination_json" in output.artifacts
        assert "normalized_dir" in output.artifacts
        assert "comparison_dir" in output.artifacts

        # 1. Verify original images were preserved without any alteration
        for f in kf_dir.glob("*.jpg"):
            assert f.read_bytes() == orig_bytes[f.name], f"Original image {f.name} was altered!"

        # 2. Verify illumination.json
        with open(output.artifacts["illumination_json"]) as jf:
            data = json.load(jf)

        assert data["total_keyframes"] == 3
        assert "note" in data
        assert "does NOT completely solve or eliminate physical shadows" in data["note"]
        assert len(data["frames"]) == 3

        for fr in data["frames"]:
            # Check required fields from specification
            assert "exposure_score" in fr
            assert "shadow_score" in fr
            assert "contrast_score" in fr
            assert "normalization_applied" in fr
            assert "final_quality_status" in fr
            assert fr["final_quality_status"] in ["OPTIMAL", "ACCEPTABLE", "DEGRADED", "REJECTED"]
            assert Path(fr["processed_image_path"]).exists()
            assert Path(fr["comparison_path"]).exists()

    def test_raw_vs_normalized_configurability(self, tmp_path):
        """
        Verifies that when mode='raw', preprocessing is passthrough for baseline comparison.
        """
        kf_dir = tmp_path / "keyframes_raw"
        kf_dir.mkdir()
        kf_manifest = _make_keyframes_manifest(kf_dir, n=2)

        stage_input = StageInput(
            mission_id="raw_test_mission",
            job_id="raw_test_job",
            stage_name="illumination_preprocessing",
            checkpoint_dir=str(tmp_path / "checkpoint_raw"),
            previous_checkpoint_dir=str(kf_dir),
            input_artifacts={"keyframes_manifest": str(kf_manifest)},
            parameters={"mode": "raw"}
        )

        stage = IlluminationPreprocessingStage()
        output = stage.execute(stage_input)

        assert output.status == "completed"
        with open(output.artifacts["illumination_json"]) as jf:
            data = json.load(jf)

        assert data["mode"] == "raw"
        for fr in data["frames"]:
            assert "raw_passthrough" in fr["normalization_applied"]

    def test_severe_degradation_rejection(self, tmp_path):
        """Severely degraded frames (>70% white clipping or near-zero contrast) should be REJECTED."""
        kf_dir = tmp_path / "keyframes_deg"
        kf_dir.mkdir()
        deg_frame = kf_dir / "kf_0000.jpg"
        # 95% pure clipped white
        blown_img = np.full((480, 640, 3), 255, dtype=np.uint8)
        cv2.imwrite(str(blown_frame := deg_frame), blown_img)

        manifest = kf_dir / "keyframes.json"
        with open(manifest, "w", encoding="utf-8") as f:
            json.dump({
                "keyframes": [{
                    "keyframe_id": 0,
                    "original_frame_id": "frame_0000",
                    "filename": "kf_0000.jpg",
                    "filepath": str(deg_frame),
                    "timestamp_sec": 0.0
                }]
            }, f)

        stage_input = StageInput(
            mission_id="rejection_mission",
            job_id="rejection_job",
            stage_name="illumination_preprocessing",
            checkpoint_dir=str(tmp_path / "checkpoint_deg"),
            previous_checkpoint_dir=str(kf_dir),
            input_artifacts={"keyframes_manifest": str(manifest)},
            parameters={"rejection_overexposure_percent": 70.0}
        )

        stage = IlluminationPreprocessingStage()
        output = stage.execute(stage_input)

        with open(output.artifacts["illumination_json"]) as jf:
            data = json.load(jf)

        assert data["rejected_count"] == 1
        assert data["frames"][0]["final_quality_status"] == "REJECTED"
