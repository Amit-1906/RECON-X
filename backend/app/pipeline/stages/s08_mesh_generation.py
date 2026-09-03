"""
Stage 9: 3D Mesh Generation (Phase 9).

Computes continuous 3D surface mesh from dense point cloud and confidence observations.
Features:
  - Statistical Outlier Removal (SOR) and confidence-based point filtering
  - Local surface normal estimation oriented towards camera viewpoints
  - Continuous surface reconstruction without inventing geometry across unobserved voids
  - Degenerate face pruning, non-manifold edge healing, and boundary-preserving smoothing
  - Connected component graph analysis for floating artifact pruning
  - Configurable mesh density decimation (high, medium, low)
  - Exports model_raw.ply, model_clean.ply, model.glb, mesh.obj, and mesh_statistics.json
  - Strict preservation of spatial coordinates
"""
import json
import logging
import time
from pathlib import Path
from typing import List, Dict, Any, Optional

import numpy as np

from backend.app.pipeline.base import BaseStage, StageExecutionError
from backend.app.schemas.stage import StageInput, StageOutput
from backend.app.pipeline.stages.mesh_engine import (
    MeshReconstructionEngine,
    read_point_cloud_with_confidence,
    write_obj_mesh
)

logger = logging.getLogger("uav_reconstruction.stage.mesh")


class MeshGenerationStage(BaseStage):
    stage_name = "mesh_generation"
    stage_order = 9
    description = (
        "Phase 9: Generates a continuous 3D surface mesh from dense point cloud and confidence data, "
        "filters noise and isolated artifacts, and exports model_raw.ply, model_clean.ply, and model.glb."
    )

    def execute(self, input_data: StageInput) -> StageOutput:
        start_time = time.time()
        ckpt_dir = Path(input_data.checkpoint_dir)
        ckpt_dir.mkdir(parents=True, exist_ok=True)
        prev_dir = Path(input_data.previous_checkpoint_dir or input_data.checkpoint_dir)

        # ── 1. Resolve Point Cloud Artifact ──────────────────────────────
        dense_ply = input_data.input_artifacts.get("dense_point_cloud_ply") or input_data.input_artifacts.get("dense_ply")
        sparse_ply = input_data.input_artifacts.get("sparse_point_cloud_ply") or input_data.input_artifacts.get("sparse_ply")

        if not dense_ply or not Path(dense_ply).exists():
            for cname in ["dense_point_cloud.ply", "dense.ply"]:
                candidate = prev_dir / cname
                if candidate.exists():
                    dense_ply = str(candidate)
                    break

        if not sparse_ply or not Path(sparse_ply).exists():
            for cname in ["sparse_point_cloud.ply", "sparse.ply"]:
                candidate = prev_dir / cname
                if candidate.exists():
                    sparse_ply = str(candidate)
                    break

        target_ply = dense_ply if (dense_ply and Path(dense_ply).exists()) else sparse_ply
        if not target_ply or not Path(target_ply).exists():
            raise StageExecutionError(
                self.stage_name,
                "No point cloud (dense_point_cloud.ply, dense.ply, or sparse.ply) available for meshing."
            )

        # ── 2. Resolve Confidence and Camera Poses Context ───────────────
        conf_dir = input_data.input_artifacts.get("dense_confidence_dir")
        conf_dir_path = Path(conf_dir) if conf_dir and Path(conf_dir).exists() else (prev_dir / "dense_confidence")
        if not conf_dir_path.exists():
            conf_dir_path = None

        metrics_json = input_data.input_artifacts.get("dense_metrics")
        metrics_path = Path(metrics_json) if metrics_json and Path(metrics_json).exists() else (prev_dir / "dense_metrics.json")
        if not metrics_path.exists():
            metrics_path = None

        # Camera poses for surface normal viewpoint orientation
        camera_positions: List[List[float]] = []
        poses_path = input_data.input_artifacts.get("camera_poses")
        if not poses_path or not Path(poses_path).exists():
            for cname in ["camera_poses.json", "trajectory.json"]:
                cand = prev_dir / cname
                if cand.exists():
                    poses_path = str(cand)
                    break

        if poses_path and Path(poses_path).exists():
            try:
                with open(poses_path, "r", encoding="utf-8") as f:
                    p_data = json.load(f)
                    p_list = p_data.get("poses", p_data if isinstance(p_data, list) else [])
                    for cam in p_list:
                        pos = cam.get("position")
                        if pos and len(pos) == 3:
                            camera_positions.append([float(pos[0]), float(pos[1]), float(pos[2])])
            except Exception as e:
                logger.warning(f"Failed parsing camera positions from {poses_path}: {e}")

        # ── 3. Execute Phase 9 Mesh Generation Engine ────────────────────
        try:
            results = MeshReconstructionEngine.execute_pipeline(
                point_cloud_path=Path(target_ply),
                output_dir=ckpt_dir,
                companion_confidence_dir=conf_dir_path,
                companion_metrics_path=metrics_path,
                camera_positions=camera_positions if camera_positions else None,
                parameters=input_data.parameters
            )
        except Exception as e:
            logger.error(f"MeshReconstructionEngine failed: {e}", exc_info=True)
            raise StageExecutionError(self.stage_name, f"Mesh reconstruction failed: {str(e)}")

        artifacts = results["artifacts"]
        stats = results["statistics"]
        elapsed_sec = round(time.time() - start_time, 2)

        mean_conf = stats["reconstruction_confidence"]["mean"]
        verts = stats["vertices"]
        triangles = stats["triangles"]
        area_m2 = stats["surface_area_m2"]
        artifacts_pruned = stats["isolated_artifacts_removed"]
        low_conf_pct = stats["low_confidence_regions"]["low_confidence_faces_pct"]

        return StageOutput(
            stage_name=self.stage_name,
            status="completed",
            checkpoint_dir=input_data.checkpoint_dir,
            artifacts=artifacts,
            metrics={
                "mesh_vertices": verts,
                "mesh_triangles": triangles,
                "estimated_surface_area_m2": area_m2,
                "reconstruction_confidence": mean_conf,
                "isolated_artifacts_pruned": artifacts_pruned,
                "low_confidence_faces_pct": low_conf_pct,
                "density_setting": str(input_data.parameters.get("mesh_density", "medium")),
                "spatial_coordinates_preserved": True,
                "processing_time_sec": elapsed_sec
            },
            summary=(
                f"Generated continuous 3D surface mesh with {verts:,} vertices and {triangles:,} triangles "
                f"({area_m2:.1f} m² surface area) in {elapsed_sec}s. Mean Confidence: {mean_conf}. "
                f"Exported model_raw.ply, model_clean.ply, and web-ready model.glb."
            )
        )


