"""
Stage 7: Mesh Generation
Computes 3D surface mesh from dense point cloud using spatial triangulation,
filters degenerate or oversized boundary triangles, and exports standard Wavefront OBJ.
"""
import json
import logging
from pathlib import Path
from typing import List, Tuple
import numpy as np
from scipy.spatial import Delaunay

from backend.app.pipeline.base import BaseStage, StageExecutionError
from backend.app.schemas.stage import StageInput, StageOutput

logger = logging.getLogger("uav_reconstruction.stage.mesh")


def read_ply_points(ply_path: Path) -> Tuple[np.ndarray, np.ndarray]:
    """Reads vertices and colors from ASCII PLY file."""
    points = []
    colors = []
    with open(ply_path, "r", encoding="utf-8") as f:
        in_header = True
        for line in f:
            line_str = line.strip()
            if in_header:
                if line_str == "end_header":
                    in_header = False
                continue
            parts = line_str.split()
            if len(parts) >= 3:
                points.append([float(parts[0]), float(parts[1]), float(parts[2])])
                if len(parts) >= 6:
                    colors.append([int(parts[3]), int(parts[4]), int(parts[5])])
                else:
                    colors.append([200, 200, 200])
    return np.array(points, dtype=np.float32), np.array(colors, dtype=np.uint8)


def write_obj(filepath: Path, vertices: np.ndarray, faces: np.ndarray, normals: np.ndarray, mtl_name: str = None):
    """Writes vertices, normals, and triangular faces to Wavefront OBJ format."""
    with open(filepath, "w", encoding="utf-8") as f:
        f.write("# UAV 3D Reconstruction Platform Mesh\n")
        if mtl_name:
            f.write(f"mtllib {mtl_name}\n")
            f.write("usemtl material_0\n")

        for v in vertices:
            f.write(f"v {v[0]:.4f} {v[1]:.4f} {v[2]:.4f}\n")

        for n in normals:
            f.write(f"vn {n[0]:.4f} {n[1]:.4f} {n[2]:.4f}\n")

        # 1-indexed faces
        for face in faces:
            i1, i2, i3 = face[0] + 1, face[1] + 1, face[2] + 1
            f.write(f"f {i1}//{i1} {i2}//{i2} {i3}//{i3}\n")


class MeshGenerationStage(BaseStage):
    stage_name = "mesh_generation"
    stage_order = 7
    description = "Generates 3D polygonal surface mesh from point cloud and exports standard OBJ."

    def execute(self, input_data: StageInput) -> StageOutput:
        dense_ply = input_data.input_artifacts.get("dense_ply")
        sparse_ply = input_data.input_artifacts.get("sparse_ply")

        prev_dir = input_data.previous_checkpoint_dir or input_data.checkpoint_dir
        if not dense_ply or not Path(dense_ply).exists():
            candidate = Path(prev_dir) / "dense.ply"
            if candidate.exists():
                dense_ply = str(candidate)

        target_ply = dense_ply if (dense_ply and Path(dense_ply).exists()) else sparse_ply
        if not target_ply or not Path(target_ply).exists():
            raise StageExecutionError(self.stage_name, "No point cloud (dense.ply or sparse.ply) available for meshing.")

        points, colors = read_ply_points(Path(target_ply))
        if len(points) < 3:
            raise StageExecutionError(self.stage_name, f"Point cloud has insufficient points ({len(points)}) to form triangles.")

        params = input_data.parameters
        max_edge_len = float(params.get("max_edge_length_meters", 8.0))

        # Perform 2.5D surface triangulation (TIN) on the aerial ground plane (XY)
        # UAV surveys naturally reconstruct terrain and structures viewed from above
        xy_pts = points[:, :2]
        tri = Delaunay(xy_pts)

        valid_faces = []
        surface_area = 0.0

        for simplex in tri.simplices:
            p0 = points[simplex[0]]
            p1 = points[simplex[1]]
            p2 = points[simplex[2]]

            # Filter long edge triangles (spanning convex hull edges with no data)
            e0 = np.linalg.norm(p1 - p0)
            e1 = np.linalg.norm(p2 - p1)
            e2 = np.linalg.norm(p0 - p2)

            if max(e0, e1, e2) <= max_edge_len:
                valid_faces.append(simplex)
                # Triangle area via cross product
                cross_prod = np.cross(p1 - p0, p2 - p0)
                area = 0.5 * np.linalg.norm(cross_prod)
                surface_area += area

        if not valid_faces:
            # Fallback: keep all simplices if edge filter was too strict
            valid_faces = tri.simplices.tolist()

        faces_arr = np.array(valid_faces, dtype=np.int32)

        # Compute vertex normals
        vertex_normals = np.zeros_like(points)
        for face in faces_arr:
            v0, v1, v2 = points[face[0]], points[face[1]], points[face[2]]
            normal = np.cross(v1 - v0, v2 - v0)
            norm_mag = np.linalg.norm(normal)
            if norm_mag > 1e-7:
                normal = normal / norm_mag
                vertex_normals[face[0]] += normal
                vertex_normals[face[1]] += normal
                vertex_normals[face[2]] += normal

        # Normalize vertex normals
        mags = np.linalg.norm(vertex_normals, axis=1, keepdims=True)
        mags[mags == 0] = 1.0
        vertex_normals = vertex_normals / mags

        obj_path = Path(input_data.checkpoint_dir) / "mesh.obj"
        write_obj(obj_path, points, faces_arr, vertex_normals, mtl_name="material.mtl")

        meta_path = Path(input_data.checkpoint_dir) / "mesh_metadata.json"
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump({
                "vertex_count": len(points),
                "triangle_face_count": len(faces_arr),
                "surface_area_m2": round(float(surface_area), 2)
            }, f, indent=2)

        return StageOutput(
            stage_name=self.stage_name,
            status="completed",
            checkpoint_dir=input_data.checkpoint_dir,
            artifacts={
                "mesh_obj": str(obj_path),
                "mesh_metadata": str(meta_path)
            },
            metrics={
                "mesh_vertices": len(points),
                "mesh_triangles": len(faces_arr),
                "estimated_surface_area_m2": round(float(surface_area), 1)
            },
            summary=f"Constructed surface mesh with {len(points)} vertices and {len(faces_arr)} triangles."
        )
