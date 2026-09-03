"""
Unit tests validating independent execution and strict input/output contracts
for all 11 reconstruction stages.
"""
from pathlib import Path
import json
import pytest

from backend.app.pipeline.stages import (
    PreprocessingStage,
    FrameQualityStage,
    KeyframeSelectionStage,
    DynamicMaskingStage,
    IlluminationPreprocessingStage,
    PoseEstimationStage,
    GeometryStage,
    DensePointCloudStage,
    MeshGenerationStage,
    TextureMappingStage,
    GeoreferencingStage,
    ConfidenceEstimationStage,
    ValidationStage,
)
from backend.app.schemas.stage import StageInput


def test_all_eleven_stages_contracts(sample_uav_video, tmp_path):
    artifacts_tracker = {}
    prev_dir = None

    # Common parameters
    job_id = "test-job-contract"
    mission_id = "test-mission-contract"

    # --- Stage 1: Preprocessing ---
    s1 = PreprocessingStage()
    s1_dir = tmp_path / "s01_preprocessing"
    s1_input = StageInput(
        job_id=job_id,
        mission_id=mission_id,
        stage_name=s1.stage_name,
        checkpoint_dir=str(s1_dir),
        video_path=sample_uav_video,
        parameters={"target_fps": 4.0, "max_dimension": 640, "apply_clahe": True}
    )
    s1_out = s1.run(s1_input)
    assert s1_out.status == "completed"
    assert "frames_dir" in s1_out.artifacts
    assert Path(s1_out.artifacts["frames_dir"]).exists()
    assert (s1_dir / "checkpoint.json").exists()
    artifacts_tracker.update(s1_out.artifacts)
    prev_dir = str(s1_dir)

    # --- Stage 2: Frame Quality ---
    s2 = FrameQualityStage()
    s2_dir = tmp_path / "s02_frame_quality"
    s2_input = StageInput(
        job_id=job_id,
        mission_id=mission_id,
        stage_name=s2.stage_name,
        checkpoint_dir=str(s2_dir),
        previous_checkpoint_dir=prev_dir,
        input_artifacts=artifacts_tracker,
        parameters={"min_sharpness_score": 50.0}
    )
    s2_out = s2.run(s2_input)
    assert s2_out.status == "completed"
    assert "quality_json" in s2_out.artifacts
    assert Path(s2_out.artifacts["quality_json"]).exists()
    artifacts_tracker.update(s2_out.artifacts)
    prev_dir = str(s2_dir)

    # --- Stage 3: Keyframe Selection ---
    s3 = KeyframeSelectionStage()
    s3_dir = tmp_path / "s03_keyframe_selection"
    s3_input = StageInput(
        job_id=job_id,
        mission_id=mission_id,
        stage_name=s3.stage_name,
        checkpoint_dir=str(s3_dir),
        previous_checkpoint_dir=prev_dir,
        input_artifacts=artifacts_tracker,
        parameters={"min_translation_pixels": 15.0}
    )
    s3_out = s3.run(s3_input)
    assert s3_out.status == "completed"
    assert "keyframes_manifest" in s3_out.artifacts
    assert Path(s3_out.artifacts["keyframes_manifest"]).exists()
    artifacts_tracker.update(s3_out.artifacts)
    prev_dir = str(s3_dir)

    # --- Stage 4: Dynamic Masking ---
    s4_dyn = DynamicMaskingStage()
    s4_dyn_dir = tmp_path / "s04_dynamic_masking"
    s4_dyn_input = StageInput(
        job_id=job_id,
        mission_id=mission_id,
        stage_name=s4_dyn.stage_name,
        checkpoint_dir=str(s4_dyn_dir),
        previous_checkpoint_dir=prev_dir,
        input_artifacts=artifacts_tracker,
        parameters={"confidence_threshold": 0.35}
    )
    s4_dyn_out = s4_dyn.run(s4_dyn_input)
    assert s4_dyn_out.status == "completed"
    assert "dynamic_objects_json" in s4_dyn_out.artifacts
    assert "static_scene_dir" in s4_dyn_out.artifacts
    assert Path(s4_dyn_out.artifacts["dynamic_objects_json"]).exists()
    artifacts_tracker.update(s4_dyn_out.artifacts)
    prev_dir = str(s4_dyn_dir)

    # --- Stage 5: Illumination-Aware Preprocessing ---
    s5_illum = IlluminationPreprocessingStage()
    s5_illum_dir = tmp_path / "s05_illumination_preprocessing"
    s5_illum_input = StageInput(
        job_id=job_id,
        mission_id=mission_id,
        stage_name=s5_illum.stage_name,
        checkpoint_dir=str(s5_illum_dir),
        previous_checkpoint_dir=prev_dir,
        input_artifacts=artifacts_tracker,
        parameters={"mode": "normalized"}
    )
    s5_illum_out = s5_illum.run(s5_illum_input)
    assert s5_illum_out.status == "completed"
    assert "illumination_json" in s5_illum_out.artifacts
    assert "normalized_dir" in s5_illum_out.artifacts
    assert Path(s5_illum_out.artifacts["illumination_json"]).exists()
    artifacts_tracker.update(s5_illum_out.artifacts)
    prev_dir = str(s5_illum_dir)

    # --- Stage 6: Pose Estimation ---
    s4 = PoseEstimationStage()
    s4_dir = tmp_path / "s06_pose_estimation"
    s4_input = StageInput(
        job_id=job_id,
        mission_id=mission_id,
        stage_name=s4.stage_name,
        checkpoint_dir=str(s4_dir),
        previous_checkpoint_dir=prev_dir,
        input_artifacts=artifacts_tracker,
        focal_length_mm=24.0,
        sensor_width_mm=35.9,
        flight_altitude_m=40.0,
        parameters={"feature_detector": "SIFT", "n_features": 1000, "use_normalized": True}
    )
    s4_out = s4.run(s4_input)
    assert s4_out.status == "completed"
    assert "trajectory_json" in s4_out.artifacts
    assert "camera_poses" in s4_out.artifacts
    assert Path(s4_out.artifacts["trajectory_json"]).exists()
    assert Path(s4_out.artifacts["camera_poses"]).exists()
    artifacts_tracker.update(s4_out.artifacts)
    prev_dir = str(s4_dir)

    # --- Stage 5: Geometry ---
    s5 = GeometryStage()
    s5_dir = tmp_path / "s05_geometry"
    s5_input = StageInput(
        job_id=job_id,
        mission_id=mission_id,
        stage_name=s5.stage_name,
        checkpoint_dir=str(s5_dir),
        previous_checkpoint_dir=prev_dir,
        input_artifacts=artifacts_tracker,
        parameters={"max_reprojection_error_px": 5.0}
    )
    s5_out = s5.run(s5_input)
    assert s5_out.status == "completed"
    assert "sparse_point_cloud_ply" in s5_out.artifacts
    assert "sparse_ply" in s5_out.artifacts
    assert "camera_poses" in s5_out.artifacts
    assert "feature_matches" in s5_out.artifacts
    assert "reconstruction_metrics" in s5_out.artifacts
    assert Path(s5_out.artifacts["sparse_point_cloud_ply"]).exists()
    assert Path(s5_out.artifacts["camera_poses"]).exists()
    assert Path(s5_out.artifacts["feature_matches"]).exists()
    assert Path(s5_out.artifacts["reconstruction_metrics"]).exists()
    artifacts_tracker.update(s5_out.artifacts)
    prev_dir = str(s5_dir)

    # --- Stage 6: Dense Point Cloud ---
    s6 = DensePointCloudStage()
    s6_dir = tmp_path / "s06_dense_point_cloud"
    s6_input = StageInput(
        job_id=job_id,
        mission_id=mission_id,
        stage_name=s6.stage_name,
        checkpoint_dir=str(s6_dir),
        previous_checkpoint_dir=prev_dir,
        input_artifacts=artifacts_tracker,
        flight_altitude_m=40.0,
        parameters={"num_disparities": 32, "block_size": 5}
    )
    s6_out = s6.run(s6_input)
    assert s6_out.status == "completed"
    assert "dense_point_cloud_ply" in s6_out.artifacts
    assert "dense_ply" in s6_out.artifacts
    assert "depth_maps_dir" in s6_out.artifacts
    assert "dense_confidence_dir" in s6_out.artifacts
    assert "dense_metrics" in s6_out.artifacts
    assert Path(s6_out.artifacts["dense_point_cloud_ply"]).exists()
    assert Path(s6_out.artifacts["dense_ply"]).exists()
    assert Path(s6_out.artifacts["depth_maps_dir"]).exists()
    assert Path(s6_out.artifacts["dense_confidence_dir"]).exists()
    assert Path(s6_out.artifacts["dense_metrics"]).exists()
    artifacts_tracker.update(s6_out.artifacts)
    prev_dir = str(s6_dir)

    # --- Stage 7: Mesh Generation ---
    s7 = MeshGenerationStage()
    s7_dir = tmp_path / "s07_mesh_generation"
    s7_input = StageInput(
        job_id=job_id,
        mission_id=mission_id,
        stage_name=s7.stage_name,
        checkpoint_dir=str(s7_dir),
        previous_checkpoint_dir=prev_dir,
        input_artifacts=artifacts_tracker,
        parameters={"max_edge_length_meters": 15.0}
    )
    s7_out = s7.run(s7_input)
    assert s7_out.status == "completed"
    assert "mesh_obj" in s7_out.artifacts
    assert Path(s7_out.artifacts["mesh_obj"]).exists()
    artifacts_tracker.update(s7_out.artifacts)
    prev_dir = str(s7_dir)

    # --- Stage 8: Texture Mapping ---
    s8 = TextureMappingStage()
    s8_dir = tmp_path / "s08_texture_mapping"
    s8_input = StageInput(
        job_id=job_id,
        mission_id=mission_id,
        stage_name=s8.stage_name,
        checkpoint_dir=str(s8_dir),
        previous_checkpoint_dir=prev_dir,
        input_artifacts=artifacts_tracker,
        parameters={"atlas_resolution": 512}
    )
    s8_out = s8.run(s8_input)
    assert s8_out.status == "completed"
    assert "mesh_textured_obj" in s8_out.artifacts
    assert "material_mtl" in s8_out.artifacts
    assert "texture_atlas_png" in s8_out.artifacts
    artifacts_tracker.update(s8_out.artifacts)
    prev_dir = str(s8_dir)

    # --- Stage 9: Georeferencing ---
    s9 = GeoreferencingStage()
    s9_dir = tmp_path / "s09_georeferencing"
    s9_input = StageInput(
        job_id=job_id,
        mission_id=mission_id,
        stage_name=s9.stage_name,
        checkpoint_dir=str(s9_dir),
        previous_checkpoint_dir=prev_dir,
        input_artifacts=artifacts_tracker,
        flight_altitude_m=40.0,
        parameters={"origin_lat": 28.6139, "origin_lon": 77.2090}
    )
    s9_out = s9.run(s9_input)
    assert s9_out.status == "completed"
    assert "georeference_json" in s9_out.artifacts
    artifacts_tracker.update(s9_out.artifacts)
    prev_dir = str(s9_dir)

    # --- Stage 10: Confidence Estimation ---
    s10 = ConfidenceEstimationStage()
    s10_dir = tmp_path / "s10_confidence_estimation"
    s10_input = StageInput(
        job_id=job_id,
        mission_id=mission_id,
        stage_name=s10.stage_name,
        checkpoint_dir=str(s10_dir),
        previous_checkpoint_dir=prev_dir,
        input_artifacts=artifacts_tracker,
        flight_altitude_m=40.0
    )
    s10_out = s10.run(s10_input)
    assert s10_out.status == "completed"
    assert "confidence_ply" in s10_out.artifacts
    artifacts_tracker.update(s10_out.artifacts)
    prev_dir = str(s10_dir)

    # --- Stage 11: Validation ---
    s11 = ValidationStage()
    s11_dir = tmp_path / "s11_validation"
    s11_input = StageInput(
        job_id=job_id,
        mission_id=mission_id,
        stage_name=s11.stage_name,
        checkpoint_dir=str(s11_dir),
        previous_checkpoint_dir=prev_dir,
        input_artifacts=artifacts_tracker,
        flight_altitude_m=40.0,
        focal_length_mm=24.0,
        sensor_width_mm=35.9,
        target_gsd_cm=2.0
    )
    s11_out = s11.run(s11_input)
    assert s11_out.status == "completed"
    assert "quality_report_json" in s11_out.artifacts
    with open(s11_out.artifacts["quality_report_json"], "r") as f:
        rep = json.load(f)
        assert "validation_status" in rep
        assert rep["validation_status"] in ("PASSED", "WARNING")
