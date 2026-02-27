"""SQLAlchemy ORM models for Project and Circuit."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    String,
    Text,
    DateTime,
    Boolean,
    Integer,
    ForeignKey,
    func,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="draft")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    circuits: Mapped[list[Circuit]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Project {self.name} ({self.id})>"


class Circuit(Base):
    __tablename__ = "circuits"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="Main")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # Circuit graph stored as JSONB
    graph_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Validation state
    is_valid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    validation_errors: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Pipeline outputs stored as JSONB
    intent_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    components_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    bom_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    pcb_constraints_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # NL description that generated this circuit
    source_description: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    project: Mapped[Project] = relationship(back_populates="circuits")

    def __repr__(self) -> str:
        return f"<Circuit {self.name} v{self.version} ({self.id})>"
