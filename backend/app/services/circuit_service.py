"""Circuit service — CRUD and AI generation (no validation logic).

Validation is handled entirely by the frontend.
The backend persists graph snapshots and runs AI generation.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status

from app.models.project import Circuit
from app.schemas.circuit_crud import CircuitCreate, CircuitUpdateGraph
from app.schemas.circuit import CircuitGraph

from app.ai.intent_parser import parse_intent
from app.ai.component_selector import select_components
from app.ai.circuit_generator import generate_circuit
from app.pcb.constraints import generate_pcb_constraints
from app.bom.generator import generate_bom


class CircuitService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ─── CRUD ───

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
        """Persist a graph snapshot from the frontend.

        No server-side validation — the frontend validates before saving.
        BOM and PCB constraints are regenerated from the new graph.
        """
        circuit = await self.get_by_id(circuit_id)
        circuit.graph_data = data.graph.model_dump()
        circuit.version += 1

        # Re-generate BOM and PCB constraints from the new graph
        bom = generate_bom(data.graph)
        pcb = generate_pcb_constraints(data.graph)
        circuit.bom_data = bom.model_dump()
        circuit.pcb_constraints_data = pcb.model_dump()

        await self.db.flush()
        return circuit

    # ─── AI Generation ───

    async def generate_from_description(
        self, circuit_id: uuid.UUID, description: str
    ) -> Circuit:
        """Run AI pipeline: NL → Intent → Components → Circuit.

        Returns the generated graph for the frontend to validate.
        No backend validation — the frontend handles it.
        """
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
        circuit.graph_data = graph.model_dump()
        circuit.version += 1

        # Generate BOM + PCB constraints from generated graph
        bom = generate_bom(graph)
        pcb = generate_pcb_constraints(graph)
        circuit.bom_data = bom.model_dump()
        circuit.pcb_constraints_data = pcb.model_dump()

        await self.db.flush()
        return circuit

    # ─── Export Helpers ───

    async def get_bom(self, circuit_id: uuid.UUID) -> dict:
        """Return BOM data for a circuit."""
        circuit = await self.get_by_id(circuit_id)
        if not circuit.bom_data:
            if not circuit.graph_data:
                raise HTTPException(400, "No graph data to generate BOM")
            graph = CircuitGraph(**circuit.graph_data)
            bom = generate_bom(graph)
            circuit.bom_data = bom.model_dump()
            await self.db.flush()
        return circuit.bom_data

    async def get_pcb_constraints(self, circuit_id: uuid.UUID) -> dict:
        """Return PCB constraints for a circuit."""
        circuit = await self.get_by_id(circuit_id)
        if not circuit.pcb_constraints_data:
            if not circuit.graph_data:
                raise HTTPException(400, "No graph data to generate PCB")
            graph = CircuitGraph(**circuit.graph_data)
            pcb = generate_pcb_constraints(graph)
            circuit.pcb_constraints_data = pcb.model_dump()
            await self.db.flush()
        return circuit.pcb_constraints_data

    async def delete(self, circuit_id: uuid.UUID) -> None:
        circuit = await self.get_by_id(circuit_id)
        await self.db.delete(circuit)
        await self.db.flush()
