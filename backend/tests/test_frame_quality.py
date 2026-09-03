"""
Phase 2 Tests — Frame Quality Assessment.

Tests cover:
  - Robustness to different image types (blurred, overexposed, underexposed, sharp, redundant)
  - Output schema correctness for frame_quality.json
"""
import json
import numpy as np
import cv2
import pytest
from pathlib import Path
from unittest.mock import MagicMock

from backend.app.pipeline.stages.s02_frame_quality import FrameQualityStage
from backend.app.schemas.stage import StageInput

class TestFrameQualityStage:
    def _create_test_image(self, path: Path, img_type: str):
        """Creates a synthetic image for testing."""
        h, w = 480, 640
        if img_type == "sharp":
            img = np.zeros((h, w, 3), dtype=np.uint8)
            cv2.rectangle(img, (100, 100), (300, 300), (255, 255, 255), -1)
            cv2.putText(img, "Sharp Text", (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (255,255,255), 2)
        elif img_type == "blurred":
            img = np.zeros((h, w, 3), dtype=np.uint8)
            cv2.rectangle(img, (100, 100), (300, 300), (255, 255, 255), -1)
            img = cv2.GaussianBlur(img, (51, 51), 0)
        elif img_type == "overexposed":
            img = np.full((h, w, 3), 250, dtype=np.uint8)
        elif img_type == "underexposed":
            img = np.full((h, w, 3), 10, dtype=np.uint8)
        else:
            img = np.zeros((h, w, 3), dtype=np.uint8)
            
        cv2.imwrite(str(path), img)

    def test_frame_quality_metrics(self, tmp_path):
        stage = FrameQualityStage()
        
        frames_dir = tmp_path / "frames"
        frames_dir.mkdir()
        
        self._create_test_image(frames_dir / "sharp.jpg", "sharp")
        self._create_test_image(frames_dir / "blurred.jpg", "blurred")
        self._create_test_image(frames_dir / "over.jpg", "overexposed")
        self._create_test_image(frames_dir / "under.jpg", "underexposed")
        self._create_test_image(frames_dir / "sharp2.jpg", "sharp") # Redundant with sharp
        
        manifest_data = {
            "frames": [
                {"frame_id": "f1", "file": "sharp.jpg", "timestamp_sec": 0.0},
                {"frame_id": "f2", "file": "blurred.jpg", "timestamp_sec": 1.0},
                {"frame_id": "f3", "file": "over.jpg", "timestamp_sec": 2.0},
                {"frame_id": "f4", "file": "under.jpg", "timestamp_sec": 3.0},
                {"frame_id": "f5", "file": "sharp2.jpg", "timestamp_sec": 4.0},
            ]
        }
        
        manifest_path = frames_dir / "metadata.json"
        with open(manifest_path, "w") as f:
            json.dump(manifest_data, f)
            
        input_data = StageInput(
            mission_id="test_mission",
            job_id="test_job",
            stage_name="frame_quality",
            checkpoint_dir=str(tmp_path),
            previous_checkpoint_dir=str(tmp_path),
            input_artifacts={"metadata_json": str(manifest_path)},
            parameters={}
        )
        
        output = stage.execute(input_data)
        
        assert output.status == "completed"
        quality_json = Path(output.artifacts["quality_json"])
        assert quality_json.exists()
        
        with open(quality_json, "r") as f:
            data = json.load(f)
            
        frames = data["frames"]
        assert len(frames) == 5
        
        # Check Sharp
        assert frames[0]["frame_id"] == "f1"
        assert frames[0]["sharpness"] > 0.5
        
        # Check Blurred
        assert frames[1]["frame_id"] == "f2"
        assert frames[1]["sharpness"] < 0.2
        assert frames[1]["classification"] == "LOW"
        
        # Check Redundant (f5)
        # f4 to f5 is a huge change (under to sharp), so it's NOT redundant
        assert frames[4]["redundancy"] > 0.5
