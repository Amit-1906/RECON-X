"""
Stage 4 (inserted): Dynamic Object Detection & Masking
Detects configurable dynamic object classes (person, car, motorcycle, bicycle, animal, etc.)
on every keyframe using YOLOv8-seg (segmentation variant).

For each frame produces:
  - detected_objects: list of detections with class/confidence/bbox
  - binary mask PNG (per-frame) combining all dynamic object regions
  - static scene mask PNG (inverse dynamic mask)

Outputs:
  dynamic_objects.json  — full detection manifest
  masks/frame_*_dynamic.png   — binary masks (255=dynamic, 0=static)
  masks/frame_*_static.png    — inverse masks

DOES NOT permanently modify original keyframe images.
Confidence values are always exposed; imperfect detection is expected.
"""
import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import cv2
import numpy as np

from backend.app.pipeline.base import BaseStage, StageExecutionError
from backend.app.schemas.stage import StageInput, StageOutput

logger = logging.getLogger("uav_reconstruction.stage.dynamic_masking")

# ── Configurable default dynamic classes (COCO class names) ─────────────
DEFAULT_DYNAMIC_CLASSES = {
    "person",
    "car",
    "motorcycle",
    "bicycle",
    "bus",
    "truck",
    "dog",
    "cat",
    "horse",
    "cow",
    "sheep",
    "bird",
}


def _get_yolo_model(model_name: str):
    """
    Lazily load the YOLO segmentation model.
    Supports yolov8n-seg, yolov8s-seg, yolov8m-seg, yolov8l-seg, yolov8x-seg.
    Falls back gracefully if ultralytics is not installed.
    """
    try:
        from ultralytics import YOLO
        model = YOLO(model_name)
        return model
    except ImportError:
        raise StageExecutionError(
            "dynamic_masking",
            "ultralytics package is required for YOLO detection. "
            "Install it with: pip install ultralytics"
        )


def _build_dynamic_mask(
    img_h: int,
    img_w: int,
    results,
    target_classes: set,
    class_names: Dict[int, str],
    conf_threshold: float
) -> Tuple[np.ndarray, List[Dict[str, Any]]]:
    """
    Given YOLO segmentation results, build a binary dynamic mask and collect detection records.
    
    Returns:
        dynamic_mask: uint8 numpy array (img_h x img_w), 255 = dynamic object pixel, 0 = static
        detections:   list of detection dicts
    """
    dynamic_mask = np.zeros((img_h, img_w), dtype=np.uint8)
    detections: List[Dict[str, Any]] = []

    if results is None or len(results) == 0:
        return dynamic_mask, detections

    result = results[0]  # single-image inference

    boxes = result.boxes
    if boxes is None or len(boxes) == 0:
        return dynamic_mask, detections

    # Segmentation masks (may be None if model doesn't support seg)
    seg_masks = result.masks  # shape: (N, H, W) resized to original image

    for i, box in enumerate(boxes):
        cls_id = int(box.cls[0].item())
        conf = float(box.conf[0].item())
        class_name = class_names.get(cls_id, f"class_{cls_id}")

        if class_name not in target_classes:
            continue
        if conf < conf_threshold:
            continue

        # Bounding box in xyxy format (supports both real tensor and plain list)
        xyxy = box.xyxy[0]
        if hasattr(xyxy, 'tolist'):
            xyxy = xyxy.tolist()
        x1, y1, x2, y2 = xyxy
        bbox = [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)]

        # Try to use segmentation mask; fall back to bounding-box rectangle
        mask_path_rel = None
        if seg_masks is not None and i < len(seg_masks.data):
            seg = seg_masks.data[i].cpu().numpy()  # (H, W) float32 0-1
            seg_bin = (seg > 0.5).astype(np.uint8) * 255
            # Resize to original image size if needed
            if seg_bin.shape != (img_h, img_w):
                seg_bin = cv2.resize(seg_bin, (img_w, img_h), interpolation=cv2.INTER_NEAREST)
            dynamic_mask = cv2.bitwise_or(dynamic_mask, seg_bin)
            has_seg_mask = True
        else:
            # No segmentation — fill bounding box
            cv2.rectangle(
                dynamic_mask,
                (int(x1), int(y1)), (int(x2), int(y2)),
                255, -1
            )
            has_seg_mask = False

        detections.append({
            "class": class_name,
            "class_id": cls_id,
            "confidence": round(conf, 4),
            "bbox_xyxy": bbox,
            "has_segmentation_mask": has_seg_mask
        })

    return dynamic_mask, detections


