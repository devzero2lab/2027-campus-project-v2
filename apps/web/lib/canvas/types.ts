export type CanvasType = 'diagram' | 'live_quiz';

export type DiagramEditor = 'diagrams.net';

export type DiagramDocument = {
  editor: DiagramEditor;
  format: 'mxfile' | 'mxgraph';
  data: string;
};

export type DiagramType =
  | 'generic'
  | 'use-case'
  | 'class'
  | 'sequence'
  | 'activity'
  | 'state'
  | 'er'
  | 'dfd'
  | 'component'
  | 'deployment';

export type DiagramNodeType =
  | 'editable'
  | 'actor'
  | 'use-case'
  | 'class-node'
  | 'entity'
  | 'weak-entity'
  | 'relationship'
  | 'process'
  | 'data-store'
  | 'external-entity'
  | 'decision'
  | 'state-node'
  | 'component-node'
  | 'swim-lane';

export type DiagramNode = {
  id: string;
  type: DiagramNodeType | string;
  position: { x: number; y: number };
  data: {
    label: string;
    attributes?: string[];
    methods?: string[];
    participant?: string;
  };
};

export type DiagramEdge = {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
  label?: string;
  type?: string;
  markerEnd?: string;
  style?: Record<string, string | number>;
};

export type DiagramCanvasPayload = {
  editor?: DiagramEditor;
  document?: DiagramDocument;
  diagram_type?: DiagramType;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
};

export type LiveQuizQuestion = {
  id: string;
  question_text: string;
  options: [string, string, string, string] | string[];
  correct_answer_index: number;
  explanation: string;
};

export type LiveQuizCanvasPayload = {
  quiz_title: string;
  time_limit_seconds: number;
  questions: LiveQuizQuestion[];
};

export type DiagramCanvasEnvelope = {
  canvas_type: 'diagram';
  payload: DiagramCanvasPayload;
};

export type LiveQuizCanvasEnvelope = {
  canvas_type: 'live_quiz';
  payload: LiveQuizCanvasPayload;
};

export type CanvasEnvelope = DiagramCanvasEnvelope | LiveQuizCanvasEnvelope;

export function isCanvasEnvelope(value: unknown): value is CanvasEnvelope {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const canvas = value as Partial<CanvasEnvelope>;
  if (canvas.canvas_type === 'diagram') {
    return Array.isArray((canvas.payload as Partial<DiagramCanvasPayload> | undefined)?.nodes);
  }

  if (canvas.canvas_type === 'live_quiz') {
    const payload = canvas.payload as Partial<LiveQuizCanvasPayload> | undefined;
    return typeof payload?.quiz_title === 'string' && Array.isArray(payload.questions);
  }

  return false;
}

export function isDiagramCanvasEnvelope(value: CanvasEnvelope | null): value is DiagramCanvasEnvelope {
  return value?.canvas_type === 'diagram';
}

export function isLiveQuizCanvasEnvelope(value: CanvasEnvelope | null): value is LiveQuizCanvasEnvelope {
  return value?.canvas_type === 'live_quiz';
}
