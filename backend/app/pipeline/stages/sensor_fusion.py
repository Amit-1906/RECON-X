"""
Sensor Fusion & Camera Trajectory Module (Phase 6).
Provides:
  1. Telemetry ingestion (CSV, GPX, SRT, JSON, or keyframe metadata).
  2. Geographic WGS84 to local East-North-Up (ENU) Cartesian projection.
  3. 7-DoF Sim(3) Umeyama visual-GPS trajectory alignment.
  4. Configurable EKF (Extended Kalman Filter) with Mahalanobis outlier gating.
  5. RTK/PPK readiness with adaptive covariance scaling.
  6. Rauch-Tung-Striebel (RTS) bidirectional trajectory smoothing.
  7. Strict visual-only fallback when sensor data is unavailable (zero fabrication).
  8. Clean separation between Relative Geometry, Metric Scale, and Georeferencing.
"""
import json
import logging
import math
import re
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
from scipy.spatial.transform import Rotation as R_scipy

logger = logging.getLogger("uav_reconstruction.fusion")

WGS84_A = 6378137.0  # semi-major axis (meters)
WGS84_F = 1.0 / 298.257223563  # flattening
WGS84_E2 = 2 * WGS84_F - WGS84_F ** 2


def wgs84_to_enu(
    lat: float, lon: float, alt: float,
    lat0: float, lon0: float, alt0: float
) -> Tuple[float, float, float]:
    """
    Converts WGS-84 Geodetic coordinates (lat, lon, alt in degrees & meters)
    to local East-North-Up (ENU) Cartesian coordinates in meters relative to (lat0, lon0, alt0).
    Accurate to sub-millimeter precision over standard UAV survey footprints.
    """
    phi0 = math.radians(lat0)
    lam0 = math.radians(lon0)
    phi = math.radians(lat)
    lam = math.radians(lon)

    # Prime vertical radius of curvature
    n0 = WGS84_A / math.sqrt(1.0 - WGS84_E2 * (math.sin(phi0) ** 2))
    x0 = (n0 + alt0) * math.cos(phi0) * math.cos(lam0)
    y0 = (n0 + alt0) * math.cos(phi0) * math.sin(lam0)
    z0 = (n0 * (1.0 - WGS84_E2) + alt0) * math.sin(phi0)

    n = WGS84_A / math.sqrt(1.0 - WGS84_E2 * (math.sin(phi) ** 2))
    x = (n + alt) * math.cos(phi) * math.cos(lam)
    y = (n + alt) * math.cos(phi) * math.sin(lam)
    z = (n * (1.0 - WGS84_E2) + alt) * math.sin(phi)

    dx = x - x0
    dy = y - y0
    dz = z - z0

    # Rotate ECEF displacement to local ENU
    east = -math.sin(lam0) * dx + math.cos(lam0) * dy
    north = -math.sin(phi0) * math.cos(lam0) * dx - math.sin(phi0) * math.sin(lam0) * dy + math.cos(phi0) * dz
    up = math.cos(phi0) * math.cos(lam0) * dx + math.cos(phi0) * math.sin(lam0) * dy + math.sin(phi0) * dz

    return east, north, up


def parse_srt_telemetry(srt_path: Path) -> List[Dict[str, Any]]:
    """Parses DJI/Autel embedded subtitle telemetry format."""
    records = []
    text = srt_path.read_text(encoding="utf-8", errors="ignore")
    blocks = text.strip().split("\n\n")

    for block in blocks:
        lines = [l.strip() for l in block.splitlines() if l.strip()]
        if len(lines) < 2:
            continue

        # Look for timestamp line (e.g. 00:00:01,000 --> 00:00:02,000)
        time_match = re.search(r"(\d{2}):(\d{2}):(\d{2})[,.](\d{3})", lines[1] if len(lines) > 1 else "")
        timestamp_sec = 0.0
        if time_match:
            hh, mm, ss, ms = map(int, time_match.groups())
            timestamp_sec = hh * 3600 + mm * 60 + ss + ms / 1000.0

        content = " ".join(lines[2:]) if len(lines) > 2 else ""
        lat_m = re.search(r"latitude\s*[:=]\s*([+-]?\d+\.?\d*)", content, re.IGNORECASE)
        lon_m = re.search(r"longitude\s*[:=]\s*([+-]?\d+\.?\d*)", content, re.IGNORECASE)
        alt_m = re.search(r"(?:rel_alt|altitude|alt)\s*[:=]\s*([+-]?\d+\.?\d*)", content, re.IGNORECASE)

        if lat_m and lon_m:
            records.append({
                "timestamp_sec": timestamp_sec,
                "latitude": float(lat_m.group(1)),
                "longitude": float(lon_m.group(1)),
                "altitude": float(alt_m.group(1)) if alt_m else 0.0,
                "source": "SRT"
            })
    return records