class DynamicMaskingStage(BaseStage):
    stage_name = "dynamic_masking"
    stage_order = 4  # Runs between keyframe selection (3) and pose estimation (5)
    description = (
        "YOLOv8-seg based detection & masking of dynamic objects in keyframes. "
        "Confidence values are always exposed. Not all dynamic objects may be detected."
    )

    def execute(self, input_data: StageInput) -> StageOutput:
        # ── 1. Resolve keyframes manifest ───────────────────────────────
        kf_manifest_path = input_data.input_artifacts.get("keyframes_manifest")
        if not kf_manifest_path or not Path(kf_manifest_path).exists():
            prev_dir = input_data.previous_checkpoint_dir or input_data.checkpoint_dir
            candidate = Path(prev_dir) / "keyframes.json"
            if candidate.exists():
                kf_manifest_path = str(candidate)

        if not kf_manifest_path or not Path(kf_manifest_path).exists():
            raise StageExecutionError(
                self.stage_name,
                "Missing keyframes.json from keyframe selection stage."
            )

        with open(kf_manifest_path, "r", encoding="utf-8") as f:
            kf_data = json.load(f)

        keyframes = kf_data.get("keyframes", [])
        if not keyframes:
            raise StageExecutionError(self.stage_name, "No keyframes found in manifest.")

        # ── 2. Parameters ────────────────────────────────────────────────
        params = input_data.parameters
        model_name: str = params.get("yolo_model", "yolov8n-seg.pt")
        conf_threshold: float = float(params.get("confidence_threshold", 0.35))
        iou_threshold: float = float(params.get("iou_threshold", 0.5))
        
        # Configurable dynamic classes
        custom_classes = params.get("dynamic_classes", None)
        if custom_classes and isinstance(custom_classes, list):
            target_classes = set(custom_classes)
        else:
            target_classes = DEFAULT_DYNAMIC_CLASSES

        # ── 3. Load model ────────────────────────────────────────────────
        logger.info(f"Loading YOLO model: {model_name}")
        model = _get_yolo_model(model_name)
        class_names: Dict[int, str] = model.names  # {0: 'person', 1: 'bicycle', ...}

        # ── 4. Output directories ────────────────────────────────────────
        masks_dir = Path(input_data.checkpoint_dir) / "masks"
        masks_dir.mkdir(parents=True, exist_ok=True)
        
        viz_dir = Path(input_data.checkpoint_dir) / "detections_viz"
        viz_dir.mkdir(parents=True, exist_ok=True)

        # ── 5. Process each keyframe ─────────────────────────────────────
        all_frame_records: List[Dict[str, Any]] = []
        total_detections = 0
        frames_with_detections = 0

        for kf in keyframes:
            frame_id = kf["original_frame_id"]
            kf_id = kf["keyframe_id"]
            img_path = kf["filepath"]

            img_bgr = cv2.imread(img_path)
            if img_bgr is None:
                logger.warning(f"Could not read keyframe: {img_path}. Skipping.")
                continue

            img_h, img_w = img_bgr.shape[:2]

            # Run YOLO segmentation inference (no_grad internally)
            results = model(
                img_bgr,
                conf=conf_threshold,
                iou=iou_threshold,
                verbose=False
            )

            # Build dynamic mask and collect detections
            dynamic_mask, detections = _build_dynamic_mask(
                img_h, img_w, results, target_classes, class_names, conf_threshold
            )

            # Static mask = inverse of dynamic mask
            static_mask = cv2.bitwise_not(dynamic_mask)

            # Save masks
            dynamic_mask_path = masks_dir / f"frame_{kf_id:04d}_dynamic.png"
            static_mask_path = masks_dir / f"frame_{kf_id:04d}_static.png"
            cv2.imwrite(str(dynamic_mask_path), dynamic_mask)
            cv2.imwrite(str(static_mask_path), static_mask)

            # Create visualization: overlay detection bboxes/masks on a copy
            viz_img = img_bgr.copy()
            # Overlay semi-transparent red on dynamic regions
            if np.any(dynamic_mask > 0):
                overlay = viz_img.copy()
                overlay[dynamic_mask > 0] = [0, 0, 200]
                viz_img = cv2.addWeighted(viz_img, 0.65, overlay, 0.35, 0)
            # Draw bboxes and labels
            for det in detections:
                x1, y1, x2, y2 = [int(v) for v in det["bbox_xyxy"]]
                label = f"{det['class']} {det['confidence']:.2f}"
                cv2.rectangle(viz_img, (x1, y1), (x2, y2), (0, 220, 100), 2)
                cv2.putText(viz_img, label, (x1, max(0, y1 - 6)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 220, 100), 1)
            
            viz_path = viz_dir / f"frame_{kf_id:04d}_detections.jpg"
            cv2.imwrite(str(viz_path), viz_img)

            n_det = len(detections)
            total_detections += n_det
            if n_det > 0:
                frames_with_detections += 1

            # Compute % of frame pixels masked as dynamic
            dynamic_pixel_pct = round(
                float(np.sum(dynamic_mask > 0)) / float(img_h * img_w) * 100.0, 2
            )

            all_frame_records.append({
                "frame_id": frame_id,
                "keyframe_id": kf_id,
                "keyframe_path": img_path,
                "timestamp_sec": kf.get("timestamp_sec", 0.0),
                "detections": detections,
                "detection_count": n_det,
                "dynamic_pixel_percent": dynamic_pixel_pct,
                "dynamic_mask_path": str(dynamic_mask_path),
                "static_mask_path": str(static_mask_path),
                "detection_viz_path": str(viz_path)
            })

            logger.info(
                f"  [{frame_id}] {n_det} dynamic objects detected "
                f"({dynamic_pixel_pct}% frame area masked)"
            )

        if not all_frame_records:
            raise StageExecutionError(self.stage_name, "No keyframes could be processed.")

        # ── 6. Write dynamic_objects.json ────────────────────────────────
        dynamic_json_path = Path(input_data.checkpoint_dir) / "dynamic_objects.json"

        out_data = {
            "total_keyframes": len(all_frame_records),
            "frames_with_dynamic_objects": frames_with_detections,
            "total_detections": total_detections,
            "model_used": model_name,
            "confidence_threshold": conf_threshold,
            "iou_threshold": iou_threshold,
            "target_classes": sorted(list(target_classes)),
            "note": (
                "Dynamic object detection is probabilistic. "
                "Confidence values are exposed for each detection. "
                "Not all dynamic objects are guaranteed to be detected."
            ),
            "frames": all_frame_records
        }

        with open(dynamic_json_path, "w", encoding="utf-8") as f:
            json.dump(out_data, f, indent=2)

        return StageOutput(
            stage_name=self.stage_name,
            status="completed",
            checkpoint_dir=input_data.checkpoint_dir,
            artifacts={
                "dynamic_objects_json": str(dynamic_json_path),
                "masks_dir": str(masks_dir),
                "detections_viz_dir": str(viz_dir)
            },
            metrics={
                "total_keyframes": len(all_frame_records),
                "frames_with_detections": frames_with_detections,
                "total_detections": total_detections,
                "model": model_name
            },
            summary=(
                f"Processed {len(all_frame_records)} keyframes. "
                f"Found {total_detections} dynamic objects across "
                f"{frames_with_detections} frames."
            )
        )
