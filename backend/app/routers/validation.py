"""Validation router — standalone circuit validation endpoint."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services.circuit_service import CircuitService
from app.schemas.circuit_crud import CircuitValidationResponse
from app.schemas.circuit import CircuitGraph
from app.schemas.validation import ValidationResult
from app.validation.engine import validate_circuit as run_validation

router = APIRouter()


def _get_service(db: AsyncSession = Depends(get_db)) -> CircuitService:
    return CircuitService(db)


@router.post(
    "/circuits/{circuit_id}",
    response_model=CircuitValidationResponse,
)
async def validate_persisted_circuit(
    circuit_id: uuid.UUID,
    service: CircuitService = Depends(_get_service),
):
    """Validate a persisted circuit and update its validation state."""
    validation, bom, pcb = await service.validate(circuit_id)
    return CircuitValidationResponse(
        circuit_id=circuit_id,
        validation=validation,
        bom=bom,
        pcb_constraints=pcb,
    )


@router.post("/inline", response_model=ValidationResult)
async def validate_inline(graph: CircuitGraph):
    """Validate a circuit graph without persisting. Stateless."""
    return run_validation(graph)
