"""Backend tests for diagram normalization behavior."""

from app.domain.models.canvas import CanvasEnvelope, CanvasType, DiagramDocument, DiagramPayload
from app.domain.models.chat import ChatMessage, ChatRequest, TextMessagePart
from app.infrastructure.llm.nebius_client import NebiusChatClient
from app.use_cases.modules.diagram_module.service import DiagramModuleService


def test_diagram_normalization_reuses_existing_node_ids() -> None:
    """Ensures synced canvas updates keep stable IDs for the same concepts."""
    service = DiagramModuleService(llm_client=NebiusChatClient())
    existing_canvas = CanvasEnvelope(
        canvas_type=CanvasType.DIAGRAM,
        payload=DiagramPayload(
            nodes=[
                {
                    "id": "course-map",
                    "type": "editable",
                    "position": {"x": 0, "y": 0},
                    "data": {"label": "Course Map"},
                }
            ],
            edges=[],
        ),
    )
    request = ChatRequest(
        messages=[
            ChatMessage(
                role="user",
                parts=[TextMessagePart(text="Expand the course map into a weekly plan diagram.")],
            )
        ],
        canvasState=existing_canvas,
    )

    response = service.generate_diagram(request)

    assert response.canvas is not None
    assert response.canvas.payload.nodes[0].id == "course-map"


def test_canvas_payload_accepts_editor_native_documents() -> None:
    """Ensures synced diagram documents can travel with the semantic node graph."""
    canvas = CanvasEnvelope(
        canvas_type=CanvasType.DIAGRAM,
        payload=DiagramPayload(
            document=DiagramDocument(data="<mxGraphModel />"),
            nodes=[],
            edges=[],
        ),
    )

    assert canvas.payload.document is not None
    assert canvas.payload.document.editor == "diagrams.net"
