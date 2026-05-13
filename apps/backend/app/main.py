"""FastAPI entrypoint for the modular AI canvas backend."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.settings import configure_langchain_tracing, get_settings
from app.infrastructure.api.routes.chat import router as chat_router


def create_app() -> FastAPI:
    """Builds the FastAPI application once so deployment targets stay simple."""
    settings = get_settings()
    configure_langchain_tracing(settings)
    app = FastAPI(
        title="Campus AI Canvas Backend",
        version="0.1.0",
        description="LangGraph-powered backend for modular canvas generation.",
    )

    # CORS is kept explicit because the frontend and backend will commonly run
    # on different local ports during development.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["x-vercel-ai-ui-message-stream"],
    )
    app.include_router(chat_router)

    @app.get("/health")
    async def health() -> dict[str, str]:
        """Provides a tiny readiness endpoint for local development."""
        return {"status": "ok"}

    return app


app = create_app()