def standalone_test():
    """
    Independently testable verification routine for Phase 9: 3D Mesh Generation.
    Generates synthetic dense point cloud with confidence, runs MeshGenerationStage,
    and verifies all required deliverables and geometric statistics.
    """
    import tempfile
    import shutil

    test_dir = Path(tempfile.mkdtemp(prefix="phase9_mesh_test_"))
    try:
        prev_dir = test_dir / "dense_checkpoint"
        prev_dir.mkdir(parents=True)
        ckpt_dir = test_dir / "mesh_checkpoint"
        ckpt_dir.mkdir(parents=True)

        # 1. Synthesize terrain + building point cloud with confidence
        np.random.seed(42)
        n_ground = 1200
        gx = np.random.uniform(-10.0, 10.0, n_ground)
        gy = np.random.uniform(-10.0, 10.0, n_ground)
        # Gentle parabolic terrain
        gz = 0.05 * (gx ** 2 + gy ** 2) + np.random.normal(0, 0.05, n_ground)
        g_conf = np.random.uniform(0.70, 0.98, n_ground)
        g_clr = np.tile([80, 160, 90], (n_ground, 1))

        # Add raised roof structure in center
        n_roof = 400
        rx = np.random.uniform(-3.0, 3.0, n_roof)
        ry = np.random.uniform(-3.0, 3.0, n_roof)
        rz = 4.0 + np.random.normal(0, 0.03, n_roof)
        r_conf = np.random.uniform(0.85, 0.99, n_roof)
        r_clr = np.tile([210, 120, 80], (n_roof, 1))

        # Add isolated noise artifacts to test pruning
        n_noise = 25
        nx = np.random.uniform(15.0, 18.0, n_noise)
        ny = np.random.uniform(15.0, 18.0, n_noise)
        nz = np.random.uniform(10.0, 15.0, n_noise)
        n_conf = np.random.uniform(0.10, 0.20, n_noise)  # Low confidence noise
        n_clr = np.tile([255, 0, 0], (n_noise, 1))

        all_pts = np.vstack([np.column_stack([gx, gy, gz]), np.column_stack([rx, ry, rz]), np.column_stack([nx, ny, nz])])
        all_clr = np.vstack([g_clr, r_clr, n_clr]).astype(np.uint8)
        all_cnf = np.concatenate([g_conf, r_conf, n_conf]).astype(np.float32)

        dense_ply_path = prev_dir / "dense_point_cloud.ply"
        with open(dense_ply_path, "w", encoding="utf-8") as f:
            f.write(
                f"ply\nformat ascii 1.0\nelement vertex {len(all_pts)}\n"
                f"property float x\nproperty float y\nproperty float z\n"
                f"property uchar red\nproperty uchar green\nproperty uchar blue\n"
                f"property float confidence\nend_header\n"
            )
            for i in range(len(all_pts)):
                p = all_pts[i]
                c = all_clr[i]
                f.write(f"{p[0]:.4f} {p[1]:.4f} {p[2]:.4f} {c[0]} {c[1]} {c[2]} {all_cnf[i]:.4f}\n")

        # Camera trajectory
        poses = [{"position": [float(i * 3 - 9), -15.0, 20.0]} for i in range(7)]
        poses_path = prev_dir / "camera_poses.json"
        with open(poses_path, "w", encoding="utf-8") as f:
            json.dump({"poses": poses}, f)

        stage_input = StageInput(
            mission_id="test_mesh_mission",
            job_id="test_mesh_job",
            stage_name="mesh_generation",
            checkpoint_dir=str(ckpt_dir),
            previous_checkpoint_dir=str(prev_dir),
            input_artifacts={
                "dense_point_cloud_ply": str(dense_ply_path),
                "camera_poses": str(poses_path)
            },
            parameters={
                "max_edge_length_meters": 4.0,
                "min_point_confidence": 0.25,
                "mesh_density": "medium",
                "min_component_faces": 10
            }
        )

        stage = MeshGenerationStage()
        print("[Standalone Test] Executing MeshGenerationStage (Phase 9)...")
        output = stage.execute(stage_input)

        assert output.status == "completed"

        # Check required output deliverables
        raw_ply = Path(output.artifacts["model_raw_ply"])
        clean_ply = Path(output.artifacts["model_clean_ply"])
        model_glb = Path(output.artifacts["model_glb"])
        mesh_obj = Path(output.artifacts["mesh_obj"])
        stats_file = Path(output.artifacts["mesh_statistics"])
        meta_file = Path(output.artifacts["mesh_metadata"])

        assert raw_ply.exists(), "model_raw.ply must exist"
        assert clean_ply.exists(), "model_clean.ply must exist"
        assert model_glb.exists(), "model.glb must exist"
        assert mesh_obj.exists(), "mesh.obj must exist"
        assert stats_file.exists(), "mesh_statistics.json must exist"
        assert meta_file.exists(), "mesh_metadata.json must exist"

        # Verify GLB size and valid header
        assert model_glb.stat().st_size > 500, "GLB file must not be empty"
        with open(model_glb, "rb") as f:
            magic = f.read(4)
            assert magic == b"glTF", "GLB must start with glTF magic bytes"

        # Verify statistics content
        with open(stats_file) as f:
            stats = json.load(f)

        assert "vertices" in stats and stats["vertices"] > 50
        assert "triangles" in stats and stats["triangles"] > 50
        assert "bounding_box" in stats
        assert "surface_area_m2" in stats and stats["surface_area_m2"] > 0
        assert "reconstruction_confidence" in stats
        assert "low_confidence_regions" in stats
        assert stats["spatial_coordinates_preserved"] is True

        print(f"[Standalone Test] Success! Generated {stats['vertices']} vertices, {stats['triangles']} triangles.")
        print(f"Surface Area: {stats['surface_area_m2']} m², Mean Confidence: {stats['reconstruction_confidence']['mean']}")
        print(f"GLB Deliverable: {model_glb} ({model_glb.stat().st_size:,} bytes)")
    finally:
        shutil.rmtree(test_dir, ignore_errors=True)


if __name__ == "__main__":
    standalone_test()
