"""
Stage 11: Metric Scale and Georeferencing (Phase 11).

Converts relative 3D reconstructions into metrically meaningful and geographically aligned 3D models.

Key Pipeline Steps:
  STEP 1: Ingest relative 3D geometry and relative camera trajectory.
  STEP 2: Estimate scale using available metric constraints (RTK/PPK, Standalone GNSS, Altimetry, Checkpoints).
  STEP 3: Align reconstruction with geographic coordinates via 7-DoF Sim(3) Umeyama SVD.
  STEP 4: Refine trajectory and transform geometry into georeferenced_model.glb.
  STEP 5: Validate against independent ground checkpoints and evaluate trajectory residuals.

Separation of Concepts:
  - Scale (scale_report.json)
  - Coordinate Alignment (coordinates.json)
  - Geographic Position (coordinates.json)
  - Reconstruction Accuracy (accuracy_report.json)

Strict Scientific Compliance:
  Never claim guaranteed centimeter-level accuracy without validated ground control.
  Never claim GCPs are universally unnecessary.
  "Reduces dependence on extensive GCPs when sufficient sensor/reference information is available."
"""
import json
import logging
import time
from pathlib import Path
from typing import Dict, Any, List

import numpy as np

from backend.app.pipeline.base import BaseStage, StageExecutionError
from backend.app.schemas.stage import StageInput, StageOutput
from backend.app.pipeline.stages.georef_engine import GeoreferenceEngine

logger = logging.getLogger("uav_reconstruction.stage.georeference")


class GeoreferencingStage(BaseStage):
    stage_name = "georeferencing"
    stage_order = 11
    description = (
        "Phase 11: Converts relative reconstruction into a metrically scaled and geographically aligned "
        "3D model using GNSS telemetry, altimetry, or ground control constraints via Umeyama Sim(3) alignment."
    )

    def execute(self, input_data: StageInput) -> StageOutput:
        start_time = time.time()
        ckpt_dir = Path(input_data.checkpoint_dir)
        ckpt_dir.mkdir(parents=True, exist_ok=True)
        prev_dir = Path(input_data.previous_checkpoint_dir or input_data.checkpoint_dir)

        # ── 1. Resolve 3D Mesh Artifact (Phase 10 or Phase 9) ────────────
        mesh_path = (
            input_data.input_artifacts.get("textured_model_glb") or
            input_data.input_artifacts.get("model_glb") or
            input_data.input_artifacts.get("model_clean_ply") or
            input_data.input_artifacts.get("mesh_textured_obj") or
            input_data.input_artifacts.get("mesh_obj")
        )

        if not mesh_path or not Path(mesh_path).exists():
            for cname in [
                "textured_model.glb", "model.glb", "model_clean.ply",
                "mesh_textured.obj", "mesh.obj", "model_raw.ply"
            ]:
                cand = prev_dir / cname
                if cand.exists():
                    mesh_path = str(cand)
                    break

        if not mesh_path or not Path(mesh_path).exists():
            raise StageExecutionError(
                self.stage_name,
                "Missing input 3D model artifact (textured_model.glb or model_clean.ply)."
            )

        # ── 2. Resolve Camera Poses Artifact ─────────────────────────────
        poses_path = input_data.input_artifacts.get("camera_poses")
        if not poses_path or not Path(poses_path).exists():
            for cname in ["camera_poses.json", "trajectory.json"]:
                for search_dir in [prev_dir, prev_dir.parent / "texture_mapping", prev_dir.parent / "geometry"]:
                    cand = search_dir / cname
                    if cand.exists():
                        poses_path = str(cand)
                        break
                if poses_path and Path(poses_path).exists():
                    break

        if not poses_path or not Path(poses_path).exists():
            raise StageExecutionError(self.stage_name, "Missing camera_poses.json artifact.")

        # ── 3. Resolve Optional Telemetry File ───────────────────────────
        telemetry_path = (
            input_data.telemetry_path or
            input_data.input_artifacts.get("telemetry_path")
        )
        telemetry_file = Path(telemetry_path) if telemetry_path and Path(telemetry_path).exists() else None

        # ── 4. Execute Phase 11 Georeference Engine ─────────────────────
        try:
            results = GeoreferenceEngine.execute_pipeline(
                mesh_path=Path(mesh_path),
                poses_path=Path(poses_path),
                output_dir=ckpt_dir,
                flight_altitude_m=input_data.flight_altitude_m,
                parameters=input_data.parameters,
                telemetry_path=telemetry_file
            )
        except Exception as e:
            logger.error(f"GeoreferenceEngine failed: {e}", exc_info=True)
            raise StageExecutionError(self.stage_name, f"Georeferencing execution failed: {str(e)}")

        artifacts = results["artifacts"]
        coords = results["coordinates"]
        scale_rep = results["scale_report"]
        acc_rep = results["accuracy_report"]
        elapsed_sec = round(time.time() - start_time, 2)

        origin = coords["origin_datum"]
        traj_res = acc_rep["camera_trajectory_residuals_m"]

        return StageOutput(
            stage_name=self.stage_name,
            status="completed",
            checkpoint_dir=input_data.checkpoint_dir,
            artifacts=artifacts,
            metrics={
                "metric_scale_factor": scale_rep["scale_factor"],
                "scale_source": scale_rep["scale_source"],
                "geodetic_datum": coords["geodetic_datum"],
                "projected_crs": coords["projected_crs"],
                "origin_latitude_deg": origin["latitude_deg"],
                "origin_longitude_deg": origin["longitude_deg"],
                "origin_altitude_msl_m": origin["altitude_msl_m"],
                "trajectory_rmse_horizontal_m": traj_res["rmse_horizontal_m"],
                "trajectory_rmse_vertical_m": traj_res["rmse_vertical_m"],
                "trajectory_rmse_3d_m": traj_res["rmse_3d_m"],
                "circular_error_90_ce90_m": traj_res["circular_error_90_ce90_m"],
                "linear_error_90_le90_m": traj_res["linear_error_90_le90_m"],
                "independent_checkpoints_evaluated": acc_rep["independent_checkpoint_validation"]["checkpoints_provided"],
                "processing_time_sec": elapsed_sec,
                "compliance_statement": acc_rep["guaranteed_accuracy_claims"]["compliance_statement"]
            },
            summary=(
                f"Georeferenced 3D model to {coords['geodetic_datum']} ({origin['latitude_deg']:.4f}°N, {origin['longitude_deg']:.4f}°E) "
                f"using {scale_rep['scale_source']}. Horizontal RMSE: {traj_res['rmse_horizontal_m']:.2f}m, "
                f"Vertical RMSE: {traj_res['rmse_vertical_m']:.2f}m (CE90: {traj_res['circular_error_90_ce90_m']:.2f}m). "
                f"Reduces dependence on extensive GCPs when sufficient sensor/reference information is available."
            )
        )


