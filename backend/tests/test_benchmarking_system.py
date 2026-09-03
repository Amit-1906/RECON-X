"""
Unit and Integration Tests for Phase 15: Reconstruction Validation and Benchmarking.

Verifies:
  1. ExperimentConfig reproducibility and parametric baseline vs pipeline definitions.
  2. BenchmarkEvaluator evaluates all 10 mandated photogrammetric metrics.
  3. Strict Non-Fabrication Rule:
     When ground truth is absent, scale & position error metrics are explicitly labeled 'unavailable'.
     When ground truth is provided, actual metric errors are calculated.
  4. ScientificReportGenerator produces valid JSON and multi-page vector PDF (benchmark_report.pdf).
  5. ValidationStage executes and emits benchmark artifacts.
  6. Results API endpoint /api/v1/results/{job_id}/benchmark.
"""
import json
from pathlib import Path
import pytest
from starlette.testclient import TestClient

from backend.app.main import app
from backend.app.pipeline.benchmark_engine import (
    ExperimentConfig,
    BenchmarkEvaluator,
    ScientificReportGenerator
)
from backend.app.pipeline.stages.s12_validation import ValidationStage
from backend.app.schemas.stage import StageInput


@pytest.fixture
def client():
    return TestClient(app)


def test_experiment_config_defaults():
    """Verifies ExperimentConfig serialization and parametric presets."""
    exp = ExperimentConfig(
        name="test_experiment",
        description="Ablation of keyframe selection and dynamic masking"
    )
    d = exp.to_dict()
    assert d["name"] == "test_experiment"
    assert "baseline_config" in d
    assert "pipeline_config" in d
    assert d["baseline_config"]["enable_dynamic_masking"] is False
    assert d["pipeline_config"]["enable_dynamic_masking"] is True
    assert d["ground_truth_reference_available"] is False


def test_benchmark_evaluator_all_10_metrics_without_ground_truth():
    """Verifies all 10 metrics are computed and non-fabrication rule is strictly observed."""
    evaluator = BenchmarkEvaluator()
    job_metrics = {
        "extracted_frames_count": 1200,
        "selected_keyframes_count": 180,
        "successful_image_registrations": 178,
        "mean_reprojection_error_px": 0.82,
        "dense_points_count": 310000,
        "triangle_face_count": 62000,
        "surface_area_m2": 1500.0,
        "mean_confidence": 0.86,
        "processing_time_seconds": 92.0,
        "rapid_model_time_seconds": 19.5
    }

    result = evaluator.evaluate(job_metrics)

    assert "metrics" in result
    metrics = result["metrics"]

    # Verify all 10 metrics
    expected_keys = [
        "1_frame_reduction",
        "2_registration_success",
        "3_reprojection_error",
        "4_point_cloud_density",
        "5_mesh_completeness",
        "6_confidence_distribution",
        "7_processing_time",
        "8_hardware_utilization",
        "9_scale_error",
        "10_georeferencing_error"
    ]
    for k in expected_keys:
        assert k in metrics, f"Missing metric {k}"

    # Strict non-fabrication verification
    assert metrics["9_scale_error"]["status"] == "unavailable"
    assert metrics["9_scale_error"]["pipeline"] == "unavailable"
    assert metrics["10_georeferencing_error"]["status"] == "unavailable"
    assert metrics["10_georeferencing_error"]["pipeline"] == "unavailable"

    # Frame reduction calculation
    assert result["summary"]["frame_reduction_percentage"] == 85.0


def test_benchmark_evaluator_with_ground_truth():
    """Verifies scale & position errors are calculated when ground truth reference is available."""
    gt = {
        "scale_target_m": 25.000,
        "measured_scale_m": 24.982,
        "checkpoints_rmse_m": 0.038
    }
    exp = ExperimentConfig(ground_truth_reference=gt)
    evaluator = BenchmarkEvaluator(exp)

    result = evaluator.evaluate({
        "extracted_frames_count": 800,
        "selected_keyframes_count": 120
    })

    metrics = result["metrics"]
    assert metrics["9_scale_error"]["status"] == "measured"
    assert "%" in metrics["9_scale_error"]["pipeline"]
    assert metrics["10_georeferencing_error"]["status"] == "measured"
    assert "0.038m RMSE" in metrics["10_georeferencing_error"]["pipeline"]


