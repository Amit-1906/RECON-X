"""
Stage 5: 3D Geometry (Sparse Triangulation)
Triangulates inlier 2D feature correspondences into initial 3D Cartesian point coordinates,
validates chirality and reprojection residuals, and exports standard sparse.ply point cloud.
"""
import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Tuple
import cv2
import numpy as np

from backend.app.pipeline.base import BaseStage, StageExecutionError
from backend.app.schemas.stage import StageInput, StageOutput

logger = logging.getLogger("uav_reconstruction.stage.geometry")


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


class GeometryStage(BaseStage):
    stage_name = "geometry"
    stage_order = 5
    description = "Triangulates 2D feature tracks into metric 3D point cloud with reprojection filtering."

    def execute(self, input_data: StageInput) -> StageOutput:
        poses_path = input_data.input_artifacts.get("camera_poses")
        intrinsics_path = input_data.input_artifacts.get("camera_intrinsics")

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

        params = input_data.parameters
        max_reproj_err = float(params.get("max_reprojection_error_px", 4.0))

        # Re-detect and triangulate consecutive camera pairs
        triangulated_pts: List[List[float]] = []
        point_colors: List[List[int]] = []
        reproj_errors: List[float] = []

        detector = cv2.SIFT_create(nfeatures=3000)
        matcher = cv2.BFMatcher(cv2.NORM_L2, crossCheck=False)

        for i in range(len(poses) - 1):
            cam1 = poses[i]
            cam2 = poses[i + 1]

            img1 = cv2.imread(cam1["filepath"])
            img2 = cv2.imread(cam2["filepath"])
            if img1 is None or img2 is None:
                continue

            gray1 = cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)
            gray2 = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)

            kp1, des1 = detector.detectAndCompute(gray1, None)
            kp2, des2 = detector.detectAndCompute(gray2, None)

            if des1 is None or des2 is None or len(des1) < 8 or len(des2) < 8:
                continue

            matches = matcher.knnMatch(des1, des2, k=2)
            good = [m for m, n in matches if len((m, n)) == 2 and m.distance < 0.80 * n.distance]

            if len(good) < 8:
                continue

            pts1 = np.float32([kp1[m.queryIdx].pt for m in good]).T
            pts2 = np.float32([kp2[m.trainIdx].pt for m in good]).T

            R1 = np.array(cam1["R"], dtype=np.float64)
            t1 = np.array(cam1["t"], dtype=np.float64).reshape(3, 1)
            R2 = np.array(cam2["R"], dtype=np.float64)
            t2 = np.array(cam2["t"], dtype=np.float64).reshape(3, 1)

            # Projection matrices P = K * [R | t]
            P1 = K @ np.hstack((R1, t1))
            P2 = K @ np.hstack((R2, t2))

            pts4D = cv2.triangulatePoints(P1, P2, pts1, pts2)

            for idx in range(pts4D.shape[1]):
                w_val = pts4D[3, idx]
                if abs(w_val) < 1e-7:
                    continue
                
                # Check point in homogeneous coordinates
                X_w = pts4D[:3, idx] / w_val
                
                # Verify chirality: point must be in front of cameras
                X_c1 = R1 @ X_w + t1.flatten()
                X_c2 = R2 @ X_w + t2.flatten()
                
                if X_c1[2] <= 0 or X_c2[2] <= 0:
                    # Invert homogeneous coordinate if both are negative
                    if X_c1[2] < 0 and X_c2[2] < 0:
                        X_w = -X_w
                        X_c1 = R1 @ X_w + t1.flatten()
                        X_c2 = R2 @ X_w + t2.flatten()
                    else:
                        continue

                if X_c1[2] <= 0 or X_c2[2] <= 0:
                    continue

                # Reprojection error check
                p1_proj = K @ X_c1
                u1, v1 = p1_proj[0] / p1_proj[2], p1_proj[1] / p1_proj[2]
                err1 = np.hypot(u1 - pts1[0, idx], v1 - pts1[1, idx])

                p2_proj = K @ X_c2
                u2, v2 = p2_proj[0] / p2_proj[2], p2_proj[1] / p2_proj[2]
                err2 = np.hypot(u2 - pts2[0, idx], v2 - pts2[1, idx])

                mean_err = (err1 + err2) / 2.0
                if mean_err <= max_reproj_err:
                    triangulated_pts.append(X_w.tolist())
                    reproj_errors.append(float(mean_err))

                    px, py = int(round(pts1[0, idx])), int(round(pts1[1, idx]))
                    px = max(0, min(px, img1.shape[1] - 1))
                    py = max(0, min(py, img1.shape[0] - 1))
                    bgr = img1[py, px]
                    point_colors.append([int(bgr[2]), int(bgr[1]), int(bgr[0])])

        if len(triangulated_pts) < 6:
            raise StageExecutionError(
                self.stage_name,
                f"Triangulation yielded only {len(triangulated_pts)} valid 3D points. Check camera baseline or image texture."
            )

        pts_arr = np.array(triangulated_pts, dtype=np.float32)
        clr_arr = np.array(point_colors, dtype=np.uint8)

        ply_path = Path(input_data.checkpoint_dir) / "sparse.ply"
        write_ply(ply_path, pts_arr, clr_arr)

        cloud_meta_path = Path(input_data.checkpoint_dir) / "sparse_metadata.json"
        mean_reproj = float(np.mean(reproj_errors)) if reproj_errors else 0.0

        with open(cloud_meta_path, "w", encoding="utf-8") as f:
            json.dump({
                "point_count": len(triangulated_pts),
                "mean_reprojection_error_px": round(mean_reproj, 3),
                "bounding_box_min": np.min(pts_arr, axis=0).tolist(),
                "bounding_box_max": np.max(pts_arr, axis=0).tolist()
            }, f, indent=2)

        return StageOutput(
            stage_name=self.stage_name,
            status="completed",
            checkpoint_dir=input_data.checkpoint_dir,
            artifacts={
                "sparse_ply": str(ply_path),
                "sparse_metadata": str(cloud_meta_path)
            },
            metrics={
                "triangulated_points_count": len(triangulated_pts),
                "mean_reprojection_error_px": round(mean_reproj, 2),
                "point_cloud_bounds": f"[{np.ptp(pts_arr[:, 0]):.1f}m, {np.ptp(pts_arr[:, 1]):.1f}m, {np.ptp(pts_arr[:, 2]):.1f}m]"
            },
            summary=f"Triangulated {len(triangulated_pts)} 3D points with {mean_reproj:.2f}px mean reprojection error."
        )
