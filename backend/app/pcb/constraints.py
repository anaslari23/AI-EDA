"""PCB Manufacturing Constraint Generator — Engine 6

Calculates PCB design rules based on circuit characteristics.
Uses IPC-2221 trace width standards.
"""

from __future__ import annotations

import math
from app.schemas.circuit import CircuitGraph
from app.schemas.pcb import PCBConstraints


# IPC-2221 trace width calculation constants
IPC_K_INTERNAL = 0.024
IPC_K_EXTERNAL = 0.048
IPC_B = 0.44
IPC_C = 0.725


def _estimate_max_current(graph: CircuitGraph) -> float:
    """Estimate maximum current draw from circuit components."""
    total_ma = 0.0
    for node in graph.nodes:
        if node.type == "mcu":
            total_ma += 80  # Typical active MCU draw
        elif node.type == "sensor":
            total_ma += 5  # Typical sensor draw
        elif node.type == "actuator":
            total_ma += 200  # Typical actuator draw
    return total_ma


def _calc_trace_width_mils(
    current_a: float,
    temp_rise_c: float = 10.0,
    copper_oz: float = 1.0,
    external: bool = True,
) -> float:
    """Calculate trace width in mils using IPC-2221."""
    k = IPC_K_EXTERNAL if external else IPC_K_INTERNAL
    thickness_mils = copper_oz * 1.378
    area = (current_a / (k * temp_rise_c**IPC_B)) ** (1 / IPC_C)
    width = area / thickness_mils
    return max(width, 6.0)  # Minimum 6 mil


def _recommend_layer_count(graph: CircuitGraph) -> int:
    """Recommend PCB layer count based on complexity."""
    node_count = len(graph.nodes)
    edge_count = len(graph.edges)
    has_high_speed = any(n.properties.get("clock_mhz", 0) > 100 for n in graph.nodes)

    if has_high_speed or node_count > 30 or edge_count > 60:
        return 4
    if node_count > 10 or edge_count > 25:
        return 2
    return 2


def generate_pcb_constraints(graph: CircuitGraph) -> PCBConstraints:
    """Generate PCB manufacturing constraints from a validated circuit."""
    max_current_ma = _estimate_max_current(graph)
    max_current_a = max_current_ma / 1000.0
    copper_oz = 1.0 if max_current_a < 1.0 else 2.0
    trace_width = _calc_trace_width_mils(max_current_a, copper_oz=copper_oz)
    layer_count = _recommend_layer_count(graph)

    thermal_notes = []
    if max_current_a > 0.5:
        thermal_notes.append(
            f"High current ({max_current_ma:.0f}mA): use wider power traces"
        )
    for node in graph.nodes:
        if node.type == "regulator":
            dropout = node.properties.get("dropout_v", 0)
            vout = node.properties.get("vout", 0)
            source_v = graph.power_source.get("voltage", 0)
            power_dissipation = (source_v - vout) * max_current_a
            if power_dissipation > 0.25:
                thermal_notes.append(
                    f"{node.id}: dissipates ~{power_dissipation:.2f}W — add thermal relief pad or heatsink"
                )

    if not thermal_notes:
        thermal_notes.append("Low power design — no special thermal considerations")

    return PCBConstraints(
        trace_width=f"{trace_width:.1f} mil ({trace_width * 0.0254:.2f} mm)",
        copper_thickness=f"{copper_oz} oz ({copper_oz * 35:.0f} µm)",
        layer_count=layer_count,
        clearance="6 mil (0.15 mm) minimum",
        ground_plane=layer_count >= 2,
        thermal_notes=thermal_notes,
    )
