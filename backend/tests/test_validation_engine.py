"""Unit tests for the Electrical Validation Engine."""

import pytest

from app.schemas.circuit import (
    CircuitGraph,
    CircuitNode,
    CircuitEdge,
    PowerRail,
)
from app.schemas.validation import ValidationSeverity
from app.validation.engine import (
    check_voltage_compatibility,
    check_ground_continuity,
    check_short_circuits,
    check_gpio_overcurrent,
    check_regulator_dropout,
    check_decoupling_caps,
    check_pull_up_resistors,
    validate_circuit,
)


# ─── Fixtures ───


def _mcu_node(node_id: str = "MCU1") -> CircuitNode:
    return CircuitNode(
        id=node_id,
        type="mcu",
        part_number="ESP32",
        properties={"operating_voltage_min": 3.0, "operating_voltage_max": 3.6},
        pins=["VCC", "GND", "GPIO0", "SDA", "SCL"],
    )


def _sensor_node(
    node_id: str = "SENSOR1",
    v_min: float = 1.8,
    v_max: float = 3.6,
) -> CircuitNode:
    return CircuitNode(
        id=node_id,
        type="sensor",
        part_number="BME280",
        properties={"operating_voltage_min": v_min, "operating_voltage_max": v_max},
        pins=["VCC", "GND", "SDA", "SCL"],
    )


def _regulator_node(
    vout: float = 3.3,
    dropout: float = 0.3,
    vin_min: float = 3.6,
) -> CircuitNode:
    return CircuitNode(
        id="REG1",
        type="regulator",
        part_number="MCP1700",
        properties={"vout": vout, "dropout_v": dropout, "vin_min": vin_min},
        pins=["VIN", "GND", "VOUT"],
    )


def _gnd_edge(src: str, tgt: str) -> CircuitEdge:
    return CircuitEdge(
        id=f"e_{src}_{tgt}_gnd",
        source_node=src,
        source_pin="GND",
        target_node=tgt,
        target_pin="GND",
        net_name="GND",
        signal_type="ground",
    )


def _power_edge(src: str, tgt: str) -> CircuitEdge:
    return CircuitEdge(
        id=f"e_{src}_{tgt}_pwr",
        source_node=src,
        source_pin="VOUT",
        target_node=tgt,
        target_pin="VCC",
        net_name="VCC_3V3",
        signal_type="power",
    )


def _cap_node(cap_id: str = "CAP1") -> CircuitNode:
    return CircuitNode(
        id=cap_id,
        type="passive",
        part_number="C0805_100NF",
        properties={"purpose": "Decoupling capacitor"},
        pins=["P1", "P2"],
    )


def _pullup_node(
    res_id: str = "R_PU1",
    purpose: str = "I2C pull-up SDA",
) -> CircuitNode:
    return CircuitNode(
        id=res_id,
        type="passive",
        part_number="R0402_4K7",
        properties={"purpose": purpose},
        pins=["P1", "P2"],
    )


# ═══════════════════════════════════════════════════════════
# Test Check 1: Voltage Compatibility
# ═══════════════════════════════════════════════════════════


class TestVoltageCompatibility:
    def test_valid_voltage(self):
        graph = CircuitGraph(
            nodes=[_mcu_node(), _sensor_node()],
            power_rails=[
                PowerRail(
                    name="VCC",
                    voltage=3.3,
                    source_node="REG1",
                    consumers=["MCU1", "SENSOR1"],
                )
            ],
        )
        errors = check_voltage_compatibility(graph)
        assert len(errors) == 0

    def test_voltage_too_high(self):
        graph = CircuitGraph(
            nodes=[_sensor_node(v_min=1.8, v_max=3.6)],
            power_rails=[
                PowerRail(
                    name="VCC", voltage=5.0, source_node="REG1", consumers=["SENSOR1"]
                )
            ],
        )
        errors = check_voltage_compatibility(graph)
        assert len(errors) == 1
        assert errors[0].code == "E_VOLTAGE_MISMATCH"

    def test_voltage_too_low(self):
        graph = CircuitGraph(
            nodes=[_sensor_node(v_min=3.0, v_max=5.5)],
            power_rails=[
                PowerRail(
                    name="VCC", voltage=1.8, source_node="REG1", consumers=["SENSOR1"]
                )
            ],
        )
        errors = check_voltage_compatibility(graph)
        assert len(errors) == 1

    def test_unknown_consumer(self):
        graph = CircuitGraph(
            power_rails=[
                PowerRail(
                    name="VCC", voltage=3.3, source_node="REG1", consumers=["GHOST"]
                )
            ],
        )
        errors = check_voltage_compatibility(graph)
        assert len(errors) == 1
        assert errors[0].code == "E_UNKNOWN_CONSUMER"


