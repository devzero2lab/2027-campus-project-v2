# Campus AI Canvas Platform Architecture

## Overview

This repository is a modular monorepo MVP for a university-focused AI workspace that combines:

- A persistent chat experience in **Next.js**
- A polymorphic, expandable **Generative UI Canvas**
- A **FastAPI + LangGraph** backend that can decide whether a request needs a visual module or a text-only answer

The MVP implements only one canvas module today:

- `diagram`: an interactive React Flow canvas for node-edge diagramming

The architecture is intentionally shaped so future modules such as `quiz`, `tasks`, or `flashcards` can be added without breaking the chat transport or existing UI rendering.

## Folder Structure

```text
.
|-- AGENTS.md
|-- ARCHITECTURE.md
|-- package.json
|-- requirements.txt
|-- scripts/
|   `-- test.mjs
`-- apps/
    |-- backend/
    |   |-- app/
    |   |   |-- main.py
    |   |   |-- core/
    |   |   |   `-- settings.py
    |   |   |-- domain/
    |   |   |   `-- models/
    |   |   |       |-- canvas.py
    |   |   |       `-- chat.py
    |   |   |-- infrastructure/
    |   |   |   |-- api/
    |   |   |   |   `-- routes/
    |   |   |   |       `-- chat.py
    |   |   |   |-- langgraph/
    |   |   |   |   `-- graph.py
    |   |   |   |-- llm/
    |   |   |   |   `-- nebius_client.py
    |   |   |   `-- streaming/
    |   |   |       `-- vercel_stream.py
    |   |   `-- use_cases/
    |   |       |-- conversation.py
    |   |       |-- supervisor.py
    |   |       `-- modules/
    |   |           `-- diagram_module/
    |   |               `-- service.py
    |   `-- tests/
    `-- web/
        |-- app/
        |   |-- globals.css
        |   |-- layout.tsx
        |   `-- page.tsx
        |-- components/
        |   |-- canvas/
        |   |   |-- canvas-shell.tsx
        |   |   |-- diagram-canvas.tsx
        |   |   `-- welcome-state.tsx
        |   `-- chat/
        |       |-- chat-message.tsx
        |       `-- workspace-shell.tsx
        |-- lib/
        |   |-- canvas/
        |   |   `-- types.ts
        |   `-- chat/
        |       |-- backend.ts
        |       `-- stream.ts
        `-- package.json
```

## Technologies And Roles

- **Next.js App Router**: Hosts the student-facing shell and renders the dynamic canvas layout.
- **React Flow**: Powers the interactive diagram module with draggable and editable nodes.
- **Vercel AI SDK-compatible UI stream protocol**: Lets the frontend consume standard text parts and custom `data-canvas` parts over a single assistant stream.
- **FastAPI**: Exposes the streaming chat API and lightweight health endpoint.
- **LangGraph**: Encapsulates routing logic so new modules can be added as graph nodes instead of branching API controllers.
- **OpenAI Python SDK with Nebius base URL**: Connects the backend to the requested OpenAI-compatible provider.
- **Pydantic**: Enforces the backend request/response contracts, including the future-safe canvas wrapper.

## Shared Canvas Contract

Every visual module must return the same top-level wrapper:

```json
{
  "canvas_type": "diagram",
  "payload": {
    "nodes": [
      {
        "id": "course-map-root",
        "type": "editable",
        "position": { "x": 0, "y": 0 },
        "data": { "label": "Course Map" }
      }
    ],
    "edges": [
      {
        "id": "course-map-root__module-one",
        "source": "course-map-root",
        "target": "module-one",
        "animated": true
      }
    ]
  }
}
```

This wrapper allows the frontend to switch on `canvas_type` instead of binding itself to one module-specific shape.

## How Dynamic Canvas Rendering Works

1. The student submits a message in the persistent chat sidebar.
2. The frontend posts the current chat transcript plus an optional synced `canvas_state`.
3. The backend LangGraph supervisor decides whether the prompt should stay text-only or route into a module.
4. If the route is conversational, the backend streams only text parts.
5. If the route is `diagram`, the backend streams:
   - standard assistant text parts
   - one custom `data-canvas` part containing the diagram wrapper
6. The frontend watches the streamed parts:
   - if it sees `data-canvas` with `canvas_type === "diagram"`, it expands the canvas and mounts React Flow
   - if the response is text-only, the canvas collapses and the layout returns to chat-first mode

This keeps the product feeling like a normal chat app until the assistant genuinely has something visual to render.

## How Modular LangGraph Routing Works

The backend graph is intentionally small for the MVP:

1. `supervisor`
2. `conversation`
3. `diagram`

The `supervisor` node inspects the latest user request and optional canvas context, then returns a route decision:

- `conversation`: greetings, general questions, or requests that do not benefit from a visual artifact
- `diagram`: prompts asking for flows, systems, maps, relationships, architecture, or edits to an existing diagram

Because the route is graph-based rather than controller-based, adding a new module is just a matter of:

- defining a new use case
- registering a new graph node
- extending the supervisor decision schema

## Diagram Feedback Loop

The diagram module supports idempotent updates through `canvas_state`.

1. The React Flow canvas tracks the current node and edge state locally.
2. The student clicks **Sync Canvas** before their next instruction.
3. The next request includes the latest canvas wrapper in the request body.
4. The diagram use case asks the LLM to update the existing graph instead of rebuilding from scratch.
5. A normalization step reuses logical node IDs and regenerates stable edge IDs when needed.

This makes follow-up prompts like "add exam prep below week 12" behave as updates rather than disconnected rewrites.

## How To Add A New Module Later

Use a `quiz` module as the example.

### Backend Steps

1. Create a domain payload model in `apps/backend/app/domain/models/` for the new module shape.
2. Extend the `CanvasType` enum and wrapper union so `canvas_type: "quiz"` becomes valid.
3. Add a new folder under `apps/backend/app/use_cases/modules/quiz_module/`.
4. Implement the module use case that accepts:
   - latest user request
   - optional `canvas_state`
   - any future module-specific inputs
5. Register a `quiz` node in `apps/backend/app/infrastructure/langgraph/graph.py`.
6. Update the supervisor response schema and prompt so it can choose `quiz`.
7. Stream the new wrapper using the same `data-canvas` channel.

### Frontend Steps

1. Add the matching TypeScript payload type in `apps/web/lib/canvas/types.ts`.
2. Create a new renderer in `apps/web/components/canvas/`, such as `quiz-canvas.tsx`.
3. Extend `canvas-shell.tsx` so it switches on `canvas_type === "quiz"`.
4. Implement a module-specific `capture` or `serialize` shape if the quiz needs syncing.
5. Reuse the same sidebar chat flow because the transport already supports polymorphic canvas data.

### Why This Scales Cleanly

- The API does not change when a new module is added.
- The frontend only needs a new renderer and shared type branch.
- The supervisor remains the single orchestration layer.
- Text-only chat still works without any canvas coupling.
