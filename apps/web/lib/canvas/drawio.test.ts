import { describe, expect, it } from 'vitest';

import {
  createDiagramDocument,
  diagramPayloadToDrawioXml,
  resolveDiagramXml,
} from './drawio';
import type { DiagramCanvasPayload } from './types';

describe('drawio helpers', () => {
  it('serializes graph nodes and edges into mxGraph XML', () => {
    const payload: DiagramCanvasPayload = {
      diagram_type: 'activity',
      nodes: [
        {
          id: 'start',
          type: 'state-node',
          position: { x: 0, y: 0 },
          data: { label: 'Start' },
        },
        {
          id: 'decision',
          type: 'decision',
          position: { x: 200, y: 120 },
          data: { label: 'Valid?' },
        },
      ],
      edges: [
        {
          id: 'start__decision',
          source: 'start',
          target: 'decision',
          label: 'next',
        },
      ],
    };

    const xml = diagramPayloadToDrawioXml(payload);

    expect(xml).toContain('<mxGraphModel');
    expect(xml).toContain('nodeType="state-node"');
    expect(xml).toContain('nodeType="decision"');
    expect(xml).toContain('source="start"');
    expect(xml).toContain('target="decision"');
  });

  it('prefers the persisted diagrams.net document when present', () => {
    const payload: DiagramCanvasPayload = {
      diagram_type: 'generic',
      document: createDiagramDocument('<mxGraphModel />'),
      nodes: [],
      edges: [],
    };

    expect(resolveDiagramXml(payload)).toBe('<mxGraphModel />');
  });
});
