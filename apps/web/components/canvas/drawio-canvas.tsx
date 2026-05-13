'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  createDiagramDocument,
  getDiagramEditorUrl,
  parseDrawioXmlToPayload,
  resolveDiagramXml,
} from '@/lib/canvas/drawio';
import type { DiagramCanvasEnvelope } from '@/lib/canvas/types';

type DrawioCanvasProps = {
  canvas: DiagramCanvasEnvelope;
  onCanvasChange: (canvas: DiagramCanvasEnvelope) => void;
};

type DrawioMessage = {
  event?: string;
  xml?: string;
  href?: string;
  target?: string;
  exit?: boolean;
};

const DRAWIO_LIBRARIES = 'general;uml;er;bpmn;flowchart';

export function DrawioCanvas({ canvas, onCanvasChange }: DrawioCanvasProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const latestCanvasRef = useRef(canvas);
  const latestXmlRef = useRef(resolveDiagramXml(canvas.payload));
  const [statusText, setStatusText] = useState('Loading diagram studio...');
  const [syncError, setSyncError] = useState<string | null>(null);

  const editorUrl = useMemo(() => getDiagramEditorUrl(), []);
  const editorOrigin = useMemo(() => new URL(editorUrl).origin, [editorUrl]);

  useEffect(() => {
    latestCanvasRef.current = canvas;
  }, [canvas]);

  const postToEditor = useCallback(
    function postToEditor(message: Record<string, unknown>) {
      iframeRef.current?.contentWindow?.postMessage(JSON.stringify(message), editorOrigin);
    },
    [editorOrigin],
  );

  const applyEditorXml = useCallback(
    async function applyEditorXml(xml: string) {
      if (xml === latestXmlRef.current) {
        return;
      }

      latestXmlRef.current = xml;

      try {
        const parsedPayload = await parseDrawioXmlToPayload(
          xml,
          latestCanvasRef.current.payload.diagram_type,
        );

        onCanvasChange({
          ...latestCanvasRef.current,
          payload: {
            ...parsedPayload,
            editor: 'diagrams.net',
            document: createDiagramDocument(xml),
            diagram_type: latestCanvasRef.current.payload.diagram_type,
          },
        });

        setSyncError(null);
        postToEditor({ action: 'status', messageKey: 'allChangesSaved', modified: false });
      } catch {
        onCanvasChange({
          ...latestCanvasRef.current,
          payload: {
            ...latestCanvasRef.current.payload,
            editor: 'diagrams.net',
            document: createDiagramDocument(xml),
          },
        });

        setSyncError(
          'Editor changes were saved, but structured AI sync is using the last parsed graph.',
        );
      }
    },
    [onCanvasChange, postToEditor],
  );

  useEffect(() => {
    function handleMessage(event: MessageEvent<string | DrawioMessage>) {
      if (event.origin !== editorOrigin) {
        return;
      }

      const payload =
        typeof event.data === 'string'
          ? safeParseMessage(event.data)
          : (event.data as DrawioMessage | null);

      if (!payload) {
        return;
      }

      if (payload.event === 'init') {
        setStatusText('Loading editable diagram...');
        postToEditor({
          action: 'load',
          xml: latestXmlRef.current,
          autosave: 1,
          title: 'Campus Diagram Studio',
          libs: DRAWIO_LIBRARIES,
          modified: 'unsavedChanges',
          saveAndExit: 0,
          noSaveBtn: 1,
        });
        return;
      }

      if (payload.event === 'load') {
        setStatusText('');
        return;
      }

      if ((payload.event === 'autosave' || payload.event === 'save') && typeof payload.xml === 'string') {
        void applyEditorXml(payload.xml);
        return;
      }

      if (payload.event === 'openLink' && payload.href) {
        window.open(payload.href, payload.target ?? '_blank', 'noopener,noreferrer');
      }
    }

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [applyEditorXml, editorOrigin, postToEditor]);

  return (
    <div className="drawio-shell">
      {statusText ? <div className="drawio-loading">{statusText}</div> : null}
      {syncError ? <div className="drawio-hint error-note">{syncError}</div> : null}
      <iframe
        ref={iframeRef}
        title="Campus diagram editor"
        className="drawio-frame"
        src={editorUrl}
      />
    </div>
  );
}

function safeParseMessage(raw: string): DrawioMessage | null {
  try {
    return JSON.parse(raw) as DrawioMessage;
  } catch {
    return null;
  }
}
