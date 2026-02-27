"""Circuit Graph Generator — Engine 3

Generates a circuit graph from selected components.
Creates proper power rails, signal connections, and ground network.
"""

from __future__ import annotations

from app.schemas.component import SelectedComponents
from app.schemas.circuit import CircuitGraph, CircuitNode, CircuitEdge, PowerRail


def _mcu_node(components: SelectedComponents) -> CircuitNode:
    mcu = components.mcu
    pins = ["VCC", "GND"]
    pins.extend([f"GPIO{i}" for i in range(min(mcu.gpio_count, 20))])
    if "I2C" in mcu.interfaces:
        pins.extend(["SDA", "SCL"])
    if "SPI" in mcu.interfaces:
        pins.extend(["MOSI", "MISO", "SCK", "CS"])
    if "UART" in mcu.interfaces:
        pins.extend(["TX", "RX"])

    return CircuitNode(
        id="U1",
        type="mcu",
        part_number=mcu.part_number,
        properties={
            "operating_voltage": mcu.operating_voltage,
            "clock_mhz": mcu.clock_mhz,
            "gpio_max_current_mA": 40,
        },
        pins=pins,
    )


def _sensor_nodes(components: SelectedComponents) -> list[CircuitNode]:
    nodes = []
    for i, sensor in enumerate(components.sensors, start=1):
        pins = ["VCC", "GND"]
        if sensor.interface == "I2C":
            pins.extend(["SDA", "SCL"])
        elif sensor.interface == "SPI":
            pins.extend(["MOSI", "MISO", "SCK", "CS"])
        elif sensor.interface == "analog":
            pins.append("AOUT")
        else:
            pins.append("DOUT")

        nodes.append(
            CircuitNode(
                id=f"S{i}",
                type="sensor",
                part_number=sensor.part_number,
                properties={
                    "sensor_type": sensor.sensor_type,
                    "operating_voltage_min": sensor.operating_voltage_min,
                    "operating_voltage_max": sensor.operating_voltage_max,
                },
                pins=pins,
            )
        )
    return nodes


def _regulator_node(components: SelectedComponents) -> CircuitNode | None:
    if not components.regulators:
        return None
    reg = components.regulators[0]
    return CircuitNode(
        id="REG1",
        type="regulator",
        part_number=reg.part_number,
        properties={
            "vin_min": reg.vin_min,
            "vin_max": reg.vin_max,
            "vout": reg.vout,
            "dropout_v": reg.dropout_v,
            "max_current_ma": reg.max_current_ma,
        },
        pins=["VIN", "VOUT", "GND"],
    )


def _passive_nodes(components: SelectedComponents) -> list[CircuitNode]:
    nodes = []
    for i, passive in enumerate(components.passives, start=1):
        prefix = "C" if passive.component_type == "capacitor" else "R"
        nodes.append(
            CircuitNode(
                id=f"{prefix}{i}",
                type="passive",
                part_number=passive.part_number,
                properties={
                    "value": passive.value,
                    "purpose": passive.purpose,
                },
                pins=["P1", "P2"],
            )
        )
    return nodes


def _protection_nodes(components: SelectedComponents) -> list[CircuitNode]:
    nodes = []
    for i, prot in enumerate(components.protection, start=1):
        nodes.append(
            CircuitNode(
                id=f"D{i}",
                type="protection",
                part_number=prot.part_number,
                properties={
                    "rating": prot.rating,
                    "purpose": prot.purpose,
                },
                pins=["A", "K"]
                if "diode" in prot.component_type.lower()
                else ["P1", "P2"],
            )
        )
    return nodes


