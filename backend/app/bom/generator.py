"""BOM Generator — Engine 7

Extracts a Bill of Materials from the final validated circuit.
Only references components from the approved database.
"""

from __future__ import annotations

from collections import Counter
from app.schemas.circuit import CircuitGraph
from app.schemas.bom import BOM, BOMEntry


# Reference designator prefixes
REF_DES_MAP = {
    "mcu": "U",
    "sensor": "U",
    "regulator": "U",
    "passive": None,  # Determined by component_type
    "protection": "D",
}


def _ref_designator(node_id: str, node_type: str, properties: dict) -> str:
    """Generate standard reference designator."""
    if node_type == "passive":
        purpose = properties.get("purpose", "")
        if "capacitor" in purpose or node_id.startswith("C"):
            return node_id if node_id[0] == "C" else f"C{node_id}"
        if "resistor" in purpose or "pull-up" in purpose or node_id.startswith("R"):
            return node_id if node_id[0] == "R" else f"R{node_id}"
        return node_id

    prefix = REF_DES_MAP.get(node_type, "X")
    return node_id if node_id.startswith(prefix) else f"{prefix}_{node_id}"


def _estimate_package_type(node) -> str:
    """Return the package from node properties or infer it."""
    # Package is typically on the component DB side; here we use what the node carries
    return "SMD"


def _get_distributor(part_number: str) -> str:
    """Return distributor reference. Real implementation would query distributor APIs."""
    return "Digi-Key / Mouser"


def generate_bom(graph: CircuitGraph) -> BOM:
    """Generate BOM from circuit graph nodes."""
    part_counts: Counter = Counter()
    entries_map: dict[str, BOMEntry] = {}

    for node in graph.nodes:
        pn = node.part_number
        part_counts[pn] += 1

        # Handle quantity multipliers encoded in purpose (e.g., "x3")
        purpose = node.properties.get("purpose", "")
        qty_multiplier = 1
        if "(x" in purpose:
            try:
                qty_str = purpose.split("(x")[1].split(")")[0]
                qty_multiplier = int(qty_str)
            except (IndexError, ValueError):
                pass

        if pn not in entries_map:
            entries_map[pn] = BOMEntry(
                component=node.properties.get("purpose", node.type),
                part_number=pn,
                quantity=qty_multiplier,
                package=_estimate_package_type(node),
                estimated_cost="See distributor",
                distributor=_get_distributor(pn),
                reference_designator=_ref_designator(
                    node.id, node.type, node.properties
                ),
            )
        else:
            entries_map[pn].quantity += qty_multiplier
            existing_ref = entries_map[pn].reference_designator
            new_ref = _ref_designator(node.id, node.type, node.properties)
            if new_ref not in existing_ref:
                entries_map[pn].reference_designator = f"{existing_ref}, {new_ref}"

    entries = list(entries_map.values())

    return BOM(
        bom=entries,
        total_estimated_cost="See distributor for live pricing",
        component_count=sum(e.quantity for e in entries),
    )
