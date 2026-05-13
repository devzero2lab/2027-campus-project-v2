"""LangGraph workflow that keeps routing separate from transport concerns."""

from typing import Literal, TypedDict

from langgraph.graph import END, START, StateGraph

from app.domain.models.canvas import CanvasEnvelope
from app.domain.models.chat import AssistantResponse, ChatRequest
from app.infrastructure.llm.nebius_client import NebiusChatClient
from app.use_cases.conversation import ConversationUseCase
from app.use_cases.modules.diagram_module.service import DiagramModuleService
from app.use_cases.modules.quiz_module.service import QuizModuleService
from app.use_cases.supervisor import SupervisorUseCase


class GraphState(TypedDict, total=False):
    """Defines the fields that move through the LangGraph workflow."""

    request: ChatRequest
    route: Literal["conversation", "diagram", "quiz"]
    assistant_text: str
    canvas: CanvasEnvelope | None


class ChatGraphRunner:
    """Compiles the routing graph once so requests stay lightweight."""

    def __init__(self) -> None:
        """Constructs all use cases and wires them into a LangGraph state machine."""
        llm_client = NebiusChatClient()
        self._supervisor = SupervisorUseCase(llm_client=llm_client)
        self._conversation = ConversationUseCase(llm_client=llm_client)
        self._diagram = DiagramModuleService(llm_client=llm_client)
        self._quiz = QuizModuleService(llm_client=llm_client)
        self._graph = self._build_graph()

    async def respond(self, request: ChatRequest) -> AssistantResponse:
        """Runs the graph for one chat request and returns the finalized response."""
        final_state = await self._graph.ainvoke({"request": request})
        return AssistantResponse(
            assistant_text=final_state["assistant_text"],
            canvas=final_state.get("canvas"),
        )

    def _build_graph(self):
        """Builds a small graph now so future modules can be added as new nodes."""
        graph = StateGraph(GraphState)
        graph.add_node("supervisor", self._supervisor_node)
        graph.add_node("conversation", self._conversation_node)
        graph.add_node("diagram", self._diagram_node)
        graph.add_node("quiz", self._quiz_node)

        graph.add_edge(START, "supervisor")
        graph.add_conditional_edges(
            "supervisor",
            self._route_after_supervisor,
            {
                "conversation": "conversation",
                "diagram": "diagram",
                "quiz": "quiz",
            },
        )
        graph.add_edge("conversation", END)
        graph.add_edge("diagram", END)
        graph.add_edge("quiz", END)
        return graph.compile()

    def _supervisor_node(self, state: GraphState) -> GraphState:
        """Runs the route decision independently from module execution."""
        decision = self._supervisor.decide(state["request"])
        return {"route": decision.route}

    def _route_after_supervisor(self, state: GraphState) -> Literal["conversation", "diagram", "quiz"]:
        """Provides the branch key expected by LangGraph conditional edges."""
        return state["route"]

    def _conversation_node(self, state: GraphState) -> GraphState:
        """Produces a text-only assistant response when no canvas is needed."""
        response = self._conversation.respond(state["request"])
        return {
            "assistant_text": response.assistant_text,
            "canvas": None,
        }

    def _diagram_node(self, state: GraphState) -> GraphState:
        """Produces the editable diagram canvas when a visual module is needed."""
        response = self._diagram.generate_diagram(state["request"])
        return {
            "assistant_text": response.assistant_text,
            "canvas": response.canvas,
        }

    def _quiz_node(self, state: GraphState) -> GraphState:
        """Produces the live quiz canvas when the prompt asks for a mock exam."""
        response = self._quiz.generate_quiz(state["request"])
        return {
            "assistant_text": response.assistant_text,
            "canvas": response.canvas,
        }


_chat_graph: ChatGraphRunner | None = None


def get_chat_graph() -> ChatGraphRunner:
    """Caches the compiled graph because its structure is static."""
    global _chat_graph
    if _chat_graph is None:
        _chat_graph = ChatGraphRunner()

    return _chat_graph
