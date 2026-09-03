"""
Stage 10: Photorealistic Texture Mapping (Phase 10).

Projects calibrated, color-balanced UAV keyframe imagery onto the reconstructed 3D
surface mesh from Phase 9.

Features:
  - Objective camera quality filtering (blur and exposure rejection)
  - Geometric visibility and viewing angle analysis
  - Multi-factor observation scoring (orthogonality, resolution, proximity)
  - Multi-view texture blending and seam reduction
  - Low-confidence tagging for unobserved surfaces (no synthetic hallucination)
  - Seamless texture atlas generation (textures/ and texture_atlas.png)
  - Web-optimized binary glTF 2.0 (textured_model.glb)
  - Comprehensive texture quality and certification report (texture_quality_report.json)
"""
import json
import logging
import time
from pathlib import Path
from typing import List, Dict, Any, Optional

import cv2
import numpy as np

from backend.app.pipeline.base import BaseStage, StageExecutionError
from backend.app.schemas.stage import StageInput, StageOutput
from backend.app.pipeline.stages.texture_engine import TextureMappingEngine

logger = logging.getLogger("uav_reconstruction.stage.texture")


class TextureMappingStage(BaseStage):
    stage_name = "texture_mapping"
    stage_order = 10
    description = (
        "Phase 10: Projects calibrated UAV keyframes onto 3D mesh surface, "
        "performs camera visibility and quality analysis, synthesizes a packed texture atlas "
        "with seam reduction, and exports textured_model.glb and texture_quality_report.json."
    )

    def execute(self, input_data: StageInput) -> StageOutput:
        start_time = time.time()
        ckpt_dir = Path(input_data.checkpoint_dir)
        ckpt_dir.mkdir(parents=True, exist_ok=True)
        prev_dir = Path(input_data.previous_checkpoint_dir or input_data.checkpoint_dir)

        # ── 1. Resolve Mesh Artifact (from Phase 9) ──────────────────────
        mesh_path = (
            input_data.input_artifacts.get("model_clean_ply") or
            input_data.input_artifacts.get("mesh_obj") or
            input_data.input_artifacts.get("model_raw_ply")
        )

        if not mesh_path or not Path(mesh_path).exists():
            for cname in ["model_clean.ply", "mesh.obj", "model_raw.ply"]:
                cand = prev_dir / cname
                if cand.exists():
                    mesh_path = str(cand)
                    break

        if not mesh_path or not Path(mesh_path).exists():
            raise StageExecutionError(
                self.stage_name,
                "Missing reconstructed mesh artifact (model_clean.ply or mesh.obj from Phase 9)."
            )

        # ── 2. Resolve Camera Poses & Intrinsics ─────────────────────────
        poses_path = input_data.input_artifacts.get("camera_poses")
        if not poses_path or not Path(poses_path).exists():
            for cname in ["camera_poses.json", "trajectory.json"]:
                for search_dir in [prev_dir, prev_dir.parent / "pose_estimation", prev_dir.parent / "geometry"]:
                    cand = search_dir / cname
                    if cand.exists():
                        poses_path = str(cand)
                        break
                if poses_path and Path(poses_path).exists():
                    break

        intrinsics_path = input_data.input_artifacts.get("camera_intrinsics")
        if not intrinsics_path or not Path(intrinsics_path).exists():
            for search_dir in [prev_dir, prev_dir.parent / "pose_estimation", prev_dir.parent / "geometry"]:
                cand = search_dir / "camera_intrinsics.json"
                if cand.exists():
                    intrinsics_path = str(cand)
                    break

        if not poses_path or not Path(poses_path).exists():
            raise StageExecutionError(self.stage_name, "Missing camera_poses.json artifact.")
        if not intrinsics_path or not Path(intrinsics_path).exists():
            raise StageExecutionError(self.stage_name, "Missing camera_intrinsics.json artifact.")

        # ── 3. Resolve Frame Quality Report (Optional) ───────────────────
        quality_report_path = input_data.input_artifacts.get("frame_quality_report")
        if not quality_report_path or not Path(quality_report_path).exists():
            for search_dir in [prev_dir, prev_dir.parent / "frame_quality"]:
                cand = search_dir / "frame_quality.json"
                if cand.exists():
                    quality_report_path = str(cand)
                    break

        # ── 4. Execute Phase 10 Texture Mapping Engine ───────────────────
        try:
            results = TextureMappingEngine.execute_pipeline(
                mesh_path=Path(mesh_path),
                poses_path=Path(poses_path),
                intrinsics_path=Path(intrinsics_path),
                output_dir=ckpt_dir,
                quality_report_path=Path(quality_report_path) if quality_report_path else None,
                parameters=input_data.parameters
            )
        except Exception as e:
            logger.error(f"TextureMappingEngine failed: {e}", exc_info=True)
            raise StageExecutionError(self.stage_name, f"Texture mapping failed: {str(e)}")

        artifacts = results["artifacts"]
        report = results["report"]
        elapsed_sec = round(time.time() - start_time, 2)

        cov_pct = report["visual_coverage_percentage"]
        tex_faces = report["textured_faces_count"]
        unobs_faces = report["unobserved_faces_count"]
        texels_m2 = report["effective_texture_resolution"]["texels_per_m2"]
        mean_angle = report["mean_observation_angle_deg"]

        return StageOutput(
            stage_name=self.stage_name,
            status="completed",
            checkpoint_dir=input_data.checkpoint_dir,
            artifacts=artifacts,
            metrics={
                "visual_coverage_percentage": cov_pct,
                "textured_faces_count": tex_faces,
                "unobserved_faces_count": unobs_faces,
                "mean_observation_angle_deg": mean_angle,
                "effective_texel_density_texels_m2": texels_m2,
                "atlas_resolution": report["effective_texture_resolution"]["atlas_width_px"],
                "keyframes_accepted": report["camera_quality_filtering"]["keyframes_accepted"],
                "keyframes_rejected_quality": report["camera_quality_filtering"]["keyframes_rejected_blur_or_exposure"],
                "seam_reduction": True,
                "spatial_geometry_preserved": True,
                "processing_time_sec": elapsed_sec
            },
            summary=(
                f"Generated photorealistic texture atlas with {cov_pct:.1f}% visual surface coverage "
                f"across {tex_faces:,} faces ({texels_m2:.1f} texels/m²). Exported textured_model.glb, "
                f"textures/, and texture_quality_report.json in {elapsed_sec}s."
            )
        )