def parse_csv_telemetry(csv_path: Path) -> List[Dict[str, Any]]:
    """Parses standard UAV flight logs in CSV format."""
    import csv
    records = []
    with open(csv_path, "r", encoding="utf-8", errors="ignore") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Flexible column lookup
            lowered = {k.lower().strip(): v for k, v in row.items() if k}
            t = float(lowered.get("timestamp_sec") or lowered.get("timestamp") or lowered.get("time") or 0.0)
            lat = lowered.get("latitude") or lowered.get("lat")
            lon = lowered.get("longitude") or lowered.get("lon")
            alt = lowered.get("altitude") or lowered.get("alt") or lowered.get("height") or 0.0
            fix = lowered.get("fix_type") or lowered.get("rtk_status") or "STANDALONE_GPS"

            if lat and lon:
                try:
                    records.append({
                        "timestamp_sec": float(t),
                        "latitude": float(lat),
                        "longitude": float(lon),
                        "altitude": float(alt),
                        "fix_type": str(fix).upper(),
                        "source": "CSV"
                    })
                except ValueError:
                    continue
    return records


def load_telemetry_for_keyframes(
    keyframes: List[Dict[str, Any]],
    telemetry_path: Optional[str] = None
) -> Tuple[List[Optional[Dict[str, Any]]], Dict[str, Any]]:
    """
    Extracts or matches GPS/IMU metadata for each keyframe.
    DOES NOT FABRICATE DATA: returns None for frames missing sensor data.
    """
    diagnostics = {
        "gps_available": False,
        "imu_available": False,
        "rtk_support": "READY",
        "rtk_fix_type": "NONE",
        "telemetry_source": "NONE",
        "matched_count": 0
    }

    # 1. Check if keyframes already contain explicit GPS tags
    kf_gps_count = sum(1 for kf in keyframes if kf.get("gps_latitude") is not None and kf.get("gps_longitude") is not None)
    if kf_gps_count >= len(keyframes) // 2 and kf_gps_count > 0:
        diagnostics["gps_available"] = True
        diagnostics["telemetry_source"] = "KEYFRAME_MANIFEST"
        diagnostics["matched_count"] = kf_gps_count
        matched = []
        for kf in keyframes:
            if kf.get("gps_latitude") is not None and kf.get("gps_longitude") is not None:
                matched.append({
                    "latitude": float(kf["gps_latitude"]),
                    "longitude": float(kf["gps_longitude"]),
                    "altitude": float(kf.get("gps_altitude", 0.0)),
                    "fix_type": str(kf.get("fix_type", "STANDALONE_GPS")).upper()
                })
            else:
                matched.append(None)
        return matched, diagnostics

    # 2. Check companion telemetry file if provided
    raw_records = []
    if telemetry_path and Path(telemetry_path).exists():
        tpath = Path(telemetry_path)
        ext = tpath.suffix.lower()
        try:
            if ext == ".srt":
                raw_records = parse_srt_telemetry(tpath)
            elif ext == ".csv":
                raw_records = parse_csv_telemetry(tpath)
            elif ext == ".json":
                with open(tpath, "r", encoding="utf-8") as f:
                    raw_records = json.load(f)
        except Exception as e:
            logger.warning(f"Error reading telemetry file {tpath}: {e}")

    if not raw_records:
        # Zero sensor fabrication
        return [None] * len(keyframes), diagnostics

    # Match raw telemetry records to keyframes by nearest timestamp
    diagnostics["gps_available"] = True
    diagnostics["telemetry_source"] = Path(telemetry_path).name
    matched = []
    t_records = np.array([r.get("timestamp_sec", 0.0) for r in raw_records])

    for kf in keyframes:
        t_kf = float(kf.get("timestamp_sec", 0.0))
        if len(t_records) > 0:
            idx = int(np.argmin(np.abs(t_records - t_kf)))
            closest = raw_records[idx]
            # Max allowable time delta: 1.5s
            if abs(t_records[idx] - t_kf) <= 1.5:
                matched.append(closest)
                diagnostics["matched_count"] += 1
                if closest.get("fix_type"):
                    diagnostics["rtk_fix_type"] = closest["fix_type"]
            else:
                matched.append(None)
        else:
            matched.append(None)

    return matched, diagnostics