def _generate_edges(
    mcu: CircuitNode,
    sensors: list[CircuitNode],
    regulator: CircuitNode | None,
    passives: list[CircuitNode],
    protection: list[CircuitNode],
) -> list[CircuitEdge]:
    edges = []
    edge_counter = 0
    vcc_rail = "3V3"

    def _add_edge(
        src_node: str,
        src_pin: str,
        tgt_node: str,
        tgt_pin: str,
        net: str,
        sig_type: str = "power",
    ):
        nonlocal edge_counter
        edge_counter += 1
        edges.append(
            CircuitEdge(
                id=f"E{edge_counter}",
                source_node=src_node,
                source_pin=src_pin,
                target_node=tgt_node,
                target_pin=tgt_pin,
                net_name=net,
                signal_type=sig_type,
            )
        )

    # Power: regulator VOUT → MCU VCC
    if regulator:
        _add_edge(regulator.id, "VOUT", mcu.id, "VCC", vcc_rail)
        _add_edge(regulator.id, "GND", "GND", "GND", "GND")
    else:
        _add_edge("VBAT", "P", mcu.id, "VCC", vcc_rail)

    # MCU ground
    _add_edge(mcu.id, "GND", "GND", "GND", "GND")

    # Sensor connections
    gpio_index = 0
    for sensor in sensors:
        _add_edge(vcc_rail, "P", sensor.id, "VCC", vcc_rail)
        _add_edge(sensor.id, "GND", "GND", "GND", "GND")

        if "SDA" in sensor.pins:
            _add_edge(mcu.id, "SDA", sensor.id, "SDA", "I2C_SDA", "signal")
            _add_edge(mcu.id, "SCL", sensor.id, "SCL", "I2C_SCL", "signal")
        elif "MOSI" in sensor.pins:
            _add_edge(mcu.id, "MOSI", sensor.id, "MOSI", "SPI_MOSI", "signal")
            _add_edge(mcu.id, "MISO", sensor.id, "MISO", "SPI_MISO", "signal")
            _add_edge(mcu.id, "SCK", sensor.id, "SCK", "SPI_SCK", "signal")
            _add_edge(
                mcu.id,
                f"GPIO{gpio_index}",
                sensor.id,
                "CS",
                f"SPI_CS{gpio_index}",
                "signal",
            )
            gpio_index += 1
        elif "AOUT" in sensor.pins:
            _add_edge(
                sensor.id,
                "AOUT",
                mcu.id,
                f"GPIO{gpio_index}",
                f"ADC{gpio_index}",
                "signal",
            )
            gpio_index += 1

    # Decoupling caps — connect between VCC and GND
    for passive in passives:
        if passive.properties.get("purpose", "").startswith(
            "decoupling"
        ) or passive.properties.get("purpose", "").startswith("bulk"):
            _add_edge(vcc_rail, "P", passive.id, "P1", vcc_rail)
            _add_edge(passive.id, "P2", "GND", "GND", "GND")

    # Pull-ups — connect between VCC and signal line
    for passive in passives:
        if "pull-up" in passive.properties.get("purpose", "").lower():
            _add_edge(vcc_rail, "P", passive.id, "P1", vcc_rail)
            _add_edge(passive.id, "P2", mcu.id, "SDA", "I2C_SDA", "signal")

    # Protection — reverse polarity diode at battery input
    if protection and regulator:
        _add_edge("VBAT", "P", protection[0].id, "A", "VBAT_RAW")
        _add_edge(protection[0].id, "K", regulator.id, "VIN", "VBAT_PROT")

    return edges


def generate_circuit(components: SelectedComponents) -> CircuitGraph:
    """Generate a complete circuit graph from selected components."""
    mcu = _mcu_node(components)
    sensors = _sensor_nodes(components)
    regulator = _regulator_node(components)
    passives = _passive_nodes(components)
    protection = _protection_nodes(components)

    all_nodes = [mcu] + sensors + passives + protection
    if regulator:
        all_nodes.append(regulator)

    edges = _generate_edges(mcu, sensors, regulator, passives, protection)

    power_rails = [
        PowerRail(
            name="3V3",
            voltage=components.mcu.operating_voltage,
            source_node=regulator.id if regulator else "VBAT",
            consumers=[mcu.id] + [s.id for s in sensors],
        )
    ]

    power_source = {
        "type": components.power.get("battery", "unspecified"),
        "voltage": 3.7
        if "battery" in components.power.get("battery", "").lower()
        else 5.0,
    }

    return CircuitGraph(
        nodes=all_nodes,
        edges=edges,
        power_rails=power_rails,
        ground_net="GND",
        power_source=power_source,
    )
