"""BOM Generator — Bill of Materials from Validated Circuit Graph.

Reads a validated CircuitGraph, maps each node to the approved
component database for real part numbers/packages/pricing, and
produces structured BOM output + CSV file export.

Pure Python. Deterministic. No AI.
"""

from __future__ import annotations

import csv
import json
from io import StringIO
from pathlib import Path
from collections import defaultdict

from app.schemas.circuit import CircuitGraph, CircuitNode
from app.schemas.bom import BOM, BOMEntry


# ─── Component Database ───

APPROVED_DB_PATH = (
    Path(__file__).parent.parent.parent / "data" / "approved_components.json"
)

_db_cache: dict | None = None


def _load_component_db() -> dict:
    """Load approved component database (cached)."""
    global _db_cache
    if _db_cache is None:
        with open(APPROVED_DB_PATH) as f:
            _db_cache = json.load(f)
    return _db_cache


def _lookup_component(part_number: str) -> dict | None:
    """Find a component in the approved database by part number.

    Searches across all categories (mcus, sensors, regulators).
    Returns the full DB entry dict or None.
    """
    db = _load_component_db()
    for category in ("mcus", "sensors", "regulators"):
        for entry in db.get(category, []):
            if entry.get("part_number") == part_number:
                return entry
    return None


# ─── Reference Designator Logic ───

_TYPE_PREFIX: dict[str, str] = {
    "mcu": "U",
    "sensor": "U",
    "regulator": "U",
    "protection": "D",
    "connector": "J",
}


def _ref_designator(node: CircuitNode, index: int) -> str:
    """Generate reference designator from node type."""
    if node.type == "passive":
        purpose = node.properties.get("purpose", "").lower()
        if "resistor" in purpose or "pull-up" in purpose:
            return f"R{index + 1}"
        return f"C{index + 1}"

    prefix = _TYPE_PREFIX.get(node.type, "X")
    return f"{prefix}{index + 1}"


# ─── Package Detection ───


def _resolve_package(node: CircuitNode, db_entry: dict | None) -> str:
    """Determine package type from DB entry or node properties."""
    # Priority 1: approved database
    if db_entry:
        pkg = db_entry.get("package", "")
        if pkg:
            return pkg

    # Priority 2: node properties
    pkg = node.properties.get("package", "")
    if pkg:
        return pkg

    # Priority 3: infer from type
    if node.type == "passive":
        purpose = node.properties.get("purpose", "").lower()
        if "resistor" in purpose or "pull-up" in purpose:
            return "0402"
        return "0805"
    if node.type == "protection":
        return "SOD-323"

    return "SMD"


# ─── Price Estimation ───

_PASSIVE_PRICES: dict[str, str] = {
    "0201": "$0.002",
    "0402": "$0.005",
    "0603": "$0.008",
    "0805": "$0.01",
    "SOD-323": "$0.10",
}


def _estimate_price(node: CircuitNode, db_entry: dict | None, package: str) -> str:
    """Estimate unit price from database or package type."""
    # DB has pricing
    if db_entry:
        price = db_entry.get("estimated_cost", "")
        if price:
            return price

    # Passive pricing by package
    if node.type == "passive":
        return _PASSIVE_PRICES.get(package, "$0.01")
    if node.type == "protection":
        return "$0.10"

    return "See distributor"


# ─── BOM Generation ───


def generate_bom(graph: CircuitGraph) -> BOM:
    """Generate BOM from a validated circuit graph.

    Groups components by part number, aggregates quantities,
    maps to approved database for package/pricing data,
    and collects reference designators.
    """
    # Group nodes by part_number
    groups: dict[str, list[tuple[CircuitNode, int]]] = defaultdict(list)
    for i, node in enumerate(graph.nodes):
        groups[node.part_number].append((node, i))

    entries: list[BOMEntry] = []

    for part_number, node_list in groups.items():
        first_node, _ = node_list[0]
        db_entry = _lookup_component(part_number)

        # Reference designators for all instances
        refs = [_ref_designator(node, idx) for node, idx in node_list]

        # Quantity (with multiplier support)
        quantity = 0
        for node, _ in node_list:
            purpose = node.properties.get("purpose", "")
            mult = 1
            if "(x" in purpose:
                try:
                    mult = int(purpose.split("(x")[1].split(")")[0])
                except (IndexError, ValueError):
                    pass
            quantity += mult

        package = _resolve_package(first_node, db_entry)
        price = _estimate_price(first_node, db_entry, package)

        # Component description
        if db_entry:
            desc = db_entry.get("description", first_node.type)
        else:
            desc = first_node.properties.get("purpose", first_node.type)

        distributor = "Digi-Key / Mouser"
        if db_entry and db_entry.get("distributor"):
            distributor = db_entry["distributor"]

        entries.append(
            BOMEntry(
                component=desc,
                part_number=part_number,
                quantity=quantity,
                package=package,
                estimated_cost=price,
                distributor=distributor,
                reference_designator=", ".join(refs),
            )
        )

    # Sort: ICs first, then passives, then protection
    type_order = {"mcu": 0, "sensor": 1, "regulator": 2, "passive": 3, "protection": 4}
    entries.sort(
        key=lambda e: type_order.get(
            next((n.type for n, _ in groups[e.part_number]), "passive"), 9
        )
    )

    total_count = sum(e.quantity for e in entries)

    return BOM(
        bom=entries,
        total_estimated_cost=_sum_costs(entries),
        component_count=total_count,
    )


def _sum_costs(entries: list[BOMEntry]) -> str:
    """Sum estimated costs where parseable."""
    total = 0.0
    all_parseable = True
    for e in entries:
        price_str = e.estimated_cost.replace("$", "").strip()
        try:
            total += float(price_str) * e.quantity
        except ValueError:
            all_parseable = False

    if all_parseable and total > 0:
        return f"${total:.2f}"
    return "See distributor for live pricing"


# ─── CSV Export ───

CSV_COLUMNS = [
    "Item",
    "Reference",
    "Part Number",
    "Description",
    "Quantity",
    "Package",
    "Unit Cost",
    "Extended Cost",
    "Distributor",
]


def generate_bom_csv(graph: CircuitGraph) -> str:
    """Generate BOM as CSV string from a validated circuit graph."""
    bom = generate_bom(graph)
    return bom_to_csv(bom)


def bom_to_csv(bom: BOM) -> str:
    """Convert a BOM object to CSV string."""
    buf = StringIO()
    writer = csv.writer(buf)
    writer.writerow(CSV_COLUMNS)

    for i, entry in enumerate(bom.bom, start=1):
        # Calculate extended cost
        ext_cost = ""
        price_str = entry.estimated_cost.replace("$", "").strip()
        try:
            unit = float(price_str)
            ext_cost = f"${unit * entry.quantity:.2f}"
        except ValueError:
            ext_cost = "N/A"

        writer.writerow(
            [
                i,
                entry.reference_designator,
                entry.part_number,
                entry.component,
                entry.quantity,
                entry.package,
                entry.estimated_cost,
                ext_cost,
                entry.distributor,
            ]
        )

    # Summary row
    writer.writerow([])
    writer.writerow(
        [
            "",
            "",
            "",
            "TOTAL",
            bom.component_count,
            "",
            "",
            bom.total_estimated_cost,
            "",
        ]
    )

    return buf.getvalue()


def write_bom_csv_file(graph: CircuitGraph, path: str) -> None:
    """Write BOM CSV file to disk."""
    content = generate_bom_csv(graph)
    with open(path, "w", newline="") as f:
        f.write(content)
