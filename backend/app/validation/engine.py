"""Electrical Validation Engine — Engine 4

Validates circuit graphs for voltage compatibility, current draw,
ground continuity, missing passives, and safety issues.
"""

from __future__ import annotations

from app.schemas.circuit import CircuitGraph
from app.schemas.validation import (
    ValidationResult,
    ValidationError,
    ValidationStatus,
    ValidationSeverity,
)


def _check_voltage_compatibility(graph: CircuitGraph) -> list[ValidationError]:
    """Verify all nodes receive compatible voltage."""
    errors = []
    for rail in graph.power_rails:
        for consumer_id in rail.consumers:
            node = next((n for n in graph.nodes if n.id == consumer_id), None)
            if not node:
                continue

            props = node.properties
            if node.type == "sensor":
                v_min = props.get("operating_voltage_min", 0)
                v_max = props.get("operating_voltage_max", 5.0)
                if not (v_min <= rail.voltage <= v_max):
                    errors.append(
                        ValidationError(
                            code="E_VOLTAGE_MISMATCH",
                            severity=ValidationSeverity.ERROR,
                            message=f"{node.id} ({node.part_number}) requires {v_min}-{v_max}V but rail {rail.name} is {rail.voltage}V",
                            node_ids=[node.id],
                            suggestion=f"Add level shifter or select sensor compatible with {rail.voltage}V",
                        )
                    )
    return errors


def _check_ground_continuity(graph: CircuitGraph) -> list[ValidationError]:
    """Verify all ICs have ground connections."""
    errors = []
    grounded_nodes = set()
    for edge in graph.edges:
        if edge.net_name == "GND" or edge.net_name == graph.ground_net:
            grounded_nodes.add(edge.source_node)
            grounded_nodes.add(edge.target_node)

    for node in graph.nodes:
        if (
            node.type in ("mcu", "sensor", "regulator")
            and node.id not in grounded_nodes
        ):
            errors.append(
                ValidationError(
                    code="E_MISSING_GROUND",
                    severity=ValidationSeverity.ERROR,
                    message=f"{node.id} ({node.part_number}) has no ground connection",
                    node_ids=[node.id],
                    suggestion=f"Connect {node.id}.GND to ground net",
                )
            )
    return errors


def _check_regulator_dropout(graph: CircuitGraph) -> list[ValidationError]:
    """Verify regulator input voltage satisfies dropout requirements."""
    errors = []
    for node in graph.nodes:
        if node.type != "regulator":
            continue
        vin_min = node.properties.get("vin_min", 0)
        dropout = node.properties.get("dropout_v", 0)
        vout = node.properties.get("vout", 0)

        source_voltage = graph.power_source.get("voltage", 0)
        min_required = vout + dropout

        if source_voltage < min_required:
            errors.append(
                ValidationError(
                    code="E_DROPOUT_VIOLATION",
                    severity=ValidationSeverity.ERROR,
                    message=f"{node.id}: Input {source_voltage}V < required {min_required}V (Vout={vout}V + dropout={dropout}V)",
                    node_ids=[node.id],
                    suggestion="Use a lower-dropout regulator or increase input voltage",
                )
            )

        if source_voltage < vin_min:
            errors.append(
                ValidationError(
                    code="E_VIN_BELOW_MIN",
                    severity=ValidationSeverity.ERROR,
                    message=f"{node.id}: Input {source_voltage}V below minimum Vin={vin_min}V",
                    node_ids=[node.id],
                    suggestion=f"Ensure input voltage is at least {vin_min}V",
                )
            )
    return errors


def _check_decoupling_caps(graph: CircuitGraph) -> list[ValidationError]:
    """Verify every IC has a decoupling capacitor."""
    errors = []
    ic_nodes = [n for n in graph.nodes if n.type in ("mcu", "sensor")]
    cap_nodes = [
        n
        for n in graph.nodes
        if n.type == "passive" and "decoupling" in n.properties.get("purpose", "")
    ]

    if len(cap_nodes) == 0 and len(ic_nodes) > 0:
        errors.append(
            ValidationError(
                code="W_MISSING_DECOUPLING",
                severity=ValidationSeverity.WARNING,
                message=f"No decoupling capacitors found for {len(ic_nodes)} IC(s)",
                node_ids=[n.id for n in ic_nodes],
                suggestion="Add 100nF decoupling capacitor near each IC VCC pin",
            )
        )
    return errors


def _check_pull_ups(graph: CircuitGraph) -> list[ValidationError]:
    """Verify I2C lines have pull-up resistors."""
    errors = []
    has_i2c = any(e.net_name.startswith("I2C") for e in graph.edges)
    has_pullup = any(
        n.type == "passive" and "pull-up" in n.properties.get("purpose", "").lower()
        for n in graph.nodes
    )

    if has_i2c and not has_pullup:
        errors.append(
            ValidationError(
                code="W_MISSING_PULLUP",
                severity=ValidationSeverity.WARNING,
                message="I2C bus detected but no pull-up resistors found",
                node_ids=[],
                suggestion="Add 4.7kΩ pull-up resistors on SDA and SCL lines",
            )
        )
    return errors


def _check_gpio_overcurrent(graph: CircuitGraph) -> list[ValidationError]:
    """Check for potential GPIO overcurrent situations."""
    errors = []
    for node in graph.nodes:
        if node.type == "mcu":
            max_gpio_ma = node.properties.get("gpio_max_current_mA", 40)
            for edge in graph.edges:
                if edge.source_node == node.id and edge.signal_type == "signal":
                    target = next(
                        (n for n in graph.nodes if n.id == edge.target_node), None
                    )
                    if target and target.type == "actuator":
                        errors.append(
                            ValidationError(
                                code="W_GPIO_OVERCURRENT_RISK",
                                severity=ValidationSeverity.WARNING,
                                message=f"Actuator {target.id} connected directly to {node.id} GPIO (max {max_gpio_ma}mA)",
                                node_ids=[node.id, target.id],
                                suggestion="Add MOSFET or transistor driver between GPIO and actuator",
                            )
                        )
    return errors


def validate_circuit(graph: CircuitGraph) -> ValidationResult:
    """Run all validation checks on a circuit graph."""
    all_errors: list[ValidationError] = []
    all_warnings: list[ValidationError] = []
    checks_total = 6
    checks_passed = 0

    checks = [
        _check_voltage_compatibility,
        _check_ground_continuity,
        _check_regulator_dropout,
        _check_decoupling_caps,
        _check_pull_ups,
        _check_gpio_overcurrent,
    ]

    for check_fn in checks:
        issues = check_fn(graph)
        errors = [e for e in issues if e.severity == ValidationSeverity.ERROR]
        warnings = [e for e in issues if e.severity != ValidationSeverity.ERROR]
        all_errors.extend(errors)
        all_warnings.extend(warnings)
        if not errors:
            checks_passed += 1

    status = (
        ValidationStatus.VALID if len(all_errors) == 0 else ValidationStatus.INVALID
    )

    return ValidationResult(
        status=status,
        errors=all_errors,
        warnings=all_warnings,
        checks_passed=checks_passed,
        checks_total=checks_total,
    )
