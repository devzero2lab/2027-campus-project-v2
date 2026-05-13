"""Supervisor logic that decides whether to stay conversational or use a module."""

import re

from app.domain.models.canvas import CanvasType
from app.domain.models.chat import ChatRequest, SupervisorDecision
from app.infrastructure.llm.nebius_client import NebiusChatClient

GREETING_PATTERN = re.compile(
    r"^(hi|hello|hey|yo|good morning|good afternoon|good evening|thanks|thank you)[!. ]*$",
    re.IGNORECASE,
)

VISUAL_HINTS = (
    "diagram",
    "flowchart",
    "mind map",
    "map out",
    "visualize",
    "visualise",
    "graph",
    "workflow",
    "architecture",
    "process",
    "relationship",
    "timeline",
    "use case",
    "use-case",
    "usecase",
    "class diagram",
    "uml class",
    "er diagram",
    "entity relationship",
    "entity-relationship",
    "erd",
    "dfd",
    "data flow",
    "dataflow",
    "activity diagram",
    "state diagram",
    "state machine",
    "statechart",
    "sequence diagram",
    "component diagram",
    "deployment diagram",
)

QUIZ_HINTS = (
    "live quiz",
    "quiz me",
    "generate quiz",
    "mock exam",
    "mock test",
    "practice quiz",
    "practice test",
    "practice exam",
    "mcq",
    "multiple choice",
    "test me",
    "self test",
)

EDIT_HINTS = ("update", "edit", "change", "add", "remove", "expand", "sync", "revise", "harder", "easier")


class SupervisorUseCase:
    """Keeps routing intelligence in one place so modules stay pluggable."""

    def __init__(self, llm_client: NebiusChatClient) -> None:
        """Stores the LLM dependency used for nuanced routing decisions."""
        self._llm_client = llm_client

    def decide(self, request: ChatRequest) -> SupervisorDecision:
        """Routes obviously textual prompts away from tools before using the LLM."""
        latest_user_text = request.latest_user_text().strip()
        lowered_text = latest_user_text.lower()
        existing_canvas_type = request.canvas_state.canvas_type if request.canvas_state else None

        if not latest_user_text:
            return SupervisorDecision(
                route="conversation",
                rationale="Empty user input defaults to a safe conversational response.",
            )

        if GREETING_PATTERN.match(latest_user_text):
            return SupervisorDecision(
                route="conversation",
                rationale="Greeting-style messages should not trigger a canvas module.",
            )

        has_visual_hint = any(hint in lowered_text for hint in VISUAL_HINTS)
        has_quiz_hint = any(hint in lowered_text for hint in QUIZ_HINTS)
        has_edit_hint = any(hint in lowered_text for hint in EDIT_HINTS)

        if existing_canvas_type == CanvasType.DIAGRAM and has_edit_hint:
            return SupervisorDecision(
                route="diagram",
                rationale="The user is editing an existing synced diagram canvas.",
            )

        if existing_canvas_type == CanvasType.LIVE_QUIZ and has_edit_hint:
            return SupervisorDecision(
                route="quiz",
                rationale="The user is revising an existing live quiz canvas.",
            )

        if has_quiz_hint:
            return SupervisorDecision(
                route="quiz",
                rationale="The prompt explicitly asks for a quiz, mock exam, or MCQ set.",
            )

        if has_visual_hint:
            return SupervisorDecision(
                route="diagram",
                rationale="The prompt explicitly asks for a visual representation.",
            )

        return self._decide_with_llm(latest_user_text, existing_canvas_type)

    def _decide_with_llm(
        self,
        latest_user_text: str,
        existing_canvas_type: CanvasType | None,
    ) -> SupervisorDecision:
        """Uses an LLM only for ambiguous prompts so simple chat remains lightweight."""
        system_prompt = (
            "You are a supervisor deciding whether a user request needs a canvas module. "
            "Return JSON only with keys route and rationale. "
            "Choose conversation for greetings, general questions, explanations, summaries, "
            "or advice that should stay text-only. "
            "Choose diagram for requests that clearly need a visual node-edge representation. "
            "Choose quiz for requests that ask for a mock exam, MCQs, self-test, or practice quiz."
        )
        user_prompt = (
            f"User request: {latest_user_text}\n"
            f"Existing canvas: {(existing_canvas_type.value if existing_canvas_type else 'none')}\n"
            "Valid routes: conversation, diagram, quiz"
        )
        fallback = {"route": "conversation", "rationale": "Ambiguous prompts stay text-only by default."}
        payload = self._llm_client.complete_json(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.1,
            fallback_json=fallback,
        )

        try:
            return SupervisorDecision.model_validate(payload)
        except Exception:
            return SupervisorDecision.model_validate(fallback)