def standalone_test():
    """
    Independently testable verification routine for Phase 11: Metric Scale and Georeferencing.
    """
    import tempfile
    import shutil
    import trimesh

    test_dir = Path(tempfile.mkdtemp(prefix="phase11_georef_test_"))
    try:
        prev_dir = test_dir / "texture_stage_checkpoint"
        prev_dir.mkdir(parents=True)
        ckpt_dir = test_dir / "georef_checkpoint"
        ckpt_dir.mkdir(parents=True)

        # 1. Synthesize 3D mesh model (box slab)
        box = trimesh.creation.box(extents=[10.0, 10.0, 2.0])
        mesh_glb_path = prev_dir / "textured_model.glb"
        box.export(str(mesh_glb_path), file_type="glb")

        # 2. Synthesize camera poses
        n_cams = 6
        poses = []
        for i in range(n_cams):
            pos = [float(i * 3.0 - 7.5), float((i % 2) * 4.0 - 2.0), 15.0]
            poses.append({
                "camera_id": i,
                "frame_id": f"cam_{i:03d}",
                "position": pos,
                "R": np.eye(3).tolist(),
                "t": [0.0, 0.0, -15.0]
            })

        poses_path = prev_dir / "camera_poses.json"
        with open(poses_path, "w", encoding="utf-8") as f:
            json.dump({"poses": poses}, f)

        stage_input = StageInput(
            mission_id="test_georef_mission",
            job_id="test_georef_job",
            stage_name="georeferencing",
            checkpoint_dir=str(ckpt_dir),
            previous_checkpoint_dir=str(prev_dir),
            input_artifacts={
                "textured_model_glb": str(mesh_glb_path),
                "camera_poses": str(poses_path)
            },
            flight_altitude_m=40.0,
            parameters={
                "origin_lat": 28.6139,
                "origin_lon": 77.2090,
                "sensor_type": "STANDALONE_GNSS",
                "checkpoints": [
                    {
                        "id": "GCP-1",
                        "east_m": 0.0,
                        "north_m": 0.0,
                        "up_m": 0.0,
                        "observed_local_xyz": [0.0, 0.0, 0.0]
                    }
                ]
            }
        )

        stage = GeoreferencingStage()
        print("[Standalone Test] Executing GeoreferencingStage (Phase 11)...")
        output = stage.execute(stage_input)

        assert output.status == "completed"

        # Check required artifacts
        glb_file = Path(output.artifacts["georeferenced_model_glb"])
        coords_file = Path(output.artifacts["coordinates_json"])
        scale_file = Path(output.artifacts["scale_report_json"])
        acc_file = Path(output.artifacts["accuracy_report_json"])
        legacy_file = Path(output.artifacts["georeference_json"])

        assert glb_file.exists() and glb_file.stat().st_size > 500, "georeferenced_model.glb must exist"
        assert coords_file.exists(), "coordinates.json must exist"
        assert scale_file.exists(), "scale_report.json must exist"
        assert acc_file.exists(), "accuracy_report.json must exist"
        assert legacy_file.exists(), "georeference.json must exist"

        # Check GLB binary validity
        with open(glb_file, "rb") as f:
            assert f.read(4) == b"glTF", "Must have valid glTF magic header"

        # Check accuracy report compliance statements
        with open(acc_file, "r") as f:
            acc_data = json.load(f)

        compliance_text = acc_data["guaranteed_accuracy_claims"]["compliance_statement"]
        assert "reduces dependence on extensive gcps when sufficient sensor/reference information is available" in compliance_text.lower()
        assert acc_data["guaranteed_accuracy_claims"]["guaranteed_centimeter_level"] is False
        assert acc_data["guaranteed_accuracy_claims"]["gcps_universally_unnecessary"] is False

        print(f"[Standalone Test] Success! Scale Source: {output.metrics['scale_source']}")
        print(f"Origin: {output.metrics['origin_latitude_deg']}°N, {output.metrics['origin_longitude_deg']}°E")
        print(f"Horizontal RMSE: {output.metrics['trajectory_rmse_horizontal_m']} m, Vertical RMSE: {output.metrics['trajectory_rmse_vertical_m']} m")
        print(f"Compliance: {output.metrics['compliance_statement']}")
    finally:
        shutil.rmtree(test_dir, ignore_errors=True)


if __name__ == "__main__":
    standalone_test()
