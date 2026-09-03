"""
Stage 6: Camera Trajectory and Sensor Fusion (Phase 6).
Estimates UAV camera trajectory using multi-view visual odometry and available sensor metadata.

Two Levels of Operation:
  LEVEL 1: Visual relative camera motion estimation (SIFT/ORB, Essential matrix, RANSAC, cheirality).
  LEVEL 2: Fuse visual trajectory with GPS/IMU when available using 7-DoF Sim(3) alignment & EKF + RTS smoothing.

Clean Conceptual Separation:
  - RELATIVE GEOMETRY: Camera motion relative to the scene in visual coordinate space.
  - METRIC SCALE: Physical scale factor in meters (from Sim(3) GPS alignment or nominal baseline).
  - GEOREFERENCING: Geographic anchor (WGS-84 origin & local ENU projection).

Robustness & Integrity:
  - Continues in visual-only mode if GPS/IMU is unavailable.
  - Zero sensor fabrication: GPS fields remain null when sensors are not present.
  - RTK/PPK support ready (adaptive tight covariance gating).
  - Mahalanobis innovation outlier rejection for GPS anomalies.
  - Full backward compatibility: outputs both trajectory.json and camera_poses.json.
"""
import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import cv2
import numpy as np
from scipy.spatial.transform import Rotation as R_scipy

from backend.app.pipeline.base import BaseStage, StageExecutionError
from backend.app.schemas.stage import StageInput, StageOutput
from backend.app.pipeline.stages.sensor_fusion import (
    wgs84_to_enu,
    load_telemetry_for_keyframes,
    umeyama_alignment,
    ExtendedKalmanTrajectoryFilter,
    render_trajectory_plot
)

logger = logging.getLogger("uav_reconstruction.stage.trajectory")


