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

        # Masks and static scene images must be written for each frame
        masks_dir = Path(output.artifacts["masks_dir"])
        static_scene_dir = Path(output.artifacts["static_scene_dir"])
        for i in range(2):
            assert (masks_dir / f"frame_{i:04d}_dynamic.png").exists()
            assert (masks_dir / f"frame_{i:04d}_static.png").exists()
            assert (static_scene_dir / f"frame_{i:04d}_static_scene.png").exists()

    def test_full_stage_with_detections_and_unmodified_originals(self, tmp_path):
        """
        Verify that detected objects produce individual mask files, static scene reconstruction
        images, correct dynamic_objects.json structure (frame ID, object class, confidence,
        bounding box, mask path), and do NOT modify original keyframes.
        """
        from backend.app.pipeline.stages.s04_dynamic_masking import resolve_target_classes

        # Verify class expansion
        animal_classes = resolve_target_classes(["animal"])
        assert "dog" in animal_classes
        assert "cat" in animal_classes
        assert "bird" in animal_classes

        vehicle_classes = resolve_target_classes(["car", "motorcycle", "bicycle"])
        assert "car" in vehicle_classes
        assert "motorcycle" in vehicle_classes
        assert "bicycle" in vehicle_classes

        frames_dir = tmp_path / "keyframes"
        frames_dir.mkdir()
        kf_json = _make_keyframes_json(frames_dir, n=2)

        # Store original keyframe hashes/bytes
        orig_bytes = {}
        for fp in frames_dir.glob("*.jpg"):
            orig_bytes[fp.name] = fp.read_bytes()

        input_data = StageInput(
            mission_id="test_mission_dyn",
            job_id="test_job_dyn",
            stage_name="dynamic_masking",
            checkpoint_dir=str(tmp_path / "checkpoint"),
            previous_checkpoint_dir=str(tmp_path),
            input_artifacts={"keyframes_manifest": str(kf_json)},
            parameters={
                "confidence_threshold": 0.35,
                "iou_threshold": 0.5,
                "dynamic_classes": ["person", "car", "motorcycle", "bicycle", "animal"]
            }
        )

        # Mock YOLO model with 1 detection on frame 0
        mock_model = MagicMock()
        mock_model.names = {0: "person", 1: "car"}

        # Detection for frame 0 (person at 100, 100, 200, 200)
        box_det = MagicMock()
        box_det.cls = MagicMock()
        box_det.cls.__getitem__ = lambda self, i: MagicMock(item=lambda: 0)
        box_det.conf = MagicMock()
        box_det.conf.__getitem__ = lambda self, i: MagicMock(item=lambda: 0.88)
        box_det.xyxy = MagicMock()
        box_det.xyxy.__getitem__ = lambda self, i: [100.0, 120.0, 250.0, 300.0]

        mock_boxes = MagicMock()
        mock_boxes.__len__ = lambda self: 1
        mock_boxes.__iter__ = lambda self: iter([box_det])

        mock_res_det = MagicMock()
        mock_res_det.boxes = mock_boxes
        mock_res_det.masks = None

        # Clean frame for frame 1
        mock_res_clean = MagicMock()
        mock_res_clean.boxes = MagicMock()
        mock_res_clean.boxes.__len__ = lambda self: 0
        mock_res_clean.boxes.__iter__ = lambda self: iter([])
        mock_res_clean.masks = None

        # Model returns detection on 1st call, clean on 2nd
        mock_model.side_effect = [[mock_res_det], [mock_res_clean]]

        with patch("backend.app.pipeline.stages.s04_dynamic_masking._get_yolo_model", return_value=mock_model):
            stage = DynamicMaskingStage()
            output = stage.execute(input_data)

        assert output.status == "completed"

        # 1. Verify original images were NOT permanently modified
        for fp in frames_dir.glob("*.jpg"):
            assert fp.read_bytes() == orig_bytes[fp.name], f"Original image {fp.name} was modified!"

        # 2. Verify dynamic_objects.json contents
        json_path = Path(output.artifacts["dynamic_objects_json"])
        with open(json_path) as f:
            data = json.load(f)

        assert data["total_detections"] == 1
        assert data["frames_with_dynamic_objects"] == 1
        assert "dynamic_objects" in data
        assert len(data["dynamic_objects"]) == 1

        obj = data["dynamic_objects"][0]
        # Must contain: frame ID, object class, confidence, bounding box, mask path
        assert obj["frame_id"] == "frame_0000"
        assert obj["object_class"] == "person"
        assert obj["confidence"] == pytest.approx(0.88, abs=1e-3)
        assert len(obj["bounding_box"]) == 4
        assert "mask_path" in obj
        assert Path(obj["mask_path"]).exists()

        # 3. Verify static scene reconstruction image exists and is masked
        static_scene_path = Path(output.artifacts["static_scene_dir"]) / "frame_0000_static_scene.png"
        assert static_scene_path.exists()
        static_img = cv2.imread(str(static_scene_path))
        # Masked region should be black [0, 0, 0]
        masked_crop = static_img[150:200, 150:200]
        assert np.all(masked_crop == 0), "Dynamic region should be masked out in static reconstruction input"

        # 4. Verify analytics layer
        assert "analytics_layer" in data
        assert data["analytics_layer"]["class_distribution"]["person"] == 1
        assert "photogrammetry_corruption_risk" in data["analytics_layer"]

