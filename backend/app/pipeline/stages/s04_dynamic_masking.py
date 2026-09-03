"""
Stage 4: Dynamic Object Detection and Masking.
Goal: Prevent moving objects from corrupting photogrammetric reconstruction.

Pipeline Step:
Frame -> Object Detection -> Segmentation -> Dynamic Mask -> Static Scene Reconstruction Input

Outputs for each keyframe:
1. detected objects (with frame ID, object class, confidence, bounding box, mask path)
2. segmentation masks (per-object binary masks)
3. dynamic mask (frame-level combined dynamic mask: 255=dynamic, 0=static)
4. static-scene image/mask (static mask: 255=static, 0=dynamic; static scene reconstruction input image)

Artifacts:
- dynamic_objects.json  (manifest with detection metadata, confidence values, dynamic object layer analytics)
- masks/frame_*_obj_*_{class}.png (individual segmentation masks)
- masks/frame_*_dynamic.png       (combined dynamic masks)
- masks/frame_*_static.png        (inverse static masks)
- static_scene/frame_*_static.png (static scene reconstruction input image)
- detections_viz/frame_*_detections.jpg (visualization)

DOES NOT permanently modify original keyframe images.
Confidence values are always exposed; dynamic object detection is probabilistic.
"""
import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple, Set
import cv2
import numpy as np

from backend.app.pipeline.base import BaseStage, StageExecutionError
from backend.app.schemas.stage import StageInput, StageOutput

logger = logging.getLogger("uav_reconstruction.stage.dynamic_masking")

# ── Dynamic Object Classes Categorization (COCO mapping) ─────────────
DYNAMIC_CLASS_CATEGORIES: Dict[str, Set[str]] = {
    "person": {"person"},
    "car": {"car"},
    "motorcycle": {"motorcycle"},
    "bicycle": {"bicycle"},
    "animal": {
        "dog", "cat", "bird", "horse", "sheep", "cow",
        "elephant", "bear", "zebra", "giraffe"
    },
    "other": {
        "bus", "truck", "boat", "airplane", "train",
        "skateboard", "surfboard"
    }
}

# Default dynamic classes to monitor
DEFAULT_DYNAMIC_CLASSES: Set[str] = set().union(*DYNAMIC_CLASS_CATEGORIES.values())


def resolve_target_classes(config_classes: Optional[List[str]]) -> Set[str]:
    """
    Resolves user-specified dynamic classes, expanding group aliases like 'animal' or 'other'
    into specific COCO segmentation classes.
    """
    if not config_classes:
        return set(DEFAULT_DYNAMIC_CLASSES)

    target_classes: Set[str] = set()
    for item in config_classes:
        norm = str(item).strip().lower()
        if norm in DYNAMIC_CLASS_CATEGORIES:
            target_classes.update(DYNAMIC_CLASS_CATEGORIES[norm])
        else:
            target_classes.add(norm)
    return target_classes


def _get_yolo_model(model_name: str = "yolov8n-seg.pt"):
    """
    Lazily loads the YOLO segmentation model.
    Falls back gracefully with descriptive error if ultralytics is not installed.
    """
    try:
        from ultralytics import YOLO
        model = YOLO(model_name)
        return model
    except ImportError:
        raise StageExecutionError(
            "dynamic_masking",
            "ultralytics package is required for YOLO segmentation. "
            "Install it via: pip install ultralytics"
        )
    except Exception as exc:
        raise StageExecutionError(
            "dynamic_masking",
            f"Failed to load YOLO model '{model_name}': {exc}"
        )