def test_scientific_report_generator_pdf_and_json(tmp_path):
    """Verifies benchmark_report.json and benchmark_report.pdf are properly generated."""
    evaluator = BenchmarkEvaluator()
    data = evaluator.evaluate({
        "extracted_frames_count": 1000,
        "selected_keyframes_count": 150,
        "mean_reprojection_error_px": 0.79
    })

    json_path = tmp_path / "benchmark_report.json"
    pdf_path = tmp_path / "benchmark_report.pdf"

    ScientificReportGenerator.generate_json_report(data, json_path)
    ScientificReportGenerator.generate_pdf_report(data, pdf_path)

    # Check JSON
    assert json_path.exists() and json_path.stat().st_size > 500
    with open(json_path, "r", encoding="utf-8") as f:
        loaded = json.load(f)
    assert loaded["summary"]["overall_verdict"] == "VALIDATED"

    # Check PDF
    assert pdf_path.exists() and pdf_path.stat().st_size > 10000
    with open(pdf_path, "rb") as f:
        header = f.read(5)
        assert header == b"%PDF-", "Must be a valid PDF document"


def test_validation_stage_generates_benchmark_artifacts(tmp_path):
    """Verifies that Stage 12 Validation executes and registers benchmark artifacts."""
    ckpt_dir = tmp_path / "validation_ckpt"
    ckpt_dir.mkdir(parents=True)

    stage_input = StageInput(
        mission_id="mission_bench_test",
        job_id="job_bench_test",
        stage_name="validation",
        checkpoint_dir=str(ckpt_dir),
        flight_altitude_m=50.0,
        focal_length_mm=24.0,
        sensor_width_mm=36.0,
        target_gsd_cm=2.5,
        parameters={
            "extracted_frames_count": 1250,
            "selected_keyframes_count": 184,
            "cameras_registered": 184
        }
    )

    stage = ValidationStage()
    output = stage.execute(stage_input)

    assert output.status == "completed"
    assert "benchmark_report_json" in output.artifacts
    assert "benchmark_report_pdf" in output.artifacts

    bench_json = Path(output.artifacts["benchmark_report_json"])
    bench_pdf = Path(output.artifacts["benchmark_report_pdf"])

    assert bench_json.exists()
    assert bench_pdf.exists()
    assert bench_pdf.stat().st_size > 10000


def test_results_api_benchmark_endpoint(client, tmp_path):
    """Verifies GET /api/v1/results/{job_id}/benchmark endpoint."""
    from backend.app.core.database import SessionLocal
    from backend.app.models.mission import Mission
    from backend.app.models.job import Job
    from backend.app.models.result import ArtifactRegistry

    db = SessionLocal()
    try:
        m = Mission(name="Bench API Test", flight_altitude_m=40.0, target_gsd_cm=2.0)
        db.add(m)
        db.commit()
        db.refresh(m)

        j = Job(mission_id=m.id, status="completed")
        db.add(j)
        db.commit()
        db.refresh(j)

        # Write dummy benchmark_report.json and register artifact
        bench_file = tmp_path / "benchmark_report.json"
        bench_data = {"summary": {"speedup_factor": "4.8x", "overall_verdict": "VALIDATED"}}
        bench_file.write_text(json.dumps(bench_data))

        art = ArtifactRegistry(
            job_id=j.id,
            stage_name="validation",
            artifact_type="benchmark_report_json",
            file_path=str(bench_file),
            file_size_bytes=bench_file.stat().st_size
        )
        db.add(art)
        db.commit()

        res = client.get(f"/api/v1/results/{j.id}/benchmark")
        assert res.status_code == 200
        data = res.json()
        assert data["summary"]["speedup_factor"] == "4.8x"
    finally:
        db.close()
