"""Pipeline Orchestrator

Runs the full AI EDA pipeline:
  Parse → Select → Graph → Validate → (Correct) → PCB → BOM
"""

from __future__ import annotations

from pydantic import BaseModel, Field
from app.schemas.intent import HardwareIntent, IntentParseResponse
from app.schemas.component import SelectedComponents
from app.schemas.circuit import CircuitGraph
from app.schemas.validation import ValidationResult, ValidationStatus
from app.schemas.pcb import PCBConstraints
from app.schemas.bom import BOM

from app.ai.intent_parser import parse_intent
from app.ai.component_selector import select_components
from app.ai.circuit_generator import generate_circuit
from app.validation.engine import validate_circuit
from app.validation.correction import correct_circuit
from app.pcb.constraints import generate_pcb_constraints
from app.bom.generator import generate_bom

MAX_CORRECTION_ITERATIONS = 3


class PipelineResult(BaseModel):
    intent: IntentParseResponse
    components: SelectedComponents
    circuit: CircuitGraph
    validation: ValidationResult
    corrections_applied: list[str] = Field(default_factory=list)
    pcb_constraints: PCBConstraints | None = None
    bom: BOM | None = None
    pipeline_status: str = "completed"
    iterations: int = 1


def run_pipeline(description: str) -> PipelineResult:
    """Execute the full design pipeline from natural language to BOM."""

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

    # Engine 4 + 5: Validate and correct loop
    all_corrections: list[str] = []
    iterations = 0

    for i in range(MAX_CORRECTION_ITERATIONS):
        iterations = i + 1
        validation = validate_circuit(circuit)

        if validation.status == ValidationStatus.VALID:
            break

        # Engine 5: Auto-correct
        result = correct_circuit(circuit, validation)
        circuit = result.corrected_graph
        all_corrections.extend(result.corrections)
    else:
        # Final validation after last correction
        validation = validate_circuit(circuit)

    # Engine 6: PCB constraints (only if valid)
    pcb_constraints = None
    if validation.status == ValidationStatus.VALID:
        pcb_constraints = generate_pcb_constraints(circuit)

    # Engine 7: BOM (only if valid)
    bom = None
    if validation.status == ValidationStatus.VALID:
        bom = generate_bom(circuit)

    status = (
        "completed"
        if validation.status == ValidationStatus.VALID
        else "completed_with_errors"
    )

    return PipelineResult(
        intent=intent_response,
        components=components,
        circuit=circuit,
        validation=validation,
        corrections_applied=all_corrections,
        pcb_constraints=pcb_constraints,
        bom=bom,
        pipeline_status=status,
        iterations=iterations,
    )