def _process_yolo_detections_and_masks(
    img_h: int,
    img_w: int,
    results,
    target_classes: Set[str],
    class_names: Dict[int, str],
    conf_threshold: float,
    frame_id: str,
    masks_dir: Path
) -> Tuple[np.ndarray, List[Dict[str, Any]]]:
    """
    Extracts detected objects, individual segmentation masks, and builds the combined dynamic mask.

    Returns:
        dynamic_mask: uint8 array (img_h, img_w), 255 = dynamic, 0 = static
        detections: list of detection dictionaries with frame ID, class, confidence, bbox, mask path
    """
    dynamic_mask = np.zeros((img_h, img_w), dtype=np.uint8)
    detections: List[Dict[str, Any]] = []

    if results is None or len(results) == 0:
        return dynamic_mask, detections

    result = results[0]
    boxes = getattr(result, "boxes", None)
    if boxes is None or len(boxes) == 0:
        return dynamic_mask, detections

    seg_masks = getattr(result, "masks", None)

    for i, box in enumerate(boxes):
        cls_id = int(box.cls[0].item())
        conf = float(box.conf[0].item())
        class_name = class_names.get(cls_id, f"class_{cls_id}").lower()

        if class_name not in target_classes:
            continue
        if conf < conf_threshold:
            continue

        # Bounding box in xyxy format
        xyxy = box.xyxy[0]
        if hasattr(xyxy, "tolist"):
            xyxy = xyxy.tolist()
        x1, y1, x2, y2 = [float(v) for v in xyxy]
        # Clamp within image bounds
        x1 = max(0.0, min(float(img_w), x1))
        y1 = max(0.0, min(float(img_h), y1))
        x2 = max(0.0, min(float(img_w), x2))
        y2 = max(0.0, min(float(img_h), y2))
        bbox = [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)]

        # Individual object segmentation mask
        obj_mask = np.zeros((img_h, img_w), dtype=np.uint8)
        has_seg_mask = False

        if seg_masks is not None and i < len(seg_masks.data):
            try:
                raw_seg = seg_masks.data[i].cpu().numpy()
                seg_bin = (raw_seg > 0.5).astype(np.uint8) * 255
                if seg_bin.shape != (img_h, img_w):
                    seg_bin = cv2.resize(seg_bin, (img_w, img_h), interpolation=cv2.INTER_NEAREST)
                obj_mask = seg_bin
                has_seg_mask = True
            except Exception as e:
                logger.warning(f"Error parsing segmentation mask for object {i}: {e}. Falling back to bbox.")
                has_seg_mask = False

        if not has_seg_mask:
            # Fallback: fill bounding box rectangle
            cv2.rectangle(
                obj_mask,
                (int(x1), int(y1)),
                (int(x2), int(y2)),
                255,
                thickness=-1
            )

        # Merge into frame dynamic mask
        dynamic_mask = cv2.bitwise_or(dynamic_mask, obj_mask)

        # Save individual segmentation mask if masks_dir is provided
        obj_mask_path = ""
        if masks_dir is not None:
            try:
                masks_dir.mkdir(parents=True, exist_ok=True)
                obj_mask_filename = f"{frame_id}_obj_{i:02d}_{class_name}.png"
                full_obj_path = masks_dir / obj_mask_filename
                cv2.imwrite(str(full_obj_path), obj_mask)
                obj_mask_path = str(full_obj_path)
            except Exception as e:
                logger.warning(f"Could not save individual mask: {e}")

        det_record = {
            "frame_id": frame_id,
            "object_class": class_name,
            "class": class_name,
            "class_id": cls_id,
            "confidence": round(conf, 4),
            "bounding_box": bbox,
            "bbox_xyxy": bbox,
            "mask_path": obj_mask_path,
            "has_segmentation_mask": has_seg_mask
        }
        detections.append(det_record)

    return dynamic_mask, detections


def _build_dynamic_mask(
    img_h: int,
    img_w: int,
    results,
    target_classes: Set[str],
    class_names: Dict[int, str],
    conf_threshold: float = 0.35,
    frame_id: str = "test_frame",
    masks_dir: Optional[Path] = None
) -> Tuple[np.ndarray, List[Dict[str, Any]]]:
    """
    Given YOLO segmentation results, build a binary dynamic mask and collect detection records.
    Maintains compatibility with helper unit tests.
    """
    return _process_yolo_detections_and_masks(
        img_h=img_h,
        img_w=img_w,
        results=results,
        target_classes=target_classes,
        class_names=class_names,
        conf_threshold=conf_threshold,
        frame_id=frame_id,
        masks_dir=masks_dir
    )