def build_intrinsics_matrix(width: int, height: int, focal_length_mm: float, sensor_width_mm: float) -> np.ndarray:
    """Computes pinhole camera calibration matrix K from sensor dimensions and focal length."""
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
    stage_order = 6
    description = (
        "Phase 6 Camera Trajectory and Sensor Fusion: extracts visual relative poses, "
        "fuses with GPS/IMU via Sim(3) alignment and EKF/RTS smoother, maintaining clean separation "
        "between relative geometry, metric scale, and georeferencing."
    )

    def execute(self, input_data: StageInput) -> StageOutput:
        # ── 1. Resolve Keyframes Manifest ────────────────────────────────
        kf_manifest_str = input_data.input_artifacts.get("keyframes_manifest")
        if not kf_manifest_str or not Path(kf_manifest_str).exists():
            prev_dir = input_data.previous_checkpoint_dir or input_data.checkpoint_dir
            for cand_name in ["keyframes.json", "keyframes_manifest.json"]:
                candidate = Path(prev_dir) / cand_name
                if candidate.exists():
                    kf_manifest_str = str(candidate)
                    break

        if not kf_manifest_str or not Path(kf_manifest_str).exists():
            raise StageExecutionError(self.stage_name, "Missing keyframes manifest from keyframe stage.")

        with open(kf_manifest_str, "r", encoding="utf-8") as f:
            kf_data = json.load(f)

        keyframes = kf_data.get("keyframes", [])
        if len(keyframes) < 2:
            raise StageExecutionError(self.stage_name, "At least 2 keyframes are required for trajectory estimation.")

        params = input_data.parameters
        detector_type = params.get("feature_detector", "SIFT").upper()
        n_features = int(params.get("n_features", 3000))
        ratio_thresh = float(params.get("ratio_test_threshold", 0.80))
        ransac_thresh = float(params.get("ransac_threshold_px", 3.0))
        use_normalized = bool(params.get("use_normalized", True))

        # ── 2. Feature Detector Setup ────────────────────────────────────
        if detector_type == "ORB":
            detector = cv2.ORB_create(nfeatures=n_features)
            matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
        else:
            detector = cv2.SIFT_create(nfeatures=n_features)
            matcher = cv2.BFMatcher(cv2.NORM_L2, crossCheck=False)

        # ── 3. Load Phase 4 Static Masks & Phase 5 Normalized Images ─────
        # Phase 4 Static Masks
        dynamic_manifest_str = input_data.input_artifacts.get("dynamic_objects_json")
        if not dynamic_manifest_str or not Path(dynamic_manifest_str).exists():
            prev_dir = input_data.previous_checkpoint_dir or input_data.checkpoint_dir
            candidate = Path(prev_dir) / "dynamic_objects.json"
            if candidate.exists():
                dynamic_manifest_str = str(candidate)

        static_masks_dict = {}
        if dynamic_manifest_str and Path(dynamic_manifest_str).exists():
            try:
                with open(dynamic_manifest_str, "r", encoding="utf-8") as f:
                    dyn_data = json.load(f)
                    for frame_record in dyn_data.get("frames", []):
                        kf_id = frame_record.get("keyframe_id")
                        mask_path = frame_record.get("static_mask_path")
                        if kf_id is not None and mask_path and Path(mask_path).exists():
                            static_masks_dict[kf_id] = mask_path
                logger.info(f"Loaded {len(static_masks_dict)} static scene masks from Phase 4.")
            except Exception as e:
                logger.warning(f"Failed to load dynamic masks: {e}")

        # Phase 5 Normalized Images
        illum_manifest_str = input_data.input_artifacts.get("illumination_manifest")
        if not illum_manifest_str or not Path(illum_manifest_str).exists():
            prev_dir = input_data.previous_checkpoint_dir or input_data.checkpoint_dir
            candidate = Path(prev_dir) / "illumination.json"
            if candidate.exists():
                illum_manifest_str = str(candidate)

        normalized_imgs_dict = {}
        if illum_manifest_str and Path(illum_manifest_str).exists():
            try:
                with open(illum_manifest_str, "r", encoding="utf-8") as f:
                    ill_data = json.load(f)
                    for fr in ill_data.get("frames", []):
                        fid = fr.get("frame_id")
                        proc_p = fr.get("processed_image_path")
                        if fid and proc_p and Path(proc_p).exists():
                            normalized_imgs_dict[fid] = proc_p
                logger.info(f"Loaded {len(normalized_imgs_dict)} normalized illumination frames from Phase 5.")
            except Exception as e:
                logger.warning(f"Failed to load illumination manifest: {e}")

        # ── 4. Feature Extraction Across Keyframes ───────────────────────
        keypoints_list = []
        descriptors_list = []
        img_shapes = []

        logger.info(f"Extracting {detector_type} features across {len(keyframes)} keyframes...")
        for kf in keyframes:
            fid = kf.get("original_frame_id")
            img_path = normalized_imgs_dict.get(fid) if (use_normalized and fid in normalized_imgs_dict) else kf["filepath"]
            img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
            if img is None:
                raise StageExecutionError(self.stage_name, f"Cannot read keyframe image: {img_path}")

            mask = None
            kf_id = kf.get("keyframe_id")
            if kf_id in static_masks_dict:
                mask_bgr = cv2.imread(static_masks_dict[kf_id], cv2.IMREAD_GRAYSCALE)
                if mask_bgr is not None:
                    if mask_bgr.shape != img.shape:
                        mask_bgr = cv2.resize(mask_bgr, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_NEAREST)
                    mask = mask_bgr

            img_shapes.append(img.shape)
            kp, des = detector.detectAndCompute(img, mask)
            keypoints_list.append(kp)
            descriptors_list.append(des)

        h, w = img_shapes[0]
        K = build_intrinsics_matrix(
            width=w,
            height=h,
            focal_length_mm=input_data.focal_length_mm,
            sensor_width_mm=input_data.sensor_width_mm
        )

        # ── 5. LEVEL 1: Visual Relative Camera Motion Estimation ─────────
        # Camera 0 is local origin: R0 = I, t0 = 0
        rotations_list = [np.eye(3, dtype=np.float64)]
        translations_list = [np.zeros((3, 1), dtype=np.float64)]
        visual_positions = [np.zeros(3, dtype=np.float64)]
        inliers_list = [len(keypoints_list[0])]
        pairwise_matches = []
        total_inliers = 0

        curr_R = np.eye(3, dtype=np.float64)
        curr_t = np.zeros((3, 1), dtype=np.float64)

        # Baseline step calculation (nominal baseline: 10% of flight altitude)
        nominal_step_m = max(0.5, input_data.flight_altitude_m * 0.08)

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

            total_inliers += inliers
            inliers_list.append(inliers)
            pairwise_matches.append({
                "frame_a": i,
                "frame_b": i + 1,
                "inliers": inliers
            })

            # Accumulate extrinsics:
            # X_c2 = rel_R * X_c1 + rel_t * scale
            curr_t = rel_R @ curr_t + (rel_t * nominal_step_m)
            curr_R = rel_R @ curr_R

            rotations_list.append(curr_R)
            translations_list.append(curr_t)

            # Camera center in visual frame: C_vis = -R^T * t
            cam_center_vis = -curr_R.T @ curr_t
            visual_positions.append(cam_center_vis.flatten())

        visual_pos_arr = np.array(visual_positions)

        # ── 6. Sensor Telemetry Ingestion & Zero-Fabrication Integrity ────
        telemetry_path = input_data.telemetry_path or input_data.input_artifacts.get("telemetry_path")
        gps_records, sensor_diag = load_telemetry_for_keyframes(keyframes, telemetry_path)

        timestamps = [float(kf.get("timestamp_sec", i * 0.5)) for i, kf in enumerate(keyframes)]

        # ── 7. LEVEL 2: Visual-GPS Alignment & Metric Scale Separation ───
        gps_enu_positions: List[Optional[Tuple[float, float, float]]] = [None] * len(keyframes)
        gps_fix_types: List[Optional[str]] = [None] * len(keyframes)
        valid_gps_count = sum(1 for g in gps_records if g is not None)

        scale_factor = 1.0
        scale_source = "NOMINAL_FLIGHT_ALTITUDE"
        georef_info = {
            "datum": "WGS-84",
            "projection": "Local East-North-Up (ENU) Tangent Plane",
            "origin_latitude": None,
            "origin_longitude": None,
            "origin_altitude_m": None
        }

        if valid_gps_count >= 3:
            # Anchor local ENU projection to first valid GPS point
            first_valid = next(g for g in gps_records if g is not None)
            ref_lat = first_valid["latitude"]
            ref_lon = first_valid["longitude"]
            ref_alt = first_valid.get("altitude", 0.0)

            georef_info["origin_latitude"] = ref_lat
            georef_info["origin_longitude"] = ref_lon
            georef_info["origin_altitude_m"] = ref_alt

            valid_vis_pts = []
            valid_enu_pts = []

            for idx, g in enumerate(gps_records):
                if g is not None:
                    enu = wgs84_to_enu(g["latitude"], g["longitude"], g.get("altitude", 0.0), ref_lat, ref_lon, ref_alt)
                    gps_enu_positions[idx] = enu
                    gps_fix_types[idx] = g.get("fix_type", "STANDALONE_GPS")
                    valid_vis_pts.append(visual_pos_arr[idx])
                    valid_enu_pts.append(enu)

            # Umeyama 7-DoF Sim(3) Alignment: visual -> GPS ENU
            if len(valid_vis_pts) >= 3:
                s_opt, r_align, t_align = umeyama_alignment(
                    np.array(valid_vis_pts),
                    np.array(valid_enu_pts)
                )
                scale_factor = s_opt
                scale_source = "GPS_SIM3_ALIGNMENT"
                # Transform visual positions into ENU metric frame
                visual_pos_arr = (scale_factor * (r_align @ visual_pos_arr.T) + t_align).T
                logger.info(f"Visual-GPS Sim(3) alignment: Scale = {scale_factor:.3f}x")

        # ── 8. Configurable EKF & RTS Trajectory Smoothing ───────────────
        ekf_smoother = ExtendedKalmanTrajectoryFilter()
        fused_pos_arr, confidences, outliers_rejected = ekf_smoother.run_filter(
            timestamps=timestamps,
            visual_positions=visual_pos_arr,
            gps_positions=gps_enu_positions,
            gps_fix_types=gps_fix_types,
            inliers=inliers_list
        )

        sensor_diag["gps_outliers_rejected"] = outliers_rejected
        sensor_diag["gps_points_count"] = valid_gps_count
        sensor_diag["sensor_fusion_mode"] = "FUSED_GPS_IMU" if valid_gps_count >= 3 else "VISUAL_ONLY"
        sensor_diag["smoothing_applied"] = "RTS_KALMAN_SMOOTHER"
        sensor_diag["mean_inlier_matches"] = round(float(total_inliers / max(1, len(keyframes) - 1)), 1)
        sensor_diag["average_confidence"] = round(float(np.mean(confidences)), 2)

        # ── 9. Compile Unified trajectory.json Manifest ──────────────────
        trajectory_entries = []
        camera_poses_compat = []

        for i, kf in enumerate(keyframes):
            R_mat = rotations_list[i]
            r_obj = R_scipy.from_matrix(R_mat)
            quat_xyzw = r_obj.as_quat()  # [qx, qy, qz, qw]
            quat_wxyz = [round(float(quat_xyzw[3]), 5), round(float(quat_xyzw[0]), 5),
                         round(float(quat_xyzw[1]), 5), round(float(quat_xyzw[2]), 5)]
            euler_deg = r_obj.as_euler("xyz", degrees=True)

            fused_p = fused_pos_arr[i].tolist()
            vis_p = visual_pos_arr[i].tolist()
            gps_rec = gps_records[i]

            gps_pos_dict = None
            if gps_rec is not None:
                gps_pos_dict = {
                    "latitude": round(float(gps_rec["latitude"]), 7),
                    "longitude": round(float(gps_rec["longitude"]), 7),
                    "altitude": round(float(gps_rec.get("altitude", 0.0)), 2),
                    "fix_type": gps_rec.get("fix_type", "STANDALONE_GPS")
                }

            entry = {
                "keyframe_id": i,
                "frame_id": kf.get("original_frame_id", f"frame_{i:04d}"),
                "timestamp": round(timestamps[i], 3),
                "position": [round(fused_p[0], 3), round(fused_p[1], 3), round(fused_p[2], 3)],
                "orientation": {
                    "quaternion": quat_wxyz,
                    "euler_deg": {
                        "roll": round(float(euler_deg[0]), 2),
                        "pitch": round(float(euler_deg[1]), 2),
                        "yaw": round(float(euler_deg[2]), 2)
                    }
                },
                "confidence": confidences[i],
                "gps_position": gps_pos_dict,
                "fused_position": [round(fused_p[0], 3), round(fused_p[1], 3), round(fused_p[2], 3)],
                "visual_position": [round(vis_p[0], 3), round(vis_p[1], 3), round(vis_p[2], 3)],
                "inlier_matches": inliers_list[i],
                "status": "TRACKED"
            }
            trajectory_entries.append(entry)

            # Backward compatibility for downstream GeometryStage
            t_compat = -R_mat @ fused_pos_arr[i].reshape(3, 1)
            camera_poses_compat.append({
                "keyframe_id": i,
                "filename": kf["filename"],
                "filepath": kf["filepath"],
                "R": R_mat.tolist(),
                "t": t_compat.flatten().tolist(),
                "position": [round(fused_p[0], 3), round(fused_p[1], 3), round(fused_p[2], 3)],
                "confidence": confidences[i],
                "inlier_matches": inliers_list[i],
                "keypoints_count": len(keypoints_list[i])
            })

        # Save artifacts
        ckpt_dir = Path(input_data.checkpoint_dir)
        ckpt_dir.mkdir(parents=True, exist_ok=True)
        traj_out_path = ckpt_dir / "trajectory.json"
        poses_out_path = ckpt_dir / "camera_poses.json"
        intrinsics_out_path = ckpt_dir / "camera_intrinsics.json"
        plot_out_path = ckpt_dir / "trajectory_viz.png"

        trajectory_manifest = {
            "mission_id": input_data.mission_id,
            "job_id": input_data.job_id,
            "total_keyframes": len(keyframes),
            "level": "LEVEL_2_FUSED" if valid_gps_count >= 3 else "LEVEL_1_VISUAL_ONLY",
            "diagnostics": sensor_diag,
            "scale_metrics": {
                "metric_scale_factor": round(float(scale_factor), 4),
                "scale_source": scale_source,
                "flight_altitude_m": input_data.flight_altitude_m
            },
            "georeferencing": georef_info,
            "trajectory": trajectory_entries
        }

        with open(traj_out_path, "w", encoding="utf-8") as f:
            json.dump(trajectory_manifest, f, indent=2)

        with open(poses_out_path, "w", encoding="utf-8") as f:
            json.dump({
                "poses": camera_poses_compat,
                "pairwise_matches": pairwise_matches
            }, f, indent=2)

        with open(intrinsics_out_path, "w", encoding="utf-8") as f:
            json.dump({
                "K": K.tolist(),
                "image_width": w,
                "image_height": h,
                "focal_length_mm": input_data.focal_length_mm,
                "sensor_width_mm": input_data.sensor_width_mm
            }, f, indent=2)

        # ── 10. Generate Trajectory Visualization Plot ───────────────────
        try:
            render_trajectory_plot(
                visual_pos=visual_pos_arr,
                fused_pos=fused_pos_arr,
                gps_pos=gps_enu_positions,
                output_path=plot_out_path,
                title=f"UAV Trajectory [{sensor_diag['sensor_fusion_mode']}] — Job {input_data.job_id[:8]}"
            )
        except Exception as pe:
            logger.warning(f"Could not render trajectory visualization plot: {pe}")

        return StageOutput(
            stage_name=self.stage_name,
            status="completed",
            checkpoint_dir=input_data.checkpoint_dir,
            artifacts={
                "trajectory_json": str(traj_out_path),
                "camera_poses": str(poses_out_path),
                "camera_intrinsics": str(intrinsics_out_path),
                "trajectory_viz": str(plot_out_path)
            },
            metrics={
                "cameras_estimated": len(trajectory_entries),
                "sensor_fusion_mode": sensor_diag["sensor_fusion_mode"],
                "gps_points_count": valid_gps_count,
                "gps_outliers_rejected": outliers_rejected,
                "mean_inlier_matches": sensor_diag["mean_inlier_matches"],
                "average_confidence": sensor_diag["average_confidence"],
                "metric_scale_factor": round(float(scale_factor), 3)
            },
            summary=(
                f"Recovered {len(trajectory_entries)} camera stations in {sensor_diag['sensor_fusion_mode']} mode. "
                f"Scale: {scale_source} (factor {scale_factor:.2f}). Avg Confidence: {sensor_diag['average_confidence']}."
            )
        )


