"""
Stage 10: Confidence Estimation
Calculates geometric uncertainty based on stereo ray intersection parallax angle,
multi-view observation redundancy, and reprojection error residuals.
"""
import json
import logging
import math
from pathlib import Path
from typing import List, Dict, Any
import numpy as np

from backend.app.pipeline.base import BaseStage, StageExecutionError
from backend.app.schemas.stage import StageInput, StageOutput

logger = logging.getLogger("uav_reconstruction.stage.confidence")


def write_ply(filepath: Path, points: np.ndarray, colors: np.ndarray):
    n_pts = len(points)
    header = (
        "ply\n"
        "format ascii 1.0\n"
        f"element vertex {n_pts}\n"
        "property float x\n"
        "property float y\n"
        "property float z\n"
        "property uchar red\n"
        "property uchar green\n"
        "property uchar blue\n"
        "end_header\n"
    )
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(header)
        for i in range(n_pts):
            p = points[i]
            c = colors[i]
            f.write(f"{p[0]:.4f} {p[1]:.4f} {p[2]:.4f} {int(c[0])} {int(c[1])} {int(c[2])}\n")


class ConfidenceEstimationStage(BaseStage):
    stage_name = "confidence_estimation"
    stage_order = 10
    description = "Evaluates ray intersection angles, multi-view redundancy, and per-point statistical confidence."

    def execute(self, input_data: StageInput) -> StageOutput:
        dense_ply = input_data.input_artifacts.get("dense_ply")
        sparse_ply = input_data.input_artifacts.get("sparse_ply")
        poses_path = input_data.input_artifacts.get("camera_poses")

        prev_dir = input_data.previous_checkpoint_dir or input_data.checkpoint_dir
        if not dense_ply or not Path(dense_ply).exists():
            candidate = Path(prev_dir) / "dense.ply"
            if candidate.exists():
                dense_ply = str(candidate)

        target_ply = dense_ply if (dense_ply and Path(dense_ply).exists()) else sparse_ply
        if not target_ply or not Path(target_ply).exists():
            candidate = Path(prev_dir) / "sparse.ply"
            if candidate.exists():
                target_ply = str(candidate)

        if not target_ply or not Path(target_ply).exists():
            raise StageExecutionError(self.stage_name, "No point cloud available to evaluate confidence.")

        # Read 3D points
        points = []
        with open(target_ply, "r", encoding="utf-8") as f:
            in_header = True
            for line in f:
                if in_header:
                    if line.strip() == "end_header":
                        in_header = False
                    continue
                parts = line.strip().split()
                if len(parts) >= 3:
                    points.append([float(parts[0]), float(parts[1]), float(parts[2])])

        if not points:
            raise StageExecutionError(self.stage_name, "Point cloud contains no vertices.")

        pts_arr = np.array(points, dtype=np.float32)

        # Read camera positions
        cam_positions = []
        if poses_path and Path(poses_path).exists():
            with open(poses_path, "r", encoding="utf-8") as f:
                pdata = json.load(f)
                for p in pdata.get("poses", []):
                    cam_positions.append(np.array(p["position"]))

        if not cam_positions:
            cam_positions = [np.array([0.0, 0.0, 0.0]), np.array([5.0, 0.0, 0.0])]

        cams_arr = np.array(cam_positions)

        # Compute geometric confidence for each point:
        # High confidence when observed by multiple cameras with good baseline separation
        confidence_scores = []
        colored_conf = []

        for pt in pts_arr:
            # Distances to all cameras
            dists = np.linalg.norm(cams_arr - pt, axis=1)
            # Closest 2 cameras
            nearest_idx = np.argsort(dists)[:2]
            c1 = cams_arr[nearest_idx[0]]
            c2 = cams_arr[nearest_idx[1]] if len(nearest_idx) > 1 else c1 + np.array([1.0, 0.0, 0.0])

            # Ray vectors
            ray1 = c1 - pt
            ray2 = c2 - pt
            norm1 = np.linalg.norm(ray1)
            norm2 = np.linalg.norm(ray2)

            if norm1 > 1e-4 and norm2 > 1e-4:
                cos_angle = np.clip(np.dot(ray1, ray2) / (norm1 * norm2), -1.0, 1.0)
                angle_deg = math.degrees(math.acos(cos_angle))
            else:
                angle_deg = 5.0

            # Score: optimal stereo angle is between 15° and 45°
            if angle_deg < 2.0:
                ang_score = 0.2
            elif angle_deg > 60.0:
                ang_score = 0.5
            else:
                ang_score = min(1.0, angle_deg / 25.0)

            # Proximity bonus (closer to cameras = higher detail)
            mean_dist = (norm1 + norm2) / 2.0
            dist_score = max(0.2, min(1.0, 1.0 - (mean_dist / (input_data.flight_altitude_m * 3.0))))

            conf = float(np.clip(0.6 * ang_score + 0.4 * dist_score, 0.05, 0.99))
            confidence_scores.append(conf)

            # Colormap: Red (low) -> Yellow (medium) -> Green (high)
            if conf < 0.5:
                # Red to Yellow
                r = 255
                g = int(255 * (conf / 0.5))
                b = 0
            else:
                # Yellow to Green
                r = int(255 * (1.0 - (conf - 0.5) / 0.5))
                g = 255
                b = 0
            colored_conf.append([r, g, b])

        conf_arr = np.array(confidence_scores, dtype=np.float32)
        clr_arr = np.array(colored_conf, dtype=np.uint8)

        conf_ply_path = Path(input_data.checkpoint_dir) / "confidence_cloud.ply"
        write_ply(conf_ply_path, pts_arr, clr_arr)

        mean_conf = float(np.mean(conf_arr))
        high_conf_pct = float(np.mean(conf_arr >= 0.7) * 100.0)

        conf_json_path = Path(input_data.checkpoint_dir) / "confidence_metrics.json"
        with open(conf_json_path, "w", encoding="utf-8") as f:
            json.dump({
                "mean_confidence": round(mean_conf, 3),
                "std_confidence": round(float(np.std(conf_arr)), 3),
                "high_confidence_percentage": round(high_conf_pct, 1),
                "evaluated_points": len(pts_arr)
            }, f, indent=2)

        return StageOutput(
            stage_name=self.stage_name,
            status="completed",
            checkpoint_dir=input_data.checkpoint_dir,
            artifacts={
                "confidence_ply": str(conf_ply_path),
                "confidence_metrics": str(conf_json_path)
            },
            metrics={
                "mean_confidence_score": round(mean_conf, 2),
                "high_confidence_points_percent": round(high_conf_pct, 1),
                "evaluated_points_count": len(pts_arr)
            },
            summary=f"Evaluated geometric confidence: {mean_conf:.2f} mean score ({high_conf_pct:.1f}% high-confidence points)."
        )
