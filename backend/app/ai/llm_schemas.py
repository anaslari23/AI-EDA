"""JSON schema definitions for structured LLM output validation.

Each schema is a strict JSON Schema dict used to:
1. Inject into LLM prompts so the model knows the expected format.
2. Validate parsed LLM responses before passing downstream.
"""

from __future__ import annotations

import json
from typing import Any

from pydantic import ValidationError

from app.schemas.intent import HardwareIntent
from app.schemas.component import SelectedComponents
from app.schemas.circuit import CircuitGraph
from app.schemas.validation import ValidationResult


# ─── JSON Schema Generators from Pydantic Models ───

INTENT_SCHEMA: dict[str, Any] = HardwareIntent.model_json_schema()

COMPONENTS_SCHEMA: dict[str, Any] = SelectedComponents.model_json_schema()

CIRCUIT_SCHEMA: dict[str, Any] = CircuitGraph.model_json_schema()

VALIDATION_SCHEMA: dict[str, Any] = ValidationResult.model_json_schema()


def schema_to_prompt_string(schema: dict[str, Any]) -> str:
    """Format a JSON schema for embedding in an LLM prompt."""
    return json.dumps(schema, indent=2)


# ─── Validators ───


class SchemaValidationError(Exception):
    """Raised when LLM output fails schema validation."""

    def __init__(self, phase: str, raw_output: str, errors: str):
        self.phase = phase
        self.raw_output = raw_output
        self.errors = errors
        super().__init__(f"[{phase}] Schema validation failed: {errors}")


def validate_intent_output(data: dict[str, Any]) -> HardwareIntent:
    """Validate and parse LLM output as HardwareIntent."""
    try:
        return HardwareIntent.model_validate(data)
    except ValidationError as e:
        raise SchemaValidationError(
            phase="intent_parsing",
            raw_output=json.dumps(data),
            errors=str(e),
        )


def validate_components_output(data: dict[str, Any]) -> SelectedComponents:
    """Validate and parse LLM output as SelectedComponents."""
    try:
        return SelectedComponents.model_validate(data)
    except ValidationError as e:
        raise SchemaValidationError(
            phase="component_selection",
            raw_output=json.dumps(data),
            errors=str(e),
        )


def validate_circuit_output(data: dict[str, Any]) -> CircuitGraph:
    """Validate and parse LLM output as CircuitGraph."""
    try:
        return CircuitGraph.model_validate(data)
    except ValidationError as e:
        raise SchemaValidationError(
            phase="circuit_generation",
            raw_output=json.dumps(data),
            errors=str(e),
        )


def validate_validation_output(data: dict[str, Any]) -> ValidationResult:
    """Validate and parse LLM output as ValidationResult."""
    try:
        return ValidationResult.model_validate(data)
    except ValidationError as e:
        raise SchemaValidationError(
            phase="validation",
            raw_output=json.dumps(data),
            errors=str(e),
        )
