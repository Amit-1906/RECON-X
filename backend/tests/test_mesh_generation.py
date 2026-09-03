"""
Unit and Integration Tests for Phase 9: 3D Mesh Generation.
Verifies:
  1. PLY ingestion with confidence parsing.
  2. Point filtering (SOR and confidence thresholding).
  3. Surface normal estimation and viewpoint orientation.
  4. Surface reconstruction without bridging across unobserved voids ("Do not invent geometry").
  5. Mesh cleanup and isolated artifact component removal.
  6. Configurable mesh density decimation.
  7. End-to-end MeshGenerationStage producing model_raw.ply, model_clean.ply, model.glb,
     mesh.obj, and mesh_statistics.json.
  8. Preservation of spatial coordinates.
  9. Web 3D viewer GLB validity.
"""
import json
import tempfile
import shutil
from pathlib import Path
import numpy as np
import pytest

from backend.app.schemas.stage import StageInput
from backend.app.pipeline.stages.s08_mesh_generation import MeshGenerationStage
from backend.app.pipeline.stages.mesh_engine import (
    read_point_cloud_with_confidence,
    filter_points_and_confidence,
    estimate_normals,
    reconstruct_surface_alpha_tin,
    cleanup_mesh,
    prune_isolated_artifacts,
    decimate_mesh,
    compute_mesh_statistics,
    write_ply_mesh,
    write_glb_mesh
)


@pytest.fixture
def synthetic_point_cloud():
    """Generates a synthetic terrain surface with building and isolated noise."""
    np.random.seed(42)
    # Terrain (parabolic ground plane)
    n_terrain = 600
    tx = np.random.uniform(-8.0, 8.0, n_terrain)
    ty = np.random.uniform(-8.0, 8.0, n_terrain)
    tz = 0.02 * (tx ** 2 + ty ** 2) + np.random.normal(0, 0.02, n_terrain)
    t_conf = np.random.uniform(0.70, 0.95, n_terrain)
    t_clr = np.tile([90, 170, 100], (n_terrain, 1))

    # Structure (elevated roof)
    n_roof = 200
    rx = np.random.uniform(-2.5, 2.5, n_roof)
    ry = np.random.uniform(-2.5, 2.5, n_roof)
    rz = 3.5 + np.random.normal(0, 0.02, n_roof)
    r_conf = np.random.uniform(0.85, 0.98, n_roof)
    r_clr = np.tile([200, 110, 70], (n_roof, 1))

    # Low-confidence noise
    n_noise = 20
    nx = np.random.uniform(15.0, 20.0, n_noise)
    ny = np.random.uniform(15.0, 20.0, n_noise)
    nz = np.random.uniform(8.0, 12.0, n_noise)
    n_conf = np.random.uniform(0.05, 0.20, n_noise)
    n_clr = np.tile([255, 0, 0], (n_noise, 1))

    pts = np.vstack([np.column_stack([tx, ty, tz]), np.column_stack([rx, ry, rz]), np.column_stack([nx, ny, nz])]).astype(np.float32)
    clrs = np.vstack([t_clr, r_clr, n_clr]).astype(np.uint8)
    confs = np.concatenate([t_conf, r_conf, n_conf]).astype(np.float32)

    return pts, clrs, confs


def test_point_cloud_reading_with_confidence(tmp_path, synthetic_point_cloud):
    pts, clrs, confs = synthetic_point_cloud
    ply_file = tmp_path / "test_cloud.ply"

    # Write ASCII PLY with confidence property
    with open(ply_file, "w", encoding="utf-8") as f:
        f.write(
            f"ply\nformat ascii 1.0\nelement vertex {len(pts)}\n"
            f"property float x\nproperty float y\nproperty float z\n"
            f"property uchar red\nproperty uchar green\nproperty uchar blue\n"
            f"property float confidence\nend_header\n"
        )
        for i in range(len(pts)):
            p = pts[i]
            c = clrs[i]
            f.write(f"{p[0]:.4f} {p[1]:.4f} {p[2]:.4f} {c[0]} {c[1]} {c[2]} {confs[i]:.4f}\n")

    r_pts, r_clrs, r_confs = read_point_cloud_with_confidence(ply_file)
    assert len(r_pts) == len(pts)
    assert len(r_clrs) == len(clrs)
    assert len(r_confs) == len(confs)
    assert np.all(r_confs >= 0.0) and np.all(r_confs <= 1.0)
    assert np.allclose(r_pts[0], pts[0], atol=1e-3)


def test_point_filtering_sor_and_confidence(synthetic_point_cloud):
    pts, clrs, confs = synthetic_point_cloud

    f_pts, f_clrs, f_confs, inlier_mask = filter_points_and_confidence(
        points=pts,
        colors=clrs,
        confidences=confs,
        min_confidence=0.25,
        sor_k_neighbors=16,
        sor_std_ratio=2.5
    )

    # Low-confidence noise points must be pruned
    assert len(f_pts) < len(pts)
    assert np.all(f_confs >= 0.25)


