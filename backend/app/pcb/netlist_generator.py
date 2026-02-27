"""KiCad Netlist Generator — Circuit Graph → KiCad NET format.

Converts the internal CircuitGraph representation into a KiCad-
compatible netlist file (S-expression format used by KiCad 6+).

Pure Python. Deterministic. No AI.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TextIO
from io import StringIO

from app.schemas.circuit import CircuitGraph, CircuitNode, CircuitEdge


# ─── Footprint Mapping ───

DEFAULT_FOOTPRINTS: dict[str, str] = {
    "mcu": "Package_QFP:LQFP-48_7x7mm_P0.5mm",
    "sensor": "Package_LGA:LGA-8_3x3mm_P0.5mm",
    "regulator": "Package_TO_SOT_SMD:SOT-223-3_TabPin2",
    "passive_cap": "Capacitor_SMD:C_0402_1005Metric",
    "passive_res": "Resistor_SMD:R_0402_1005Metric",
    "passive": "Capacitor_SMD:C_0805_2012Metric",
    "protection": "Diode_SMD:D_SOD-323",
    "connector": "Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical",
}

REFERENCE_PREFIXES: dict[str, str] = {
    "mcu": "U",
    "sensor": "U",
    "regulator": "U",
    "passive": "C",
    "protection": "D",
    "connector": "J",
}


def _ref_designator(node: CircuitNode, index: int) -> str:
    """Generate reference designator from node type + index."""
    prefix = REFERENCE_PREFIXES.get(node.type, "X")
    # Distinguish resistors from capacitors
    purpose = node.properties.get("purpose", "").lower()
    if node.type == "passive":
        if "resistor" in purpose or "pull-up" in purpose:
            prefix = "R"
        elif "capacitor" in purpose or "decoupling" in purpose:
            prefix = "C"
    return f"{prefix}{index + 1}"


def _footprint(node: CircuitNode) -> str:
    """Select footprint based on node type and properties."""
    pkg = node.properties.get("package", "")
    if pkg:
        return pkg

    if node.type == "passive":
        purpose = node.properties.get("purpose", "").lower()
        if "resistor" in purpose or "pull-up" in purpose:
            return DEFAULT_FOOTPRINTS["passive_res"]
        return DEFAULT_FOOTPRINTS["passive_cap"]

    return DEFAULT_FOOTPRINTS.get(node.type, DEFAULT_FOOTPRINTS["passive"])


# ─── Net Extraction ───


class Net:
    """Represents a single net (named electrical connection)."""

    __slots__ = ("name", "code", "pins")

    def __init__(self, name: str, code: int):
        self.name = name
        self.code = code
        self.pins: list[tuple[str, str]] = []  # (ref_designator, pin_name)

    def add_pin(self, ref: str, pin: str) -> None:
        self.pins.append((ref, pin))


def _extract_nets(
    graph: CircuitGraph,
    ref_map: dict[str, str],
) -> list[Net]:
    """Build net list from circuit edges.

    Groups edges by net_name and collects all connected
    (component, pin) pairs per net.
    """
    net_dict: dict[str, Net] = {}
    net_code = 1  # 0 reserved for unconnected

    for edge in graph.edges:
        name = edge.net_name
        if name not in net_dict:
            net_dict[name] = Net(name, net_code)
            net_code += 1

        net = net_dict[name]
        src_ref = ref_map.get(edge.source_node, edge.source_node)
        tgt_ref = ref_map.get(edge.target_node, edge.target_node)

        pair_src = (src_ref, edge.source_pin)
        pair_tgt = (tgt_ref, edge.target_pin)

        if pair_src not in net.pins:
            net.add_pin(*pair_src)
        if pair_tgt not in net.pins:
            net.add_pin(*pair_tgt)

    return list(net_dict.values())


# ─── Netlist Writer (KiCad S-expression) ───


def generate_netlist(graph: CircuitGraph) -> str:
    """Convert CircuitGraph to KiCad netlist string (S-expression).

    Returns the full .net file content as a string.
    """
    buf = StringIO()
    _write_netlist(graph, buf)
    return buf.getvalue()


def write_netlist_file(graph: CircuitGraph, path: str) -> None:
    """Write KiCad netlist to a file path."""
    content = generate_netlist(graph)
    with open(path, "w") as f:
        f.write(content)


def _write_netlist(graph: CircuitGraph, out: TextIO) -> None:
    """Write complete KiCad netlist S-expression to stream."""

    # Build reference designator map
    ref_map: dict[str, str] = {}
    for i, node in enumerate(graph.nodes):
        ref_map[node.id] = _ref_designator(node, i)

    nets = _extract_nets(graph, ref_map)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    out.write("(export (version D)\n")

    # ─ Design section
    out.write("  (design\n")
    out.write(f'    (source "ANTIGRAVITY AI EDA")\n')
    out.write(f'    (date "{timestamp}")\n')
    out.write(f'    (tool "ANTIGRAVITY PCB Generator 1.0")\n')
    out.write("  )\n")

    # ─ Components section
    out.write("  (components\n")
    for node in graph.nodes:
        ref = ref_map[node.id]
        fp = _footprint(node)
        value = node.part_number
        out.write("    (comp\n")
        out.write(f'      (ref "{ref}")\n')
        out.write(f'      (value "{value}")\n')
        out.write(f'      (footprint "{fp}")\n')
        out.write(f"      (fields\n")
        out.write(f'        (field (name "Type") "{node.type}")\n')
        out.write(f'        (field (name "InternalID") "{node.id}")\n')
        out.write(f"      )\n")
        out.write("    )\n")
    out.write("  )\n")

    # ─ Nets section
    out.write("  (nets\n")
    out.write('    (net (code 0) (name "unconnected"))\n')
    for net in nets:
        out.write(f'    (net (code {net.code}) (name "{net.name}"))\n')
    out.write("  )\n")

    # ─ Net connections (libparts section simplified)
    out.write("  (net_classes\n")
    out.write("    (net_class Default\n")
    out.write("      (clearance 0.15)\n")
    out.write("      (trace_width 0.15)\n")
    out.write("      (via_dia 0.6)\n")
    out.write("      (via_drill 0.3)\n")
    for net in nets:
        out.write(f'      (add_net "{net.name}")\n')
    out.write("    )\n")
    out.write("  )\n")

    out.write(")\n")


# ─── Utility ───


def get_ref_map(graph: CircuitGraph) -> dict[str, str]:
    """Return node_id → reference designator mapping."""
    return {node.id: _ref_designator(node, i) for i, node in enumerate(graph.nodes)}


def get_net_list(
    graph: CircuitGraph,
) -> list[dict[str, object]]:
    """Return nets as plain dicts for API/JSON use."""
    ref_map = get_ref_map(graph)
    nets = _extract_nets(graph, ref_map)
    return [
        {
            "name": net.name,
            "code": net.code,
            "pins": [{"ref": r, "pin": p} for r, p in net.pins],
        }
        for net in nets
    ]
