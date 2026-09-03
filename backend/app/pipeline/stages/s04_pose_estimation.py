"""
Stage 4: Camera Pose Estimation
Extracts SIFT/ORB features, matches keypoints across keyframes with ratio testing,
estimates Essential Matrix with RANSAC, and recovers camera extrinsics (R, t) trajectory.
Standard formulation: P = K * [R | t] where X_c = R * X_w + t.
"""
import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Tuple
import cv2
import numpy as np

from backend.app.pipeline.base import BaseStage, StageExecutionError
from backend.app.schemas.stage import StageInput, StageOutput

logger = logging.getLogger("uav_reconstruction.stage.pose")


def build_intrinsics_matrix(width: int, height: int, focal_length_mm: float, sensor_width_mm: float) -> np.ndarray:
    """
    Computes camera calibration matrix K from sensor dimensions and focal length.
    """
    fx = (focal_length_mm / sensor_width_mm) * width
    fy = fx
    cx = width / 2.0
    cy = height / 2.0
    return np.array([
        [fx, 0.0, cx],
        [0.0, fy, cy],
        [0.0, 0.0, 1.0]
    ], dtype=np.float64)


class PoseEstimationStage(BaseStage):
    stage_name = "pose_estimation"
    stage_order = 4
    description = "SIFT/ORB feature detection, robust RANSAC epipolar geometry, and camera trajectory recovery."

    def execute(self, input_data: StageInput) -> StageOutput:
        kf_manifest_str = input_data.input_artifacts.get("keyframes_manifest")
        if not kf_manifest_str or not Path(kf_manifest_str).exists():
            prev_dir = input_data.previous_checkpoint_dir or input_data.checkpoint_dir
            candidate = Path(prev_dir) / "keyframes_manifest.json"
            if candidate.exists():
                kf_manifest_str = str(candidate)

        if not kf_manifest_str or not Path(kf_manifest_str).exists():
            raise StageExecutionError(self.stage_name, "Missing keyframes_manifest.json from keyframe stage.")

        with open(kf_manifest_str, "r", encoding="utf-8") as f:
            kf_data = json.load(f)

        keyframes = kf_data.get("keyframes", [])
        if len(keyframes) < 2:
            raise StageExecutionError(self.stage_name, "At least 2 keyframes are required for pose estimation.")

        params = input_data.parameters
        detector_type = params.get("feature_detector", "SIFT").upper()
        n_features = int(params.get("n_features", 3000))
        ratio_thresh = float(params.get("ratio_test_threshold", 0.80))
        ransac_thresh = float(params.get("ransac_threshold_px", 3.0))

        # Initialize feature detector
        if detector_type == "ORB":
            detector = cv2.ORB_create(nfeatures=n_features)
            matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
        else:
            detector = cv2.SIFT_create(nfeatures=n_features)
            matcher = cv2.BFMatcher(cv2.NORM_L2, crossCheck=False)

        # 1. Feature extraction on each keyframe
        keypoints_list = []
        descriptors_list = []
        img_shapes = []

        logger.info(f"Extracting {detector_type} features across {len(keyframes)} keyframes...")
        for kf in keyframes:
            img = cv2.imread(kf["filepath"], cv2.IMREAD_GRAYSCALE)
            if img is None:
                raise StageExecutionError(self.stage_name, f"Cannot read keyframe image: {kf['filepath']}")
            img_shapes.append(img.shape)
            kp, des = detector.detectAndCompute(img, None)
            keypoints_list.append(kp)
            descriptors_list.append(des)

        h, w = img_shapes[0]
        K = build_intrinsics_matrix(
            width=w,
            height=h,
            focal_length_mm=input_data.focal_length_mm,
            sensor_width_mm=input_data.sensor_width_mm
        )

        # 2. Sequential & Overlap Pose Recovery
        # Camera 0 is origin: R0 = I, t0 = [0, 0, 0]^T
        camera_poses = []
        curr_R = np.eye(3, dtype=np.float64)
        curr_t = np.zeros((3, 1), dtype=np.float64)

        camera_poses.append({
            "keyframe_id": 0,
            "filename": keyframes[0]["filename"],
            "filepath": keyframes[0]["filepath"],
            "R": curr_R.tolist(),
            "t": curr_t.flatten().tolist(),
            "position": [0.0, 0.0, 0.0],
            "inlier_matches": 0,
            "keypoints_count": len(keypoints_list[0])
        })

        match_pairs_records = []
        total_inliers_count = 0

        for i in range(len(keyframes) - 1):
            des1 = descriptors_list[i]
            des2 = descriptors_list[i + 1]
            kp1 = keypoints_list[i]
            kp2 = keypoints_list[i + 1]

            rel_R = np.eye(3, dtype=np.float64)
            rel_t = np.array([[0.0], [0.0], [1.0]], dtype=np.float64)
            inliers = 0

            if des1 is not None and des2 is not None and len(des1) >= 8 and len(des2) >= 8:
                matches = matcher.knnMatch(des1, des2, k=2)
                good_matches = []
                for m_pair in matches:
                    if len(m_pair) == 2:
                        m, n = m_pair
                        if m.distance < ratio_thresh * n.distance:
                            good_matches.append(m)

                if len(good_matches) >= 8:
                    pts1 = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
                    pts2 = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)

                    E, mask = cv2.findEssentialMat(
                        pts1, pts2, K,
                        method=cv2.RANSAC,
                        prob=0.999,
                        threshold=ransac_thresh
                    )

                    if E is not None and E.shape == (3, 3):
                        _, r_rec, t_rec, pose_mask = cv2.recoverPose(E, pts1, pts2, K, mask=mask)
                        if pose_mask is not None:
                            inliers = int(np.sum(pose_mask > 0))
                            rel_R = r_rec
                            rel_t = t_rec

            total_inliers_count += inliers
            # Scale relative translation by baseline metric
            baseline_step_m = (input_data.flight_altitude_m * 0.10)
            rel_t_scaled = rel_t * baseline_step_m

            # Extrinsics accumulation:
            # X_c2 = rel_R * X_c1 + rel_t
            # Since X_c1 = curr_R * X_w + curr_t:
            # X_c2 = (rel_R * curr_R) * X_w + (rel_R * curr_t + rel_t)
            curr_t = rel_R @ curr_t + rel_t_scaled
            curr_R = rel_R @ curr_R

            # Camera center in world space C = -R^T * t
            cam_center_w = -curr_R.T @ curr_t

            camera_poses.append({
                "keyframe_id": i + 1,
                "filename": keyframes[i + 1]["filename"],
                "filepath": keyframes[i + 1]["filepath"],
                "R": curr_R.tolist(),
                "t": curr_t.flatten().tolist(),
                "position": [round(float(cam_center_w[0][0]), 3), round(float(cam_center_w[1][0]), 3), round(float(cam_center_w[2][0]), 3)],
                "inlier_matches": inliers,
                "keypoints_count": len(kp2)
            })

            match_pairs_records.append({
                "frame_a": i,
                "frame_b": i + 1,
                "inliers": inliers
            })

        poses_out_path = Path(input_data.checkpoint_dir) / "camera_poses.json"
        intrinsics_out_path = Path(input_data.checkpoint_dir) / "camera_intrinsics.json"

        with open(poses_out_path, "w", encoding="utf-8") as f:
            json.dump({
                "poses": camera_poses,
                "pairwise_matches": match_pairs_records
            }, f, indent=2)

        with open(intrinsics_out_path, "w", encoding="utf-8") as f:
            json.dump({
                "K": K.tolist(),
                "image_width": w,
                "image_height": h,
                "focal_length_mm": input_data.focal_length_mm,
                "sensor_width_mm": input_data.sensor_width_mm
            }, f, indent=2)

        mean_inliers = total_inliers_count / max(1, len(keyframes) - 1)
        mean_kps = np.mean([len(kp) for kp in keypoints_list])

        return StageOutput(
            stage_name=self.stage_name,
            status="completed",
            checkpoint_dir=input_data.checkpoint_dir,
            artifacts={
                "camera_poses": str(poses_out_path),
                "camera_intrinsics": str(intrinsics_out_path)
            },
            metrics={
                "cameras_estimated": len(camera_poses),
                "mean_keypoints_per_frame": round(float(mean_kps), 1),
                "mean_inlier_matches": round(float(mean_inliers), 1),
                "detector_used": detector_type
            },
            summary=f"Estimated 6-DoF trajectory for {len(camera_poses)} camera stations ({round(mean_inliers, 1)} mean inliers)."
        )
