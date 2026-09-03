"""
Independent Stage Execution API.
Enables calling any individual reconstruction stage in isolation with explicit contracts.
"""
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException
from backend.app.pipeline.registry import ORDERED_STAGES, get_stage_instance, STAGE_REGISTRY
from backend.app.schemas.stage import StageInput, StageOutput

router = APIRouter(prefix="/stages", tags=["Pipeline Stages"])


@router.get("", response_model=List[str])
def list_available_stages():
    """Returns the ordered list of all 11 available modular reconstruction stages."""
    return ORDERED_STAGES


@router.get("/{stage_name}/info")
def get_stage_info(stage_name: str):
    """Returns documentation and order metadata for a specific stage."""
    if stage_name not in STAGE_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Stage '{stage_name}' not registered.")
    instance = get_stage_instance(stage_name)
    return {
        "stage_name": instance.stage_name,
        "stage_order": instance.stage_order,
        "description": instance.description
    }


@router.post("/{stage_name}/execute", response_model=StageOutput)
def execute_stage_standalone(stage_name: str, stage_input: StageInput):
    """
    Executes a single reconstruction stage independently using its explicit StageInput contract.
    Loads prior checkpoints or input files and writes outputs to checkpoint_dir.
    """
    if stage_name not in STAGE_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Stage '{stage_name}' not found.")
    
    stage_instance = get_stage_instance(stage_name)
    try:
        output = stage_instance.run(stage_input)
        return output
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
