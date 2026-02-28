"""ANTIGRAVITY — AI-native EDA Backend

Slim backend responsibilities:
  1. Project persistence (async SQLAlchemy)
  2. AI orchestration (intent → components → circuit)
  3. Gerber file generation
  4. BOM export
  5. Firmware stub generation
  6. Collaborative sync (WebSocket)

Validation and graph logic have been moved to the frontend.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db.session import init_db, close_db
from app.routers import pipeline, components, project, circuit, firmware, sync


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create tables. Shutdown: close DB pool."""
    await init_db()
    yield
    await close_db()


def create_app() -> FastAPI:
    settings = get_settings()

    application = FastAPI(
        title=settings.app_name,
        version="0.3.0",
        description=(
            "ANTIGRAVITY — AI-native EDA platform.\n\n"
            "Backend handles persistence, AI orchestration, "
            "Gerber export, BOM, and firmware stubs.\n"
            "Circuit validation runs entirely in the frontend."
        ),
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://localhost:5174",
            "http://localhost:3000",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ─── AI Pipeline (stateless) ───
    application.include_router(
        pipeline.router, prefix="/api/pipeline", tags=["Pipeline"]
    )

    # ─── Component library ───
    application.include_router(
        components.router, prefix="/api/components", tags=["Components"]
    )

    # ─── Project persistence ───
    application.include_router(
        project.router, prefix="/api/projects", tags=["Projects"]
    )

    # ─── Circuit CRUD + AI generation ───
    application.include_router(
        circuit.router, prefix="/api/circuits", tags=["Circuits"]
    )

    # ─── Firmware stub generation ───
    application.include_router(
        firmware.router, prefix="/api/firmware", tags=["Firmware"]
    )

    # ─── Collaborative sync (WebSocket) ───
    application.include_router(sync.router, prefix="/api/sync", tags=["Sync"])

    return application


app = create_app()


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "antigravity-eda", "version": "0.3.0"}
