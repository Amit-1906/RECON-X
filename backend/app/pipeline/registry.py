"""
Reconstruction Stage Registry.
Provides dynamic stage lookup, topological ordering, and instantiation.
"""
from typing import Dict, Type, List
from backend.app.pipeline.base import BaseStage
from backend.app.pipeline.stages import (
    PreprocessingStage,
    FrameQualityStage,
    KeyframeSelectionStage,
    PoseEstimationStage,
    GeometryStage,
    DensePointCloudStage,
    MeshGenerationStage,
    TextureMappingStage,
    GeoreferencingStage,
    ConfidenceEstimationStage,
    ValidationStage,
)

STAGE_REGISTRY: Dict[str, Type[BaseStage]] = {
    PreprocessingStage.stage_name: PreprocessingStage,
    FrameQualityStage.stage_name: FrameQualityStage,
    KeyframeSelectionStage.stage_name: KeyframeSelectionStage,
    PoseEstimationStage.stage_name: PoseEstimationStage,
    GeometryStage.stage_name: GeometryStage,
    DensePointCloudStage.stage_name: DensePointCloudStage,
    MeshGenerationStage.stage_name: MeshGenerationStage,
    TextureMappingStage.stage_name: TextureMappingStage,
    GeoreferencingStage.stage_name: GeoreferencingStage,
    ConfidenceEstimationStage.stage_name: ConfidenceEstimationStage,
    ValidationStage.stage_name: ValidationStage,
}

ORDERED_STAGES: List[str] = [
    "preprocessing",
    "frame_quality",
    "keyframe_selection",
    "pose_estimation",
    "geometry",
    "dense_point_cloud",
    "mesh_generation",
    "texture_mapping",
    "georeferencing",
    "confidence_estimation",
    "validation",
]

def get_stage_instance(stage_name: str) -> BaseStage:
    if stage_name not in STAGE_REGISTRY:
        raise ValueError(f"Unknown stage '{stage_name}'. Available: {list(STAGE_REGISTRY.keys())}")
    return STAGE_REGISTRY[stage_name]()

def get_all_stages() -> List[BaseStage]:
    return [STAGE_REGISTRY[name]() for name in ORDERED_STAGES]
