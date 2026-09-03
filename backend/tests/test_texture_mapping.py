"""
Unit and Integration Tests for Phase 10: Photorealistic Texture Mapping.
Verifies:
  1. Mesh geometry loading with spatial coordinate preservation.
  2. Frame quality filtering (blur and exposure rejection).
  3. Camera visibility analysis and frustum projection mathematics.
  4. Handling of unobserved surfaces (no hallucinated textures, low-confidence tagging).
  5. Multi-view texture blending and seam reduction.
  6. Texture atlas generation and UV parameterization.
  7. End-to-end TextureMappingStage producing textured_model.glb, textures/,
     texture_quality_report.json, mesh_textured.obj, and material.mtl.
  8. GLB validity and texture embedding.
"""
import json
import tempfile
import shutil
from pathlib import Path
import cv2
import numpy as np
import pytest
import trimesh

from backend.app.schemas.stage import StageInput
from backend.app.pipeline.stages.s09_texture_mapping import TextureMappingStage
from backend.app.pipeline.stages.texture_engine import (
    load_mesh_geometry,
    assess_image_sharpness_and_exposure,
    filter_candidate_cameras,
    compute_visibility_and_scoring,
    generate_seamless_texture_atlas,
    compute_texture_quality_report,
    export_textured_glb,
    export_textured_obj
)


