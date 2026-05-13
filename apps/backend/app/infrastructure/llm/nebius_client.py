"""OpenAI-compatible Nebius client wrapper used by the backend use cases."""

import json

from langsmith import wrappers
from openai import OpenAI

from app.core.settings import get_settings


class NebiusChatClient:
    """Wraps the OpenAI SDK so the rest of the app depends on one adapter."""

    def __init__(self) -> None:
        """Initializes the configured OpenAI-compatible client lazily."""
        settings = get_settings()
        self._model = settings.nebius_model
        self._api_key = settings.nebius_api_key
        raw_client = (
            OpenAI(
                base_url=settings.nebius_base_url,
                api_key=self._api_key,
            )
            if self._api_key
            else None
        )
        tracing_enabled = (
            settings.langchain_tracing
            or settings.langchain_tracing_v2
            or settings.langsmith_tracing
        )
        self._client = wrappers.wrap_openai(raw_client) if raw_client and tracing_enabled else raw_client

    def complete_text(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
        fallback_text: str,
    ) -> str:
        """Returns plain assistant text while failing gracefully in local MVP setups."""
        if self._client is None:
            return fallback_text

        try:
            response = self._client.chat.completions.create(
                model=self._model,
                temperature=temperature,
                top_p=0.95,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            return (response.choices[0].message.content or "").strip() or fallback_text
        except Exception:
            return fallback_text

    def complete_json(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
        fallback_json: dict,
    ) -> dict:
        """Requests JSON output and falls back safely if the provider is unavailable."""
        if self._client is None:
            return fallback_json

        try:
            response = self._client.chat.completions.create(
                model=self._model,
                temperature=temperature,
                top_p=0.95,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            content = (response.choices[0].message.content or "").strip()
            return json.loads(content)
        except Exception:
            return fallback_json

