"""Diagram generation use case for the MVP canvas module."""

import json
import re
from dataclasses import dataclass

from pydantic import BaseModel, Field

from app.domain.models.canvas import (
    CanvasEnvelope,
    CanvasType,
    DiagramEdge,
    DiagramNode,
    DiagramNodeData,
    DiagramPayload,
    DiagramType,
    NodePosition,
)
from app.domain.models.chat import AssistantResponse, ChatRequest
from app.infrastructure.llm.nebius_client import NebiusChatClient


class DiagramLLMResponse(BaseModel):
    """Defines the exact JSON shape the LLM should return for diagram requests."""

    assistant_text: str = Field(min_length=1)
    diagram_type: str = Field(default="generic")
    nodes: list[DiagramNode] = Field(default_factory=list)
    edges: list[DiagramEdge] = Field(default_factory=list)


@dataclass(frozen=True)
class ExistingNodeIndex:
    """Indexes existing nodes for stable ID reuse during diagram updates."""

    by_id: dict[str, DiagramNode]
    by_label: dict[str, DiagramNode]


class DiagramModuleService:
    """Creates or updates diagram canvases while preserving stable node identity."""

    def __init__(self, llm_client: NebiusChatClient) -> None:
        """Stores the shared LLM client so the module can generate structured output."""
        self._llm_client = llm_client

    # Maps diagram-type keyword → preferred node types for the LLM prompt
    _NODE_TYPE_GUIDE = (
        "Node type → shape mapping (use the correct type for the requested diagram):\n"
        "  editable      → rounded rectangle  (generic / default)\n"
        "  actor         → stick figure        (use-case: human actors)\n"
        "  use-case      → oval               (use-case: system functions)\n"
        "  class-node    → 3-compartment rect  (class: include attributes[] and methods[] arrays)\n"
        "  entity        → sharp rectangle     (er: strong entities)\n"
        "  weak-entity   → double rectangle    (er: weak entities)\n"
        "  relationship  → diamond             (er: relationships between entities)\n"
        "  process       → circle              (dfd: transforms / processes)\n"
        "  data-store    → open-ended rect     (dfd: persistent storage)\n"
        "  external-entity → plain rectangle   (dfd: external actors)\n"
        "  decision      → diamond             (activity: decision / branch points)\n"
        "  state-node    → rounded rect+border (state: states in a state machine)\n"
        "  component-node → rect with tab      (component: software components)\n"
    )

    def generate_diagram(self, request: ChatRequest) -> AssistantResponse:
        """Builds a diagram wrapper and assistant narration from the user request."""
        latest_user_text = request.latest_user_text()
        previous_canvas = self._extract_previous_diagram_canvas(request.canvas_state)
        detected_type = self._detect_diagram_type(latest_user_text)
        system_prompt = (
            "You generate React Flow compatible diagrams for university students studying "
            "Software Engineering. "
            "Return JSON only with the keys: assistant_text, diagram_type, nodes, edges. "
            "diagram_type must be one of: generic, use-case, class, sequence, activity, "
            "state, er, dfd, component, deployment.\n"
            + self._NODE_TYPE_GUIDE
            + "Rules:\n"
            "  - Use the correct node type for the detected diagram_type.\n"
            "  - For class-node, populate data.attributes and data.methods arrays.\n"
            "  - Store labels at data.label (concise, ≤ 4 words).\n"
            "  - If an existing canvas is provided, update it — preserve meaningful IDs.\n"
            "  - Only create edges that reference valid node IDs.\n"
        )
        user_prompt = (
            "User request:\n"
            f"{latest_user_text}\n\n"
            f"Detected diagram type hint: {detected_type}\n\n"
            "Existing canvas:\n"
            f"{self._serialize_previous_canvas(previous_canvas)}\n\n"
            "Return 3-10 nodes unless the request clearly needs fewer or more."
        )
        fallback_payload = self._build_fallback_diagram(latest_user_text, previous_canvas)
        llm_payload = self._llm_client.complete_json(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.3,
            fallback_json=fallback_payload.model_dump(mode="json"),
        )

        try:
            parsed_response = DiagramLLMResponse.model_validate(llm_payload)
        except Exception:
            parsed_response = fallback_payload

        if not parsed_response.nodes:
            parsed_response = fallback_payload

        # Resolve diagram_type from the LLM response, falling back to the detected hint
        try:
            resolved_type = DiagramType(parsed_response.diagram_type)
        except ValueError:
            resolved_type = DiagramType(detected_type) if detected_type in DiagramType._value2member_map_ else DiagramType.GENERIC

        normalized_canvas = self._normalize_canvas(
            payload=DiagramPayload(
                diagram_type=resolved_type,
                nodes=parsed_response.nodes,
                edges=parsed_response.edges,
            ),
            previous_canvas=previous_canvas,
        )
        return AssistantResponse(
            assistant_text=parsed_response.assistant_text,
            canvas=normalized_canvas,
        )

    def _serialize_previous_canvas(self, canvas: CanvasEnvelope | None) -> str:
        """Keeps the prompt readable while still giving the model update context."""
        if canvas is None:
            return "None"

        return json.dumps(canvas.model_dump(mode="json"), ensure_ascii=False, indent=2)

    def _extract_previous_diagram_canvas(self, canvas: CanvasEnvelope | None) -> CanvasEnvelope | None:
        """Uses previous canvas context only when it belongs to the diagram module."""
        if canvas is None or canvas.canvas_type != CanvasType.DIAGRAM:
            return None

        return canvas

    def _build_fallback_diagram(
        self,
        latest_user_text: str,
        previous_canvas: CanvasEnvelope | None,
    ) -> DiagramLLMResponse:
        """Provides a resilient diagram response when the LLM is unavailable."""
        seed_label = latest_user_text[:48].strip().title() or "Study Plan"
        existing_nodes = previous_canvas.payload.nodes if previous_canvas else []
        if existing_nodes:
            root_id = existing_nodes[0].id
            root_label = existing_nodes[0].data.label
        else:
            root_id = self._slugify(seed_label)
            root_label = seed_label

        nodes = [
            DiagramNode(
                id=root_id,
                type="editable",
                position=NodePosition(x=0, y=0),
                data=DiagramNodeData(label=root_label),
            ),
            DiagramNode(
                id=f"{root_id}-details",
                type="editable",
                position=NodePosition(x=-220, y=180),
                data=DiagramNodeData(label="Key Details"),
            ),
            DiagramNode(
                id=f"{root_id}-next-steps",
                type="editable",
                position=NodePosition(x=220, y=180),
                data=DiagramNodeData(label="Next Steps"),
            ),
        ]
        edges = [
            DiagramEdge(
                id=f"{root_id}__{root_id}-details",
                source=root_id,
                target=f"{root_id}-details",
                animated=True,
            ),
            DiagramEdge(
                id=f"{root_id}__{root_id}-next-steps",
                source=root_id,
                target=f"{root_id}-next-steps",
                animated=True,
            ),
        ]

        return DiagramLLMResponse(
            assistant_text="I prepared a starter diagram that you can refine or sync back for updates.",
            nodes=nodes,
            edges=edges,
        )

    def _detect_diagram_type(self, text: str) -> str:
        """Guesses the SE diagram type from simple keyword matching."""
        lowered = text.lower()
        if any(k in lowered for k in ("use case", "use-case", "actor", "usecase")):
            return "use-case"
        if any(k in lowered for k in ("class diagram", "uml class", "class node")):
            return "class"
        if any(k in lowered for k in ("er diagram", "entity relationship", "entity-relationship", "erd")):
            return "er"
        if any(k in lowered for k in ("dfd", "data flow", "dataflow")):
            return "dfd"
        if any(k in lowered for k in ("activity diagram", "activity flow")):
            return "activity"
        if any(k in lowered for k in ("state diagram", "state machine", "statechart")):
            return "state"
        if any(k in lowered for k in ("sequence diagram", "sequence flow")):
            return "sequence"
        if any(k in lowered for k in ("component diagram",)):
            return "component"
        if any(k in lowered for k in ("deployment diagram",)):
            return "deployment"
        return "generic"

    def _normalize_canvas(
        self,
        payload: DiagramPayload,
        previous_canvas: CanvasEnvelope | None,
    ) -> CanvasEnvelope:
        """Normalizes IDs and edges so diagram updates stay stable across turns."""
        existing_index = self._index_existing_nodes(previous_canvas)
        used_ids: set[str] = set()
        resolved_id_map: dict[str, str] = {}
        normalized_nodes: list[DiagramNode] = []

        for node in payload.nodes:
            normalized_label = self._normalize_label(node.data.label)
            preferred_id = node.id.strip()
            stable_id = self._choose_stable_id(
                preferred_id=preferred_id,
                normalized_label=normalized_label,
                existing_index=existing_index,
                used_ids=used_ids,
            )
            used_ids.add(stable_id)
            resolved_id_map[preferred_id] = stable_id
            normalized_nodes.append(
                DiagramNode(
                    id=stable_id,
                    type=node.type or "editable",
                    position=node.position,
                    data=DiagramNodeData(
                        label=node.data.label.strip(),
                        attributes=node.data.attributes,
                        methods=node.data.methods,
                    ),
                )
            )

        normalized_edges: list[DiagramEdge] = []
        edge_ids: set[str] = set()
        for edge in payload.edges:
            source = resolved_id_map.get(edge.source, edge.source)
            target = resolved_id_map.get(edge.target, edge.target)
            if source not in used_ids or target not in used_ids:
                continue

            edge_id = self._unique_edge_id(source, target, edge_ids)
            edge_ids.add(edge_id)
            normalized_edges.append(
                DiagramEdge(
                    id=edge_id,
                    source=source,
                    target=target,
                    animated=edge.animated,
                    label=edge.label,
                    type=edge.type,
                    marker_end=edge.marker_end,
                )
            )

        normalized_payload = DiagramPayload(
            diagram_type=payload.diagram_type,
            nodes=normalized_nodes,
            edges=normalized_edges,
        )
        return CanvasEnvelope(canvas_type=CanvasType.DIAGRAM, payload=normalized_payload)

    def _index_existing_nodes(self, canvas: CanvasEnvelope | None) -> ExistingNodeIndex:
        """Builds lookup tables that let future diagram edits reuse the right IDs."""
        if canvas is None:
            return ExistingNodeIndex(by_id={}, by_label={})

        by_id = {node.id: node for node in canvas.payload.nodes}
        by_label = {self._normalize_label(node.data.label): node for node in canvas.payload.nodes}
        return ExistingNodeIndex(by_id=by_id, by_label=by_label)

    def _choose_stable_id(
        self,
        preferred_id: str,
        normalized_label: str,
        existing_index: ExistingNodeIndex,
        used_ids: set[str],
    ) -> str:
        """Prefers previous semantic IDs so canvas updates remain idempotent."""
        if preferred_id in existing_index.by_id and preferred_id not in used_ids:
            return preferred_id

        if normalized_label in existing_index.by_label:
            candidate = existing_index.by_label[normalized_label].id
            if candidate not in used_ids:
                return candidate

        base_id = self._slugify(preferred_id or normalized_label or "node")
        candidate = base_id
        suffix = 2
        while candidate in used_ids:
            candidate = f"{base_id}-{suffix}"
            suffix += 1

        return candidate

    def _unique_edge_id(self, source: str, target: str, existing_ids: set[str]) -> str:
        """Creates deterministic edge IDs so React Flow updates remain predictable."""
        base_id = f"{source}__{target}"
        candidate = base_id
        suffix = 2
        while candidate in existing_ids:
            candidate = f"{base_id}-{suffix}"
            suffix += 1

        return candidate

    def _normalize_label(self, label: str) -> str:
        """Normalizes labels for semantic matching between diagram revisions."""
        return re.sub(r"\s+", " ", label.strip().lower())

    def _slugify(self, value: str) -> str:
        """Converts user-facing labels into readable and stable node identifiers."""
        slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
        return slug or "node"
