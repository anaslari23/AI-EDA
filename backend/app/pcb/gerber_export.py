"""Gerber Export Preparation — Generate fabrication output config.

Prepares Gerber file specifications, drill files, and fabrication
notes for PCB manufacturing. Generates a job file that can drive
actual Gerber generation through KiCad CLI or other tools.

Pure Python. Deterministic. No AI.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from io import StringIO
from dataclasses import dataclass, field, asdict
from typing import Any

from app.schemas.circuit import CircuitGraph
from app.schemas.pcb import PCBConstraints
from app.pcb.netlist_generator import get_ref_map


# ─── Gerber Layer Definitions ───


@dataclass
class GerberLayer:
    """Single Gerber layer specification."""

    name: str
    file_extension: str
    description: str
    polarity: str = "positive"  # positive | negative
    function: str = ""


def _standard_layers(layer_count: int) -> list[GerberLayer]:
    """Generate standard Gerber layer stack for given layer count."""
    layers = [
        GerberLayer(
            name="F.Cu",
            file_extension=".gtl",
            description="Front copper",
            function="Copper,L1,Top",
        ),
        GerberLayer(
            name="F.Mask",
            file_extension=".gts",
            description="Front solder mask",
            polarity="negative",
            function="SolderMask,Top",
        ),
        GerberLayer(
            name="F.Paste",
            file_extension=".gtp",
            description="Front solder paste",
            function="Paste,Top",
        ),
        GerberLayer(
            name="F.SilkS",
            file_extension=".gto",
            description="Front silkscreen",
            function="Legend,Top",
        ),
    ]

    # Internal layers
    for i in range(2, layer_count):
        layers.append(
            GerberLayer(
                name=f"In{i - 1}.Cu",
                file_extension=f".g{i}",
                description=f"Internal copper layer {i - 1}",
                function=f"Copper,L{i},Inr",
            )
        )

    layers.extend(
        [
            GerberLayer(
                name="B.Cu",
                file_extension=".gbl",
                description="Back copper",
                function=f"Copper,L{layer_count},Bot",
            ),
            GerberLayer(
                name="B.Mask",
                file_extension=".gbs",
                description="Back solder mask",
                polarity="negative",
                function="SolderMask,Bot",
            ),
            GerberLayer(
                name="B.Paste",
                file_extension=".gbp",
                description="Back solder paste",
                function="Paste,Bot",
            ),
            GerberLayer(
                name="B.SilkS",
                file_extension=".gbo",
                description="Back silkscreen",
                function="Legend,Bot",
            ),
            GerberLayer(
                name="Edge.Cuts",
                file_extension=".gm1",
                description="Board outline",
                function="Profile,NP",
            ),
        ]
    )

    return layers


# ─── Drill File Specification ───


@dataclass
class DrillSpec:
    """Drill file specification."""

    file_extension: str = ".drl"
    format_type: str = "excellon"
    units: str = "mm"
    plated: bool = True
    min_hole_mm: float = 0.3
    via_drill_mm: float = 0.3
    via_annular_ring_mm: float = 0.15


# ─── Board Outline ───


@dataclass
class BoardOutline:
    """Rectangular board outline dimensions."""

    width_mm: float = 50.0
    height_mm: float = 50.0
    corner_radius_mm: float = 1.5
    origin_x_mm: float = 0.0
    origin_y_mm: float = 0.0


def _estimate_board_size(
    graph: CircuitGraph,
) -> BoardOutline:
    """Estimate minimum board size from component count."""
    n = len(graph.nodes)

    # Rough area estimate: each component ≈ 8x8mm with spacing
    component_area_mm2 = n * 64
    # Square root for side length + 20% routing overhead + 5mm margin
    side = max(25.0, (component_area_mm2**0.5) * 1.2 + 10)
    side = round(side / 5) * 5  # Round to 5mm

    return BoardOutline(
        width_mm=side,
        height_mm=side,
        corner_radius_mm=1.5,
    )


# ─── Fabrication Notes ───


@dataclass
class FabricationNotes:
    """Manufacturing notes for the PCB fab house."""

    material: str = "FR-4 TG150"
    surface_finish: str = "HASL Lead-Free"
    board_thickness_mm: float = 1.6
    min_trace_mm: float = 0.15
    min_space_mm: float = 0.15
    min_drill_mm: float = 0.3
    solder_mask_color: str = "green"
    silkscreen_color: str = "white"
    impedance_controlled: bool = False
    ipc_class: str = "Class 2"
    notes: list[str] = field(default_factory=list)


# ─── Job File Generator ───


@dataclass
class GerberJob:
    """Complete Gerber export job specification.

    This is the top-level output — contains everything a
    fabrication house or Gerber viewer needs.
    """

    project_name: str
    timestamp: str
    board_outline: BoardOutline
    layers: list[GerberLayer]
    drill: DrillSpec
    fabrication: FabricationNotes
    component_count: int
    net_count: int
    layer_count: int


def prepare_gerber_export(
    graph: CircuitGraph,
    constraints: PCBConstraints,
    project_name: str = "antigravity_pcb",
) -> GerberJob:
    """Prepare complete Gerber export specification.

    This does NOT generate actual Gerber files (which require
    a full PCB layout engine), but produces a complete job
    specification that defines:
      - Layer stack
      - Drill specifications
      - Board outline
      - Fabrication notes
      - Manufacturing parameters

    This job spec can drive Gerber generation through KiCad CLI:
      kicad-cli pcb export gerbers --job <job.json> <pcb_file>
    """
    layer_count = constraints.layer_count
    timestamp = datetime.now(timezone.utc).isoformat()
    board = _estimate_board_size(graph)

    # Extract trace width from constraints string
    trace_mm = 0.15
    tw_str = constraints.trace_width
    if "mm" in tw_str:
        try:
            # Parse "6.0 mil (0.15 mm)" format
            mm_part = tw_str.split("(")[1].split("mm")[0].strip()
            trace_mm = float(mm_part)
        except (IndexError, ValueError):
            pass

    fab = FabricationNotes(
        min_trace_mm=max(0.1, trace_mm),
        min_space_mm=max(0.1, trace_mm),
        impedance_controlled=layer_count >= 4,
        notes=constraints.thermal_notes,
    )

    # Copper weight from constraints
    copper_oz = 1.0
    ct_str = constraints.copper_thickness
    if "oz" in ct_str:
        try:
            copper_oz = float(ct_str.split("oz")[0].strip())
        except ValueError:
            pass

    if copper_oz >= 2.0:
        fab.notes.append(f"Heavy copper: {copper_oz}oz — verify with fab house")

    ref_map = get_ref_map(graph)
    net_count = len({e.net_name for e in graph.edges})

    return GerberJob(
        project_name=project_name,
        timestamp=timestamp,
        board_outline=board,
        layers=_standard_layers(layer_count),
        drill=DrillSpec(),
        fabrication=fab,
        component_count=len(graph.nodes),
        net_count=net_count,
        layer_count=layer_count,
    )


def gerber_job_to_json(job: GerberJob) -> str:
    """Serialize GerberJob to JSON for API/file output."""
    return json.dumps(asdict(job), indent=2)


def write_gerber_job_file(job: GerberJob, path: str) -> None:
    """Write Gerber job specification to JSON file."""
    with open(path, "w") as f:
        f.write(gerber_job_to_json(job))


# ─── Fabrication Output Summary ───


def generate_fab_summary(job: GerberJob) -> str:
    """Generate a human-readable fabrication summary string."""
    buf = StringIO()
    buf.write("═══ FABRICATION OUTPUT SUMMARY ═══\n\n")
    buf.write(f"Project:    {job.project_name}\n")
    buf.write(f"Generated:  {job.timestamp}\n")
    buf.write(f"Components: {job.component_count}\n")
    buf.write(f"Nets:       {job.net_count}\n\n")

    buf.write("─── Board ───\n")
    b = job.board_outline
    buf.write(f"Size:       {b.width_mm} × {b.height_mm} mm\n")
    buf.write(f"Corners:    {b.corner_radius_mm} mm radius\n\n")

    buf.write("─── Layer Stack ───\n")
    buf.write(f"Layers:     {job.layer_count}\n")
    for layer in job.layers:
        buf.write(
            f"  {layer.name:12s} {layer.file_extension:5s}   {layer.description}\n"
        )

    buf.write(f"\n─── Drill ───\n")
    d = job.drill
    buf.write(f"Format:     {d.format_type}\n")
    buf.write(f"Min hole:   {d.min_hole_mm} mm\n")
    buf.write(f"Via drill:  {d.via_drill_mm} mm\n\n")

    buf.write("─── Fabrication ───\n")
    f = job.fabrication
    buf.write(f"Material:   {f.material}\n")
    buf.write(f"Thickness:  {f.board_thickness_mm} mm\n")
    buf.write(f"Finish:     {f.surface_finish}\n")
    buf.write(f"Mask:       {f.solder_mask_color}\n")
    buf.write(f"Silkscreen: {f.silkscreen_color}\n")
    buf.write(f"Min trace:  {f.min_trace_mm} mm\n")
    buf.write(f"IPC Class:  {f.ipc_class}\n")

    if f.notes:
        buf.write(f"\n─── Notes ───\n")
        for note in f.notes:
            buf.write(f"  • {note}\n")

    return buf.getvalue()