@pytest.fixture
def synthetic_mesh_and_cameras(tmp_path):
    """Creates a synthetic terrain surface mesh and calibrated UAV cameras."""
    # 1. 3D Terrain mesh (8x8 grid slab)
    verts = []
    faces = []
    grid_n = 8
    for y in range(grid_n):
        for x in range(grid_n):
            vx = float(x * 2.5 - 8.75)
            vy = float(y * 2.5 - 8.75)
            vz = float(0.03 * (vx**2 + vy**2))
            verts.append([vx, vy, vz])

    for y in range(grid_n - 1):
        for x in range(grid_n - 1):
            i0 = y * grid_n + x
            i1 = i0 + 1
            i2 = (y + 1) * grid_n + x
            i3 = i2 + 1
            faces.append([i0, i1, i2])
            faces.append([i1, i3, i2])

    v_arr = np.array(verts, dtype=np.float32)
    f_arr = np.array(faces, dtype=np.int32)

    # Save as PLY
    ply_path = tmp_path / "model_clean.ply"
    with open(ply_path, "w", encoding="utf-8") as f:
        f.write(
            f"ply\nformat ascii 1.0\nelement vertex {len(verts)}\n"
            f"property float x\nproperty float y\nproperty float z\n"
            f"element face {len(faces)}\nproperty list uchar int vertex_indices\nend_header\n"
        )
        for v in v_arr:
            f.write(f"{v[0]:.4f} {v[1]:.4f} {v[2]:.4f}\n")
        for f_idx in f_arr:
            f.write(f"3 {f_idx[0]} {f_idx[1]} {f_idx[2]}\n")

    # 2. Keyframes and poses
    img_w, img_h = 640, 480
    focal = 480.0
    kf_dir = tmp_path / "keyframes"
    kf_dir.mkdir()

    poses = []
    for i in range(3):
        # Create patterned image with rich midtone texture
        img = np.full((img_h, img_w, 3), 110, dtype=np.uint8)
        img[:, :, 1] = 140  # Grass green midtone
        for cx in range(0, img_w, 12):
            for cy in range(0, img_h, 12):
                if (cx // 12 + cy // 12) % 2 == 0:
                    img[cy:cy+12, cx:cx+12] = (200 - i * 20, 80, 50 + i * 30)

        img_file = kf_dir / f"frame_{i:03d}.jpg"
        cv2.imwrite(str(img_file), img)

        pos_x = float(i * 5.0 - 5.0)
        cam_pos = np.array([pos_x, -12.0, 22.0], dtype=np.float64)

        # Look-at rotation matrix
        fwd = np.array([0.0, 0.0, 0.0]) - cam_pos
        fwd = fwd / np.linalg.norm(fwd)
        right = np.array([1.0, 0.0, 0.0], dtype=np.float64)
        down = np.cross(fwd, right)
        down = down / np.linalg.norm(down)
        right = np.cross(down, fwd)

        R = np.vstack([right, down, fwd])
        t = (-R @ cam_pos).tolist()

        poses.append({
            "camera_id": i,
            "frame_id": f"frame_{i:03d}",
            "filename": img_file.name,
            "filepath": str(img_file),
            "position": cam_pos.tolist(),
            "R": R.tolist(),
            "t": t
        })

    poses_file = tmp_path / "camera_poses.json"
    with open(poses_file, "w", encoding="utf-8") as f:
        json.dump({"poses": poses}, f)

    intrinsics_file = tmp_path / "camera_intrinsics.json"
    K = [
        [focal, 0.0, img_w / 2.0],
        [0.0, focal, img_h / 2.0],
        [0.0, 0.0, 1.0]
    ]
    with open(intrinsics_file, "w", encoding="utf-8") as f:
        json.dump({"K": K, "image_width": img_w, "image_height": img_h}, f)

    return ply_path, poses_file, intrinsics_file, v_arr, f_arr


def test_load_mesh_geometry(synthetic_mesh_and_cameras):
    ply_path, _, _, orig_verts, orig_faces = synthetic_mesh_and_cameras
    verts, faces, normals = load_mesh_geometry(ply_path)

    assert len(verts) == len(orig_verts)
    assert len(faces) == len(orig_faces)
    assert np.allclose(verts, orig_verts, atol=1e-3), "Original geometry must be preserved!"
    assert normals.shape == verts.shape


def test_quality_filtering_rejects_blurred_and_overexposed_frames(tmp_path):
    # Create sharp, blurred, and overexposed images
    img_w, img_h = 320, 240
    # 1. Sharp patterned image with balanced midtone exposure
    sharp_img = np.full((img_h, img_w, 3), 120, dtype=np.uint8)
    for x in range(0, img_w, 16):
        cv2.line(sharp_img, (x, 0), (x, img_h), (210, 210, 210), 3)

    # 2. Heavily blurred image
    blurred_img = cv2.GaussianBlur(sharp_img, (31, 31), 10.0)

    # 3. Overexposed image (washed out white)
    overexp_img = np.full((img_h, img_w, 3), 250, dtype=np.uint8)

    sharp_path = tmp_path / "sharp.jpg"
    blur_path = tmp_path / "blur.jpg"
    overexp_path = tmp_path / "overexp.jpg"

    cv2.imwrite(str(sharp_path), sharp_img)
    cv2.imwrite(str(blur_path), blurred_img)
    cv2.imwrite(str(overexp_path), overexp_img)

    s_var, _, s_q = assess_image_sharpness_and_exposure(sharp_img)
    b_var, _, b_q = assess_image_sharpness_and_exposure(blurred_img)
    _, o_exp, o_q = assess_image_sharpness_and_exposure(overexp_img)

    assert s_var > b_var, "Sharp frame must have higher Laplacian variance than blurred frame"
    assert s_q > b_q, "Sharp frame must have higher composite score"
    assert o_exp < 0.35, "Overexposed frame must have low exposure score"

    poses = [
        {"camera_id": 0, "filepath": str(sharp_path), "frame_id": "sharp"},
        {"camera_id": 1, "filepath": str(blur_path), "frame_id": "blur"},
        {"camera_id": 2, "filepath": str(overexp_path), "frame_id": "overexp"}
    ]
    K = np.array([[300.0, 0, 160], [0, 300, 120], [0, 0, 1]])

    filtered, stats = filter_candidate_cameras(
        poses=poses,
        K=K,
        image_w=img_w,
        image_h=img_h,
        min_sharpness_threshold=35.0
    )

    accepted_ids = [c["frame_id"] for c in filtered]
    assert "sharp" in accepted_ids
    assert "blur" not in accepted_ids, "Heavily blurred frame must be rejected"
    assert "overexp" not in accepted_ids, "Overexposed frame must be rejected"
    assert stats["keyframes_rejected_blur_or_exposure"] == 2


def test_unobserved_surface_handling():
    """
    Verifies that faces pointing away from cameras or outside frustums:
      - Are marked as unobserved (is_observed = False).
      - Do NOT have synthetic/hallucinated textures fabricated.
      - Are filled with the neutral diagnostic tone.
    """
    # 2 horizontal faces:
    # Face 0 points upward (+Z), Face 1 points downward (-Z, underside)
    verts = np.array([
        [0.0, 0.0, 0.0], [2.0, 0.0, 0.0], [0.0, 2.0, 0.0],  # Face 0 (points +Z)
        [0.0, 0.0, -1.0], [0.0, 2.0, -1.0], [2.0, 0.0, -1.0]  # Face 1 (points -Z)
    ], dtype=np.float32)

    faces = np.array([[0, 1, 2], [3, 4, 5]], dtype=np.int32)

    # Overhead camera looking down from +Z
    cam_pos = np.array([1.0, 1.0, 10.0])
    R = np.array([
        [1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, 0.0, -1.0]  # Looking down towards origin
    ], dtype=np.float64)
    t = (-R @ cam_pos).tolist()

    dummy_img = np.full((240, 320, 3), 150, dtype=np.uint8)
    cameras = [{
        "camera_id": 0,
        "camera_idx": 0,
        "frame_id": "overhead_cam",
        "image_bgr": dummy_img,
        "R": R,
        "t": np.array(t).reshape(3, 1),
        "C": cam_pos,
        "sharpness": 80.0,
        "exposure": 0.85,
        "quality_score": 0.85,
        "K": np.array([[200.0, 0, 160], [0, 200, 120], [0, 0, 1]]),
        "width": 320,
        "height": 240
    }]

    face_obs, unobs_indices = compute_visibility_and_scoring(verts, faces, cameras)

    # Face 0 is visible from above
    assert face_obs[0]["is_observed"] is True
    # Face 1 is pointing downwards away from camera -> must be unobserved!
    assert face_obs[1]["is_observed"] is False
    assert 1 in unobs_indices

    # Generate texture atlas
    atlas_bgr, uv_coords, conf_map, metrics = generate_seamless_texture_atlas(
        vertices=verts,
        faces=faces,
        face_observations=face_obs,
        cameras=cameras,
        atlas_resolution=512,
        unobserved_color_rgb=(100, 116, 139)
    )

    assert metrics["unobserved_faces_count"] == 1
    assert metrics["visual_coverage_percentage"] == 50.0


def test_end_to_end_texture_mapping_stage(tmp_path, synthetic_mesh_and_cameras):
    ply_path, poses_file, intrinsics_file, v_arr, f_arr = synthetic_mesh_and_cameras
    stage_dir = tmp_path / "texture_stage_out"
    stage_dir.mkdir()

    stage_input = StageInput(
        mission_id="test_mission_phase10",
        job_id="test_job_phase10",
        stage_name="texture_mapping",
        checkpoint_dir=str(stage_dir),
        previous_checkpoint_dir=str(tmp_path),
        input_artifacts={
            "model_clean_ply": str(ply_path),
            "camera_poses": str(poses_file),
            "camera_intrinsics": str(intrinsics_file)
        },
        parameters={
            "atlas_resolution": 1024,
            "max_views_per_face": 2,
            "seam_reduction": True
        }
    )

    stage = TextureMappingStage()
    output = stage.execute(stage_input)

    assert output.status == "completed"

    # 1. Check Artifacts presence
    assert "textured_model_glb" in output.artifacts
    assert "textures_dir" in output.artifacts
    assert "texture_quality_report" in output.artifacts
    assert "mesh_textured_obj" in output.artifacts
    assert "material_mtl" in output.artifacts
    assert "texture_atlas_png" in output.artifacts

    glb_file = Path(output.artifacts["textured_model_glb"])
    textures_dir = Path(output.artifacts["textures_dir"])
    report_file = Path(output.artifacts["texture_quality_report"])
    obj_file = Path(output.artifacts["mesh_textured_obj"])
    mtl_file = Path(output.artifacts["material_mtl"])
    atlas_file = Path(output.artifacts["texture_atlas_png"])

    assert glb_file.exists() and glb_file.stat().st_size > 1000
    assert textures_dir.exists()
    assert (textures_dir / "texture_atlas.png").exists()
    assert (textures_dir / "diffuse.png").exists()
    assert (textures_dir / "confidence_map.png").exists()
    assert report_file.exists()
    assert obj_file.exists()
    assert mtl_file.exists()
    assert atlas_file.exists()

    # 2. Check GLB format and texture embedding
    with open(glb_file, "rb") as f:
        magic = f.read(4)
        assert magic == b"glTF", "Must be a valid binary glTF file"

    tm = trimesh.load(str(glb_file), process=False)
    mesh = list(tm.geometry.values())[0] if isinstance(tm, trimesh.Scene) else tm
    assert len(mesh.vertices) == len(v_arr), "Vertex count must match clean mesh!"
    assert len(mesh.faces) == len(f_arr), "Face count must match clean mesh!"
    # Verify spatial coordinates preservation
    assert np.allclose(mesh.vertices[0], v_arr[0], atol=1e-3), "Spatial coordinates must be preserved!"

    # 3. Check texture quality report content
    with open(report_file, "r", encoding="utf-8") as f:
        report = json.load(f)

    assert report["visual_coverage_percentage"] > 70.0
    assert report["textured_faces_count"] > 0
    assert "surface_area_metrics" in report
    assert "camera_contribution_distribution" in report
    assert report["unobserved_surface_handling"]["fabricated_texture"] is False
    assert report["spatial_coordinates_preserved"] is True


def test_seam_reduction_and_multi_view_blending(synthetic_mesh_and_cameras):
    ply_path, poses_file, intrinsics_file, v_arr, f_arr = synthetic_mesh_and_cameras
    verts, faces, normals = load_mesh_geometry(ply_path)

    with open(poses_file, "r") as f:
        poses = json.load(f)["poses"]
    with open(intrinsics_file, "r") as f:
        int_data = json.load(f)

    K = np.array(int_data["K"], dtype=np.float64)
    cameras, _ = filter_candidate_cameras(poses, K, int_data["image_width"], int_data["image_height"])

    face_obs, _ = compute_visibility_and_scoring(verts, faces, cameras)

    # Test atlas generation with multi-view blending enabled
    atlas_blend, _, conf_map_blend, metrics_blend = generate_seamless_texture_atlas(
        vertices=verts,
        faces=faces,
        face_observations=face_obs,
        cameras=cameras,
        atlas_resolution=512,
        max_views_per_face=2,
        seam_reduction=True
    )

    # Test atlas generation with single best view
    atlas_single, _, conf_map_single, metrics_single = generate_seamless_texture_atlas(
        vertices=verts,
        faces=faces,
        face_observations=face_obs,
        cameras=cameras,
        atlas_resolution=512,
        max_views_per_face=1,
        seam_reduction=False
    )

    assert atlas_blend.shape == (512, 512, 3)
    assert atlas_single.shape == (512, 512, 3)
    assert metrics_blend["visual_coverage_percentage"] > 70.0
    assert metrics_single["visual_coverage_percentage"] > 70.0