def test_normal_estimation_and_viewpoint_orientation(synthetic_point_cloud):
    pts, _, _ = synthetic_point_cloud
    cams = [[0.0, -10.0, 25.0], [5.0, -10.0, 25.0]]

    normals, curvatures = estimate_normals(pts[:200], k_neighbors=12, camera_positions=cams)
    assert len(normals) == 200
    assert len(curvatures) == 200

    # Normals must be unit length
    mags = np.linalg.norm(normals, axis=1)
    assert np.allclose(mags, 1.0, atol=1e-3)

    # Aerial viewpoints: normals predominantly face upward (+Z)
    assert np.mean(normals[:, 2]) > 0.3


def test_surface_reconstruction_no_invented_geometry():
    """
    Verifies that the surface reconstruction does NOT invent geometry
    for completely unobserved surfaces or across empty voids.
    """
    # Create two disjoint clusters separated by a 20m empty void
    np.random.seed(123)
    c1_x = np.random.uniform(-10.0, -5.0, 100)
    c1_y = np.random.uniform(-2.0, 2.0, 100)
    c1_z = np.zeros(100)

    c2_x = np.random.uniform(15.0, 20.0, 100)
    c2_y = np.random.uniform(-2.0, 2.0, 100)
    c2_z = np.zeros(100)

    pts = np.vstack([np.column_stack([c1_x, c1_y, c1_z]), np.column_stack([c2_x, c2_y, c2_z])]).astype(np.float32)
    normals = np.tile([0.0, 0.0, 1.0], (len(pts), 1)).astype(np.float32)
    confs = np.full(len(pts), 0.85, dtype=np.float32)

    # Reconstruct with max_edge_length_m = 4.0 meters
    faces = reconstruct_surface_alpha_tin(pts, normals, confs, max_edge_length_m=4.0)

    # No face should span across the void between cluster 1 (< -5) and cluster 2 (> 15)
    for f in faces:
        p0, p1, p2 = pts[f[0]], pts[f[1]], pts[f[2]]
        e0 = np.linalg.norm(p1 - p0)
        e1 = np.linalg.norm(p2 - p1)
        e2 = np.linalg.norm(p0 - p2)
        # All edges must be within the maximum edge length
        assert max(e0, e1, e2) <= 4.0
        # No bridge triangle should have vertices in both clusters
        xs = [p0[0], p1[0], p2[0]]
        assert not (min(xs) < -4.0 and max(xs) > 10.0), "Disallowed: triangle invented across unobserved void!"


def test_mesh_cleanup_and_isolated_artifact_pruning():
    # Simple mesh with 1 large component (6 triangles) and 1 isolated floating triangle (1 triangle)
    verts = np.array([
        [0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0],
        [1.0, 1.0, 0.0], [2.0, 0.0, 0.0], [2.0, 1.0, 0.0],
        # Floating artifact
        [10.0, 10.0, 5.0], [11.0, 10.0, 5.0], [10.0, 11.0, 5.0]
    ], dtype=np.float32)

    faces = np.array([
        [0, 1, 2], [1, 3, 2], [1, 4, 3], [4, 5, 3],
        # Isolated artifact face
        [6, 7, 8]
    ], dtype=np.int32)

    clrs = np.tile([128, 128, 128], (len(verts), 1)).astype(np.uint8)
    confs = np.full(len(verts), 0.8, dtype=np.float32)
    normals = np.tile([0.0, 0.0, 1.0], (len(verts), 1)).astype(np.float32)

    c_v, c_f, c_c, c_cnf, c_n, pruned_count = prune_isolated_artifacts(
        vertices=verts,
        faces=faces,
        colors=clrs,
        confidences=confs,
        normals=normals,
        min_component_faces=3
    )

    assert pruned_count == 1
    assert len(c_f) == 4  # Only the 4 connected faces remain
    assert len(c_v) == 6  # 6 connected vertices


