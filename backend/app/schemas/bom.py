from __future__ import annotations

from pydantic import BaseModel, Field


class BOMEntry(BaseModel):
    component: str
    part_number: str
    quantity: int
    package: str
    estimated_cost: str
    distributor: str
    reference_designator: str = ""


class BOM(BaseModel):
    bom: list[BOMEntry] = Field(default_factory=list)
    total_estimated_cost: str = "$0.00"
    component_count: int = 0
