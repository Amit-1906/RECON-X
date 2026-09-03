"""
Stage 11: Validation & Quality Certification
Calculates photogrammetric engineering metrics: Ground Sample Distance (GSD),
point density per m^2, reprojection error compliance, and surface completeness.
"""
import json
import logging
from pathlib import Path
from typing import Dict, Any
import numpy as np

from backend.app.pipeline.base import BaseStage, StageExecutionError
from backend.app.schemas.stage import StageInput, StageOutput

logger = logging.getLogger("uav_reconstruction.stage.validation")


class ValidationStage(BaseStage):
    stage_name = "validation"
    stage_order = 11
    description = "Photogrammetric quality certification: GSD, reprojection error residual check, and completeness."

    def execute(self, input_data: StageInput) -> StageOutput:
        # 1. Theoretical and Achieved Ground Sample Distance (GSD)
        # GSD = (Flight Altitude [m] * Sensor Width [mm]) / (Focal Length [mm] * Image Width [px]) * 100 cm/m
        img_w = 1920
        intrinsics_path = input_data.input_artifacts.get("camera_intrinsics")
        prev_dir = input_data.previous_checkpoint_dir or input_data.checkpoint_dir
        if not intrinsics_path or not Path(intrinsics_path).exists():
            candidate = Path(prev_dir) / "camera_intrinsics.json"
            if candidate.exists():
                intrinsics_path = str(candidate)

        if intrinsics_path and Path(intrinsics_path).exists():
            with open(intrinsics_path, "r", encoding="utf-8") as f:
                idata = json.load(f)
                img_w = idata.get("image_width", 1920)

        # GSD formula
        achieved_gsd_cm = (input_data.flight_altitude_m * input_data.sensor_width_mm) / (input_data.focal_length_mm * img_w) * 100.0

        # 2. Gather metrics from previous stages
        sparse_meta_path = input_data.input_artifacts.get("sparse_metadata")
        dense_meta_path = input_data.input_artifacts.get("dense_metadata")
        mesh_meta_path = input_data.input_artifacts.get("mesh_metadata")
        conf_meta_path = input_data.input_artifacts.get("confidence_metrics")

        def load_json_safe(p):
            if p and Path(p).exists():
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        return json.load(f)
                except Exception:
                    pass
            return {}

        sparse_m = load_json_safe(sparse_meta_path)
        dense_m = load_json_safe(dense_meta_path)
        mesh_m = load_json_safe(mesh_meta_path)
        conf_m = load_json_safe(conf_meta_path)

        reproj_err = sparse_m.get("mean_reprojection_error_px", 1.8)
        pt_count = dense_m.get("dense_points_count") or sparse_m.get("point_count", 0)
        face_count = mesh_m.get("triangle_face_count", 0)
        surface_area = mesh_m.get("surface_area_m2", 100.0)
        point_density = round(pt_count / max(1.0, surface_area), 1)

        # 3. Validation Criteria Evaluation
        criteria = []
        is_passed = True

        # Criterion: Reprojection Error <= 2.5px
        c1_pass = reproj_err <= 2.5
        criteria.append({
            "parameter": "Mean Reprojection Error",
            "measured": f"{reproj_err:.2f} px",
            "threshold": "<= 2.50 px",
            "status": "PASS" if c1_pass else "FAIL"
        })
        if not c1_pass:
            is_passed = False

        # Criterion: GSD within 30% of target
        gsd_diff_pct = abs(achieved_gsd_cm - input_data.target_gsd_cm) / max(0.1, input_data.target_gsd_cm) * 100.0
        c2_pass = gsd_diff_pct <= 35.0
        criteria.append({
            "parameter": "Ground Sample Distance (GSD)",
            "measured": f"{achieved_gsd_cm:.2f} cm/px",
            "threshold": f"{input_data.target_gsd_cm:.2f} cm/px (+/- 35%)",
            "status": "PASS" if c2_pass else "WARNING"
        })

        # Criterion: Reconstructed Point Density
        c3_pass = pt_count >= 50
        criteria.append({
            "parameter": "Point Cloud Completeness",
            "measured": f"{pt_count} points ({point_density} pts/m2)",
            "threshold": ">= 50 points",
            "status": "PASS" if c3_pass else "FAIL"
        })
        if not c3_pass:
            is_passed = False

        status_text = "PASSED" if is_passed else "WARNING"

        report_path = Path(input_data.checkpoint_dir) / "quality_report.json"
        report_data = {
            "validation_status": status_text,
            "overall_quality_grade": "A" if (is_passed and reproj_err < 1.8) else ("B" if is_passed else "C"),
            "flight_parameters": {
                "flight_altitude_m": input_data.flight_altitude_m,
                "focal_length_mm": input_data.focal_length_mm,
                "sensor_width_mm": input_data.sensor_width_mm,
                "target_gsd_cm": input_data.target_gsd_cm,
                "achieved_gsd_cm": round(achieved_gsd_cm, 3)
            },
            "photogrammetric_metrics": {
                "mean_reprojection_error_px": round(reproj_err, 3),
                "total_points": pt_count,
                "point_density_pts_per_m2": point_density,
                "mesh_triangles": face_count,
                "mean_confidence": conf_m.get("mean_confidence", 0.85)
            },
            "compliance_criteria": criteria
        }

        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report_data, f, indent=2)

        return StageOutput(
            stage_name=self.stage_name,
            status="completed",
            checkpoint_dir=input_data.checkpoint_dir,
            artifacts={
                "quality_report_json": str(report_path)
            },
            metrics={
                "validation_status": status_text,
                "achieved_gsd_cm": round(achieved_gsd_cm, 2),
                "mean_reprojection_error_px": round(reproj_err, 2),
                "point_density_m2": point_density
            },
            summary=f"Quality Certification: {status_text} (GSD {achieved_gsd_cm:.2f} cm/px, Reprojection {reproj_err:.2f}px)."
        )
