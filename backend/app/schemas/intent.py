from __future__ import annotations

from pydantic import BaseModel, Field


class DeviceConstraints(BaseModel):
    budget: str | None = None
    size: str | None = None
    battery_life: str | None = None


class HardwareIntent(BaseModel):
    device_type: str | None = None
    connectivity: list[str] = Field(default_factory=list)
    power_source: str | None = None
    environment: str | None = None
    sensors: list[str] = Field(default_factory=list)
    actuators: list[str] = Field(default_factory=list)
    constraints: DeviceConstraints = Field(default_factory=DeviceConstraints)
    communication_protocol: list[str] = Field(default_factory=list)
    data_logging: bool = False


class IntentParseRequest(BaseModel):
    description: str = Field(
        ..., min_length=10, description="Natural language hardware description"
    )


class IntentParseResponse(BaseModel):
    intent: HardwareIntent
    confidence: float = Field(ge=0.0, le=1.0, description="Parse confidence score")
    raw_input: str
