# SE Diagram Canvas — Fix & Expansion Plan

## Problem Summary

1. **Blank canvas bug** — circular render loop prevents React Flow from stabilizing
2. **Limited diagram types** — only generic nodes; no UML/SE shapes

---

## Bug: Circular Render Loop

```
DiagramCanvas mounts
  → useEffect([nodes, edges]) fires → onCanvasChange()
  → parent setWorkingCanvas() → re-render → new canvas prop
  → useEffect([canvas]) fires → setNodes() + setEdges()
  → useEffect([nodes, edges]) fires → onCanvasChange() again
  → ∞ loop — React Flow never stabilizes
```

**Fix:**
- Skip first render in `useEffect([nodes, edges])` using `useRef(true)`
- Add stable `key` to `<DiagramCanvas>` (based on node IDs) so it remounts only on new AI diagrams

---

## Proposed Changes

### Fix 1 — `diagram-canvas.tsx`
- Add `isFirstRender` ref to skip `onCanvasChange` on mount
- Remove `useEffect([canvas])` — use `key` remount instead

### Fix 2 — `canvas-shell.tsx`
- Add `key={activeCanvas?.payload.nodes.map(n=>n.id).join(',')}` to `<DiagramCanvas>`

---

## SE Diagram Expansion

### New Node Types (Frontend)

| Type | Shape | Used In |
|---|---|---|
| `editable` | Rounded rect (existing) | General |
| `actor` | Stick figure | Use Case |
| `use-case` | Oval | Use Case |
| `class-node` | 3-compartment rect | Class |
| `entity` | Sharp rect | ER |
| `weak-entity` | Double rect | ER |
| `relationship` | Diamond | ER |
| `process` | Circle | DFD |
| `data-store` | Open-ended rect | DFD |
| `decision` | Diamond | Activity |
| `state` | Rounded rect w/ border | State Machine |

### Backend Prompt Update
- Add `diagram_type` to canvas payload
- System prompt includes node type → shape mapping
- LLM instructed to use correct `type` per diagram

### Files to Change

#### Frontend
- `apps/web/components/canvas/diagram-canvas.tsx` — full rewrite with all node types + loop fix
- `apps/web/app/globals.css` — styles for all new node shapes
- `apps/web/lib/canvas/types.ts` — add `diagram_type` field

#### Backend
- `apps/backend/app/domain/models/canvas.py` — add `diagram_type` enum field
- `apps/backend/app/use_cases/modules/diagram_module/service.py` — richer prompt
- `apps/backend/app/use_cases/supervisor.py` — detect diagram type from user request

---

## Verification
1. "Draw a use case diagram for ATM system" → actors + ovals appear
2. "Class diagram for Student, Course" → 3-compartment boxes appear
3. "ER diagram for library DB" → entities + diamonds appear
4. Nodes are draggable, labels editable inline
5. No console errors, no infinite re-render
