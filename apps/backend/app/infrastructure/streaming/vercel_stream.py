"""SSE helpers for the Vercel UIMessage-compatible streaming protocol."""

import asyncio
import json
from typing import AsyncGenerator

from app.domain.models.canvas import CanvasEnvelope


class VercelUIMessageStream:
    """Formats assistant responses into incremental UIMessage stream parts."""

    def __init__(self, message_id: str) -> None:
        """Stores the assistant message ID so the client can reconcile parts."""
        self._message_id = message_id

    async def stream(
        self,
        assistant_text: str,
        canvas: CanvasEnvelope | None,
    ) -> AsyncGenerator[str, None]:
        """Streams text first and canvas data second to preserve chat-first UX."""
        text_part_id = f"{self._message_id}-text"
        yield self._encode({"type": "start", "messageId": self._message_id})
        yield self._encode({"type": "text-start", "id": text_part_id})

        for chunk in self._chunk_text(assistant_text):
            yield self._encode({"type": "text-delta", "id": text_part_id, "delta": chunk})
            await asyncio.sleep(0.01)

        yield self._encode({"type": "text-end", "id": text_part_id})

        if canvas is not None:
            # Custom data parts are how the backend can add future module payloads
            # without changing the chat transport contract.
            yield self._encode(
                {
                    "type": "data-canvas",
                    "id": f"{self._message_id}-canvas",
                    "data": canvas.model_dump(mode="json"),
                }
            )

        yield self._encode({"type": "finish", "messageId": self._message_id})
        yield "data: [DONE]\n\n"

    def _encode(self, payload: dict) -> str:
        """Encodes a single stream part as an SSE data event."""
        return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    def _chunk_text(self, assistant_text: str) -> list[str]:
        """Splits text into small readable chunks so the UI feels live."""
        words = assistant_text.split()
        if not words:
            return [""]

        chunks: list[str] = []
        current_chunk: list[str] = []
        for word in words:
            current_chunk.append(word)
            if len(" ".join(current_chunk)) >= 28:
                chunks.append(" ".join(current_chunk) + " ")
                current_chunk = []

        if current_chunk:
            chunks.append(" ".join(current_chunk) + " ")

        return chunks

