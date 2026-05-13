import type {
  DiagramCanvasPayload,
  DiagramDocument,
  DiagramEdge,
  DiagramNode,
  DiagramNodeType,
  DiagramType,
} from '@/lib/canvas/types';

const DEFAULT_DIAGRAM_EDITOR_URL =
  'https://embed.diagrams.net/?embed=1&proto=json&spin=1&ui=min&libraries=1&modified=unsavedChanges&stealth=1';

const DEFAULT_NODE_SIZES: Record<string, { width: number; height: number }> = {
  editable: { width: 180, height: 72 },
  actor: { width: 100, height: 140 },
  'use-case': { width: 180, height: 96 },
  'class-node': { width: 220, height: 150 },
  entity: { width: 180, height: 72 },
  'weak-entity': { width: 190, height: 82 },
  relationship: { width: 140, height: 140 },
  process: { width: 120, height: 120 },
  'data-store': { width: 180, height: 76 },
  'external-entity': { width: 180, height: 72 },
  decision: { width: 140, height: 140 },
  'state-node': { width: 180, height: 76 },
  'component-node': { width: 190, height: 92 },
  'swim-lane': { width: 260, height: 140 },
};

export function getDiagramEditorUrl(): string {
  return process.env.NEXT_PUBLIC_DIAGRAMS_NET_URL ?? DEFAULT_DIAGRAM_EDITOR_URL;
}

export function createDiagramDocument(data: string): DiagramDocument {
  return {
    editor: 'diagrams.net',
    format: data.trim().startsWith('<mxGraphModel') ? 'mxgraph' : 'mxfile',
    data,
  };
}

export function resolveDiagramXml(payload: DiagramCanvasPayload): string {
  return payload.document?.data ?? diagramPayloadToDrawioXml(payload);
}

export function diagramPayloadToDrawioXml(payload: DiagramCanvasPayload): string {
  const cells = [
    '<mxCell id="0" />',
    '<mxCell id="1" parent="0" />',
    ...payload.nodes.map((node) => buildVertexCell(node)),
    ...payload.edges.map((edge) => buildEdgeCell(edge)),
  ].join('');

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<mxGraphModel dx="1600" dy="1200" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1600" pageHeight="1200" math="0" shadow="0">' +
    `<root>${cells}</root>` +
    '</mxGraphModel>'
  );
}

export async function parseDrawioXmlToPayload(
  xml: string,
  fallbackDiagramType?: DiagramType,
): Promise<DiagramCanvasPayload> {
  const graphXml = await unwrapDrawioXml(xml);
  const doc = parseXml(graphXml);
  const cells = Array.from(doc.getElementsByTagName('mxCell'));

  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];

  for (const cell of cells) {
    if (cell.getAttribute('vertex') === '1') {
      nodes.push(parseVertexCell(cell, fallbackDiagramType));
      continue;
    }

    if (cell.getAttribute('edge') === '1') {
      const parsedEdge = parseEdgeCell(cell);
      if (parsedEdge) {
        edges.push(parsedEdge);
      }
    }
  }

  return {
    editor: 'diagrams.net',
    document: createDiagramDocument(xml),
    diagram_type: fallbackDiagramType,
    nodes,
    edges,
  };
}

function buildVertexCell(node: DiagramNode): string {
  const size = DEFAULT_NODE_SIZES[node.type] ?? DEFAULT_NODE_SIZES.editable;
  const label = escapeXml(buildNodeValue(node));
  const attrs = [
    `id="${escapeXml(node.id)}"`,
    `value="${label}"`,
    `style="${escapeXml(styleForNode(node))}"`,
    'vertex="1"',
    'parent="1"',
    `nodeType="${escapeXml(node.type)}"`,
  ];

  if (node.data.attributes?.length) {
    attrs.push(`canvasAttributes="${escapeXml(node.data.attributes.join('||'))}"`);
  }

  if (node.data.methods?.length) {
    attrs.push(`canvasMethods="${escapeXml(node.data.methods.join('||'))}"`);
  }

  return (
    `<mxCell ${attrs.join(' ')}>` +
    `<mxGeometry x="${round(node.position.x)}" y="${round(node.position.y)}" width="${size.width}" height="${size.height}" as="geometry" />` +
    '</mxCell>'
  );
}

