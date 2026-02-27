"""Electrical Validation Engine — Deterministic Rule-Based Circuit Checker.

Pure Python. No AI. Fully unit-testable.

Validates a circuit graph against 7 electrical safety/correctness rules:
  1. Voltage compatibility between connected nodes
  2. Ground continuity for every IC
  3. Short circuit detection (VCC–GND paths)
  4. GPIO overcurrent risk (actuators on GPIO pins)
  5. Regulator dropout voltage compliance
  6. Decoupling capacitor presence per IC
  7. Pull-up resistor presence on I2C buses

Input:  CircuitGraph (Pydantic model)
Output: ValidationResult with status VALID|INVALID, errors[], warnings[]
"""

from __future__ import annotations

from app.schemas.circuit import CircuitGraph, CircuitNode, CircuitEdge
from app.schemas.validation import (
    ValidationResult,
    ValidationError,
    ValidationStatus,
    ValidationSeverity,
)


# ─── Internal Helpers ───


def _node_map(graph: CircuitGraph) -> dict[str, CircuitNode]:
    """Build id→node lookup for O(1) access."""
    return {n.id: n for n in graph.nodes}


def _edges_for_node(graph: CircuitGraph, node_id: str) -> list[CircuitEdge]:
    """Return all edges touching a node."""
    return [
        e for e in graph.edges if e.source_node == node_id or e.target_node == node_id
    ]


def _peer_node_id(edge: CircuitEdge, node_id: str) -> str:
    """Return the other node on an edge."""
    return edge.target_node if edge.source_node == node_id else edge.source_node


IC_TYPES = frozenset({"mcu", "sensor", "regulator"})
GPIO_MAX_CURRENT_MA = 20


# ═══════════════════════════════════════════════════════════
# Check 1: Voltage Compatibility
# ═══════════════════════════════════════════════════════════


def check_voltage_compatibility(
    graph: CircuitGraph,
) -> list[ValidationError]:
    """Verify every consumer on a power rail operates within its
    rated voltage range."""
    errors: list[ValidationError] = []
    nodes = _node_map(graph)

    for rail in graph.power_rails:
        for consumer_id in rail.consumers:
            node = nodes.get(consumer_id)
            if node is None:
                errors.append(
                    ValidationError(
                        code="E_UNKNOWN_CONSUMER",
                        severity=ValidationSeverity.ERROR,
                        message=(
                            f"Rail {rail.name}: consumer '{consumer_id}' "
                            f"not found in node list"
                        ),
                        node_ids=[consumer_id],
                        suggestion="Remove stale consumer reference",
                    )
                )
                continue

            props = node.properties
            v_min = float(props.get("operating_voltage_min", 0))
            v_max = float(props.get("operating_voltage_max", 5.5))

            if not (v_min <= rail.voltage <= v_max):
                errors.append(
                    ValidationError(
                        code="E_VOLTAGE_MISMATCH",
                        severity=ValidationSeverity.ERROR,
                        message=(
                            f"{node.id} ({node.part_number}) requires "
                            f"{v_min}–{v_max}V, but rail "
                            f"{rail.name} supplies {rail.voltage}V"
                        ),
                        node_ids=[node.id],
                        suggestion=(
                            "Add level shifter or select component "
                            f"compatible with {rail.voltage}V"
                        ),
                    )
                )

    return errors


# ═══════════════════════════════════════════════════════════
# Check 2: Ground Continuity
# ═══════════════════════════════════════════════════════════


def check_ground_continuity(
    graph: CircuitGraph,
) -> list[ValidationError]:
    """Every IC (MCU, sensor, regulator) must have at least one edge
    on the ground net."""
    errors: list[ValidationError] = []
    gnd = graph.ground_net

    # Build set of nodes with ground connections
    grounded: set[str] = set()
    for edge in graph.edges:
        if edge.net_name == gnd or edge.signal_type == "ground":
            grounded.add(edge.source_node)
            grounded.add(edge.target_node)

    for node in graph.nodes:
        if node.type in IC_TYPES and node.id not in grounded:
            errors.append(
                ValidationError(
                    code="E_MISSING_GROUND",
                    severity=ValidationSeverity.ERROR,
                    message=(
                        f"{node.id} ({node.part_number}) has no ground connection"
                    ),
                    node_ids=[node.id],
                    suggestion=f"Connect {node.id}.GND to {gnd}",
                )
            )

    return errors


# ═══════════════════════════════════════════════════════════
# Check 3: Short Circuit Detection
# ═══════════════════════════════════════════════════════════


