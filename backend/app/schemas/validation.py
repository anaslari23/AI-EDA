from __future__ import annotations

from enum import Enum
from pydantic import BaseModel, Field


class ValidationSeverity(str, Enum):
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


class ValidationError(BaseModel):
    code: str
    severity: ValidationSeverity
    message: str
    node_ids: list[str] = Field(default_factory=list)
    suggestion: str | None = None


class ValidationStatus(str, Enum):
    VALID = "VALID"
    INVALID = "INVALID"


class ValidationResult(BaseModel):
    status: ValidationStatus
    errors: list[ValidationError] = Field(default_factory=list)
    warnings: list[ValidationError] = Field(default_factory=list)
    checks_passed: int = 0
    checks_total: int = 0
