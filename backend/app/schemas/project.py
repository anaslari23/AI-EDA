"""Pydantic schemas for Project CRUD operations."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


# ─── Request Schemas ───


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    status: str | None = Field(None, pattern=r"^(draft|active|archived)$")


# ─── Response Schemas ───


class CircuitSummary(BaseModel):
    id: uuid.UUID
    name: str
    version: int
    is_valid: bool
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    status: str
    created_at: datetime
    updated_at: datetime
    circuits: list[CircuitSummary] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class ProjectListItem(BaseModel):
    id: uuid.UUID
    name: str
    status: str
    circuit_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectListResponse(BaseModel):
    projects: list[ProjectListItem]
    total: int
