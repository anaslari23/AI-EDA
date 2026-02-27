from __future__ import annotations

from pydantic import BaseModel, Field


class PCBConstraints(BaseModel):
    trace_width: str
    copper_thickness: str
    layer_count: int
    clearance: str
    ground_plane: bool = True
    thermal_notes: list[str] = Field(default_factory=list)
    board_dimensions: str | None = None
    recommended_stackup: str | None = None