class DynamicMaskingStage(BaseStage):
    stage_name = "dynamic_masking"
    stage_order = 4
    description = (
        "YOLOv8-seg dynamic object detection and masking to prevent moving objects "
        "(people, vehicles, animals) from corrupting photogrammetric 3D reconstruction."
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
            raise StageExecutionError(self.stage_name, "No keyframes found in manifest to mask.")

        # ── 2. Configure Parameters & Dynamic Classes ────────────────────
        params = input_data.parameters
        model_name: str = params.get("yolo_model", "yolov8n-seg.pt")
        conf_threshold: float = float(params.get("confidence_threshold", 0.35))
        iou_threshold: float = float(params.get("iou_threshold", 0.5))

        target_classes = resolve_target_classes(params.get("dynamic_classes"))

        # ── 3. Load YOLO Model ───────────────────────────────────────────
        logger.info(f"Loading YOLO segmentation model: {model_name}")
        model = _get_yolo_model(model_name)
        class_names: Dict[int, str] = getattr(model, "names", {})

        # ── 4. Output Directories ────────────────────────────────────────
        ckpt_dir = Path(input_data.checkpoint_dir)
        masks_dir = ckpt_dir / "masks"
        masks_dir.mkdir(parents=True, exist_ok=True)

        static_scene_dir = ckpt_dir / "static_scene"
        static_scene_dir.mkdir(parents=True, exist_ok=True)

        viz_dir = ckpt_dir / "detections_viz"
        viz_dir.mkdir(parents=True, exist_ok=True)

        # ── 5. Process Keyframes ─────────────────────────────────────────
        all_frame_records: List[Dict[str, Any]] = []
        flat_dynamic_objects: List[Dict[str, Any]] = []
        total_detections = 0
        frames_with_detections = 0
        class_counts: Dict[str, int] = {}
        all_confidences: List[float] = []
        area_percentages: List[float] = []
        timeline_records: List[Dict[str, Any]] = []

        for kf in keyframes:
            frame_id = str(kf.get("original_frame_id", f"frame_{kf.get('keyframe_id', 0):04d}"))
            kf_id = int(kf.get("keyframe_id", 0))
            img_path = kf["filepath"]

            # Original keyframe is read without modifying it
            img_bgr = cv2.imread(img_path)
            if img_bgr is None:
                logger.warning(f"Could not read keyframe image: {img_path}. Skipping.")
                continue

            img_h, img_w = img_bgr.shape[:2]

            # YOLO segmentation inference
            results = model(
                img_bgr,
                conf=conf_threshold,
                iou=iou_threshold,
                verbose=False
            )

            # Output 1 & 2: Detected objects and per-object segmentation masks
            # Output 3: Combined dynamic mask
            dynamic_mask, detections = _process_yolo_detections_and_masks(
                img_h=img_h,
                img_w=img_w,
                results=results,
                target_classes=target_classes,
                class_names=class_names,
                conf_threshold=conf_threshold,
                frame_id=frame_id,
                masks_dir=masks_dir
            )

            # Output 4: Static-scene image and mask
            # Static mask: inverse of dynamic mask (255 = static pixel, 0 = dynamic pixel)
            static_mask = cv2.bitwise_not(dynamic_mask)

            dynamic_mask_path = masks_dir / f"frame_{kf_id:04d}_dynamic.png"
            static_mask_path = masks_dir / f"frame_{kf_id:04d}_static.png"
            cv2.imwrite(str(dynamic_mask_path), dynamic_mask)
            cv2.imwrite(str(static_mask_path), static_mask)

            # Static Scene Reconstruction Input image:
            # Dynamic regions masked out to black/neutral so downstream SfM/photogrammetry
            # algorithms only detect features on pristine static background structures.
            static_scene_img = img_bgr.copy()
            static_scene_img[dynamic_mask > 0] = [0, 0, 0]
            static_scene_path = static_scene_dir / f"frame_{kf_id:04d}_static_scene.png"
            cv2.imwrite(str(static_scene_path), static_scene_img)

            # Detection Visualization Overlay
            viz_img = img_bgr.copy()
            if np.any(dynamic_mask > 0):
                overlay = viz_img.copy()
                overlay[dynamic_mask > 0] = [0, 0, 220]  # Highlight dynamic mask regions in red
                viz_img = cv2.addWeighted(viz_img, 0.68, overlay, 0.32, 0)

            for det in detections:
                x1, y1, x2, y2 = [int(v) for v in det["bounding_box"]]
                label = f"{det['object_class']} {det['confidence']:.2f}"
                cv2.rectangle(viz_img, (x1, y1), (x2, y2), (0, 230, 115), 2)
                cv2.putText(
                    viz_img,
                    label,
                    (x1, max(14, y1 - 6)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    (0, 230, 115),
                    1,
                    cv2.LINE_AA
                )

            viz_path = viz_dir / f"frame_{kf_id:04d}_detections.jpg"
            cv2.imwrite(str(viz_path), viz_img)

            # Metrics
            n_det = len(detections)
            total_detections += n_det
            if n_det > 0:
                frames_with_detections += 1

            dynamic_pixels = int(np.sum(dynamic_mask > 0))
            dynamic_pixel_pct = round(float(dynamic_pixels) / float(img_h * img_w) * 100.0, 2)
            area_percentages.append(dynamic_pixel_pct)

            for det in detections:
                flat_dynamic_objects.append({
                    "frame_id": frame_id,
                    "object_class": det["object_class"],
                    "confidence": det["confidence"],
                    "bounding_box": det["bounding_box"],
                    "mask_path": det["mask_path"]
                })
                cls_name = det["object_class"]
                class_counts[cls_name] = class_counts.get(cls_name, 0) + 1
                all_confidences.append(det["confidence"])

            frame_entry = {
                "frame_id": frame_id,
                "keyframe_id": kf_id,
                "keyframe_path": img_path,
                "timestamp_sec": float(kf.get("timestamp_sec", 0.0)),
                "detections": detections,
                "detection_count": n_det,
                "dynamic_pixel_percent": dynamic_pixel_pct,
                "dynamic_mask_path": str(dynamic_mask_path),
                "static_mask_path": str(static_mask_path),
                "static_scene_path": str(static_scene_path),
                "detection_viz_path": str(viz_path)
            }
            all_frame_records.append(frame_entry)

            timeline_records.append({
                "frame_id": frame_id,
                "keyframe_id": kf_id,
                "timestamp_sec": float(kf.get("timestamp_sec", 0.0)),
                "detection_count": n_det,
                "dynamic_pixel_percent": dynamic_pixel_pct,
                "classes": [d["object_class"] for d in detections]
            })

            logger.info(
                f"  Keyframe [{frame_id}]: {n_det} dynamic objects detected "
                f"({dynamic_pixel_pct}% area masked)"
            )

        if not all_frame_records:
            raise StageExecutionError(self.stage_name, "No keyframes could be processed.")

        # ── 6. Dynamic Object Layer & Analytics ──────────────────────────
        avg_conf = round(float(np.mean(all_confidences)), 3) if all_confidences else 0.0
        avg_area = round(float(np.mean(area_percentages)), 2) if area_percentages else 0.0
        max_area = round(float(np.max(area_percentages)), 2) if area_percentages else 0.0

        if max_area > 20.0:
            risk_level = "Elevated Dynamic Occlusion (Mitigated with Static Reconstruction Masks)"
        elif max_area > 5.0:
            risk_level = "Moderate Dynamic Objects (Mitigated with Static Reconstruction Masks)"
        else:
            risk_level = "Low Dynamic Occlusion (Optimal for Reconstruction)"

        analytics_layer = {
            "total_detections": total_detections,
            "frames_with_dynamic_objects": frames_with_detections,
            "class_distribution": class_counts,
            "average_confidence": avg_conf,
            "average_dynamic_area_percent": avg_area,
            "max_dynamic_area_percent": max_area,
            "photogrammetry_corruption_risk": risk_level,
            "timeline": timeline_records
        }

        # ── 7. Write dynamic_objects.json ────────────────────────────────
        dynamic_json_path = ckpt_dir / "dynamic_objects.json"
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
            "dynamic_objects": flat_dynamic_objects,
            "analytics_layer": analytics_layer,
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
                "static_scene_dir": str(static_scene_dir),
                "detections_viz_dir": str(viz_dir)
            },
            metrics={
                "total_keyframes": len(all_frame_records),
                "frames_with_detections": frames_with_detections,
                "total_detections": total_detections,
                "model": model_name,
                "average_confidence": avg_conf,
                "max_dynamic_area_pct": max_area
            },
            summary=(
                f"Processed {len(all_frame_records)} keyframes. "
                f"Isolated {total_detections} dynamic objects across "
                f"{frames_with_detections} frames, generating static scene masks and images."
            )
        )


