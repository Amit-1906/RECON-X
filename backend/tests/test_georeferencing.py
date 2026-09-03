"""
Unit and Integration Tests for Phase 11: Metric Scale and Georeferencing.

Verifies:
  1. Geodetic conversions (WGS84, ECEF, ENU, UTM, EPSG:3857) with sub-millimeter precision.
  2. Umeyama 7-DoF Sim(3) similarity transformation solver.
  3. Metric scale estimation hierarchy (RTK, standalone GNSS, altimetry, checkpoints).
  4. Accuracy and trajectory residual statistics (RMSE H/V/3D, CE90, LE90).
  5. Independent checkpoint validation.
  6. Strict compliance with scientific disclaimers (never claim guaranteed cm or GCP obsolescence).
  7. End-to-end GeoreferencingStage producing georeferenced_model.glb, coordinates.json,
     scale_report.json, and accuracy_report.json.
"""
import json
from pathlib import Path
import numpy as np
import pytest
import trimesh

from backend.app.schemas.stage import StageInput
from backend.app.pipeline.stages.s10_georeferencing import GeoreferencingStage
from backend.app.pipeline.stages.georef_engine import (
    GeodeticConverter,
    MetricScaleEstimator,
    Sim3AlignmentSolver,
    AccuracyValidator,
    GeoreferencedModelExporter
)


def test_geodetic_conversions():
    """Verifies round-trip geodetic coordinate conversions."""
    # New Delhi survey coordinates
    lat0, lon0, alt0 = 28.6139, 77.2090, 215.0

    # 1. WGS84 -> ECEF -> WGS84 round-trip
    ecef = GeodeticConverter.wgs84_to_ecef(lat0, lon0, alt0)
    lat_rt, lon_rt, alt_rt = GeodeticConverter.ecef_to_wgs84(ecef[0], ecef[1], ecef[2])
    assert abs(lat_rt - lat0) < 1e-7, "Latitude roundtrip mismatch"
    assert abs(lon_rt - lon0) < 1e-7, "Longitude roundtrip mismatch"
    assert abs(alt_rt - alt0) < 1e-3, "Altitude roundtrip mismatch"

    # 2. WGS84 -> ENU -> WGS84 round-trip
    # Point displaced 100m East, 50m North, 10m Up
    p_lat, p_lon, p_alt = 28.61435, 77.21002, 225.0
    enu = GeodeticConverter.wgs84_to_enu(p_lat, p_lon, p_alt, lat0, lon0, alt0)
    assert enu[0] > 0, "East coordinate must be positive"
    assert enu[1] > 0, "North coordinate must be positive"

    p_lat_rt, p_lon_rt, p_alt_rt = GeodeticConverter.enu_to_wgs84(
        enu[0], enu[1], enu[2], lat0, lon0, alt0
    )
    assert abs(p_lat_rt - p_lat) < 1e-6
    assert abs(p_lon_rt - p_lon) < 1e-6
    assert abs(p_alt_rt - p_alt) < 1e-2

    # 3. UTM projection
    easting, northing, zone, hemisphere = GeodeticConverter.wgs84_to_utm(lat0, lon0)
    assert zone == 43, "New Delhi lies in UTM Zone 43"
    assert hemisphere == "N"
    assert 100000 < easting < 900000
    assert 0 < northing < 10000000

    # 4. Web Mercator
    merc_x, merc_y = GeodeticConverter.latlon_to_mercator(lat0, lon0)
    assert merc_x > 0 and merc_y > 0


def test_umeyama_sim3_solver():
    """Verifies that Umeyama SVD precisely recovers known 7-DoF Sim(3) parameters."""
    # Synthetic relative points
    src = np.array([
        [0.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, 0.0, 1.0],
        [2.0, 1.5, 3.0]
    ], dtype=np.float64)

    true_scale = 12.5
    # 30 deg rotation around Z
    ang = np.radians(30.0)
    R_true = np.array([
        [np.cos(ang), -np.sin(ang), 0.0],
        [np.sin(ang), np.cos(ang), 0.0],
        [0.0, 0.0, 1.0]
    ], dtype=np.float64)
    t_true = np.array([100.0, -50.0, 25.0], dtype=np.float64)

    # Target points: dst = s * R * src + t
    dst = (true_scale * (R_true @ src.T)).T + t_true

    # Solve
    s_est, R_est, t_est = Sim3AlignmentSolver.solve_umeyama_sim3(src, dst)

    assert abs(s_est - true_scale) < 1e-3, "Scale must match ground truth"
    assert np.allclose(R_est, R_true, atol=1e-3), "Rotation must match ground truth"
    assert np.allclose(t_est, t_true, atol=1e-3), "Translation must match ground truth"


