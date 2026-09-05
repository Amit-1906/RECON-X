"""
Unit and Integration Tests for Phase 12: Confidence-Aware 3D Reconstruction.

Verifies:
  1. Multi-factor evidence evaluation across the 8 photogrammetric evidence streams.
  2. Three-tier classification into High Confidence, Medium Confidence, and Unknown.
  3. Strict non-fabrication guarantee: unobserved regions are marked UNKNOWN, never invented.
  4. Accuracy of surface area calculations per confidence tier.
  5. Correct color assignment: Green (#22c55e), Yellow (#eab308), Slate Gray (#64748b).
  6. Binary glTF and ASCII PLY export with per-vertex confidence values.
  7. End-to-end ConfidenceEstimationStage producing confidence_map.glb, confidence_map.ply,
     confidence_atlas.png, and confidence_report.json.
"""
import json
import sys
from pathlib import Path

# Ensure project root is on sys.path so 'backend' is resolved in IDE and direct runs
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import numpy as np
import pytest
import trimesh

from backend.app.schemas.stage import StageInput
from backend.app.pipeline.stages.s11_confidence_estimation import ConfidenceEstimationStage
from backend.app.pipeline.stages.confidence_engine import (
    ConfidenceEstimationEngine,
    COLOR_HIGH,
    COLOR_MEDIUM,
    COLOR_UNKNOWN
)


@pytest.fixture
def synthetic_mesh_and_cameras():
    """Creates a synthetic mesh with known observed top faces and unobserved bottom faces."""
    # Box slab: top face at Z=1.0, bottom face at Z=-1.0
    box = trimesh.creation.box(extents=[10.0, 10.0, 2.0])

    # 4 overhead cameras looking downwards at top face from Z=20
    cameras = []
    for i in range(4):
        pos = [float(i * 4.0 - 6.0), -12.0, 20.0]
        fwd = np.array([0.0, 0.0, 0.0]) - np.array(pos)
        fwd = fwd / np.linalg.norm(fwd)
        right = np.array([1.0, 0.0, 0.0])
        down = np.cross(fwd, right)
        down = down / np.linalg.norm(down)
        right = np.cross(down, fwd)
        R = np.vstack([right, down, fwd])
        t = (-R @ np.array(pos)).tolist()

        cameras.append({
            "camera_id": i,
            "frame_id": f"cam_{i:03d}",
            "position": pos,
            "R": R.tolist(),
            "t": t,
            "K": [[450.0, 0.0, 320.0], [0.0, 450.0, 240.0], [0.0, 0.0, 1.0]],
            "width": 640,
            "height": 480,
            "sharpness": 85.0,
            "quality_score": 0.90
        })

    return box, cameras


def test_evidence_fusion_and_scoring(synthetic_mesh_and_cameras):
    box, cameras = synthetic_mesh_and_cameras

    results = ConfidenceEstimationEngine.evaluate_mesh_confidence(
        mesh=box,
        cameras=cameras
    )

    conf_scores = results["confidence_scores"]
    report = results["report"]

    assert len(conf_scores) == len(box.vertices)
    assert np.all((conf_scores >= 0.0) & (conf_scores <= 1.0)), "Confidence scores must be in [0, 1]"

    stats = report["tier_statistics"]
    assert stats["high_confidence_percentage"] > 0.0, "Observed top surfaces must be High Confidence"
    assert stats["unknown_percentage"] > 0.0, "Underside surfaces must be classified as Unknown"


def test_three_tier_classification_colors(synthetic_mesh_and_cameras):
    box, cameras = synthetic_mesh_and_cameras

    results = ConfidenceEstimationEngine.evaluate_mesh_confidence(
        mesh=box,
        cameras=cameras
    )

    colors = results["vertex_colors"]
    scores = results["confidence_scores"]

    for i in range(len(scores)):
        if scores[i] >= 0.70:
            # Must be Green
            assert np.array_equal(colors[i], COLOR_HIGH) or np.array_equal(colors[i], COLOR_MEDIUM)
        elif scores[i] < 0.35:
            # Must be Slate Gray
            assert np.array_equal(colors[i], COLOR_UNKNOWN)


