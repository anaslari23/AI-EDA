"""Project router — CRUD endpoints for project management."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services.project_service import ProjectService
from app.schemas.project import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    ProjectListResponse,
    ProjectListItem,
)

router = APIRouter()


def _get_service(db: AsyncSession = Depends(get_db)) -> ProjectService:
    return ProjectService(db)


@router.post("/", response_model=ProjectResponse, status_code=201)
async def create_project(
    data: ProjectCreate,
    service: ProjectService = Depends(_get_service),
):
    """Create a new EDA project."""
    project = await service.create(data)
    return ProjectResponse.model_validate(project)


@router.get("/", response_model=ProjectListResponse)
async def list_projects(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    service: ProjectService = Depends(_get_service),
):
    """List all projects with pagination."""
    projects, total = await service.list_all(offset=offset, limit=limit)
    items = []
    for p in projects:
        items.append(
            ProjectListItem(
                id=p.id,
                name=p.name,
                status=p.status,
                circuit_count=len(p.circuits)
                if hasattr(p, "circuits") and p.circuits
                else 0,
                created_at=p.created_at,
                updated_at=p.updated_at,
            )
        )
    return ProjectListResponse(projects=items, total=total)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: uuid.UUID,
    service: ProjectService = Depends(_get_service),
):
    """Get a project by ID with its circuits."""
    project = await service.get_by_id(project_id)
    return ProjectResponse.model_validate(project)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    data: ProjectUpdate,
    service: ProjectService = Depends(_get_service),
):
    """Update a project's name, description, or status."""
    project = await service.update(project_id, data)
    return ProjectResponse.model_validate(project)


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: uuid.UUID,
    service: ProjectService = Depends(_get_service),
):
    """Delete a project and all its circuits."""
    await service.delete(project_id)