def standalone_test():
    """
    Independently testable routine for Phase 4 Dynamic Object Detection and Masking.
    Creates synthetic test keyframes with simulated moving objects (cars, pedestrians),
    runs the DynamicMaskingStage, and validates outputs.
    """
    import tempfile
    import shutil

    test_dir = Path(tempfile.mkdtemp(prefix="phase4_test_"))
    try:
        kf_dir = test_dir / "keyframes"
        kf_dir.mkdir(parents=True)
        ckpt_dir = test_dir / "checkpoint"
        ckpt_dir.mkdir(parents=True)

        keyframes = []
        for i in range(3):
            fp = kf_dir / f"keyframe_{i:04d}.png"
            # Background scene
            img = np.full((480, 640, 3), 160, dtype=np.uint8)
            cv2.putText(img, f"Static Background Scene {i}", (50, 80),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.0, (40, 40, 40), 2)

            if i > 0:
                # Add simulated dynamic object (e.g. car/vehicle)
                cv2.rectangle(img, (120 * i, 200), (120 * i + 180, 340), (20, 30, 200), -1)
                cv2.putText(img, "MOVING VEHICLE", (120 * i + 10, 270),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

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
            mission_id="standalone_test_mission",
            job_id="standalone_test_job",
            stage_name="dynamic_masking",
            checkpoint_dir=str(ckpt_dir),
            previous_checkpoint_dir=str(kf_dir),
            input_artifacts={"keyframes_manifest": str(manifest_path)},
            parameters={"confidence_threshold": 0.25}
        )

        stage = DynamicMaskingStage()
        print("[Standalone Test] Executing DynamicMaskingStage...")
        output = stage.execute(stage_input)

        assert output.status == "completed"
        dyn_json = Path(output.artifacts["dynamic_objects_json"])
        assert dyn_json.exists(), "dynamic_objects.json must exist"

        with open(dyn_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        assert "dynamic_objects" in data
        assert "analytics_layer" in data
        assert "frames" in data
        assert len(data["frames"]) == 3

        masks_dir = Path(output.artifacts["masks_dir"])
        static_scene_dir = Path(output.artifacts["static_scene_dir"])
        assert masks_dir.exists()
        assert static_scene_dir.exists()

        for kf in keyframes:
            kid = kf["keyframe_id"]
            assert (masks_dir / f"frame_{kid:04d}_dynamic.png").exists()
            assert (masks_dir / f"frame_{kid:04d}_static.png").exists()
            assert (static_scene_dir / f"frame_{kid:04d}_static_scene.png").exists()

        print("[Standalone Test] Success! All dynamic masks, static scene inputs, and dynamic_objects.json generated.")
        print(f"Summary: {output.summary}")
    finally:
        shutil.rmtree(test_dir, ignore_errors=True)


if __name__ == "__main__":
    standalone_test()
