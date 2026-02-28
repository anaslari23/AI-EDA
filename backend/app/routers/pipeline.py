"""Pipeline router — AI orchestration endpoints.

Runs the AI design pipeline: NL → Intent → Components → Circuit → BOM → PCB.
Validation is handled entirely in the frontend.
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.schemas.intent import IntentParseRequest, IntentParseResponse
from app.ai.intent_parser import parse_intent
from app.services.pipeline import run_pipeline, PipelineResult

router = APIRouter()


class PipelineRunRequest(BaseModel):
    description: str = Field(
        ..., min_length=10, description="Natural language hardware description"
    )


@router.post("/run", response_model=PipelineResult)
async def run_full_pipeline(request: PipelineRunRequest):
    """Execute the full design pipeline: NL → Intent → Components → Circuit → BOM → PCB."""
    result = run_pipeline(request.description)
    return result


@router.post("/parse", response_model=IntentParseResponse)
async def parse_only(request: IntentParseRequest):
    """Parse NL description into structured hardware intent."""
    intent, confidence = parse_intent(request.description)
    return IntentParseResponse(
        intent=intent,
        confidence=confidence,
        raw_input=request.description,
    )