function buildEdgeCell(edge: DiagramEdge): string {
  const attrs = [
    `id="${escapeXml(edge.id)}"`,
    `source="${escapeXml(edge.source)}"`,
    `target="${escapeXml(edge.target)}"`,
    `style="${escapeXml(styleForEdge(edge))}"`,
    'edge="1"',
    'parent="1"',
  ];

  if (edge.label) {
    attrs.splice(1, 0, `value="${escapeXml(edge.label)}"`);
  }

  return (
    `<mxCell ${attrs.join(' ')}>` +
    '<mxGeometry relative="1" as="geometry" />' +
    '</mxCell>'
  );
}

function buildNodeValue(node: DiagramNode): string {
  if (node.type === 'class-node') {
    const sections = [node.data.label];

    if (node.data.attributes?.length) {
      sections.push('---', ...node.data.attributes);
    }

    if (node.data.methods?.length) {
      sections.push('---', ...node.data.methods);
    }

    return sections.join('\n');
  }

  if (node.type === 'component-node') {
    return `<<component>>\n${node.data.label}`;
  }

  return node.data.label;
}

function styleForNode(node: DiagramNode): string {
  switch (node.type as DiagramNodeType) {
    case 'actor':
      return 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;whiteSpace=wrap;';
    case 'use-case':
      return 'ellipse;whiteSpace=wrap;html=1;';
    case 'class-node':
      return 'shape=rectangle;whiteSpace=wrap;html=1;rounded=0;';
    case 'entity':
      return 'shape=rectangle;whiteSpace=wrap;html=1;';
    case 'weak-entity':
      return 'shape=rectangle;whiteSpace=wrap;html=1;double=1;';
    case 'relationship':
    case 'decision':
      return 'rhombus;whiteSpace=wrap;html=1;';
    case 'process':
      return 'ellipse;whiteSpace=wrap;html=1;';
    case 'data-store':
      return 'shape=datastore;whiteSpace=wrap;html=1;';
    case 'external-entity':
      return 'shape=rectangle;whiteSpace=wrap;html=1;';
    case 'state-node':
      return 'rounded=1;arcSize=999;whiteSpace=wrap;html=1;';
    case 'component-node':
      return 'shape=component;whiteSpace=wrap;html=1;';
    case 'swim-lane':
      return 'swimlane;whiteSpace=wrap;html=1;';
    case 'editable':
    default:
      return 'rounded=1;whiteSpace=wrap;html=1;';
  }
}

function styleForEdge(edge: DiagramEdge): string {
  const marker =
    edge.markerEnd === 'none'
      ? 'none'
      : edge.markerEnd === 'arrow'
        ? 'open'
        : 'block';

  return [
    'edgeStyle=orthogonalEdgeStyle',
    'rounded=0',
    'orthogonalLoop=1',
    'jettySize=auto',
    'html=1',
    `endArrow=${marker}`,
    'endFill=1',
  ].join(';');
}

function parseVertexCell(cell: Element, fallbackDiagramType?: DiagramType): DiagramNode {
  const geometry = cell.getElementsByTagName('mxGeometry')[0];
  const position = {
    x: toNumber(geometry?.getAttribute('x')),
    y: toNumber(geometry?.getAttribute('y')),
  };
  const label = extractLabel(cell.getAttribute('value'));
  const nodeType = inferNodeType(cell, fallbackDiagramType);
  const attributes = splitCellMetadata(cell.getAttribute('canvasAttributes'));
  const methods = splitCellMetadata(cell.getAttribute('canvasMethods'));

  return {
    id:
      cell.getAttribute('id') ??
      `node-${Math.round(position.x)}-${Math.round(position.y)}-${label.toLowerCase().replace(/\s+/g, '-') || 'item'}`,
    type: nodeType,
    position,
    data: {
      label: label || 'Node',
      attributes,
      methods,
    },
  };
}

