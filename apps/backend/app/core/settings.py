"""Application settings for backend runtime configuration."""

import os
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Centralizes environment-driven settings for predictable configuration."""

    nebius_api_key: str | None = Field(default=None, alias="NEBIUS_API_KEY")
    nebius_base_url: str = Field(
        default="https://api.tokenfactory.nebius.com/v1/",
        alias="NEBIUS_BASE_URL",
    )
    nebius_model: str = Field(
        default="Qwen/Qwen3-30B-A3B-Instruct-2507",
        alias="NEBIUS_MODEL",
    )
    backend_port: int = Field(default=8000, alias="BACKEND_PORT")
    cors_origins: list[str] = ["http://localhost:3000"]
    langchain_tracing: bool = Field(default=False, alias="LANGCHAIN_TRACING")
    langchain_tracing_v2: bool = Field(default=False, alias="LANGCHAIN_TRACING_V2")
    langsmith_tracing: bool = Field(default=False, alias="LANGSMITH_TRACING")
    langchain_api_key: str | None = Field(default=None, alias="LANGCHAIN_API_KEY")
    langsmith_api_key: str | None = Field(default=None, alias="LANGSMITH_API_KEY")
    langchain_project: str = Field(
        default="campus-ai-canvas-backend",
        alias="LANGCHAIN_PROJECT",
    )
    langsmith_project: str | None = Field(default=None, alias="LANGSMITH_PROJECT")
    langchain_endpoint: str = Field(
        default="https://api.smith.langchain.com",
        alias="LANGCHAIN_ENDPOINT",
    )
    langsmith_endpoint: str | None = Field(default=None, alias="LANGSMITH_ENDPOINT")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        populate_by_name=True,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    """Caches settings so every request shares the same configuration object."""
    return Settings()


def configure_langchain_tracing(settings: Settings | None = None) -> None:
    """Applies tracing settings to the environment used by LangGraph/LangChain."""
    resolved_settings = settings or get_settings()
    tracing_enabled = (
        resolved_settings.langchain_tracing
        or resolved_settings.langchain_tracing_v2
        or resolved_settings.langsmith_tracing
    )
    tracing_value = "true" if tracing_enabled else "false"
    api_key = resolved_settings.langsmith_api_key or resolved_settings.langchain_api_key
    project = resolved_settings.langsmith_project or resolved_settings.langchain_project
    endpoint = resolved_settings.langsmith_endpoint or resolved_settings.langchain_endpoint

    os.environ["LANGCHAIN_TRACING_V2"] = tracing_value
    os.environ["LANGSMITH_TRACING"] = tracing_value

    if api_key:
        os.environ["LANGCHAIN_API_KEY"] = api_key
        os.environ["LANGSMITH_API_KEY"] = api_key

    if project:
        os.environ["LANGCHAIN_PROJECT"] = project
        os.environ["LANGSMITH_PROJECT"] = project

    if endpoint:
        os.environ["LANGCHAIN_ENDPOINT"] = endpoint
        os.environ["LANGSMITH_ENDPOINT"] = endpoint
