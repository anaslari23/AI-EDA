from __future__ import annotations

from pydantic import BaseModel, Field


class MCU(BaseModel):
    part_number: str
    manufacturer: str
    core: str
    clock_mhz: float
    flash_kb: int
    ram_kb: int
    gpio_count: int
    operating_voltage: float
    interfaces: list[str] = Field(default_factory=list)
    wireless: list[str] = Field(default_factory=list)
    package: str
    unit_price: float


class Sensor(BaseModel):
    part_number: str
    manufacturer: str
    sensor_type: str
    interface: str
    operating_voltage_min: float
    operating_voltage_max: float
    package: str
    unit_price: float


class Regulator(BaseModel):
    part_number: str
    manufacturer: str
    topology: str
    vin_min: float
    vin_max: float
    vout: float
    max_current_ma: float
    dropout_v: float
    package: str
    unit_price: float


class Passive(BaseModel):
    part_number: str
    component_type: str  # capacitor, resistor, inductor
    value: str
    voltage_rating: str | None = None
    package: str
    unit_price: float
    purpose: str  # decoupling, pull-up, filtering, etc.


class Protection(BaseModel):
    part_number: str
    component_type: str  # diode, fuse, TVS, MOSFET
    rating: str
    package: str
    unit_price: float
    purpose: str


class SelectedComponents(BaseModel):
    mcu: MCU
    sensors: list[Sensor] = Field(default_factory=list)
    power: dict[str, str | None] = Field(default_factory=dict)
    regulators: list[Regulator] = Field(default_factory=list)
    passives: list[Passive] = Field(default_factory=list)
    protection: list[Protection] = Field(default_factory=list)