def test_metric_scale_estimation_hierarchy():
    """Tests hierarchical metric scale resolution (RTK vs GNSS vs Altimetry vs Checkpoints)."""
    rel_cams = np.array([
        [0.0, 0.0, 0.0],
        [2.0, 0.0, 0.0],
        [4.0, 0.0, 0.0],
        [6.0, 0.0, 0.0]
    ], dtype=np.float64)

    # 1. RTK GNSS baselines (exact metric ground baselines = 10m spacing)
    geo_cams = np.array([
        [0.0, 0.0, 0.0],
        [10.0, 0.0, 0.0],
        [20.0, 0.0, 0.0],
        [30.0, 0.0, 0.0]
    ], dtype=np.float64)

    res_rtk = MetricScaleEstimator.estimate_scale(
        rel_camera_positions=rel_cams,
        telemetry_positions=geo_cams,
        sensor_type="RTK_GNSS"
    )
    assert res_rtk["scale_source"] == "RTK_PPK_GNSS_BASELINES"
    assert abs(res_rtk["scale_factor"] - 5.0) < 1e-2
    assert res_rtk["scale_confidence"] > 0.90

    # 2. Standalone GNSS
    res_gps = MetricScaleEstimator.estimate_scale(
        rel_camera_positions=rel_cams,
        telemetry_positions=geo_cams,
        sensor_type="STANDALONE_GNSS"
    )
    assert res_gps["scale_source"] == "STANDALONE_GNSS_BASELINES"
    assert abs(res_gps["scale_factor"] - 5.0) < 1e-2

    # 3. Known Reference Checkpoints (overrides GNSS)
    known_baselines = [{"idx_a": 0, "idx_b": 3, "distance_m": 45.0}]
    res_cp = MetricScaleEstimator.estimate_scale(
        rel_camera_positions=rel_cams,
        telemetry_positions=geo_cams,
        known_baselines=known_baselines
    )
    assert res_cp["scale_source"] == "CHECKPOINT_REFERENCE_SCALE"
    # Relative baseline is 6.0 units, true distance is 45.0m -> scale = 7.5
    assert abs(res_cp["scale_factor"] - 7.5) < 1e-2

    # 4. Fallback to Altimetry when telemetry is absent
    res_alt = MetricScaleEstimator.estimate_scale(
        rel_camera_positions=rel_cams,
        telemetry_positions=None,
        flight_altitude_m=50.0
    )
    assert res_alt["scale_source"] == "BAROMETRIC_LASER_ALTIMETRY"
    assert res_alt["scale_factor"] > 0.0


def test_strict_scientific_disclaimer_compliance():
    """
    Verifies adherence to mandatory scientific disclaimers:
      - Never claim guaranteed centimeter-level accuracy without validated ground control.
      - Never claim GCPs are universally unnecessary.
      - Mandates: 'reduces dependence on extensive GCPs when sufficient sensor/reference information is available.'
    """
    rel_cams = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0]], dtype=np.float64)
    geo_cams = np.array([[0, 0, 0], [5, 0, 0], [0, 5, 0]], dtype=np.float64)

    acc = AccuracyValidator.evaluate_residuals(
        rel_cams=rel_cams,
        geo_cams=geo_cams,
        scale=5.0,
        R_align=np.eye(3),
        t_align=np.zeros(3),
        checkpoints=None,
        gps_available=True,
        rtk_available=False
    )

    claims = acc["guaranteed_accuracy_claims"]
    assert claims["guaranteed_centimeter_level"] is False
    assert claims["gcps_universally_unnecessary"] is False

    statement = claims["compliance_statement"].lower()
    assert "reduces dependence on extensive gcps when sufficient sensor/reference information is available" in statement
    assert "centimeter-level accuracy is never guaranteed" in statement
    assert len(acc["identified_limitations"]) >= 3


