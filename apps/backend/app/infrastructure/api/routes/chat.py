"""Streaming chat routes for the frontend assistant experience."""

import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.domain.models.chat import ChatRequest
from app.infrastructure.langgraph.graph import get_chat_graph
from app.infrastructure.streaming.vercel_stream import VercelUIMessageStream

router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat/stream")
async def stream_chat(request: ChatRequest) -> StreamingResponse:
    """Streams a UIMessage-compatible assistant response for the Next.js client."""
    latest_user_text = request.latest_user_text()
    if not latest_user_text:
        raise HTTPException(status_code=400, detail="At least one user message is required.")

    graph = get_chat_graph()
    assistant_response = await graph.respond(request)
    stream = VercelUIMessageStream(message_id=str(uuid.uuid4()))

    async def event_generator():
        """Formats the final assistant response into incremental SSE parts."""
        async for chunk in stream.stream(
            assistant_text=assistant_response.assistant_text,
            canvas=assistant_response.canvas,
        ):
            yield chunk

    response = StreamingResponse(event_generator(), media_type="text/event-stream")
    response.headers["Cache-Control"] = "no-cache"
    response.headers["Connection"] = "keep-alive"
    response.headers["x-vercel-ai-ui-message-stream"] = "v1"
    return response

