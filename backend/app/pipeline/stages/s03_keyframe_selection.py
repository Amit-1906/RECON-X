"""
Stage 3: Intelligent Keyframe Selection
Prunes redundant or low-quality frames based on Phase 2 output.
Guarantees stereo parallax via sparse optical flow while minimizing compute redundancy.
Outputs a keyframes.json manifest.
"""
import json
import logging
from pathlib import Path
import shutil
from typing import List, Dict, Any
import cv2
import numpy as np

from backend.app.pipeline.base import BaseStage, StageExecutionError
from backend.app.schemas.stage import StageInput, StageOutput

logger = logging.getLogger("uav_reconstruction.stage.keyframes")


class KeyframeSelectionStage(BaseStage):
    stage_name = "keyframe_selection"
    stage_order = 3
    description = "Intelligently selects keyframes using quality filtering, optical flow parallax, and structural redundancy checks."

    def execute(self, input_data: StageInput) -> StageOutput:
        quality_json_path = input_data.input_artifacts.get("quality_json")
        if not quality_json_path or not Path(quality_json_path).exists():
            prev_dir = input_data.previous_checkpoint_dir or input_data.checkpoint_dir
            candidate = Path(prev_dir) / "frame_quality.json"
            if candidate.exists():
                quality_json_path = str(candidate)

        if not quality_json_path or not Path(quality_json_path).exists():
            raise StageExecutionError(self.stage_name, "Missing frame_quality.json from quality stage.")

        with open(quality_json_path, "r", encoding="utf-8") as f:
            quality_data = json.load(f)

        records = quality_data.get("frames", [])
        if not records:
            raise StageExecutionError(self.stage_name, "No quality records available for keyframe selection.")

        params = input_data.parameters
        min_disp = float(params.get("min_translation_pixels", 20.0))
        max_drops = int(params.get("max_consecutive_drops", 10))

        keyframes_dir = Path(input_data.checkpoint_dir) / "keyframes"
        keyframes_dir.mkdir(parents=True, exist_ok=True)

        selected_keyframes: List[Dict[str, Any]] = []
        
        prev_img = None
        prev_kps = None
        consecutive_drops = 0
        total_disp_accum = 0.0

        orb = cv2.ORB_create(nfeatures=500)

        for idx, rec in enumerate(records):
            should_select = False
            selection_reason = ""
            similarity_to_previous = 0.0
            
            # 1. Quality Filter: Reject LOW quality frames
            if rec.get("classification") == "LOW":
                # We do not select LOW frames, unless we are desperate (max drops reached)
                if consecutive_drops >= max_drops:
                    should_select = True
                    selection_reason = "MAX_DROPS_REACHED (Low Quality Fallback)"
                else:
                    consecutive_drops += 1
                    continue

            img_path = rec["filepath"]
            img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
            if img is None:
                continue

            if prev_img is None and not should_select:
                should_select = True
                selection_reason = "FIRST_FRAME"
            elif not should_select:
                # 2. Redundancy & Parallax Check via Optical Flow
                # We calculate optical flow of ORB features from prev_img to img
                if prev_kps is not None and len(prev_kps) > 10:
                    p0 = np.array([kp.pt for kp in prev_kps], dtype=np.float32).reshape(-1, 1, 2)
                    p1, st, err = cv2.calcOpticalFlowPyrLK(prev_img, img, p0, None)
                    
                    if p1 is not None and st is not None:
                        good_new = p1[st == 1]
                        good_old = p0[st == 1]
                        
                        if len(good_new) > 10:
                            # Calculate median displacement
                            displacements = np.linalg.norm(good_new - good_old, axis=1)
                            median_disp = float(np.median(displacements))
                            total_disp_accum += median_disp
                            
                            # Calculate Similarity (inverse of displacement relative to threshold)
                            # similarity_to_previous: 1.0 means identical, 0.0 means completely moved
                            similarity_to_previous = max(0.0, 1.0 - (median_disp / (min_disp * 2)))

                            if median_disp >= min_disp:
                                should_select = True
                                selection_reason = "SUFFICIENT_PARALLAX"
                            elif rec.get("redundancy", 1.0) < 0.2: 
                                # Use Phase 2 redundancy metric as a fallback structural check
                                should_select = True
                                selection_reason = "STRUCTURAL_CHANGE"
                        else:
                            should_select = True
                            selection_reason = "LOST_TRACKING (Significant change)"
                    else:
                        should_select = True
                        selection_reason = "LOST_TRACKING"
                else:
                    should_select = True
                    selection_reason = "INSUFFICIENT_PREVIOUS_FEATURES"
                    
                if not should_select and consecutive_drops >= max_drops:
                    should_select = True
                    selection_reason = "MAX_DROPS_REACHED"
            
            if should_select:
                kf_idx = len(selected_keyframes)
                dest_filename = f"keyframe_{kf_idx:04d}.jpg"
                dest_path = keyframes_dir / dest_filename
                shutil.copy2(img_path, str(dest_path))

                selected_keyframes.append({
                    "keyframe_id": kf_idx,
                    "original_frame_id": rec["frame_id"],
                    "filename": dest_filename,
                    "filepath": str(dest_path),
                    "timestamp_sec": rec.get("timestamp_sec", 0.0),
                    "quality_score": rec.get("overall_quality", 0),
                    "feature_score": rec.get("feature_score", 0.0),
                    "similarity_to_previous": round(similarity_to_previous, 4),
                    "selection_reason": selection_reason
                })
                
                prev_img = img
                prev_kps = orb.detect(img, None)
                consecutive_drops = 0
            else:
                consecutive_drops += 1

        if len(selected_keyframes) < 2 and len(records) >= 2:
            # Select the final frame as fallback to guarantee stereoscopic baseline
            rec = records[-1]
            img_path = rec["filepath"]
            kf_idx = len(selected_keyframes)
            dest_filename = f"keyframe_{kf_idx:04d}.jpg"
            dest_path = keyframes_dir / dest_filename
            shutil.copy2(img_path, str(dest_path))
            selected_keyframes.append({
                "keyframe_id": kf_idx,
                "original_frame_id": rec["frame_id"],
                "filename": dest_filename,
                "filepath": str(dest_path),
                "timestamp_sec": rec.get("timestamp_sec", 0.0),
                "quality_score": rec.get("overall_quality", 0),
                "feature_score": rec.get("feature_score", 0.0),
                "similarity_to_previous": 0.0,
                "selection_reason": "MINIMUM_KEYFRAME_FALLBACK"
            })

        if len(selected_keyframes) < 2:
            raise StageExecutionError(
                self.stage_name,
                "Insufficient keyframes (< 2) selected for stereoscopic 3D reconstruction."
            )

        manifest_path = Path(input_data.checkpoint_dir) / "keyframes.json"
        
        reduction = round((1.0 - (len(selected_keyframes) / max(1, len(records)))) * 100.0, 1)

        out_data = {
            "total_input_frames": len(records),
            "keyframes_count": len(selected_keyframes),
            "reduction_percent": reduction,
            "keyframes": selected_keyframes
        }

        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(out_data, f, indent=2)

        return StageOutput(
            stage_name=self.stage_name,
            status="completed",
            checkpoint_dir=input_data.checkpoint_dir,
            artifacts={
                "keyframes_dir": str(keyframes_dir),
                "keyframes_manifest": str(manifest_path)
            },
            metrics={
                "input_frames": len(records),
                "keyframes_selected": len(selected_keyframes),
                "reduction_percent": reduction,
                "mean_displacement_px": round(total_disp_accum / max(1, len(selected_keyframes)), 2)
            },
            summary=f"Selected {len(selected_keyframes)} optimal keyframes ({reduction}% reduction)."
        )
