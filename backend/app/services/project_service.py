"""Project service — business logic for project CRUD."""

from __future__ import annotations

import uuid

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status

from app.models.project import Project, Circuit
from app.schemas.project import ProjectCreate, ProjectUpdate


class ProjectService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, data: ProjectCreate) -> Project:
        project = Project(
            name=data.name,
            description=data.description,
            status="draft",
        )
        self.db.add(project)
        await self.db.flush()
        return project

    async def get_by_id(self, project_id: uuid.UUID) -> Project:
        stmt = (
            select(Project)
            .where(Project.id == project_id)
            .options(selectinload(Project.circuits))
        )
        result = await self.db.execute(stmt)
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Project {project_id} not found",
            )
        return project

    async def list_all(
        self, offset: int = 0, limit: int = 50
    ) -> tuple[list[Project], int]:
        # Count
        count_stmt = select(func.count()).select_from(Project)
        total = (await self.db.execute(count_stmt)).scalar() or 0

        # Fetch
        stmt = (
            select(Project)
            .order_by(Project.updated_at.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        projects = list(result.scalars().all())

        return projects, total

    async def update(self, project_id: uuid.UUID, data: ProjectUpdate) -> Project:
        project = await self.get_by_id(project_id)
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(project, field, value)
        await self.db.flush()
        return project

    async def delete(self, project_id: uuid.UUID) -> None:
        project = await self.get_by_id(project_id)
        await self.db.delete(project)
        await self.db.flush()
