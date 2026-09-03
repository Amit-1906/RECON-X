"""
Stage 6: Dense Point Cloud Reconstruction
Computes dense multi-view stereo disparities (SGBM), reprojects 2D disparity fields
to metric 3D space with RGB color, and writes standard dense.ply point cloud.
"""
import json
import logging
from pathlib import Path
from typing import List, Dict, Any
import cv2
import numpy as np

from backend.app.pipeline.base import BaseStage, StageExecutionError
from backend.app.schemas.stage import StageInput, StageOutput

logger = logging.getLogger("uav_reconstruction.stage.dense")


def write_ply(filepath: Path, points: np.ndarray, colors: np.ndarray):
    """
    Writes 3D points and RGB colors to standard ASCII PLY format.
    """
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


class DensePointCloudStage(BaseStage):
    stage_name = "dense_point_cloud"
    stage_order = 6
    description = "Dense disparity estimation and dense 3D point cloud generation in standard PLY format."

    def execute(self, input_data: StageInput) -> StageOutput:
        poses_path = input_data.input_artifacts.get("camera_poses")
        intrinsics_path = input_data.input_artifacts.get("camera_intrinsics")
        sparse_ply_path = input_data.input_artifacts.get("sparse_ply")

        prev_dir = input_data.previous_checkpoint_dir or input_data.checkpoint_dir
        if not poses_path or not Path(poses_path).exists():
            candidate = Path(prev_dir) / "camera_poses.json"
            if candidate.exists():
                poses_path = str(candidate)

        if not intrinsics_path or not Path(intrinsics_path).exists():
            candidate = Path(prev_dir) / "camera_intrinsics.json"
            if candidate.exists():
                intrinsics_path = str(candidate)

        if not poses_path or not Path(poses_path).exists():
            raise StageExecutionError(self.stage_name, "Missing camera_poses.json artifact.")
        if not intrinsics_path or not Path(intrinsics_path).exists():
            raise StageExecutionError(self.stage_name, "Missing camera_intrinsics.json artifact.")

        with open(poses_path, "r", encoding="utf-8") as f:
            poses_data = json.load(f)
        with open(intrinsics_path, "r", encoding="utf-8") as f:
            intrinsics_data = json.load(f)

        poses = poses_data.get("poses", [])
        K = np.array(intrinsics_data["K"], dtype=np.float64)
        fx = K[0, 0]
        cx, cy = K[0, 2], K[1, 2]

        params = input_data.parameters
        num_disp = int(params.get("num_disparities", 64))
        block_size = int(params.get("block_size", 7))
        voxel_size = float(params.get("voxel_downsample_size", 0.05))

        # Setup StereoSGBM disparity matcher
        stereo = cv2.StereoSGBM_create(
            minDisparity=0,
            numDisparities=num_disp,
            blockSize=block_size,
            P1=8 * 3 * block_size ** 2,
            P2=32 * 3 * block_size ** 2,
            disp12MaxDiff=1,
            uniquenessRatio=10,
            speckleWindowSize=100,
            speckleRange=32,
            mode=cv2.STEREO_SGBM_MODE_SGBM_3WAY
        )

        all_points = []
        all_colors = []

        # Load sparse points if available to ensure coverage
        if sparse_ply_path and Path(sparse_ply_path).exists():
            with open(sparse_ply_path, "r", encoding="utf-8") as f:
                lines = f.readlines()
            in_header = True
            for line in lines:
                if in_header:
                    if line.strip() == "end_header":
                        in_header = False
                    continue
                parts = line.strip().split()
                if len(parts) >= 6:
                    all_points.append([float(parts[0]), float(parts[1]), float(parts[2])])
                    all_colors.append([int(parts[3]), int(parts[4]), int(parts[5])])

        # Dense disparity across consecutive keyframes
        logger.info(f"Computing dense stereo disparities across {len(poses)-1} keyframe pairs...")
        for i in range(len(poses) - 1):
            cam1 = poses[i]
            cam2 = poses[i + 1]

            img1 = cv2.imread(cam1["filepath"])
            img2 = cv2.imread(cam2["filepath"])
            if img1 is None or img2 is None:
                continue

            gray1 = cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)
            gray2 = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)

            # Downsample for faster computation and noise robustness
            scale = 0.5
            s_gray1 = cv2.resize(gray1, (0, 0), fx=scale, fy=scale)
            s_gray2 = cv2.resize(gray2, (0, 0), fx=scale, fy=scale)
            s_img1 = cv2.resize(img1, (0, 0), fx=scale, fy=scale)

            disp = stereo.compute(s_gray1, s_gray2).astype(np.float32) / 16.0

            # Baseline calculation between camera 1 and camera 2
            pos1 = np.array(cam1["position"])
            pos2 = np.array(cam2["position"])
            baseline_m = max(0.5, float(np.linalg.norm(pos2 - pos1)))

            R1 = np.array(cam1["R"], dtype=np.float64)
            t1 = np.array(cam1["t"], dtype=np.float64).reshape(3, 1)

            # Sample valid disparities: disparity > 0 and disparity <= num_disp
            valid_mask = (disp > 2.0) & (disp < num_disp)
            # Take a uniform stride to control point count and memory
            stride = 6
            y_indices, x_indices = np.where(valid_mask)
            sub_indices = np.arange(0, len(y_indices), stride)

            for idx in sub_indices:
                y = y_indices[idx]
                x = x_indices[idx]
                d = disp[y, x]

                # Convert to full-scale coordinates
                orig_x = x / scale
                orig_y = y / scale

                # Metric depth Z = (f * B) / disparity
                Z_c = (fx * baseline_m) / max(d, 0.1)
                # Filter abnormal depths outside reasonable UAV altitude range
                if Z_c < 1.0 or Z_c > (input_data.flight_altitude_m * 3.0):
                    continue

                X_c = (orig_x - cx) * Z_c / fx
                Y_c = (orig_y - cy) * Z_c / fx
                pt_cam = np.array([X_c, Y_c, Z_c])

                # Transform to world coordinates: X_w = R^T * (X_c - t)
                pt_world = R1.T @ (pt_cam - t1.flatten())
                all_points.append(pt_world.tolist())

                bgr = s_img1[y, x]
                all_colors.append([int(bgr[2]), int(bgr[1]), int(bgr[0])])

        if len(all_points) < 50:
            raise StageExecutionError(
                self.stage_name,
                f"Insufficient dense points ({len(all_points)}) generated. Ensure adequate overlap and texture."
            )

        pts_arr = np.array(all_points, dtype=np.float32)
        clr_arr = np.array(all_colors, dtype=np.uint8)

        # Simple spatial voxel subsampling: quantize coordinates to grid
        quantized = np.round(pts_arr / voxel_size) * voxel_size
        _, unique_indices = np.unique(quantized, axis=0, return_index=True)
        pts_arr = pts_arr[unique_indices]
        clr_arr = clr_arr[unique_indices]

        dense_ply_path = Path(input_data.checkpoint_dir) / "dense.ply"
        write_ply(dense_ply_path, pts_arr, clr_arr)

        meta_path = Path(input_data.checkpoint_dir) / "dense_metadata.json"
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump({
                "dense_points_count": len(pts_arr),
                "voxel_size_m": voxel_size,
                "bounding_box_min": np.min(pts_arr, axis=0).tolist(),
                "bounding_box_max": np.max(pts_arr, axis=0).tolist()
            }, f, indent=2)

        return StageOutput(
            stage_name=self.stage_name,
            status="completed",
            checkpoint_dir=input_data.checkpoint_dir,
            artifacts={
                "dense_ply": str(dense_ply_path),
                "dense_metadata": str(meta_path)
            },
            metrics={
                "dense_points_reconstructed": len(pts_arr),
                "voxel_downsample_m": voxel_size,
                "cloud_extent_xyz": f"[{np.ptp(pts_arr[:, 0]):.1f}m, {np.ptp(pts_arr[:, 1]):.1f}m, {np.ptp(pts_arr[:, 2]):.1f}m]"
            },
            summary=f"Reconstructed dense point cloud with {len(pts_arr)} points in PLY format."
        )
