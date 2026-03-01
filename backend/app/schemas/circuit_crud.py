"""Extended Pydantic schemas for Circuit CRUD operations."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.circuit import CircuitGraph


# ─── Request Schemas ───


class CircuitCreate(BaseModel):
    name: str = Field(default="Main", min_length=1, max_length=255)
    source_description: str | None = None


class CircuitUpdateGraph(BaseModel):
    """Update the circuit graph data."""

    graph: CircuitGraph


class CircuitGenerateRequest(BaseModel):
    """Generate a circuit from natural language."""

    description: str = Field(..., min_length=10)


class CircuitSnapshotSaveRequest(BaseModel):
    """Persist a browser-authored circuit snapshot."""

    graph: CircuitGraph
    base_version: int = Field(
        ...,
        ge=0,
        description="Frontend version expected by caller for optimistic locking",
    )
    label: str | None = Field(
        default=None,
        max_length=120,
        description="Optional snapshot label for future history UI",
    )


class CircuitSnapshotSaveResponse(BaseModel):
    circuit_id: uuid.UUID
    version: int
    saved_at: datetime
    label: str | None = None


# ─── Response Schemas ───


class CircuitResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    version: int
    graph_data: dict | None = None
    is_valid: bool
    validation_errors: dict | None = None
    intent_data: dict | None = None
    components_data: dict | None = None
    bom_data: dict | None = None
    pcb_constraints_data: dict | None = None
    source_description: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
