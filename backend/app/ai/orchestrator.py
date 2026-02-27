"""LLM-powered AI Orchestrator for the EDA pipeline.

Uses an OpenAI-compatible client to run 4 pipeline phases:
  1. parse_intent()       — NL → HardwareIntent
  2. select_components()  — HardwareIntent → SelectedComponents
  3. generate_circuit()   — SelectedComponents → CircuitGraph
  4. validate()           — CircuitGraph → ValidationResult

Each phase enforces strict JSON schema validation with automatic retry.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from openai import AsyncOpenAI, APIError

from app.config import get_settings
from app.schemas.intent import HardwareIntent
from app.schemas.component import SelectedComponents
from app.schemas.circuit import CircuitGraph
from app.schemas.validation import ValidationResult

from app.ai.llm_schemas import (
    INTENT_SCHEMA,
    COMPONENTS_SCHEMA,
    CIRCUIT_SCHEMA,
    VALIDATION_SCHEMA,
    validate_intent_output,
    validate_components_output,
    validate_circuit_output,
    validate_validation_output,
    SchemaValidationError,
)
from app.ai.prompts import (
    intent_parsing_prompts,
    component_selection_prompts,
    circuit_generation_prompts,
    validation_prompts,
    retry_prompt,
)

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
APPROVED_COMPONENTS_PATH = (
    Path(__file__).parent.parent.parent / "data" / "approved_components.json"
)


# ─── Client Factory ───


def _create_client() -> AsyncOpenAI:
    """Create an OpenAI-compatible async client.

    Works with:
      - OpenAI API (default)
      - Azure OpenAI (set base_url + api_key)
      - Local models via OpenAI-compatible servers (LM Studio, Ollama, vLLM)
      - Any OpenAI-compatible proxy
    """
    settings = get_settings()
    return AsyncOpenAI(
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url or None,
        timeout=60.0,
    )


def _load_approved_components() -> dict[str, Any]:
    """Load the approved component database."""
    with open(APPROVED_COMPONENTS_PATH) as f:
        return json.load(f)


# ─── Core LLM Call ───


async def _llm_call(
    client: AsyncOpenAI,
    system_prompt: str,
    user_prompt: str,
    model: str | None = None,
    temperature: float = 0.1,
) -> str:
    """Make a single LLM call and return the raw text response."""
    settings = get_settings()
    model = model or settings.llm_model

    try:
        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=temperature,
            response_format={"type": "json_object"},
        )
        return response.choices[0].message.content or "{}"
    except APIError as e:
        logger.error("LLM API error: %s", e)
        raise


async def _llm_call_with_retry(
    client: AsyncOpenAI,
    system_prompt: str,
    user_prompt: str,
    phase: str,
    schema: dict[str, Any],
    validator: Any,
    model: str | None = None,
) -> Any:
    """Call LLM with automatic retry on schema validation failure.

    Returns the validated Pydantic model instance.
    """
    last_error: Exception | None = None
    raw_output = ""

    for attempt in range(MAX_RETRIES):
        if attempt == 0:
            sys_prompt, usr_prompt = system_prompt, user_prompt
        else:
            # Use retry prompt with previous error context
            sys_prompt, usr_prompt = retry_prompt(
                phase=phase,
                previous_output=raw_output,
                error_message=str(last_error),
                schema=schema,
            )

        raw_output = await _llm_call(client, sys_prompt, usr_prompt, model)

        try:
            parsed = json.loads(raw_output)
            result = validator(parsed)
            logger.info(
                "[%s] Success on attempt %d/%d", phase, attempt + 1, MAX_RETRIES
            )
            return result
        except json.JSONDecodeError as e:
            last_error = e
            logger.warning("[%s] Attempt %d: Invalid JSON — %s", phase, attempt + 1, e)
        except SchemaValidationError as e:
            last_error = e
            logger.warning(
                "[%s] Attempt %d: Schema error — %s", phase, attempt + 1, e.errors
            )

    raise RuntimeError(
        f"[{phase}] Failed after {MAX_RETRIES} attempts. Last error: {last_error}"
    )


# ─── Pipeline Phase Functions ───


async def parse_intent(
    description: str,
    client: AsyncOpenAI | None = None,
) -> HardwareIntent:
    """Phase 1: Parse natural language into structured hardware intent.

    Args:
        description: Natural language device description.
        client: Optional pre-configured client. Creates default if None.

    Returns:
        Validated HardwareIntent.
    """
    client = client or _create_client()
    system, user = intent_parsing_prompts(description)

    return await _llm_call_with_retry(
        client=client,
        system_prompt=system,
        user_prompt=user,
        phase="intent_parsing",
        schema=INTENT_SCHEMA,
        validator=validate_intent_output,
    )


async def select_components(
    intent: HardwareIntent,
    client: AsyncOpenAI | None = None,
) -> SelectedComponents:
    """Phase 2: Select components from approved database.

    Args:
        intent: Parsed hardware intent.
        client: Optional pre-configured client.

    Returns:
        Validated SelectedComponents.
    """
    client = client or _create_client()
    approved = _load_approved_components()
    system, user = component_selection_prompts(intent.model_dump(), approved)

    return await _llm_call_with_retry(
        client=client,
        system_prompt=system,
        user_prompt=user,
        phase="component_selection",
        schema=COMPONENTS_SCHEMA,
        validator=validate_components_output,
    )


async def generate_circuit(
    components: SelectedComponents,
    client: AsyncOpenAI | None = None,
) -> CircuitGraph:
    """Phase 3: Generate circuit graph from selected components.

    Args:
        components: Selected components with passives and protection.
        client: Optional pre-configured client.

    Returns:
        Validated CircuitGraph.
    """
    client = client or _create_client()
    system, user = circuit_generation_prompts(components.model_dump())

    return await _llm_call_with_retry(
        client=client,
        system_prompt=system,
        user_prompt=user,
        phase="circuit_generation",
        schema=CIRCUIT_SCHEMA,
        validator=validate_circuit_output,
    )


async def validate(
    circuit: CircuitGraph,
    client: AsyncOpenAI | None = None,
) -> ValidationResult:
    """Phase 4: Validate circuit for electrical correctness.

    Args:
        circuit: Circuit graph to validate.
        client: Optional pre-configured client.

    Returns:
        Validated ValidationResult.
    """
    client = client or _create_client()
    system, user = validation_prompts(circuit.model_dump())

    return await _llm_call_with_retry(
        client=client,
        system_prompt=system,
        user_prompt=user,
        phase="validation",
        schema=VALIDATION_SCHEMA,
        validator=validate_validation_output,
    )


# ─── Full Pipeline ───


async def run_pipeline(
    description: str,
    client: AsyncOpenAI | None = None,
) -> dict[str, Any]:
    """Run the complete AI pipeline end-to-end.

    Returns a dict with all phase outputs.
    """
    client = client or _create_client()

    logger.info("Pipeline START: %s...", description[:80])

    # Phase 1
    intent = await parse_intent(description, client)
    logger.info("Phase 1 complete — device_type=%s", intent.device_type)

    # Phase 2
    components = await select_components(intent, client)
    logger.info(
        "Phase 2 complete — mcu=%s, sensors=%d",
        components.mcu.part_number if components.mcu else "none",
        len(components.sensors),
    )

    # Phase 3
    circuit = await generate_circuit(components, client)
    logger.info(
        "Phase 3 complete — nodes=%d, edges=%d",
        len(circuit.nodes),
        len(circuit.edges),
    )

    # Phase 4
    validation_result = await validate(circuit, client)
    logger.info(
        "Phase 4 complete — status=%s, errors=%d",
        validation_result.status,
        len(validation_result.errors),
    )

    return {
        "intent": intent.model_dump(),
        "components": components.model_dump(),
        "circuit": circuit.model_dump(),
        "validation": validation_result.model_dump(),
        "pipeline_status": "completed"
        if validation_result.status.value == "VALID"
        else "completed_with_errors",
    }
