"""Live quiz generation use case for the canvas platform."""

import re

from pydantic import BaseModel, Field

from app.domain.models.canvas import CanvasEnvelope, CanvasType, LiveQuizPayload, QuizQuestion
from app.domain.models.chat import AssistantResponse, ChatRequest
from app.infrastructure.llm.nebius_client import NebiusChatClient


class QuizLLMResponse(BaseModel):
    """Defines the exact JSON shape the LLM should return for live quiz requests."""

    assistant_text: str = Field(min_length=1)
    quiz_title: str = Field(min_length=1)
    time_limit_seconds: int = Field(ge=60)
    questions: list[QuizQuestion] = Field(min_length=1)


class QuizModuleService:
    """Creates live quiz canvases that the frontend can grade instantly."""

    def __init__(self, llm_client: NebiusChatClient) -> None:
        """Stores the shared LLM client so quiz generation stays centralized."""
        self._llm_client = llm_client

    def generate_quiz(self, request: ChatRequest) -> AssistantResponse:
        """Builds a quiz wrapper and assistant narration from the user request."""
        latest_user_text = request.latest_user_text()
        fallback_payload = self._build_fallback_quiz(latest_user_text)

        system_prompt = (
            "You create timed multiple-choice quizzes for university students. "
            "Return JSON only with the keys: assistant_text, quiz_title, time_limit_seconds, questions. "
            "questions must contain 4 to 8 items. "
            "Each question must include: id, question_text, options, correct_answer_index, explanation. "
            "Use exactly 4 options per question. "
            "correct_answer_index must be zero-based. "
            "Make the quiz academically useful, concise, and suitable for self-study review."
        )
        user_prompt = (
            "Create a live quiz from this request.\n\n"
            f"User request:\n{latest_user_text}\n\n"
            "If the user mentions a number of questions or a time limit, follow it when reasonable."
        )
        llm_payload = self._llm_client.complete_json(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.3,
            fallback_json=fallback_payload.model_dump(mode="json"),
        )

        try:
            parsed_response = QuizLLMResponse.model_validate(llm_payload)
        except Exception:
            parsed_response = fallback_payload

        normalized_payload = self._normalize_payload(parsed_response)
        canvas = CanvasEnvelope(canvas_type=CanvasType.LIVE_QUIZ, payload=normalized_payload)
        return AssistantResponse(
            assistant_text=parsed_response.assistant_text,
            canvas=canvas,
        )

    def _normalize_payload(self, response: QuizLLMResponse) -> LiveQuizPayload:
        """Repairs malformed question IDs or answer indices before streaming."""
        normalized_questions: list[QuizQuestion] = []

        for index, question in enumerate(response.questions, start=1):
            options = [option.strip() for option in question.options][:4]
            while len(options) < 4:
                options.append(f"Option {chr(64 + len(options) + 1)}")

            answer_index = question.correct_answer_index
            if answer_index < 0 or answer_index >= len(options):
                answer_index = 0

            normalized_questions.append(
                QuizQuestion(
                    id=question.id.strip() or f"q{index}",
                    question_text=question.question_text.strip(),
                    options=options,
                    correct_answer_index=answer_index,
                    explanation=question.explanation.strip(),
                )
            )

        return LiveQuizPayload(
            quiz_title=response.quiz_title.strip(),
            time_limit_seconds=max(60, response.time_limit_seconds),
            questions=normalized_questions,
        )

    def _build_fallback_quiz(self, latest_user_text: str) -> QuizLLMResponse:
        """Provides a resilient quiz response when the LLM is unavailable."""
        topic = self._extract_topic(latest_user_text)
        questions = [
            QuizQuestion(
                id="q1",
                question_text=f"What is the best first step when revising {topic}?",
                options=[
                    "List the core concepts you must understand",
                    "Memorize random definitions without context",
                    "Skip the topic until the night before",
                    "Study only the easiest subtopic",
                ],
                correct_answer_index=0,
                explanation=f"Starting with the core concepts gives you a structure for reviewing {topic}.",
            ),
            QuizQuestion(
                id="q2",
                question_text=f"Which method most effectively checks your understanding of {topic}?",
                options=[
                    "Passive rereading only",
                    "Active self-testing with questions",
                    "Ignoring the difficult sections",
                    "Highlighting every sentence",
                ],
                correct_answer_index=1,
                explanation="Self-testing exposes gaps in understanding much faster than passive review.",
            ),
            QuizQuestion(
                id="q3",
                question_text=f"Why should explanations matter in a {topic} mock exam?",
                options=[
                    "They help you learn from mistakes after grading",
                    "They replace the need to answer the question",
                    "They make wrong answers count as correct",
                    "They remove the need for revision",
                ],
                correct_answer_index=0,
                explanation="Explanations turn the quiz into a learning tool instead of a score-only exercise.",
            ),
            QuizQuestion(
                id="q4",
                question_text=f"Which revision habit is strongest before a {topic} exam?",
                options=[
                    "Studying only what you already know well",
                    "Practicing under timed conditions",
                    "Skipping feedback after each attempt",
                    "Avoiding mixed-difficulty questions",
                ],
                correct_answer_index=1,
                explanation="Timed practice makes the quiz feel like a real exam and improves pacing.",
            ),
            QuizQuestion(
                id="q5",
                question_text=f"What should you do after missing a question about {topic}?",
                options=[
                    "Ignore it and move on forever",
                    "Rewrite the question without checking the answer",
                    "Review the explanation and revisit the weak concept",
                    "Assume it was just bad luck",
                ],
                correct_answer_index=2,
                explanation="Reviewing the explanation and weak concept helps the next attempt go better.",
            ),
        ]

        return QuizLLMResponse(
            assistant_text=f"I prepared a timed live quiz on {topic} so you can test yourself immediately.",
            quiz_title=f"{topic} Mock Exam",
            time_limit_seconds=600,
            questions=questions,
        )

    def _extract_topic(self, latest_user_text: str) -> str:
        """Turns the latest request into a readable quiz title seed."""
        cleaned = re.sub(r"\s+", " ", latest_user_text).strip(" .!?")
        cleaned = re.sub(
            r"^(please\s+)?(create|generate|make|build|give me|prepare)\s+(a\s+)?(live\s+)?(quiz|mock exam|mock test|practice quiz|practice test|mcq(?: quiz)?)(\s+on|\s+about|\s+for)?\s*",
            "",
            cleaned,
            flags=re.IGNORECASE,
        )
        cleaned = re.sub(r"^(on|about|for)\s+", "", cleaned, flags=re.IGNORECASE)
        return cleaned.title() or "Requested Topic"