def test_configurable_mesh_density():
    # Create an icosphere or grid with many faces
    verts = []
    faces = []
    # 10x10 grid
    idx = 0
    for y in range(10):
        for x in range(10):
            verts.append([float(x), float(y), 0.0])
    for y in range(9):
        for x in range(9):
            i0 = y * 10 + x
            i1 = i0 + 1
            i2 = (y + 1) * 10 + x
            i3 = i2 + 1
            faces.append([i0, i1, i2])
            faces.append([i1, i3, i2])

    v_arr = np.array(verts, dtype=np.float32)
    f_arr = np.array(faces, dtype=np.int32)
    c_arr = np.tile([150, 150, 150], (len(v_arr), 1)).astype(np.uint8)
    cnf_arr = np.full(len(v_arr), 0.85, dtype=np.float32)
    n_arr = np.tile([0.0, 0.0, 1.0], (len(v_arr), 1)).astype(np.float32)

    orig_faces = len(f_arr)

    # Test "low" density decimation
    d_v, d_f, _, _, _ = decimate_mesh(v_arr, f_arr, c_arr, cnf_arr, n_arr, density_setting="low")
    assert len(d_f) < orig_faces, "Decimation must reduce face count for 'low' setting"

    # Test "high" density (no decimation)
    h_v, h_f, _, _, _ = decimate_mesh(v_arr, f_arr, c_arr, cnf_arr, n_arr, density_setting="high")
    assert len(h_f) == orig_faces, "High density setting should preserve all faces"


def test_end_to_end_mesh_generation_stage(tmp_path, synthetic_point_cloud):
    pts, clrs, confs = synthetic_point_cloud
    prev_dir = tmp_path / "dense_stage"
    prev_dir.mkdir(parents=True)
    stage_dir = tmp_path / "mesh_stage"
    stage_dir.mkdir(parents=True)

    dense_ply = prev_dir / "dense_point_cloud.ply"
    with open(dense_ply, "w", encoding="utf-8") as f:
        f.write(
            f"ply\nformat ascii 1.0\nelement vertex {len(pts)}\n"
            f"property float x\nproperty float y\nproperty float z\n"
            f"property uchar red\nproperty uchar green\nproperty uchar blue\n"
            f"property float confidence\nend_header\n"
        )
        for i in range(len(pts)):
            p = pts[i]
            c = clrs[i]
            f.write(f"{p[0]:.4f} {p[1]:.4f} {p[2]:.4f} {c[0]} {c[1]} {c[2]} {confs[i]:.4f}\n")

    # Camera trajectory
    poses = [{"position": [float(i * 4 - 8), -12.0, 22.0]} for i in range(5)]
    poses_path = prev_dir / "camera_poses.json"
    with open(poses_path, "w", encoding="utf-8") as f:
        json.dump({"poses": poses}, f)

    stage_input = StageInput(
        job_id="test_mesh_job",
        mission_id="test_mesh_mission",
        stage_name="mesh_generation",
        checkpoint_dir=str(stage_dir),
        previous_checkpoint_dir=str(prev_dir),
        input_artifacts={
            "dense_point_cloud_ply": str(dense_ply),
            "camera_poses": str(poses_path)
        },
        parameters={
            "max_edge_length_meters": 4.5,
            "min_point_confidence": 0.25,
            "mesh_density": "medium",
            "min_component_faces": 10
        }
    )

    stage = MeshGenerationStage()
    output = stage.execute(stage_input)

    assert output.status == "completed"

    # Verify All Required Output Deliverables
    assert "model_raw_ply" in output.artifacts
    assert "model_clean_ply" in output.artifacts
    assert "model_glb" in output.artifacts
    assert "mesh_obj" in output.artifacts
    assert "mesh_statistics" in output.artifacts
    assert "mesh_metadata" in output.artifacts

    raw_ply = Path(output.artifacts["model_raw_ply"])
    clean_ply = Path(output.artifacts["model_clean_ply"])
    model_glb = Path(output.artifacts["model_glb"])
    mesh_obj = Path(output.artifacts["mesh_obj"])
    stats_json = Path(output.artifacts["mesh_statistics"])
    meta_json = Path(output.artifacts["mesh_metadata"])

    assert raw_ply.exists() and raw_ply.stat().st_size > 0
    assert clean_ply.exists() and clean_ply.stat().st_size > 0
    assert model_glb.exists() and model_glb.stat().st_size > 0
    assert mesh_obj.exists() and mesh_obj.stat().st_size > 0
    assert stats_json.exists() and stats_json.stat().st_size > 0
    assert meta_json.exists() and meta_json.stat().st_size > 0

    # Verify GLB Header format
    with open(model_glb, "rb") as f:
        magic = f.read(4)
        assert magic == b"glTF", "Must have glTF 2.0 binary magic header"

    # Verify Statistics
    with open(stats_json) as f:
        stats = json.load(f)

    assert stats["vertices"] > 50
    assert stats["triangles"] > 50
    assert "bounding_box" in stats
    assert stats["surface_area_m2"] > 0
    assert "reconstruction_confidence" in stats
    assert "high_confidence_pct" in stats["reconstruction_confidence"]["distribution"]
    assert stats["spatial_coordinates_preserved"] is True

    # Check spatial coordinate preservation against original ground truth span
    bbox = stats["bounding_box"]
    assert bbox["min_coords"][0] < -5.0  # spans across [-8, 8]
    assert bbox["max_coords"][0] > 5.0