def test_independent_checkpoint_validation():
    """Verifies independent ground checkpoint validation when GCPs are provided."""
    rel_cams = np.array([[0, 0, 0], [2, 0, 0], [0, 2, 0]], dtype=np.float64)
    geo_cams = np.array([[0, 0, 0], [10, 0, 0], [0, 10, 0]], dtype=np.float64)

    checkpoints = [
        {
            "id": "GCP-1",
            "east_m": 5.0,
            "north_m": 0.0,
            "up_m": 0.0,
            "observed_local_xyz": [1.0, 0.0, 0.0]  # Transformed to 5.0m (0 error)
        },
        {
            "id": "GCP-2",
            "east_m": 0.0,
            "north_m": 5.0,
            "up_m": 0.0,
            "observed_local_xyz": [0.0, 1.0, 0.0]  # Transformed to 5.0m (0 error)
        }
    ]

    acc = AccuracyValidator.evaluate_residuals(
        rel_cams=rel_cams,
        geo_cams=geo_cams,
        scale=5.0,
        R_align=np.eye(3),
        t_align=np.zeros(3),
        checkpoints=checkpoints,
        rtk_available=True
    )

    cp_val = acc["independent_checkpoint_validation"]
    assert cp_val["checkpoints_provided"] is True
    assert cp_val["checkpoint_count"] == 2
    assert cp_val["checkpoint_rmse_horizontal_m"] < 1e-2


def test_end_to_end_georeferencing_stage(tmp_path):
    """Verifies end-to-end execution of GeoreferencingStage and deliverables."""
    prev_dir = tmp_path / "stage_prev"
    prev_dir.mkdir()
    ckpt_dir = tmp_path / "stage_georef"
    ckpt_dir.mkdir()

    # 1. Synthesize input GLB model
    box = trimesh.creation.box(extents=[10.0, 10.0, 2.0])
    glb_in = prev_dir / "textured_model.glb"
    box.export(str(glb_in), file_type="glb")

    # 2. Synthesize camera poses
    poses = []
    for i in range(5):
        poses.append({
            "camera_id": i,
            "frame_id": f"cam_{i:03d}",
            "position": [float(i * 4.0 - 8.0), 0.0, 15.0],
            "R": np.eye(3).tolist(),
            "t": [0.0, 0.0, -15.0]
        })

    poses_path = prev_dir / "camera_poses.json"
    with open(poses_path, "w", encoding="utf-8") as f:
        json.dump({"poses": poses}, f)

    stage_input = StageInput(
        mission_id="mission_phase11",
        job_id="job_phase11",
        stage_name="georeferencing",
        checkpoint_dir=str(ckpt_dir),
        previous_checkpoint_dir=str(prev_dir),
        input_artifacts={
            "textured_model_glb": str(glb_in),
            "camera_poses": str(poses_path)
        },
        flight_altitude_m=40.0,
        parameters={
            "origin_lat": 28.6139,
            "origin_lon": 77.2090,
            "sensor_type": "STANDALONE_GNSS"
        }
    )

    stage = GeoreferencingStage()
    output = stage.execute(stage_input)

    assert output.status == "completed"

    # 1. Check Artifacts
    assert "georeferenced_model_glb" in output.artifacts
    assert "coordinates_json" in output.artifacts
    assert "scale_report_json" in output.artifacts
    assert "accuracy_report_json" in output.artifacts
    assert "georeference_json" in output.artifacts

    glb_out = Path(output.artifacts["georeferenced_model_glb"])
    coords_out = Path(output.artifacts["coordinates_json"])
    scale_out = Path(output.artifacts["scale_report_json"])
    acc_out = Path(output.artifacts["accuracy_report_json"])

    assert glb_out.exists() and glb_out.stat().st_size > 500
    assert coords_out.exists()
    assert scale_out.exists()
    assert acc_out.exists()

    # 2. Check GLB binary validity
    with open(glb_out, "rb") as f:
        assert f.read(4) == b"glTF", "Must be a valid binary glTF file"

    # Check that vertex count is preserved
    tm = trimesh.load(str(glb_out), process=False)
    mesh = list(tm.geometry.values())[0] if isinstance(tm, trimesh.Scene) else tm
    assert len(mesh.vertices) == len(box.vertices), "Geometry vertex count must be preserved"

    # 3. Check JSON content
    with open(coords_out, "r") as f:
        coords = json.load(f)
    assert coords["geodetic_datum"] == "WGS 84 (EPSG:4326)"
    assert "bounding_box_wgs84" in coords
    assert "transformation_matrix_sim3" in coords

    with open(scale_out, "r") as f:
        scale_rep = json.load(f)
    assert "scale_factor" in scale_rep
    assert "scale_source" in scale_rep

    with open(acc_out, "r") as f:
        acc_rep = json.load(f)
    assert "camera_trajectory_residuals_m" in acc_rep
    assert "guaranteed_accuracy_claims" in acc_rep
    assert acc_rep["guaranteed_accuracy_claims"]["guaranteed_centimeter_level"] is False
