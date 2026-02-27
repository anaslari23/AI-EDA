"""Prompt templates for each AI pipeline phase.

Each function returns (system_prompt, user_prompt) to keep
prompt engineering cleanly separated from orchestration logic.
"""

from __future__ import annotations

import json
from typing import Any

from app.ai.llm_schemas import (
    INTENT_SCHEMA,
    COMPONENTS_SCHEMA,
    CIRCUIT_SCHEMA,
    VALIDATION_SCHEMA,
    schema_to_prompt_string,
)


# ─── Shared Rules ───

SHARED_RULES = """
CRITICAL RULES:
1. Return ONLY valid JSON. No markdown, no code fences, no explanations.
2. Follow the provided JSON schema EXACTLY.
3. Never hallucinate component specifications.
4. Only use components from the approved component database when provided.
5. Always respect voltage compatibility.
6. Prioritize safety and manufacturability.
7. If requirements are ambiguous, use sensible defaults — do NOT leave fields null unless the schema allows it.
""".strip()


# ─── Phase 1: Intent Parsing ───


def intent_parsing_prompts(user_description: str) -> tuple[str, str]:
    """Return (system, user) prompts for hardware intent extraction."""

    system = f"""You are a Hardware Intent Parser for an AI-native EDA platform.

Your task: Extract structured hardware requirements from a natural language device description.

{SHARED_RULES}

OUTPUT JSON SCHEMA:
{schema_to_prompt_string(INTENT_SCHEMA)}

FIELD GUIDELINES:
- device_type: Infer from context (e.g., "weather_station", "robot", "iot_sensor", "wearable").
- connectivity: Extract WiFi, BLE, LoRa, Zigbee, Ethernet, Cellular, etc.
- power_source: "battery", "usb", "mains", "solar", or combinations.
- environment: "indoor", "outdoor", "industrial", "underwater", "high_altitude".
- sensors: List specific sensor types (e.g., "temperature", "humidity", "accelerometer").
- actuators: List actuator types (e.g., "motor", "led", "buzzer", "servo").
- constraints.budget: Extract dollar amounts. Null if not mentioned.
- constraints.size: Extract dimensions or categories like "compact", "handheld". Null if not mentioned.
- constraints.battery_life: Extract durations like "6 months", "24 hours". Null if not mentioned.
- communication_protocol: Extract I2C, SPI, UART, etc.
- data_logging: true if the device stores or logs data."""

    user = f"""Parse this hardware device description and extract structured requirements:

\"{user_description}\"

Return ONLY the JSON object matching the schema. No other text."""

    return system, user


# ─── Phase 2: Component Selection ───


def component_selection_prompts(
    intent_json: dict[str, Any],
    approved_components: dict[str, Any],
) -> tuple[str, str]:
    """Return (system, user) prompts for component selection."""

    system = f"""You are a Component Selection Engine for an AI-native EDA platform.

Your task: Select real components from the approved database that satisfy the hardware requirements.

{SHARED_RULES}

ADDITIONAL RULES:
- MCU must support all required connectivity protocols.
- Sensor operating voltages must be compatible with MCU logic level.
- Always include one 0.1µF decoupling capacitor per IC power pin.
- If I2C is used, include 4.7kΩ pull-up resistors on SDA/SCL.
- If battery powered, include reverse polarity protection (Schottky diode).
- If a regulator is needed, choose one whose Vin_min ≤ supply voltage and dropout is compatible.
- Never invent components — ONLY select from the approved list.

OUTPUT JSON SCHEMA:
{schema_to_prompt_string(COMPONENTS_SCHEMA)}"""

    user = f"""Given these hardware requirements:
{json.dumps(intent_json, indent=2)}

And this approved component database:
{json.dumps(approved_components, indent=2)}

Select the optimal components. Return ONLY the JSON object matching the schema."""

    return system, user


# ─── Phase 3: Circuit Generation ───


def circuit_generation_prompts(
    components_json: dict[str, Any],
) -> tuple[str, str]:
    """Return (system, user) prompts for circuit graph generation."""

    system = f"""You are a Circuit Graph Generator for an AI-native EDA platform.

Your task: Create a complete circuit graph connecting all selected components.

{SHARED_RULES}

CIRCUIT GENERATION RULES:
- Every IC must have VCC and GND connections.
- Every sensor must be connected to the MCU via the correct protocol pins (I2C: SDA/SCL, SPI: MOSI/MISO/SCK/CS, Analog: ADC).
- Power rails must be properly defined with voltage and source.
- Include power → regulator → MCU → sensor signal paths.
- Include ground paths for all components.
- Each node must list all its physical pins.
- Each edge must specify source_pin and target_pin by exact name.

OUTPUT JSON SCHEMA:
{schema_to_prompt_string(CIRCUIT_SCHEMA)}"""

    user = f"""Generate a circuit graph for these selected components:
{json.dumps(components_json, indent=2)}

Create nodes for each component, define power rails, and generate all required edges.
Return ONLY the JSON object matching the schema."""

    return system, user


# ─── Phase 4: Validation ───


def validation_prompts(
    circuit_json: dict[str, Any],
) -> tuple[str, str]:
    """Return (system, user) prompts for electrical validation."""

    system = f"""You are an Electrical Validation Engine for an AI-native EDA platform.

Your task: Validate a circuit graph for electrical correctness and safety.

{SHARED_RULES}

VALIDATION CHECKS:
1. VOLTAGE COMPATIBILITY: Ensure all connected pins have compatible voltage levels.
2. GROUND CONTINUITY: Every IC must have a path to ground.
3. REGULATOR DROPOUT: Input voltage must exceed Vout + dropout.
4. MISSING DECOUPLING: Each IC should have a 0.1µF decoupling cap.
5. MISSING PULL-UPS: I2C buses need pull-up resistors.
6. GPIO OVERCURRENT: No GPIO should source > 20mA.
7. SHORT CIRCUITS: No direct VCC-to-GND paths.
8. UNCONNECTED PINS: Flag critical unconnected power/signal pins.

OUTPUT JSON SCHEMA:
{schema_to_prompt_string(VALIDATION_SCHEMA)}

For each error, provide:
- code: Machine-readable error code (e.g., "E_VOLTAGE_MISMATCH")
- severity: "error" or "warning"
- message: Human-readable description
- node_id: Affected component (if applicable)
- pin_id: Affected pin (if applicable)"""

    user = f"""Validate this circuit graph for electrical correctness:
{json.dumps(circuit_json, indent=2)}

Return ONLY the JSON object matching the schema."""

    return system, user


# ─── Retry Prompt ───


def retry_prompt(
    phase: str,
    previous_output: str,
    error_message: str,
    schema: dict[str, Any],
) -> tuple[str, str]:
    """Generate a correction prompt when the LLM returns malformed output."""

    system = f"""You are a JSON output correction engine.

Your previous output for the "{phase}" phase failed schema validation.
Fix the output to match the required schema EXACTLY.

{SHARED_RULES}

REQUIRED SCHEMA:
{schema_to_prompt_string(schema)}"""

    user = f"""Your previous output was:
{previous_output}

The validation error was:
{error_message}

Fix the JSON to match the schema. Return ONLY the corrected JSON object."""

    return system, user
