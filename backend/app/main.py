from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db.session import init_db, close_db
from app.routers import pipeline, components, design, project, circuit, validation


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
        version="0.2.0",
        description="ANTIGRAVITY — AI-native Electronic Design Automation platform",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # AI pipeline (stateless)
    application.include_router(
        pipeline.router, prefix="/api/pipeline", tags=["Pipeline"]
    )
    application.include_router(
        components.router, prefix="/api/components", tags=["Components"]
    )

    # Project CRUD
    application.include_router(
        project.router, prefix="/api/projects", tags=["Projects"]
    )

    # Circuit CRUD + Generation
    application.include_router(
        circuit.router, prefix="/api/circuits", tags=["Circuits"]
    )

    # Validation
    application.include_router(
        validation.router, prefix="/api/validate", tags=["Validation"]
    )

    # Design (legacy placeholder)
    application.include_router(design.router, prefix="/api/design", tags=["Design"])

    return application


app = create_app()


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "antigravity-eda", "version": "0.2.0"}
