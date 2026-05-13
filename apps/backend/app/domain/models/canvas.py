"""Shared canvas wrapper models for all present and future visual modules."""

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, model_validator


class CanvasType(str, Enum):
    """Enumerates supported canvas module identifiers."""

    DIAGRAM = "diagram"
    LIVE_QUIZ = "live_quiz"


class DiagramEditor(str, Enum):
    """Identifies which editor owns the persisted diagram document."""

    DIAGRAMS_NET = "diagrams.net"


class DiagramType(str, Enum):
    """Identifies the SE diagram type so the frontend can render the right shapes."""

    GENERIC = "generic"
    USE_CASE = "use-case"
    CLASS = "class"
    SEQUENCE = "sequence"
    ACTIVITY = "activity"
    STATE = "state"
    ER = "er"
    DFD = "dfd"
    COMPONENT = "component"
    DEPLOYMENT = "deployment"


class NodePosition(BaseModel):
    """Represents the 2D placement used by React Flow."""

    x: float
    y: float


class DiagramNodeData(BaseModel):
    """Stores editable node metadata without coupling to one future renderer."""

    label: str = Field(min_length=1)
    attributes: list[str] = Field(default_factory=list)
    methods: list[str] = Field(default_factory=list)


class DiagramNode(BaseModel):
    """Matches the minimal React Flow node shape needed by the MVP."""

    id: str = Field(min_length=1)
    type: str = Field(default="editable")
    position: NodePosition
    data: DiagramNodeData

    model_config = ConfigDict(extra="ignore")


class DiagramEdge(BaseModel):
    """Matches the minimal React Flow edge shape used by the frontend."""

    id: str = Field(min_length=1)
    source: str = Field(min_length=1)
    target: str = Field(min_length=1)
    animated: bool = True
    label: str | None = None
    type: str | None = None
    marker_end: str | None = None

    model_config = ConfigDict(extra="ignore")


class DiagramDocument(BaseModel):
    """Stores the editor-native document so roundtrips keep full fidelity."""

    editor: DiagramEditor = DiagramEditor.DIAGRAMS_NET
    format: str = "mxgraph"
    data: str = Field(min_length=1)


class DiagramPayload(BaseModel):
    """Wraps graph primitives so future diagram metadata can be added safely."""

    editor: DiagramEditor = DiagramEditor.DIAGRAMS_NET
    document: DiagramDocument | None = None
    diagram_type: DiagramType = DiagramType.GENERIC
    nodes: list[DiagramNode] = Field(default_factory=list)
    edges: list[DiagramEdge] = Field(default_factory=list)


class QuizQuestion(BaseModel):
    """Represents one multiple-choice question in the live quiz module."""

    id: str = Field(min_length=1)
    question_text: str = Field(min_length=1)
    options: list[str] = Field(min_length=4, max_length=4)
    correct_answer_index: int = Field(ge=0)
    explanation: str = Field(min_length=1)

    @model_validator(mode="after")
    def validate_answer_index(self) -> "QuizQuestion":
        """Ensures the correct answer points at a real option."""
        if self.correct_answer_index >= len(self.options):
            raise ValueError("correct_answer_index must reference one of the provided options.")

        return self


class LiveQuizPayload(BaseModel):
    """Carries the data needed to render an interactive timed quiz on the canvas."""

    quiz_title: str = Field(min_length=1)
    time_limit_seconds: int = Field(ge=60)
    questions: list[QuizQuestion] = Field(min_length=1)


class CanvasEnvelope(BaseModel):
    """Provides the stable top-level wrapper required by the frontend."""

    canvas_type: CanvasType
    payload: DiagramPayload | LiveQuizPayload

    @model_validator(mode="after")
    def validate_payload_matches_canvas_type(self) -> "CanvasEnvelope":
        """Keeps the generic wrapper strict so module payloads cannot mix accidentally."""
        if self.canvas_type == CanvasType.DIAGRAM and not isinstance(self.payload, DiagramPayload):
            raise ValueError("diagram canvases must use DiagramPayload.")

        if self.canvas_type == CanvasType.LIVE_QUIZ and not isinstance(self.payload, LiveQuizPayload):
            raise ValueError("live_quiz canvases must use LiveQuizPayload.")

        return self


class CanvasStreamPart(BaseModel):
    """Separates assistant text from visual payloads during streaming."""

    assistant_text: str = Field(min_length=1)
    canvas: CanvasEnvelope
