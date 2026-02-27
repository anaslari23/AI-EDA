"""Component Selection Engine — Engine 2

Matches hardware intent to approved components from the component database.
Enforces voltage compatibility and always includes required passives.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.schemas.intent import HardwareIntent
from app.schemas.component import (
    MCU,
    Sensor,
    Regulator,
    Passive,
    Protection,
    SelectedComponents,
)

COMPONENT_DB_PATH = (
    Path(__file__).parent.parent.parent / "data" / "approved_components.json"
)


def _load_component_db() -> dict:
    """Load the approved component database."""
    with open(COMPONENT_DB_PATH, "r") as f:
        return json.load(f)


def _select_mcu(intent: HardwareIntent, db: dict) -> MCU:
    """Select MCU based on connectivity and interface requirements."""
    best_match = None
    best_score = -1

    for mcu_data in db.get("mcus", []):
        score = 0
        mcu_wireless = [w.lower() for w in mcu_data.get("wireless", [])]
        mcu_interfaces = [i.lower() for i in mcu_data.get("interfaces", [])]

        for conn in intent.connectivity:
            if conn.lower() in mcu_wireless or conn.lower() in [
                w.replace(" ", "") for w in mcu_wireless
            ]:
                score += 10

        for proto in intent.communication_protocol:
            if proto.lower() in mcu_interfaces:
                score += 5

        if intent.power_source and "battery" in intent.power_source.lower():
            if mcu_data.get("operating_voltage", 5.0) <= 3.3:
                score += 3

        if intent.constraints.budget:
            budget_val = float(intent.constraints.budget.replace("$", ""))
            if mcu_data.get("unit_price", 0) < budget_val * 0.3:
                score += 2

        if score > best_score:
            best_score = score
            best_match = mcu_data

    if not best_match and db.get("mcus"):
        best_match = db["mcus"][0]

    return MCU(**best_match)


def _select_sensors(
    intent: HardwareIntent, db: dict, mcu_voltage: float
) -> list[Sensor]:
    """Select sensors matching required types and MCU voltage. Deduplicates by part number."""
    selected: list[Sensor] = []
    selected_pns: set[str] = set()

    for required_sensor in intent.sensors:
        for sensor_data in db.get("sensors", []):
            pn = sensor_data.get("part_number", "")
            if pn in selected_pns:
                continue

            sensor_type = sensor_data.get("sensor_type", "").lower()
            required_lower = required_sensor.lower()

            if required_lower in sensor_type or sensor_type in required_lower:
                v_min = sensor_data.get("operating_voltage_min", 0)
                v_max = sensor_data.get("operating_voltage_max", 5.0)
                if v_min <= mcu_voltage <= v_max:
                    selected.append(Sensor(**sensor_data))
                    selected_pns.add(pn)
                    break
    return selected


def _select_regulator(
    intent: HardwareIntent, db: dict, mcu_voltage: float
) -> list[Regulator]:
    """Select voltage regulator based on power source and MCU voltage.
    For battery-powered designs, prefer lowest dropout voltage."""
    candidates = []
    for reg_data in db.get("regulators", []):
        if abs(reg_data.get("vout", 0) - mcu_voltage) < 0.1:
            candidates.append(reg_data)

    if not candidates:
        return []

    is_battery = bool(intent.power_source and "battery" in intent.power_source.lower())

    if is_battery:
        # Sort by dropout voltage (ascending) — prefer LDO with lowest dropout
        candidates.sort(key=lambda r: r.get("dropout_v", 999))
    else:
        # Sort by max current (descending) — prefer highest capacity
        candidates.sort(key=lambda r: r.get("max_current_ma", 0), reverse=True)

    return [Regulator(**candidates[0])]


def _generate_passives(
    mcu: MCU, sensors: list[Sensor], intent: HardwareIntent
) -> list[Passive]:
    """Generate required passive components — decoupling caps, pull-ups."""
    passives = []
    ic_count = 1 + len(sensors)  # MCU + sensors

    # 100nF decoupling cap per IC
    passives.append(
        Passive(
            part_number="GRM188R71C104KA01D",
            component_type="capacitor",
            value="100nF",
            voltage_rating="16V",
            package="0402",
            unit_price=0.01,
            purpose=f"decoupling capacitor (x{ic_count})",
        )
    )

    # 10uF bulk cap for MCU power
    passives.append(
        Passive(
            part_number="GRM188R61A106ME69D",
            component_type="capacitor",
            value="10uF",
            voltage_rating="10V",
            package="0402",
            unit_price=0.02,
            purpose="bulk decoupling for MCU VCC",
        )
    )

    # I2C pull-ups if I2C is used
    has_i2c = any("i2c" in p.lower() for p in intent.communication_protocol) or any(
        s.interface.lower() == "i2c" for s in sensors
    )
    if has_i2c:
        passives.append(
            Passive(
                part_number="RC0402FR-074K7L",
                component_type="resistor",
                value="4.7kΩ",
                voltage_rating=None,
                package="0402",
                unit_price=0.01,
                purpose="I2C pull-up resistor (x2, SDA+SCL)",
            )
        )

    return passives


def _generate_protection(intent: HardwareIntent) -> list[Protection]:
    """Generate protection components for battery-powered designs."""
    protection = []

    if intent.power_source and "battery" in intent.power_source.lower():
        protection.append(
            Protection(
                part_number="MBR0520LT1G",
                component_type="Schottky diode",
                rating="20V 0.5A",
                package="SOD-123",
                unit_price=0.15,
                purpose="reverse polarity protection",
            )
        )

    return protection


def select_components(intent: HardwareIntent) -> SelectedComponents:
    """Run the full component selection pipeline."""
    db = _load_component_db()

    mcu = _select_mcu(intent, db)
    sensors = _select_sensors(intent, db, mcu.operating_voltage)
    regulators = _select_regulator(intent, db, mcu.operating_voltage)
    passives = _generate_passives(mcu, sensors, intent)
    protection = _generate_protection(intent)

    power_info = {
        "battery": intent.power_source or "unspecified",
        "regulator": regulators[0].part_number if regulators else None,
        "charging_ic": None,
    }

    return SelectedComponents(
        mcu=mcu,
        sensors=sensors,
        power=power_info,
        regulators=regulators,
        passives=passives,
        protection=protection,
    )