def standalone_test():
    """
    Independently testable routine for Phase 6 Camera Trajectory & Sensor Fusion.
    Creates synthetic keyframe imagery and simulated GPS telemetry, runs PoseEstimationStage,
    and verifies trajectory.json, camera_poses.json, and sensor fusion diagnostics.
    """
    import tempfile
    import shutil

    test_dir = Path(tempfile.mkdtemp(prefix="phase6_trajectory_test_"))
    try:
        kf_dir = test_dir / "keyframes"
        kf_dir.mkdir(parents=True)
        ckpt_dir = test_dir / "checkpoint"
        ckpt_dir.mkdir(parents=True)

        keyframes = []
        telemetry_records = []
        base_lat = 37.774929
        base_lon = -122.419416

        for i in range(4):
            fp = kf_dir / f"keyframe_{i:04d}.jpg"
            img = np.zeros((480, 640, 3), dtype=np.uint8)
            img[:] = 120 + (i * 10)
            # Add distinctive feature points
            for fx in range(50, 600, 70):
                for fy in range(50, 440, 60):
                    cv2.circle(img, (fx + i * 8, fy), 6, (255, 200, 50), -1)
                    cv2.rectangle(img, (fx - 10, fy - 10), (fx + 10, fy + 10), (10, 240, 10), 1)

            cv2.imwrite(str(fp), img)
            keyframes.append({
                "keyframe_id": i,
                "original_frame_id": f"frame_{i:04d}",
                "filename": fp.name,
                "filepath": str(fp),
                "timestamp_sec": float(i * 1.0)
            })

            telemetry_records.append({
                "timestamp_sec": float(i * 1.0),
                "latitude": base_lat + (i * 0.0001),
                "longitude": base_lon + (i * 0.0001),
                "altitude": 100.0 + (i * 0.5),
                "fix_type": "RTK_FIXED" if i % 2 == 0 else "STANDALONE_GPS"
            })

        # Manifests
        manifest_path = kf_dir / "keyframes.json"
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump({"keyframes": keyframes}, f)

        telem_path = test_dir / "flight_telemetry.json"
        with open(telem_path, "w", encoding="utf-8") as f:
            json.dump(telemetry_records, f)

        stage_input = StageInput(
            mission_id="test_traj_mission",
            job_id="test_traj_job",
            stage_name="pose_estimation",
            checkpoint_dir=str(ckpt_dir),
            previous_checkpoint_dir=str(kf_dir),
            input_artifacts={"keyframes_manifest": str(manifest_path)},
            telemetry_path=str(telem_path),
            flight_altitude_m=50.0,
            focal_length_mm=24.0,
            sensor_width_mm=35.9,
            parameters={"feature_detector": "SIFT", "n_features": 1000}
        )

        stage = PoseEstimationStage()
        print("[Standalone Test] Executing PoseEstimationStage (Phase 6)...")
        output = stage.execute(stage_input)

        assert output.status == "completed"
        traj_file = Path(output.artifacts["trajectory_json"])
        assert traj_file.exists(), "trajectory.json must exist"

        with open(traj_file, "r", encoding="utf-8") as f:
            traj_data = json.load(f)

        assert traj_data["level"] == "LEVEL_2_FUSED"
        assert traj_data["diagnostics"]["gps_available"] is True
        assert traj_data["diagnostics"]["sensor_fusion_mode"] == "FUSED_GPS_IMU"
        assert len(traj_data["trajectory"]) == 4

        for item in traj_data["trajectory"]:
            assert "timestamp" in item
            assert "position" in item
            assert "orientation" in item
            assert "confidence" in item
            assert "gps_position" in item
            assert "fused_position" in item
            assert "visual_position" in item
            assert item["gps_position"] is not None

        # Check visual-only mode when no telemetry is provided
        stage_input_vis = StageInput(
            mission_id="test_traj_mission_vis",
            job_id="test_traj_job_vis",
            stage_name="pose_estimation",
            checkpoint_dir=str(ckpt_dir / "vis_only"),
            previous_checkpoint_dir=str(kf_dir),
            input_artifacts={"keyframes_manifest": str(manifest_path)},
            telemetry_path=None,
            flight_altitude_m=50.0,
            focal_length_mm=24.0,
            sensor_width_mm=35.9,
            parameters={"feature_detector": "SIFT", "n_features": 1000}
        )
        (ckpt_dir / "vis_only").mkdir(parents=True, exist_ok=True)
        out_vis = stage.execute(stage_input_vis)
        with open(out_vis.artifacts["trajectory_json"]) as f:
            data_vis = json.load(f)

        assert data_vis["level"] == "LEVEL_1_VISUAL_ONLY"
        assert data_vis["diagnostics"]["gps_available"] is False
        for item in data_vis["trajectory"]:
            assert item["gps_position"] is None, "GPS data must NOT be fabricated"

        print("[Standalone Test] Phase 6 Success! trajectory.json verified for both fused and visual-only modes.")
        print(f"Summary: {output.summary}")
    finally:
        shutil.rmtree(test_dir, ignore_errors=True)


if __name__ == "__main__":
    standalone_test()
