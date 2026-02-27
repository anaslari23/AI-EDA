from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def list_designs():
    """List all saved designs. (Placeholder — requires DB integration)"""
    return {
        "designs": [],
        "message": "Design persistence requires Phase 3 (PostgreSQL integration)",
    }


@router.post("/")
async def create_design():
    """Save a new design. (Placeholder — requires DB integration)"""
    return {"message": "Design persistence requires Phase 3 (PostgreSQL integration)"}