def standalone_test():
    """
    Independently testable verification routine for Phase 10: Photorealistic Texture Mapping.
    Creates a synthetic mesh and calibrated keyframes with textured canvas, executes TextureMappingStage,
    and asserts all required deliverables and quality reports.
    """
    import tempfile
    import shutil

    test_dir = Path(tempfile.mkdtemp(prefix="phase10_texture_test_"))
    try:
        mesh_dir = test_dir / "mesh_checkpoint"
        mesh_dir.mkdir(parents=True)
        ckpt_dir = test_dir / "texture_checkpoint"
        ckpt_dir.mkdir(parents=True)

        # 1. Synthesize 3D mesh surface (terrain slab)
        verts = []
        faces = []
        grid_n = 10
        for y in range(grid_n):
            for x in range(grid_n):
                vx = float(x * 2.0 - 10.0)
                vy = float(y * 2.0 - 10.0)
                vz = float(0.04 * (vx**2 + vy**2))
                verts.append([vx, vy, vz])

        for y in range(grid_n - 1):
            for x in range(grid_n - 1):
                i0 = y * grid_n + x
                i1 = i0 + 1
                i2 = (y + 1) * grid_n + x
                i3 = i2 + 1
                faces.append([i0, i1, i2])
                faces.append([i1, i3, i2])

        mesh_obj_path = mesh_dir / "model_clean.ply"
        with open(mesh_obj_path, "w", encoding="utf-8") as f:
            f.write(
                f"ply\nformat ascii 1.0\nelement vertex {len(verts)}\n"
                f"property float x\nproperty float y\nproperty float z\n"
                f"element face {len(faces)}\nproperty list uchar int vertex_indices\nend_header\n"
            )
            for v in verts:
                f.write(f"{v[0]:.4f} {v[1]:.4f} {v[2]:.4f}\n")
            for f_idx in faces:
                f.write(f"3 {f_idx[0]} {f_idx[1]} {f_idx[2]}\n")

        # 2. Synthesize camera poses and keyframe images
        kf_dir = test_dir / "keyframes"
        kf_dir.mkdir(parents=True)

        poses = []
        img_w, img_h = 640, 480
        focal = 450.0

        for i in range(3):
            # Richly textured keyframe canvas
            canvas = np.zeros((img_h, img_w, 3), dtype=np.uint8)
            canvas[:] = (60, 110, 70)  # Greenish grass
            # Add distinct patterns
            for cx in range(40, img_w, 80):
                for cy in range(40, img_h, 80):
                    cv2.rectangle(canvas, (cx, cy), (cx + 35, cy + 35), (200 - i * 30, 140, 80 + i * 20), -1)

            img_file = kf_dir / f"kf_{i:04d}.jpg"
            cv2.imwrite(str(img_file), canvas)

            # Camera looking downwards towards origin from altitude Z=25
            pos_x = float(i * 4.0 - 4.0)
            cam_pos = np.array([pos_x, -14.0, 25.0], dtype=np.float64)

            # Look-at rotation: optical axis (+Z_c) points directly towards mesh center [0, 0, 0]
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
                "frame_id": f"kf_{i:04d}",
                "filename": img_file.name,
                "filepath": str(img_file),
                "position": cam_pos.tolist(),
                "R": R.tolist(),
                "t": t
            })

        poses_path = mesh_dir / "camera_poses.json"
        with open(poses_path, "w", encoding="utf-8") as f:
            json.dump({"poses": poses}, f)

        intrinsics_path = mesh_dir / "camera_intrinsics.json"
        K = [
            [focal, 0.0, img_w / 2.0],
            [0.0, focal, img_h / 2.0],
            [0.0, 0.0, 1.0]
        ]
        with open(intrinsics_path, "w", encoding="utf-8") as f:
            json.dump({"K": K, "image_width": img_w, "image_height": img_h}, f)

        stage_input = StageInput(
            mission_id="test_texture_mission",
            job_id="test_texture_job",
            stage_name="texture_mapping",
            checkpoint_dir=str(ckpt_dir),
            previous_checkpoint_dir=str(mesh_dir),
            input_artifacts={
                "model_clean_ply": str(mesh_obj_path),
                "camera_poses": str(poses_path),
                "camera_intrinsics": str(intrinsics_path)
            },
            parameters={
                "atlas_resolution": 1024,
                "max_views_per_face": 2,
                "seam_reduction": True
            }
        )

        stage = TextureMappingStage()
        print("[Standalone Test] Executing TextureMappingStage (Phase 10)...")
        output = stage.execute(stage_input)

        assert output.status == "completed"

        # Check required artifacts
        glb_file = Path(output.artifacts["textured_model_glb"])
        textures_dir = Path(output.artifacts["textures_dir"])
        report_file = Path(output.artifacts["texture_quality_report"])
        obj_file = Path(output.artifacts["mesh_textured_obj"])
        mtl_file = Path(output.artifacts["material_mtl"])

        assert glb_file.exists() and glb_file.stat().st_size > 500, "textured_model.glb must exist"
        assert textures_dir.exists(), "textures/ directory must exist"
        assert (textures_dir / "texture_atlas.png").exists(), "texture_atlas.png must exist in textures/"
        assert report_file.exists(), "texture_quality_report.json must exist"
        assert obj_file.exists(), "mesh_textured.obj must exist"
        assert mtl_file.exists(), "material.mtl must exist"

        # Validate GLB header
        with open(glb_file, "rb") as f:
            magic = f.read(4)
            assert magic == b"glTF", "GLB must have glTF magic header"

        # Validate texture quality report content
        with open(report_file) as f:
            report = json.load(f)

        assert "visual_coverage_percentage" in report
        assert "effective_texture_resolution" in report
        assert "camera_contribution_distribution" in report
        assert "unobserved_surface_handling" in report
        assert report["unobserved_surface_handling"]["fabricated_texture"] is False
        assert report["spatial_coordinates_preserved"] is True

        print(f"[Standalone Test] Success! Visual Coverage: {report['visual_coverage_percentage']}% across {report['textured_faces_count']} faces.")
        print(f"Textured GLB: {glb_file} ({glb_file.stat().st_size:,} bytes).")
    finally:
        shutil.rmtree(test_dir, ignore_errors=True)


if __name__ == "__main__":
    standalone_test()
