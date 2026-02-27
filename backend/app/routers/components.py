from fastapi import APIRouter

import json
from pathlib import Path

router = APIRouter()

COMPONENT_DB_PATH = (
    Path(__file__).parent.parent.parent / "data" / "approved_components.json"
)


@router.get("/")
async def list_all_components():
    """Return the full approved component database."""
    with open(COMPONENT_DB_PATH, "r") as f:
        return json.load(f)


@router.get("/mcus")
async def list_mcus():
    """Return all approved MCUs."""
    with open(COMPONENT_DB_PATH, "r") as f:
        db = json.load(f)
    return db.get("mcus", [])


@router.get("/sensors")
async def list_sensors():
    """Return all approved sensors."""
    with open(COMPONENT_DB_PATH, "r") as f:
        db = json.load(f)
    return db.get("sensors", [])


@router.get("/regulators")
async def list_regulators():
    """Return all approved voltage regulators."""
    with open(COMPONENT_DB_PATH, "r") as f:
        db = json.load(f)
    return db.get("regulators", [])
