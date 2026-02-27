from __future__ import annotations

from pydantic import BaseModel, Field


class CircuitNode(BaseModel):
    id: str
    type: str  # mcu, sensor, regulator, passive, protection
    part_number: str
    properties: dict = Field(default_factory=dict)
    pins: list[str] = Field(default_factory=list)


class CircuitEdge(BaseModel):
    id: str
    source_node: str
    source_pin: str
    target_node: str
    target_pin: str
    net_name: str
    signal_type: str = "power"  # power, signal, ground


class PowerRail(BaseModel):
    name: str
    voltage: float
    source_node: str
    consumers: list[str] = Field(default_factory=list)


class CircuitGraph(BaseModel):
    nodes: list[CircuitNode] = Field(default_factory=list)
    edges: list[CircuitEdge] = Field(default_factory=list)
    power_rails: list[PowerRail] = Field(default_factory=list)
    ground_net: str = "GND"
    power_source: dict = Field(default_factory=dict)