def check_short_circuits(
    graph: CircuitGraph,
) -> list[ValidationError]:
    """Detect direct VCC→GND paths (short circuits).

    A true short is an edge that bridges a power OUTPUT pin
    (VCC, VOUT) to a GROUND pin (GND) on a non-ground net,
    meaning a power source is tied directly to ground without
    any load in between.

    Normal ground-routing edges (signal_type="ground" or
    net_name=GND) are NOT shorts — they are legitimate return
    current paths.
    """
    errors: list[ValidationError] = []
    gnd_net = graph.ground_net

    power_output_pins = frozenset({"VCC", "VOUT"})
    ground_pins = frozenset({"GND"})

    for edge in graph.edges:
        # Ground-routing edges are always OK
        if edge.signal_type == "ground" or edge.net_name == gnd_net:
            continue

        src_pin = edge.source_pin.upper()
        tgt_pin = edge.target_pin.upper()

        # Case 1: power output → ground pin on a non-ground net
        is_short = (src_pin in power_output_pins and tgt_pin in ground_pins) or (
            tgt_pin in power_output_pins and src_pin in ground_pins
        )

        if is_short:
            errors.append(
                ValidationError(
                    code="E_SHORT_CIRCUIT",
                    severity=ValidationSeverity.ERROR,
                    message=(
                        f"Short circuit: "
                        f"{edge.source_node}.{edge.source_pin}"
                        f" → {edge.target_node}.{edge.target_pin} "
                        f"on net {edge.net_name}"
                    ),
                    node_ids=[edge.source_node, edge.target_node],
                    suggestion=(
                        "Remove direct power-to-ground connection "
                        "or add a load between them"
                    ),
                )
            )

    return errors


# ═══════════════════════════════════════════════════════════
# Check 4: GPIO Overcurrent Risk
# ═══════════════════════════════════════════════════════════


def check_gpio_overcurrent(
    graph: CircuitGraph,
) -> list[ValidationError]:
    """Flag actuators or high-draw devices connected directly
    to MCU GPIO pins without a driver."""
    errors: list[ValidationError] = []
    nodes = _node_map(graph)

    for node in graph.nodes:
        if node.type != "mcu":
            continue

        max_ma = float(node.properties.get("gpio_max_current_mA", GPIO_MAX_CURRENT_MA))

        for edge in graph.edges:
            if edge.source_node != node.id:
                continue
            if edge.signal_type != "signal":
                continue

            target = nodes.get(edge.target_node)
            if target is None:
                continue

            # Actuators should use a driver transistor
            if target.type == "actuator":
                errors.append(
                    ValidationError(
                        code="W_GPIO_OVERCURRENT_RISK",
                        severity=ValidationSeverity.WARNING,
                        message=(
                            f"Actuator {target.id} connected directly "
                            f"to {node.id} GPIO "
                            f"(max {max_ma}mA per pin)"
                        ),
                        node_ids=[node.id, target.id],
                        suggestion=(
                            "Add MOSFET or transistor driver between GPIO and actuator"
                        ),
                    )
                )

            # Any load with known draw exceeding GPIO limit
            draw_ma = float(target.properties.get("current_draw_mA", 0))
            if draw_ma > max_ma:
                errors.append(
                    ValidationError(
                        code="E_GPIO_OVERCURRENT",
                        severity=ValidationSeverity.ERROR,
                        message=(
                            f"{target.id} draws {draw_ma}mA but "
                            f"{node.id} GPIO max is {max_ma}mA"
                        ),
                        node_ids=[node.id, target.id],
                        suggestion=(
                            f"Add driver circuit — GPIO can only source {max_ma}mA"
                        ),
                    )
                )

    return errors


# ═══════════════════════════════════════════════════════════
# Check 5: Regulator Dropout Voltage
# ═══════════════════════════════════════════════════════════


def check_regulator_dropout(
    graph: CircuitGraph,
) -> list[ValidationError]:
    """Verify input voltage exceeds Vout + dropout for every
    regulator, and does not fall below Vin_min."""
    errors: list[ValidationError] = []
    source_v = float(graph.power_source.get("voltage", 0))

    for node in graph.nodes:
        if node.type != "regulator":
            continue

        vout = float(node.properties.get("vout", 0))
        dropout = float(node.properties.get("dropout_v", 0))
        vin_min = float(node.properties.get("vin_min", 0))
        min_required = vout + dropout

        if source_v > 0 and source_v < min_required:
            errors.append(
                ValidationError(
                    code="E_DROPOUT_VIOLATION",
                    severity=ValidationSeverity.ERROR,
                    message=(
                        f"{node.id}: input {source_v}V < required "
                        f"{min_required}V "
                        f"(Vout={vout}V + dropout={dropout}V)"
                    ),
                    node_ids=[node.id],
                    suggestion=(
                        "Use a lower-dropout regulator or increase input voltage"
                    ),
                )
            )

        if source_v > 0 and vin_min > 0 and source_v < vin_min:
            errors.append(
                ValidationError(
                    code="E_VIN_BELOW_MIN",
                    severity=ValidationSeverity.ERROR,
                    message=(
                        f"{node.id}: input {source_v}V below minimum Vin={vin_min}V"
                    ),
                    node_ids=[node.id],
                    suggestion=(f"Ensure input voltage ≥ {vin_min}V"),
                )
            )

    return errors


# ═══════════════════════════════════════════════════════════
# Check 6: Decoupling Capacitors
# ═══════════════════════════════════════════════════════════


