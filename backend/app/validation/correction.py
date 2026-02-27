"""Real-Time Electrical Correction Engine — Engine 5

Auto-corrects invalid circuits by fixing common issues:
missing ground, missing passives, voltage mismatches.
"""

from __future__ import annotations

from copy import deepcopy

from app.schemas.circuit import CircuitGraph, CircuitNode, CircuitEdge
from app.schemas.validation import ValidationResult, ValidationError


class CorrectionResult:
    def __init__(self, corrected_graph: CircuitGraph, corrections: list[str]):
        self.corrected_graph = corrected_graph
        self.corrections = corrections


def _fix_missing_ground(graph: CircuitGraph, error: ValidationError) -> list[str]:
    """Add ground connections for ungrounded nodes."""
    corrections = []
    for node_id in error.node_ids:
        edge_id = f"E_FIX_GND_{node_id}"
        graph.edges.append(
            CircuitEdge(
                id=edge_id,
                source_node=node_id,
                source_pin="GND",
                target_node="GND",
                target_pin="GND",
                net_name="GND",
                signal_type="power",
            )
        )
        corrections.append(f"Added ground connection for {node_id}")
    return corrections


def _fix_missing_decoupling(graph: CircuitGraph, error: ValidationError) -> list[str]:
    """Add decoupling capacitors for ICs without them."""
    corrections = []
    existing_caps = len(
        [
            n
            for n in graph.nodes
            if n.type == "passive"
            and n.properties.get("purpose", "").startswith("decoupling")
        ]
    )

    for i, node_id in enumerate(error.node_ids):
        cap_id = f"C_FIX_{existing_caps + i + 1}"
        graph.nodes.append(
            CircuitNode(
                id=cap_id,
                type="passive",
                part_number="GRM188R71C104KA01D",
                properties={"value": "100nF", "purpose": "decoupling capacitor"},
                pins=["P1", "P2"],
            )
        )
        graph.edges.append(
            CircuitEdge(
                id=f"E_FIX_CAP_{cap_id}_VCC",
                source_node="3V3",
                source_pin="P",
                target_node=cap_id,
                target_pin="P1",
                net_name="3V3",
                signal_type="power",
            )
        )
        graph.edges.append(
            CircuitEdge(
                id=f"E_FIX_CAP_{cap_id}_GND",
                source_node=cap_id,
                source_pin="P2",
                target_node="GND",
                target_pin="GND",
                net_name="GND",
                signal_type="power",
            )
        )
        corrections.append(f"Added 100nF decoupling capacitor {cap_id} for {node_id}")
    return corrections


def _fix_missing_pullups(graph: CircuitGraph, error: ValidationError) -> list[str]:
    """Add I2C pull-up resistors."""
    corrections = []
    for line in ["SDA", "SCL"]:
        r_id = f"R_FIX_PU_{line}"
        graph.nodes.append(
            CircuitNode(
                id=r_id,
                type="passive",
                part_number="RC0402FR-074K7L",
                properties={"value": "4.7kΩ", "purpose": f"I2C pull-up ({line})"},
                pins=["P1", "P2"],
            )
        )
        graph.edges.append(
            CircuitEdge(
                id=f"E_FIX_PU_{line}_VCC",
                source_node="3V3",
                source_pin="P",
                target_node=r_id,
                target_pin="P1",
                net_name="3V3",
                signal_type="power",
            )
        )
        graph.edges.append(
            CircuitEdge(
                id=f"E_FIX_PU_{line}_SIG",
                source_node=r_id,
                source_pin="P2",
                target_node="U1",
                target_pin=line,
                net_name=f"I2C_{line}",
                signal_type="signal",
            )
        )
        corrections.append(f"Added 4.7kΩ pull-up on I2C {line}")
    return corrections


FIXERS = {
    "E_MISSING_GROUND": _fix_missing_ground,
    "W_MISSING_DECOUPLING": _fix_missing_decoupling,
    "W_MISSING_PULLUP": _fix_missing_pullups,
}


def correct_circuit(
    graph: CircuitGraph, validation: ValidationResult
) -> CorrectionResult:
    """Apply automatic corrections to an invalid circuit."""
    corrected = deepcopy(graph)
    all_corrections: list[str] = []

    all_issues = validation.errors + validation.warnings
    for issue in all_issues:
        fixer = FIXERS.get(issue.code)
        if fixer:
            fixes = fixer(corrected, issue)
            all_corrections.extend(fixes)

    return CorrectionResult(
        corrected_graph=corrected,
        corrections=all_corrections,
    )