function parseEdgeCell(cell: Element): DiagramEdge | null {
  const source = cell.getAttribute('source');
  const target = cell.getAttribute('target');

  if (!source || !target) {
    return null;
  }

  return {
    id: cell.getAttribute('id') ?? `${source}__${target}`,
    source,
    target,
    animated: false,
    label: extractLabel(cell.getAttribute('value')) || undefined,
    markerEnd: inferMarkerEnd(cell.getAttribute('style') ?? ''),
  };
}

function inferNodeType(cell: Element, fallbackDiagramType?: DiagramType): DiagramNodeType | string {
  const explicitNodeType = cell.getAttribute('nodeType');
  if (explicitNodeType) {
    return explicitNodeType;
  }

  const style = (cell.getAttribute('style') ?? '').toLowerCase();

  if (style.includes('shape=umlactor')) {
    return 'actor';
  }

  if (style.includes('shape=component')) {
    return 'component-node';
  }

  if (style.includes('shape=datastore')) {
    return 'data-store';
  }

  if (style.includes('swimlane')) {
    return 'swim-lane';
  }

  if (style.includes('double=1')) {
    return 'weak-entity';
  }

  if (style.includes('rhombus')) {
    return fallbackDiagramType === 'activity' ? 'decision' : 'relationship';
  }

  if (style.includes('ellipse')) {
    if (fallbackDiagramType === 'dfd') {
      return 'process';
    }

    return fallbackDiagramType === 'use-case' ? 'use-case' : 'process';
  }

  if (style.includes('rounded=1')) {
    return fallbackDiagramType === 'state' ? 'state-node' : 'editable';
  }

  return fallbackDiagramType === 'er' ? 'entity' : 'editable';
}

function inferMarkerEnd(style: string): DiagramEdge['markerEnd'] {
  const lower = style.toLowerCase();

  if (lower.includes('endarrow=none')) {
    return 'none';
  }

  if (lower.includes('endarrow=open')) {
    return 'arrow';
  }

  return 'arrowclosed';
}

function splitCellMetadata(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split('||')
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractLabel(value: string | null): string {
  if (!value) {
    return '';
  }

  if (typeof DOMParser === 'undefined') {
    return value
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const parser = new DOMParser();
  const htmlDoc = parser.parseFromString(`<body>${value}</body>`, 'text/html');
  const text = htmlDoc.body.textContent ?? '';

  return text.replace(/\s+/g, ' ').trim();
}

async function unwrapDrawioXml(xml: string): Promise<string> {
  const trimmed = xml.trim();

  if (trimmed.startsWith('<mxGraphModel')) {
    return trimmed;
  }

  const doc = parseXml(trimmed);
  const rawGraph = doc.getElementsByTagName('mxGraphModel')[0];
  if (rawGraph) {
    return new XMLSerializer().serializeToString(rawGraph);
  }

  const diagram = doc.getElementsByTagName('diagram')[0];
  const payload = diagram?.textContent?.trim();

  if (!payload) {
    throw new Error('The diagrams.net document did not contain diagram XML.');
  }

  if (payload.startsWith('<mxGraphModel')) {
    return payload;
  }

  return inflateDrawioPayload(payload);
}

async function inflateDrawioPayload(payload: string): Promise<string> {
  const binary = atob(payload);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const buffer = await new Response(stream).arrayBuffer();
  const text = new TextDecoder().decode(buffer);

  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function parseXml(xml: string): XMLDocument {
  if (typeof DOMParser === 'undefined') {
    throw new Error('DOMParser is unavailable in this runtime.');
  }

  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Invalid diagrams.net XML document.');
  }

  return doc;
}

function round(value: number): string {
  return String(Math.round(value));
}

function toNumber(value: string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\n', '&#xa;');
}