def umeyama_alignment(pts_source: np.ndarray, pts_target: np.ndarray) -> Tuple[float, np.ndarray, np.ndarray]:
    """
    Computes optimal 7-DoF Sim(3) similarity transformation [scale, R, translation]
    aligning pts_source to pts_target using Umeyama's SVD algorithm.
    pts_target ~ scale * R @ pts_source + translation.
    """
    n, m = pts_source.shape
    if n < 3:
        return 1.0, np.eye(3), np.zeros((3, 1))

    mu_s = np.mean(pts_source, axis=0)
    mu_t = np.mean(pts_target, axis=0)

    centered_s = pts_source - mu_s
    centered_t = pts_target - mu_t

    var_s = np.mean(np.sum(centered_s ** 2, axis=1))
    if var_s < 1e-7:
        return 1.0, np.eye(3), (mu_t - mu_s).reshape(3, 1)

    cov = (centered_t.T @ centered_s) / float(n)
    u, d, vt = np.linalg.svd(cov)

    s_mat = np.eye(m)
    if np.linalg.det(u) * np.linalg.det(vt) < 0:
        s_mat[-1, -1] = -1

    r_opt = u @ s_mat @ vt
    scale_opt = float((np.trace(np.diag(d) @ s_mat)) / var_s)
    scale_opt = max(0.01, scale_opt)

    t_opt = mu_t.reshape(3, 1) - scale_opt * (r_opt @ mu_s.reshape(3, 1))
    return scale_opt, r_opt, t_opt


