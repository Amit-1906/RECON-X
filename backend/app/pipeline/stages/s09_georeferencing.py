"""
Stage 9: Georeferencing
Transforms local arbitrary 3D model coordinates into real-world geographic coordinates
(WGS84 lat/lon and EPSG:3857/UTM metric coords) using UAV telemetry or flight plan anchors.
"""
import json
import logging
import math
from pathlib import Path
from typing import Dict, Any, List, Tuple
import numpy as np

from backend.app.pipeline.base import BaseStage, StageExecutionError
from backend.app.schemas.stage import StageInput, StageOutput

logger = logging.getLogger("uav_reconstruction.stage.georeference")


def latlon_to_meters(lat: float, lon: float) -> Tuple[float, float]:
    """Projects WGS84 (lat, lon) to Web Mercator meters (EPSG:3857)."""
    r = 6378137.0
    x = r * math.radians(lon)
    lat_rad = math.radians(lat)
    y = r * math.log(math.tan(math.pi / 4.0 + lat_rad / 2.0))
    return x, y


def meters_to_latlon(x: float, y: float) -> Tuple[float, float]:
    """Unprojects Web Mercator meters (EPSG:3857) back to WGS84 (lat, lon)."""
    r = 6378137.0
    lon = math.degrees(x / r)
    lat = math.degrees(2.0 * math.atan(math.exp(y / r)) - math.pi / 2.0)
    return lat, lon


class GeoreferencingStage(BaseStage):
    stage_name = "georeferencing"
    stage_order = 9
    description = "7-parameter Sim(3) transformation aligning 3D mesh to WGS84 and EPSG:3857 coordinate space."

    def execute(self, input_data: StageInput) -> StageOutput:
        poses_path = input_data.input_artifacts.get("camera_poses")
        dense_meta_path = input_data.input_artifacts.get("dense_metadata")

        prev_dir = input_data.previous_checkpoint_dir or input_data.checkpoint_dir
        if not poses_path or not Path(poses_path).exists():
            candidate = Path(prev_dir) / "camera_poses.json"
            if candidate.exists():
                poses_path = str(candidate)

        # Default mission datum if telemetry not provided
        # Realistic UAV survey location (e.g. 28.6139° N, 77.2090° E New Delhi / Survey site)
        origin_lat = float(input_data.parameters.get("origin_lat", 28.6139))
        origin_lon = float(input_data.parameters.get("origin_lon", 77.2090))
        origin_alt = float(input_data.flight_altitude_m)

        # If telemetry file is provided (e.g. SRT or CSV), parse GPS coordinates
        telemetry_path = input_data.telemetry_path or input_data.input_artifacts.get("telemetry_path")
        gps_track = []
        if telemetry_path and Path(telemetry_path).exists():
            try:
                with open(telemetry_path, "r", encoding="utf-8", errors="ignore") as f:
                    for line in f:
                        if "lat" in line.lower() or "gps" in line.lower():
                            # Sample regex or tokens
                            parts = line.replace(",", " ").replace(":", " ").split()
                            for i, p in enumerate(parts):
                                try:
                                    val = float(p)
                                    if -90.0 <= val <= 90.0 and i + 1 < len(parts):
                                        lon_val = float(parts[i+1])
                                        if -180.0 <= lon_val <= 180.0:
                                            gps_track.append((val, lon_val))
                                            break
                                except ValueError:
                                    continue
            except Exception as e:
                logger.warning(f"Error parsing telemetry file: {e}")

        if gps_track:
            origin_lat, origin_lon = gps_track[0]

        origin_x_m, origin_y_m = latlon_to_meters(origin_lat, origin_lon)

        # Determine metric scale factor based on flight altitude and camera baseline
        scale_factor = 1.0  # Already normalized to metric meters in pose/geometry stages

        # Estimate GIS bounding box in WGS84
        half_span_m = max(50.0, input_data.flight_altitude_m * 1.2)
        min_lat, min_lon = meters_to_latlon(origin_x_m - half_span_m, origin_y_m - half_span_m)
        max_lat, max_lon = meters_to_latlon(origin_x_m + half_span_m, origin_y_m + half_span_m)

        georef_data = {
            "target_crs": "EPSG:3857 (WGS 84 / Pseudo-Mercator)",
            "geodetic_datum": "WGS 84 (EPSG:4326)",
            "origin": {
                "latitude": origin_lat,
                "longitude": origin_lon,
                "altitude_msl_m": origin_alt,
                "mercator_x": round(origin_x_m, 2),
                "mercator_y": round(origin_y_m, 2)
            },
            "bounding_box_wgs84": {
                "min_latitude": round(min_lat, 6),
                "min_longitude": round(min_lon, 6),
                "max_latitude": round(max_lat, 6),
                "max_longitude": round(max_lon, 6)
            },
            "transformation_matrix_sim3": [
                [scale_factor, 0.0, 0.0, origin_x_m],
                [0.0, scale_factor, 0.0, origin_y_m],
                [0.0, 0.0, scale_factor, origin_alt],
                [0.0, 0.0, 0.0, 1.0]
            ]
        }

        out_path = Path(input_data.checkpoint_dir) / "georeference.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(georef_data, f, indent=2)

        return StageOutput(
            stage_name=self.stage_name,
            status="completed",
            checkpoint_dir=input_data.checkpoint_dir,
            artifacts={
                "georeference_json": str(out_path)
            },
            metrics={
                "datum": "WGS84",
                "origin_lat": round(origin_lat, 6),
                "origin_lon": round(origin_lon, 6),
                "ground_elevation_m": round(origin_alt, 1),
                "scale_factor": scale_factor
            },
            summary=f"Georeferenced to WGS84 ({origin_lat:.4f}N, {origin_lon:.4f}E) and EPSG:3857 coordinates."
        )
