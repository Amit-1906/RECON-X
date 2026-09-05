# Test Videos Directory

Place your drone flight videos in this directory to use them for coding, pipeline experimentation, and debugging.

## Supported Formats
- `.mp4`, `.mov`, `.avi`, `.mkv`, `.webm`, `.ts`, `.mts`

## Default Video Location
Place your video here as:
`test_videos/input_video.mp4` (or any `.mp4`/`.mov` file name)

## How to Run & Code Against Your Video

### 1. Run Complete Reconstruction Pipeline on Your Video:
```bash
python scripts/process_custom_video.py --video test_videos/input_video.mp4
```
Or simply run without arguments to auto-detect the video in this folder:
```bash
python scripts/process_custom_video.py
```

### 2. Run in Your Python Code / Interactive Shell:
```python
from pathlib import Path
from backend.app.pipeline.runner import PipelineRunner

video_path = Path("test_videos/input_video.mp4")

runner = PipelineRunner(
    job_id="dev_test_01",
    mission_id="dev_mission",
    video_path=str(video_path),
    flight_altitude_m=45.0,
    target_gsd_cm=1.5,
    preferred_device="auto"  # or "cuda", "cpu"
)

results = runner.run()
print("Artifacts generated:", results.keys())
```
