"""Pipeline Orchestrator

Runs the AI design pipeline:
  Parse → Select → Generate → BOM → PCB

Validation has been moved to the frontend.
"""

from __future__ import annotations

from pydantic import BaseModel, Field
from app.schemas.intent import IntentParseResponse
from app.schemas.component import SelectedComponents
from app.schemas.circuit import CircuitGraph
from app.schemas.pcb import PCBConstraints
from app.schemas.bom import BOM

from app.ai.intent_parser import parse_intent
from app.ai.component_selector import select_components
from app.ai.circuit_generator import generate_circuit
from app.pcb.constraints import generate_pcb_constraints
from app.bom.generator import generate_bom


class PipelineResult(BaseModel):
    intent: IntentParseResponse
    components: SelectedComponents
    circuit: CircuitGraph
    pcb_constraints: PCBConstraints | None = None
    bom: BOM | None = None
    pipeline_status: str = "completed"


def run_pipeline(description: str) -> PipelineResult:
    """Execute the AI design pipeline from natural language to BOM.

    Returns the generated graph for the frontend to validate.
    """

    # Engine 1: Parse intent
    intent, confidence = parse_intent(description)
    intent_response = IntentParseResponse(
        intent=intent,
        confidence=confidence,
        raw_input=description,
    )

    # Engine 2: Select components
    components = select_components(intent)

    # Engine 3: Generate circuit
    circuit = generate_circuit(components)

    # Engine 4: PCB constraints
    pcb_constraints = generate_pcb_constraints(circuit)

    # Engine 5: BOM
    bom = generate_bom(circuit)

    return PipelineResult(
        intent=intent_response,
        components=components,
        circuit=circuit,
        pcb_constraints=pcb_constraints,
        bom=bom,
        pipeline_status="completed",
    )