# ═══════════════════════════════════════════════════════════
# Test Check 2: Ground Continuity
# ═══════════════════════════════════════════════════════════


class TestGroundContinuity:
    def test_all_grounded(self):
        mcu = _mcu_node()
        sensor = _sensor_node()
        graph = CircuitGraph(
            nodes=[mcu, sensor],
            edges=[_gnd_edge("MCU1", "SENSOR1")],
        )
        errors = check_ground_continuity(graph)
        assert len(errors) == 0

    def test_missing_ground(self):
        graph = CircuitGraph(nodes=[_mcu_node(), _sensor_node()])
        errors = check_ground_continuity(graph)
        assert len(errors) == 2
        assert all(e.code == "E_MISSING_GROUND" for e in errors)


# ═══════════════════════════════════════════════════════════
# Test Check 3: Short Circuits
# ═══════════════════════════════════════════════════════════


class TestShortCircuits:
    def test_no_short(self):
        graph = CircuitGraph(
            nodes=[_mcu_node()],
            edges=[_gnd_edge("MCU1", "MCU1")],
        )
        errors = check_short_circuits(graph)
        assert len(errors) == 0

    def test_direct_short(self):
        graph = CircuitGraph(
            nodes=[_mcu_node()],
            edges=[
                CircuitEdge(
                    id="short",
                    source_node="MCU1",
                    source_pin="VCC",
                    target_node="MCU1",
                    target_pin="GND",
                    net_name="SHORT",
                    signal_type="power",
                )
            ],
        )
        errors = check_short_circuits(graph)
        assert any(e.code == "E_SHORT_CIRCUIT" for e in errors)


# ═══════════════════════════════════════════════════════════
# Test Check 4: GPIO Overcurrent
# ═══════════════════════════════════════════════════════════


class TestGPIOOvercurrent:
    def test_no_actuator(self):
        graph = CircuitGraph(
            nodes=[_mcu_node(), _sensor_node()],
            edges=[
                CircuitEdge(
                    id="sig",
                    source_node="MCU1",
                    source_pin="GPIO0",
                    target_node="SENSOR1",
                    target_pin="CS",
                    net_name="SPI_CS",
                    signal_type="signal",
                )
            ],
        )
        errors = check_gpio_overcurrent(graph)
        assert len(errors) == 0

    def test_actuator_direct_connect(self):
        actuator = CircuitNode(
            id="MOTOR1",
            type="actuator",
            part_number="DC_MOTOR",
            properties={"current_draw_mA": 500},
            pins=["P1", "P2"],
        )
        graph = CircuitGraph(
            nodes=[_mcu_node(), actuator],
            edges=[
                CircuitEdge(
                    id="sig",
                    source_node="MCU1",
                    source_pin="GPIO0",
                    target_node="MOTOR1",
                    target_pin="P1",
                    net_name="MOTOR_CTRL",
                    signal_type="signal",
                )
            ],
        )
        errors = check_gpio_overcurrent(graph)
        assert len(errors) >= 1


# ═══════════════════════════════════════════════════════════
# Test Check 5: Regulator Dropout
# ═══════════════════════════════════════════════════════════


class TestRegulatorDropout:
    def test_valid_dropout(self):
        graph = CircuitGraph(
            nodes=[_regulator_node(vout=3.3, dropout=0.3, vin_min=3.6)],
            power_source={"voltage": 5.0},
        )
        errors = check_regulator_dropout(graph)
        assert len(errors) == 0

    def test_dropout_violation(self):
        graph = CircuitGraph(
            nodes=[_regulator_node(vout=3.3, dropout=1.1, vin_min=4.5)],
            power_source={"voltage": 3.7},
        )
        errors = check_regulator_dropout(graph)
        assert any(e.code == "E_DROPOUT_VIOLATION" for e in errors)

    def test_vin_below_min(self):
        graph = CircuitGraph(
            nodes=[_regulator_node(vout=3.3, dropout=0.3, vin_min=4.5)],
            power_source={"voltage": 3.7},
        )
        errors = check_regulator_dropout(graph)
        assert any(e.code == "E_VIN_BELOW_MIN" for e in errors)


# ═══════════════════════════════════════════════════════════
# Test Check 6: Decoupling Capacitors
# ═══════════════════════════════════════════════════════════