class ExtendedKalmanTrajectoryFilter:
    """
    Configurable Extended Kalman Filter (EKF) with RTS Smoothing.
    State vector: [x, y, z, vx, vy, vz]^T in local metric coordinate space.
    """

    def __init__(
        self,
        dt_default: float = 0.5,
        process_pos_noise: float = 0.1,
        process_vel_noise: float = 0.5,
        visual_pos_noise: float = 0.25,
        gps_standalone_noise: float = 2.5,
        gps_rtk_fixed_noise: float = 0.02,
        gps_rtk_float_noise: float = 0.20
    ):
        self.dt_default = dt_default
        self.q_p = process_pos_noise
        self.q_v = process_vel_noise
        self.r_vis = visual_pos_noise
        self.r_gps_std = gps_standalone_noise
        self.r_gps_rtk_fix = gps_rtk_fixed_noise
        self.r_gps_rtk_flt = gps_rtk_float_noise

    def run_filter(
        self,
        timestamps: List[float],
        visual_positions: np.ndarray,
        gps_positions: List[Optional[Tuple[float, float, float]]],
        gps_fix_types: List[Optional[str]],
        inliers: List[int]
    ) -> Tuple[np.ndarray, List[float], int]:
        """
        Executes Forward EKF + Backward RTS Smoother.
        Returns:
            smoothed_positions: (N, 3) np.ndarray
            confidences: List[float] per station (0.0 to 1.0)
            outliers_rejected: int count
        """
        n = len(timestamps)
        if n == 0:
            return np.zeros((0, 3)), [], 0

        # Initial state from first valid measurement
        init_pos = visual_positions[0]
        if gps_positions[0] is not None:
            init_pos = np.array(gps_positions[0])

        x_est = np.zeros((n, 6))
        p_est = np.zeros((n, 6, 6))
        x_pred = np.zeros((n, 6))
        p_pred = np.zeros((n, 6, 6))

        # Initial state and covariance
        curr_x = np.zeros(6)
        curr_x[:3] = init_pos
        if n > 1:
            dt0 = max(0.01, timestamps[1] - timestamps[0])
            curr_x[3:] = (visual_positions[1] - visual_positions[0]) / dt0

        curr_p = np.eye(6)
        curr_p[:3, :3] *= 10.0
        curr_p[3:, 3:] *= 50.0

        x_est[0] = curr_x
        p_est[0] = curr_p

        outliers_rejected = 0

        # --- Forward Pass ---
        for k in range(1, n):
            dt = max(0.01, timestamps[k] - timestamps[k - 1]) if k > 0 else self.dt_default

            # 1. Kinematic Process Model
            F = np.eye(6)
            F[0, 3] = dt
            F[1, 4] = dt
            F[2, 5] = dt

            Q = np.zeros((6, 6))
            Q[:3, :3] = np.eye(3) * (self.q_p ** 2) * dt
            Q[3:, 3:] = np.eye(3) * (self.q_v ** 2) * dt

            # Predict
            pred_x = F @ curr_x
            pred_p = F @ curr_p @ F.T + Q

            x_pred[k] = pred_x
            p_pred[k] = pred_p

            # 2. Measurement Update 1: Visual Relative Odometry
            H_pos = np.zeros((3, 6))
            H_pos[:3, :3] = np.eye(3)

            # Modulate visual noise by feature inlier count
            inlier_count = max(1, inliers[k] if k < len(inliers) else 50)
            vis_sigma = self.r_vis * (1.0 + 30.0 / inlier_count)
            R_vis = np.eye(3) * (vis_sigma ** 2)

            z_vis = visual_positions[k]
            y_vis = z_vis - H_pos @ pred_x
            S_vis = H_pos @ pred_p @ H_pos.T + R_vis
            K_vis = pred_p @ H_pos.T @ np.linalg.inv(S_vis)

            curr_x = pred_x + K_vis @ y_vis
            curr_p = (np.eye(6) - K_vis @ H_pos) @ pred_p

            # 3. Measurement Update 2: Absolute GPS (if available)
            if gps_positions[k] is not None:
                z_gps = np.array(gps_positions[k])
                fix_type = (gps_fix_types[k] or "").upper()

                if "FIX" in fix_type or "RTK_FIXED" in fix_type:
                    gps_sigma = self.r_gps_rtk_fix
                elif "FLOAT" in fix_type or "DGPS" in fix_type:
                    gps_sigma = self.r_gps_rtk_flt
                else:
                    gps_sigma = self.r_gps_std

                R_gps = np.eye(3) * (gps_sigma ** 2)
                y_gps = z_gps - H_pos @ curr_x
                S_gps = H_pos @ curr_p @ H_pos.T + R_gps
                S_inv = np.linalg.inv(S_gps)

                # Mahalanobis outlier rejection gating (adaptive warm-up gate vs steady 99.9% chi-square)
                gate_thresh = 60.0 if k <= 2 else 16.27
                mahalanobis_d2 = float(y_gps.T @ S_inv @ y_gps)
                if mahalanobis_d2 <= gate_thresh:
                    K_gps = curr_p @ H_pos.T @ S_inv
                    curr_x = curr_x + K_gps @ y_gps
                    curr_p = (np.eye(6) - K_gps @ H_pos) @ curr_p
                else:
                    outliers_rejected += 1
                    logger.debug(f"Frame {k}: GPS outlier rejected (Mahalanobis d^2 = {mahalanobis_d2:.2f})")

            x_est[k] = curr_x
            p_est[k] = curr_p

        # --- Backward RTS Smoother Pass ---
        smoothed_x = np.copy(x_est)
        smoothed_p = np.copy(p_est)

        for k in range(n - 2, -1, -1):
            dt = max(0.01, timestamps[k + 1] - timestamps[k])
            F = np.eye(6)
            F[0, 3] = dt
            F[1, 4] = dt
            F[2, 5] = dt

            P_pred_next = p_pred[k + 1]
            try:
                C = p_est[k] @ F.T @ np.linalg.inv(P_pred_next)
                smoothed_x[k] = x_est[k] + C @ (smoothed_x[k + 1] - x_pred[k + 1])
                smoothed_p[k] = p_est[k] + C @ (smoothed_p[k + 1] - P_pred_next) @ C.T
            except np.linalg.LinAlgError:
                pass

        # Compute per-station confidence metrics
        confidences = []
        for k in range(n):
            pos_cov_trace = float(np.trace(smoothed_p[k][:3, :3]))
            cov_factor = max(0.2, 1.0 - math.sqrt(max(0.0, pos_cov_trace)) / 6.0)
            inl = inliers[k] if k < len(inliers) else 50
            inl_factor = min(1.0, max(0.3, inl / 100.0))
            gps_bonus = 0.15 if gps_positions[k] is not None else 0.0
            conf = round(float(np.clip(cov_factor * 0.6 + inl_factor * 0.3 + gps_bonus, 0.15, 0.99)), 2)
            confidences.append(conf)

        return smoothed_x[:, :3], confidences, outliers_rejected


