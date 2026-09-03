"""
Unit tests for Phase 4: Dynamic Object Detection & Masking.

Tests use synthetic images and mock the YOLO model so the tests run
without requiring a GPU or a real model download.
"""
import json
import numpy as np
import cv2
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch

from backend.app.pipeline.stages.s04_dynamic_masking import (
    DynamicMaskingStage,
    _build_dynamic_mask,
    DEFAULT_DYNAMIC_CLASSES
)
from backend.app.schemas.stage import StageInput


def _make_synthetic_frame(path: Path, width: int = 640, height: int = 480):
    """Create a simple synthetic image with texture."""
    img = np.random.randint(50, 200, (height, width, 3), dtype=np.uint8)
    cv2.rectangle(img, (100, 100), (300, 300), (230, 230, 230), -1)
    cv2.imwrite(str(path), img)


def _make_keyframes_json(frames_dir: Path, n: int) -> Path:
    keyframes = []
    for i in range(n):
        fp = frames_dir / f"kf_{i:04d}.jpg"
        _make_synthetic_frame(fp)
        keyframes.append({
            "keyframe_id": i,
            "original_frame_id": f"frame_{i:04d}",
            "filename": fp.name,
            "filepath": str(fp),
            "timestamp_sec": float(i),
            "quality_score": 85,
            "feature_score": 0.7,
            "similarity_to_previous": 0.1,
            "selection_reason": "SUFFICIENT_PARALLAX"
        })
    out = frames_dir / "keyframes.json"
    with open(out, "w") as f:
        json.dump({"total_input_frames": n, "keyframes_count": n, "keyframes": keyframes}, f)
    return out


# ── Helper: fake YOLO result ──────────────────────────────────────────────

def _make_mock_results(cls_id: int, conf: float, x1=100, y1=100, x2=200, y2=200):
    """Returns a fake ultralytics Results object mimicking a single detection."""
    mock_box = MagicMock()
    mock_box.cls = MagicMock()
    mock_box.cls.__getitem__ = lambda self, i: MagicMock(item=lambda: cls_id)
    mock_box.conf = MagicMock()
    mock_box.conf.__getitem__ = lambda self, i: MagicMock(item=lambda: conf)
    mock_box.xyxy = MagicMock()
    mock_box.xyxy.__getitem__ = lambda self, i: [x1, y1, x2, y2]

    mock_boxes = MagicMock()
    mock_boxes.__len__ = lambda self: 1
    mock_boxes.__iter__ = lambda self: iter([mock_box])

    mock_result = MagicMock()
    mock_result.boxes = mock_boxes
    mock_result.masks = None  # No seg masks in this mock → bbox fallback

    return [mock_result]


# ── Tests ─────────────────────────────────────────────────────────────────

class TestDynamicMaskingStage:

    def test_build_dynamic_mask_with_bbox_fallback(self):
        """_build_dynamic_mask should fill bbox rect when no seg masks available."""
        img_h, img_w = 480, 640
        class_names = {0: "person"}

        mock_results = _make_mock_results(cls_id=0, conf=0.85, x1=100, y1=100, x2=300, y2=300)

        mask, detections = _build_dynamic_mask(
            img_h, img_w, mock_results, {"person"}, class_names, conf_threshold=0.3
        )

        assert mask.shape == (img_h, img_w), "Mask must match image dimensions"
        assert np.any(mask > 0), "Mask should have dynamic pixels for 'person' detection"
        assert len(detections) == 1
        assert detections[0]["class"] == "person"
        assert detections[0]["confidence"] == pytest.approx(0.85, abs=1e-3)
        assert detections[0]["has_segmentation_mask"] is False

    def test_build_dynamic_mask_ignores_non_target_class(self):
        """Detections for classes not in target_classes should be ignored."""
        img_h, img_w = 480, 640
        class_names = {63: "laptop"}  # not in target_classes

        mock_results = _make_mock_results(cls_id=63, conf=0.90)

        mask, detections = _build_dynamic_mask(
            img_h, img_w, mock_results, DEFAULT_DYNAMIC_CLASSES, class_names, conf_threshold=0.3
        )

        assert np.all(mask == 0), "No mask should be created for non-dynamic classes"
        assert len(detections) == 0

    def test_build_dynamic_mask_confidence_threshold(self):
        """Detections below confidence threshold should be rejected."""
        img_h, img_w = 480, 640
        class_names = {0: "person"}

        mock_results = _make_mock_results(cls_id=0, conf=0.20)  # Below 0.35

        mask, detections = _build_dynamic_mask(
            img_h, img_w, mock_results, {"person"}, class_names, conf_threshold=0.35
        )

        assert np.all(mask == 0), "Low-confidence detection should be rejected"
        assert len(detections) == 0

    def test_static_mask_is_inverse_of_dynamic_mask(self):
        """static_mask + dynamic_mask should cover all pixels."""
        img_h, img_w = 480, 640
        dynamic_mask = np.zeros((img_h, img_w), dtype=np.uint8)
        cv2.rectangle(dynamic_mask, (50, 50), (200, 200), 255, -1)

        static_mask = cv2.bitwise_not(dynamic_mask)

        combined = cv2.bitwise_or(dynamic_mask, static_mask)
        assert np.all(combined == 255), "Every pixel must be either dynamic or static"

    def test_full_stage_executes_without_gpu(self, tmp_path):
        """
        Full stage integration test using a mocked YOLO model.
        Verifies: dynamic_objects.json created, masks written, artifacts populated.
        """
        frames_dir = tmp_path / "keyframes"
        frames_dir.mkdir()
        kf_json = _make_keyframes_json(frames_dir, n=2)

        input_data = StageInput(
            mission_id="test_mission",
            job_id="test_job",
            stage_name="dynamic_masking",
            checkpoint_dir=str(tmp_path / "checkpoint"),
            previous_checkpoint_dir=str(tmp_path),
            input_artifacts={"keyframes_manifest": str(kf_json)},
            parameters={
                "confidence_threshold": 0.35,
                "iou_threshold": 0.5
            }
        )

        # Patch YOLO model loading and inference
        mock_model = MagicMock()
        mock_model.names = {0: "person"}
        # Simulate no detections (clean scene)
        mock_result = MagicMock()
        mock_result.boxes = MagicMock()
        mock_result.boxes.__len__ = lambda self: 0
        mock_result.boxes.__iter__ = lambda self: iter([])
        mock_result.masks = None
        mock_model.return_value = [mock_result]

        with patch("backend.app.pipeline.stages.s04_dynamic_masking._get_yolo_model", return_value=mock_model):
            stage = DynamicMaskingStage()
            output = stage.execute(input_data)

        assert output.status == "completed"
        assert "dynamic_objects_json" in output.artifacts

        json_path = Path(output.artifacts["dynamic_objects_json"])
        assert json_path.exists()

        with open(json_path) as f:
            data = json.load(f)

        assert data["total_keyframes"] == 2
        assert data["total_detections"] == 0
        assert "note" in data, "Uncertainty disclaimer must be present in output"

        # Masks must be written for each frame
        masks_dir = Path(output.artifacts["masks_dir"])
        for i in range(2):
            assert (masks_dir / f"frame_{i:04d}_dynamic.png").exists()
            assert (masks_dir / f"frame_{i:04d}_static.png").exists()
