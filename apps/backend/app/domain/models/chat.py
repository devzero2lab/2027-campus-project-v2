"""Chat request models shared across the API and LangGraph workflow."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.domain.models.canvas import CanvasEnvelope


class TextMessagePart(BaseModel):
    """Captures the text part shape commonly sent by chat UIs."""

    type: Literal["text"] = "text"
    text: str = Field(min_length=1)


class ChatMessage(BaseModel):
    """Stores role-tagged messages while remaining UI-message friendly."""

    id: str | None = None
    role: Literal["system", "user", "assistant"]
    parts: list[TextMessagePart] = Field(default_factory=list)
    content: str | None = None

    model_config = ConfigDict(extra="ignore")

    def text_content(self) -> str:
        """Normalizes the message text so routing logic has one read path."""
        if self.parts:
            return "\n".join(part.text.strip() for part in self.parts if part.text.strip())

        return (self.content or "").strip()


class ChatRequest(BaseModel):
    """Bundles the transcript plus optional synced canvas state."""

    messages: list[ChatMessage] = Field(default_factory=list)
    canvas_state: CanvasEnvelope | None = Field(default=None, alias="canvasState")

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    def latest_user_text(self) -> str:
        """Returns the latest user message because the supervisor routes on it."""
        for message in reversed(self.messages):
            if message.role == "user":
                return message.text_content()

        return ""


class SupervisorDecision(BaseModel):
    """Keeps routing decisions explicit and future-module friendly."""

    route: Literal["conversation", "diagram", "quiz"]
    rationale: str = Field(min_length=1)


class AssistantResponse(BaseModel):
    """Represents the final assistant output before it is streamed."""

    assistant_text: str = Field(min_length=1)
    canvas: CanvasEnvelope | None = None