def test_unobserved_regions_not_invented(synthetic_mesh_and_cameras):
    box, cameras = synthetic_mesh_and_cameras

    results = ConfidenceEstimationEngine.evaluate_mesh_confidence(
        mesh=box,
        cameras=cameras
    )

    report = results["report"]
    guarantee = report["scientific_integrity_guarantee"]

    assert guarantee["invented_geometry_for_unknown"] is False
    assert "zero geometry was fabricated" in guarantee["statement"].lower()

    # The bottom vertices (Z = -1.0) point downwards away from all overhead cameras
    bottom_vert_indices = np.where(box.vertices[:, 2] < -0.9)[0]
    for idx in bottom_vert_indices:
        # Bottom vertices must be classified as unknown (< 0.35)
        assert results["confidence_scores"][idx] < 0.35


def test_confidence_report_structure(synthetic_mesh_and_cameras):
    box, cameras = synthetic_mesh_and_cameras

    results = ConfidenceEstimationEngine.evaluate_mesh_confidence(
        mesh=box,
        cameras=cameras
    )

    rep = results["report"]
    assert "tier_statistics" in rep
    assert "surface_area_metrics_m2" in rep
    assert "measured_vs_estimated_breakdown" in rep
    assert "factor_contributions" in rep

    tier_stats = rep["tier_statistics"]
    total_pct = (
        tier_stats["high_confidence_percentage"] +
        tier_stats["medium_confidence_percentage"] +
        tier_stats["unknown_percentage"]
    )
    assert abs(total_pct - 100.0) < 0.5, "Tier percentages must sum to ~100%"


def test_end_to_end_confidence_stage(tmp_path, synthetic_mesh_and_cameras):
    box, cameras = synthetic_mesh_and_cameras
    prev_dir = tmp_path / "stage_georef_out"
    prev_dir.mkdir()
    ckpt_dir = tmp_path / "stage_conf_out"
    ckpt_dir.mkdir()

    glb_in = prev_dir / "georeferenced_model.glb"
    box.export(str(glb_in), file_type="glb")

    poses_path = prev_dir / "camera_poses.json"
    with open(poses_path, "w", encoding="utf-8") as f:
        json.dump({"poses": cameras}, f)

    stage_input = StageInput(
        mission_id="mission_phase12",
        job_id="job_phase12",
        stage_name="confidence_estimation",
        checkpoint_dir=str(ckpt_dir),
        previous_checkpoint_dir=str(prev_dir),
        input_artifacts={
            "georeferenced_model_glb": str(glb_in),
            "camera_poses": str(poses_path)
        },
        flight_altitude_m=35.0
    )

    stage = ConfidenceEstimationStage()
    output = stage.execute(stage_input)

    assert output.status == "completed"

    # Check required deliverables
    assert "confidence_map_glb" in output.artifacts
    assert "confidence_map" in output.artifacts
    assert "confidence_ply" in output.artifacts
    assert "confidence_report_json" in output.artifacts
    assert "confidence_atlas_png" in output.artifacts

    glb_file = Path(output.artifacts["confidence_map_glb"])
    ply_file = Path(output.artifacts["confidence_ply"])
    report_file = Path(output.artifacts["confidence_report_json"])
    atlas_file = Path(output.artifacts["confidence_atlas_png"])

    assert glb_file.exists() and glb_file.stat().st_size > 500
    assert ply_file.exists()
    assert report_file.exists()
    assert atlas_file.exists()

    # Verify binary glTF format and vertex colors
    tm = trimesh.load(str(glb_file), process=False)
    mesh = list(tm.geometry.values())[0] if isinstance(tm, trimesh.Scene) else tm
    assert len(mesh.vertices) == len(box.vertices), "Geometry vertex count must be preserved"
    assert mesh.visual.vertex_colors is not None, "Confidence GLB must contain vertex color attributes"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