class TestDecouplingCaps:
    def test_cap_present(self):
        cap = _cap_node()
        graph = CircuitGraph(
            nodes=[_mcu_node(), cap],
            edges=[
                CircuitEdge(
                    id="cap_e",
                    source_node="CAP1",
                    source_pin="P1",
                    target_node="MCU1",
                    target_pin="VCC",
                    net_name="VCC",
                    signal_type="power",
                )
            ],
        )
        errors = check_decoupling_caps(graph)
        assert len(errors) == 0

    def test_cap_missing(self):
        graph = CircuitGraph(nodes=[_mcu_node()])
        errors = check_decoupling_caps(graph)
        assert len(errors) == 1
        assert errors[0].code == "W_MISSING_DECOUPLING"


# ═══════════════════════════════════════════════════════════
# Test Check 7: Pull-Up Resistors
# ═══════════════════════════════════════════════════════════


class TestPullUps:
    def test_no_i2c(self):
        graph = CircuitGraph(
            nodes=[_mcu_node()],
            edges=[_gnd_edge("MCU1", "MCU1")],
        )
        errors = check_pull_up_resistors(graph)
        assert len(errors) == 0

    def test_i2c_with_pullups(self):
        sda_r = _pullup_node("R_SDA", "I2C pull-up SDA")
        scl_r = _pullup_node("R_SCL", "I2C pull-up SCL")
        graph = CircuitGraph(
            nodes=[_mcu_node(), _sensor_node(), sda_r, scl_r],
            edges=[
                CircuitEdge(
                    id="i2c_sda",
                    source_node="MCU1",
                    source_pin="SDA",
                    target_node="SENSOR1",
                    target_pin="SDA",
                    net_name="I2C_SDA",
                    signal_type="signal",
                ),
                CircuitEdge(
                    id="i2c_scl",
                    source_node="MCU1",
                    source_pin="SCL",
                    target_node="SENSOR1",
                    target_pin="SCL",
                    net_name="I2C_SCL",
                    signal_type="signal",
                ),
                CircuitEdge(
                    id="pu_sda",
                    source_node="R_SDA",
                    source_pin="P1",
                    target_node="MCU1",
                    target_pin="SDA",
                    net_name="I2C_SDA",
                    signal_type="signal",
                ),
                CircuitEdge(
                    id="pu_scl",
                    source_node="R_SCL",
                    source_pin="P1",
                    target_node="MCU1",
                    target_pin="SCL",
                    net_name="I2C_SCL",
                    signal_type="signal",
                ),
            ],
        )
        errors = check_pull_up_resistors(graph)
        assert len(errors) == 0

    def test_i2c_without_pullups(self):
        graph = CircuitGraph(
            nodes=[_mcu_node(), _sensor_node()],
            edges=[
                CircuitEdge(
                    id="i2c_sda",
                    source_node="MCU1",
                    source_pin="SDA",
                    target_node="SENSOR1",
                    target_pin="SDA",
                    net_name="I2C_SDA",
                    signal_type="signal",
                ),
            ],
        )
        errors = check_pull_up_resistors(graph)
        assert len(errors) == 2  # Missing SDA + SCL pull-ups


# ═══════════════════════════════════════════════════════════
# Test Full Validator
# ═══════════════════════════════════════════════════════════


class TestFullValidator:
    def test_clean_circuit_valid(self):
        cap = _cap_node()
        graph = CircuitGraph(
            nodes=[_mcu_node(), cap],
            edges=[
                _gnd_edge("MCU1", "MCU1"),
                CircuitEdge(
                    id="cap_e",
                    source_node="CAP1",
                    source_pin="P1",
                    target_node="MCU1",
                    target_pin="VCC",
                    net_name="VCC",
                    signal_type="power",
                ),
            ],
            power_rails=[
                PowerRail(
                    name="VCC", voltage=3.3, source_node="REG1", consumers=["MCU1"]
                )
            ],
        )
        result = validate_circuit(graph)
        assert result.status.value == "VALID"
        assert result.checks_passed == result.checks_total

    def test_multiple_errors(self):
        graph = CircuitGraph(
            nodes=[_mcu_node(), _sensor_node(v_min=4.5, v_max=5.5)],
            power_rails=[
                PowerRail(
                    name="VCC", voltage=3.3, source_node="REG1", consumers=["SENSOR1"]
                )
            ],
        )
        result = validate_circuit(graph)
        assert result.status.value == "INVALID"
        assert len(result.errors) >= 1

    def test_selective_checks(self):
        graph = CircuitGraph(nodes=[_mcu_node()])
        result = validate_circuit(graph, checks=[check_ground_continuity])
        assert result.checks_total == 1
        assert len(result.errors) == 1
