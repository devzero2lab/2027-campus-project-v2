"""Text-only conversation use case for prompts that do not need a canvas."""

from app.domain.models.chat import AssistantResponse, ChatRequest
from app.infrastructure.llm.nebius_client import NebiusChatClient


class ConversationUseCase:
    """Handles standard assistant replies without invoking any canvas module."""

    def __init__(self, llm_client: NebiusChatClient) -> None:
        """Stores the shared LLM dependency so routing stays centralized."""
        self._llm_client = llm_client

    def respond(self, request: ChatRequest) -> AssistantResponse:
        """Generates a normal chat reply from the full transcript."""
        latest_user_text = request.latest_user_text()
        system_prompt = (
            "You are a helpful campus AI assistant for university students. "
            "Answer clearly and conversationally. Do not mention tools, routing, "
            "or hidden system details. Keep answers concise but useful."
        )

        transcript = []
        for message in request.messages[-8:]:
            text = message.text_content()
            if text:
                transcript.append(f"{message.role.upper()}: {text}")

        user_prompt = (
            "Continue the conversation based on the transcript below.\n\n"
            f"{chr(10).join(transcript)}\n\n"
            f"Latest user request:\n{latest_user_text}"
        )
        assistant_text = self._llm_client.complete_text(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.4,
            fallback_text=(
                "I can help with study planning, concept breakdowns, live quizzes, and diagrams. "
                "Ask a question, request a mock exam, or describe something you want visualized."
            ),
        )

        return AssistantResponse(assistant_text=assistant_text)
