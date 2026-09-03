"""
Phase 3 Tests — Keyframe Selection.

Tests cover:
  - Quality filtering (skipping LOW quality frames)
  - Parallax selection via ORB flow
  - Output schema correctness for keyframes.json
"""
import json
import numpy as np
import cv2
import pytest
from pathlib import Path

from backend.app.pipeline.stages.s03_keyframe_selection import KeyframeSelectionStage
from backend.app.schemas.stage import StageInput

class TestKeyframeSelectionStage:
    def _create_test_image(self, path: Path, offset_x: int = 0):
        """Creates a synthetic image with ORB features. Offset_x simulates camera motion."""
        h, w = 480, 640
        img = np.zeros((h, w, 3), dtype=np.uint8)
        
        # Add textured rectangles (good for ORB)
        cv2.rectangle(img, (100 + offset_x, 100), (300 + offset_x, 300), (255, 255, 255), -1)
        # Add some noise to give texture for ORB inside the square
        noise = np.random.randint(0, 255, (200, 200, 3), dtype=np.uint8)
        img[100:300, 100+offset_x:300+offset_x] = noise
        
        cv2.imwrite(str(path), img)

    def test_keyframe_selection(self, tmp_path):
        stage = KeyframeSelectionStage()
        
        frames_dir = tmp_path / "frames"
        frames_dir.mkdir()
        
        # f1: Base image
        self._create_test_image(frames_dir / "f1.jpg", offset_x=0)
        # f2: LOW quality (should be skipped)
        self._create_test_image(frames_dir / "f2.jpg", offset_x=0)
        # f3: Small motion (should be skipped because motion < 20)
        self._create_test_image(frames_dir / "f3.jpg", offset_x=5)
        # f4: Large motion (should be selected, motion = 40)
        self._create_test_image(frames_dir / "f4.jpg", offset_x=40)
        
        quality_data = {
            "frames": [
                {"frame_id": "f1", "filepath": str(frames_dir / "f1.jpg"), "timestamp_sec": 0.0, "classification": "HIGH", "overall_quality": 95},
                {"frame_id": "f2", "filepath": str(frames_dir / "f2.jpg"), "timestamp_sec": 1.0, "classification": "LOW", "overall_quality": 30},
                {"frame_id": "f3", "filepath": str(frames_dir / "f3.jpg"), "timestamp_sec": 2.0, "classification": "HIGH", "overall_quality": 85},
                {"frame_id": "f4", "filepath": str(frames_dir / "f4.jpg"), "timestamp_sec": 3.0, "classification": "HIGH", "overall_quality": 90},
            ]
        }
        
        quality_path = frames_dir / "frame_quality.json"
        with open(quality_path, "w") as f:
            json.dump(quality_data, f)
            
        input_data = StageInput(
            mission_id="test_mission",
            job_id="test_job",
            stage_name="keyframe_selection",
            checkpoint_dir=str(tmp_path),
            previous_checkpoint_dir=str(tmp_path),
            input_artifacts={"quality_json": str(quality_path)},
            parameters={"min_translation_pixels": 20.0, "max_consecutive_drops": 10}
        )
        
        output = stage.execute(input_data)
        
        assert output.status == "completed"
        kf_json = Path(output.artifacts["keyframes_manifest"])
        assert kf_json.exists()
        
        with open(kf_json, "r") as f:
            data = json.load(f)
            
        keyframes = data["keyframes"]
        
        # We expect f1 (first frame) and f4 (large motion). f2 dropped (LOW), f3 dropped (small motion)
        assert len(keyframes) == 2
        assert keyframes[0]["original_frame_id"] == "f1"
        assert keyframes[0]["selection_reason"] == "FIRST_FRAME"
        
        assert keyframes[1]["original_frame_id"] == "f4"
        assert keyframes[1]["selection_reason"] == "SUFFICIENT_PARALLAX"
