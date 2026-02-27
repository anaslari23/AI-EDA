from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import pipeline, components, design


def create_app() -> FastAPI:
    settings = get_settings()

    application = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description="AI-native Electronic Design Automation platform",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(
        pipeline.router, prefix="/api/pipeline", tags=["Pipeline"]
    )
    application.include_router(
        components.router, prefix="/api/components", tags=["Components"]
    )
    application.include_router(design.router, prefix="/api/design", tags=["Design"])

    return application


app = create_app()


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "ai-eda"}