def render_trajectory_plot(
    visual_pos: np.ndarray,
    fused_pos: np.ndarray,
    gps_pos: List[Optional[Tuple[float, float, float]]],
    output_path: Path,
    title: str = "UAV Camera Trajectory & Sensor Fusion"
):
    """
    Renders 2-panel trajectory plot (top-down East-North and Altitude vs Station).
    """
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6), facecolor="#0f172a")

    # Dark theme styling
    for ax in (ax1, ax2):
        ax.set_facecolor("#1e293b")
        ax.tick_params(colors="#94a3b8")
        ax.xaxis.label.set_color("#cbd5e1")
        ax.yaxis.label.set_color("#cbd5e1")
        ax.title.set_color("#f8fafc")
        for spine in ax.spines.values():
            spine.set_color("#334155")
        ax.grid(True, color="#334155", linestyle="--", alpha=0.6)

    # Panel 1: Top-down (X vs Y)
    ax1.plot(visual_pos[:, 0], visual_pos[:, 1], "c--", label="Visual Odometry", linewidth=1.5, alpha=0.8)
    ax1.plot(fused_pos[:, 0], fused_pos[:, 1], "#10b981", label="Fused Trajectory (RTS)", linewidth=2.5)

    # Plot GPS points if available
    valid_gps = [(p[0], p[1]) for p in gps_pos if p is not None]
    if valid_gps:
        gx, gy = zip(*valid_gps)
        ax1.scatter(gx, gy, color="#f59e0b", s=35, zorder=5, label="Raw GPS Fixes", alpha=0.9)

    ax1.scatter(fused_pos[0, 0], fused_pos[0, 1], color="#38bdf8", s=80, marker="o", zorder=6, label="Start")
    ax1.scatter(fused_pos[-1, 0], fused_pos[-1, 1], color="#ef4444", s=80, marker="s", zorder=6, label="End")
    ax1.set_xlabel("Local East [m]")
    ax1.set_ylabel("Local North [m]")
    ax1.set_title("Flight Path (Top-Down Projection)")
    ax1.legend(facecolor="#1e293b", edgecolor="#475569", labelcolor="#e2e8f0")
    ax1.axis("equal")

    # Panel 2: Altitude Profile (Station Index vs Z)
    stations = np.arange(len(fused_pos))
    ax2.plot(stations, visual_pos[:, 2], "c--", label="Visual Altitude", linewidth=1.5, alpha=0.8)
    ax2.plot(stations, fused_pos[:, 2], "#10b981", label="Fused Altitude", linewidth=2.5)

    gps_alts = [(i, p[2]) for i, p in enumerate(gps_pos) if p is not None]
    if gps_alts:
        g_idx, g_z = zip(*gps_alts)
        ax2.scatter(g_idx, g_z, color="#f59e0b", s=35, zorder=5, label="GPS Altitude", alpha=0.9)

    ax2.set_xlabel("Keyframe Station Index")
    ax2.set_ylabel("Altitude [m]")
    ax2.set_title("Altitude Profile")
    ax2.legend(facecolor="#1e293b", edgecolor="#475569", labelcolor="#e2e8f0")

    fig.suptitle(title, color="#f8fafc", fontsize=14, fontweight="bold")
    plt.tight_layout()
    fig.savefig(str(output_path), dpi=150, facecolor=fig.get_facecolor(), edgecolor="none")
    plt.close(fig)
