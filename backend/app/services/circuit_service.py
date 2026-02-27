"""Circuit service — business logic for circuit CRUD, generation, and validation."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status

from app.models.project import Circuit
from app.schemas.circuit_crud import CircuitCreate, CircuitUpdateGraph
from app.schemas.circuit import CircuitGraph
from app.schemas.validation import ValidationResult, ValidationStatus
from app.schemas.bom import BOM
from app.schemas.pcb import PCBConstraints

from app.ai.intent_parser import parse_intent
from app.ai.component_selector import select_components
from app.ai.circuit_generator import generate_circuit
from app.validation.engine import validate_circuit
from app.validation.correction import correct_circuit
from app.pcb.constraints import generate_pcb_constraints
from app.bom.generator import generate_bom

MAX_CORRECTION_ITERATIONS = 3


class CircuitService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, project_id: uuid.UUID, data: CircuitCreate) -> Circuit:
        circuit = Circuit(
            project_id=project_id,
            name=data.name,
            source_description=data.source_description,
        )
        self.db.add(circuit)
        await self.db.flush()
        return circuit

    async def get_by_id(self, circuit_id: uuid.UUID) -> Circuit:
        stmt = select(Circuit).where(Circuit.id == circuit_id)
        result = await self.db.execute(stmt)
        circuit = result.scalar_one_or_none()
        if not circuit:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Circuit {circuit_id} not found",
            )
        return circuit

    async def list_by_project(self, project_id: uuid.UUID) -> list[Circuit]:
        stmt = (
            select(Circuit)
            .where(Circuit.project_id == project_id)
            .order_by(Circuit.version.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_graph(
        self, circuit_id: uuid.UUID, data: CircuitUpdateGraph
    ) -> Circuit:
        circuit = await self.get_by_id(circuit_id)
        circuit.graph_data = data.graph.model_dump()
        circuit.version += 1

        # Re-validate after graph change
        validation = validate_circuit(data.graph)
        circuit.is_valid = validation.status == ValidationStatus.VALID
        circuit.validation_errors = validation.model_dump()

        # Regenerate BOM and PCB constraints if valid
        if circuit.is_valid:
            bom = generate_bom(data.graph)
            pcb = generate_pcb_constraints(data.graph)
            circuit.bom_data = bom.model_dump()
            circuit.pcb_constraints_data = pcb.model_dump()

        await self.db.flush()
        return circuit

    async def generate_from_description(
        self, circuit_id: uuid.UUID, description: str
    ) -> Circuit:
        """Run full AI pipeline and store results in the circuit."""
        circuit = await self.get_by_id(circuit_id)
        circuit.source_description = description

        # Engine 1: Parse intent
        intent, confidence = parse_intent(description)
        circuit.intent_data = {
            "intent": intent.model_dump(),
            "confidence": confidence,
        }

        # Engine 2: Select components
        components = select_components(intent)
        circuit.components_data = components.model_dump()

        # Engine 3: Generate circuit graph
        graph = generate_circuit(components)

        # Engine 4 + 5: Validate and correct
        for _ in range(MAX_CORRECTION_ITERATIONS):
            validation = validate_circuit(graph)
            if validation.status == ValidationStatus.VALID:
                break
            result = correct_circuit(graph, validation)
            graph = result.corrected_graph

        validation = validate_circuit(graph)

        circuit.graph_data = graph.model_dump()
        circuit.is_valid = validation.status == ValidationStatus.VALID
        circuit.validation_errors = validation.model_dump()
        circuit.version += 1

        if circuit.is_valid:
            bom = generate_bom(graph)
            pcb = generate_pcb_constraints(graph)
            circuit.bom_data = bom.model_dump()
            circuit.pcb_constraints_data = pcb.model_dump()

        await self.db.flush()
        return circuit

    async def validate(
        self, circuit_id: uuid.UUID
    ) -> tuple[ValidationResult, BOM | None, PCBConstraints | None]:
        """Validate an existing circuit and update its state."""
        circuit = await self.get_by_id(circuit_id)

        if not circuit.graph_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Circuit has no graph data to validate",
            )

        graph = CircuitGraph(**circuit.graph_data)
        validation = validate_circuit(graph)

        circuit.is_valid = validation.status == ValidationStatus.VALID
        circuit.validation_errors = validation.model_dump()

        bom = None
        pcb = None
        if circuit.is_valid:
            bom = generate_bom(graph)
            pcb = generate_pcb_constraints(graph)
            circuit.bom_data = bom.model_dump()
            circuit.pcb_constraints_data = pcb.model_dump()

        await self.db.flush()
        return validation, bom, pcb

    async def delete(self, circuit_id: uuid.UUID) -> None:
        circuit = await self.get_by_id(circuit_id)
        await self.db.delete(circuit)
        await self.db.flush()