def check_decoupling_caps(
    graph: CircuitGraph,
) -> list[ValidationError]:
    """Every IC should have a nearby decoupling capacitor.
    Tracks per-IC coverage, not just global presence."""
    errors: list[ValidationError] = []
    nodes = _node_map(graph)

    # Map: cap node_id → set of IC node_ids it decouples
    cap_coverage: dict[str, set[str]] = {}
    for node in graph.nodes:
        if (
            node.type == "passive"
            and "decoupling" in node.properties.get("purpose", "").lower()
        ):
            # Find which IC this cap is connected to
            covered = set[str]()
            for edge in graph.edges:
                if edge.source_node == node.id:
                    peer = nodes.get(edge.target_node)
                elif edge.target_node == node.id:
                    peer = nodes.get(edge.source_node)
                else:
                    continue
                if peer and peer.type in IC_TYPES:
                    covered.add(peer.id)
            cap_coverage[node.id] = covered

    all_covered = set[str]()
    for covered in cap_coverage.values():
        all_covered |= covered

    # Check each IC
    uncovered: list[str] = []
    for node in graph.nodes:
        if node.type in IC_TYPES and node.id not in all_covered:
            uncovered.append(node.id)

    if uncovered:
        errors.append(
            ValidationError(
                code="W_MISSING_DECOUPLING",
                severity=ValidationSeverity.WARNING,
                message=(
                    f"{len(uncovered)} IC(s) without decoupling "
                    f"capacitor: {', '.join(uncovered)}"
                ),
                node_ids=uncovered,
                suggestion=(
                    "Add 100nF (0.1µF) ceramic capacitor "
                    "between each IC's VCC and GND pins"
                ),
            )
        )

    return errors


# ═══════════════════════════════════════════════════════════
# Check 7: Pull-Up Resistors on I2C
# ═══════════════════════════════════════════════════════════


def check_pull_up_resistors(
    graph: CircuitGraph,
) -> list[ValidationError]:
    """I2C buses require pull-up resistors on SDA and SCL."""
    errors: list[ValidationError] = []

    # Detect I2C usage
    i2c_edges = [
        e
        for e in graph.edges
        if (
            e.net_name.upper().startswith("I2C")
            or e.source_pin.upper() in ("SDA", "SCL")
            or e.target_pin.upper() in ("SDA", "SCL")
        )
    ]

    if not i2c_edges:
        return errors

    # Detect pull-up resistors
    has_sda_pullup = False
    has_scl_pullup = False

    for node in graph.nodes:
        if node.type != "passive":
            continue
        purpose = node.properties.get("purpose", "").lower()
        if "pull-up" not in purpose and "pullup" not in purpose:
            continue

        connected_pins = set[str]()
        for edge in graph.edges:
            if edge.source_node == node.id:
                connected_pins.add(edge.target_pin.upper())
            elif edge.target_node == node.id:
                connected_pins.add(edge.source_pin.upper())

        if "SDA" in connected_pins or "sda" in purpose:
            has_sda_pullup = True
        if "SCL" in connected_pins or "scl" in purpose:
            has_scl_pullup = True

    if not has_sda_pullup:
        errors.append(
            ValidationError(
                code="W_MISSING_I2C_PULLUP_SDA",
                severity=ValidationSeverity.WARNING,
                message="I2C SDA line has no pull-up resistor",
                node_ids=[],
                suggestion=("Add 4.7kΩ pull-up resistor on SDA to VCC"),
            )
        )

    if not has_scl_pullup:
        errors.append(
            ValidationError(
                code="W_MISSING_I2C_PULLUP_SCL",
                severity=ValidationSeverity.WARNING,
                message="I2C SCL line has no pull-up resistor",
                node_ids=[],
                suggestion=("Add 4.7kΩ pull-up resistor on SCL to VCC"),
            )
        )

    return errors


# ═══════════════════════════════════════════════════════════
# Main Validator
# ═══════════════════════════════════════════════════════════

# Registry of all checks — easily extendable
ALL_CHECKS = [
    check_voltage_compatibility,
    check_ground_continuity,
    check_short_circuits,
    check_gpio_overcurrent,
    check_regulator_dropout,
    check_decoupling_caps,
    check_pull_up_resistors,
]


def validate_circuit(
    graph: CircuitGraph,
    checks: list | None = None,
) -> ValidationResult:
    """Run all (or selected) validation checks on a circuit graph.

    Args:
        graph: The circuit graph to validate.
        checks: Optional subset of check functions to run.
                 Defaults to ALL_CHECKS.

    Returns:
        ValidationResult with VALID/INVALID status, errors, warnings.
    """
    check_fns = checks if checks is not None else ALL_CHECKS
    all_errors: list[ValidationError] = []
    all_warnings: list[ValidationError] = []
    checks_passed = 0

    for check_fn in check_fns:
        issues = check_fn(graph)
        errs = [e for e in issues if e.severity == ValidationSeverity.ERROR]
        warns = [e for e in issues if e.severity != ValidationSeverity.ERROR]
        all_errors.extend(errs)
        all_warnings.extend(warns)
        if not errs:
            checks_passed += 1

    status = (
        ValidationStatus.VALID if len(all_errors) == 0 else ValidationStatus.INVALID
    )

    return ValidationResult(
        status=status,
        errors=all_errors,
        warnings=all_warnings,
        checks_passed=checks_passed,
        checks_total=len(check_fns),
    )
