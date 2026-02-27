"""Circuit router — CRUD and generation endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services.circuit_service import CircuitService
from app.schemas.circuit_crud import (
    CircuitCreate,
    CircuitUpdateGraph,
    CircuitGenerateRequest,
    CircuitResponse,
)

router = APIRouter()


def _get_service(db: AsyncSession = Depends(get_db)) -> CircuitService:
    return CircuitService(db)


@router.post(
    "/projects/{project_id}/circuits",
    response_model=CircuitResponse,
    status_code=201,
)
async def create_circuit(
    project_id: uuid.UUID,
    data: CircuitCreate,
    service: CircuitService = Depends(_get_service),
):
    """Create an empty circuit in a project."""
    circuit = await service.create(project_id, data)
    return CircuitResponse.model_validate(circuit)


@router.get("/{circuit_id}", response_model=CircuitResponse)
async def get_circuit(
    circuit_id: uuid.UUID,
    service: CircuitService = Depends(_get_service),
):
    """Get a circuit by ID with all pipeline data."""
    circuit = await service.get_by_id(circuit_id)
    return CircuitResponse.model_validate(circuit)


@router.put("/{circuit_id}/graph", response_model=CircuitResponse)
async def update_circuit_graph(
    circuit_id: uuid.UUID,
    data: CircuitUpdateGraph,
    service: CircuitService = Depends(_get_service),
):
    """Update the circuit graph. Auto-revalidates and regenerates BOM/PCB."""
    circuit = await service.update_graph(circuit_id, data)
    return CircuitResponse.model_validate(circuit)


@router.post("/{circuit_id}/generate", response_model=CircuitResponse)
async def generate_circuit(
    circuit_id: uuid.UUID,
    data: CircuitGenerateRequest,
    service: CircuitService = Depends(_get_service),
):
    """Run full AI pipeline from NL description and store results."""
    circuit = await service.generate_from_description(circuit_id, data.description)
    return CircuitResponse.model_validate(circuit)


@router.get(
    "/projects/{project_id}/circuits",
    response_model=list[CircuitResponse],
)
async def list_circuits(
    project_id: uuid.UUID,
    service: CircuitService = Depends(_get_service),
):
    """List all circuits in a project."""
    circuits = await service.list_by_project(project_id)
    return [CircuitResponse.model_validate(c) for c in circuits]


@router.delete("/{circuit_id}", status_code=204)
async def delete_circuit(
    circuit_id: uuid.UUID,
    service: CircuitService = Depends(_get_service),
):
    """Delete a circuit."""
    await service.delete(circuit_id)
