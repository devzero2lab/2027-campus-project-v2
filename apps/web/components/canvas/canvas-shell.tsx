'use client';

import { DrawioCanvas } from '@/components/canvas/drawio-canvas';
import { LiveQuizCanvas } from '@/components/canvas/live-quiz-canvas';
import { WelcomeState } from '@/components/canvas/welcome-state';
import {
  isDiagramCanvasEnvelope,
  isLiveQuizCanvasEnvelope,
  type CanvasEnvelope,
} from '@/lib/canvas/types';

type CanvasShellProps = {
  activeCanvas: CanvasEnvelope | null;
  workingCanvas: CanvasEnvelope | null;
  onCanvasChange: (canvas: CanvasEnvelope) => void;
  onSyncCanvas: () => void;
  isSyncEnabled: boolean;
};

export function CanvasShell({
  activeCanvas,
  workingCanvas,
  onCanvasChange,
  onSyncCanvas,
  isSyncEnabled,
}: CanvasShellProps) {
  const canvasKey = activeCanvas ? `${activeCanvas.canvas_type}-${JSON.stringify(activeCanvas.payload)}` : 'welcome';
  const canvasTitle = isLiveQuizCanvasEnvelope(activeCanvas) ? 'Live Quiz' : 'Canvas Workspace';
  const showSyncButton = isDiagramCanvasEnvelope(activeCanvas);

  return (
    <section className="canvas-panel">
      <div className="canvas-shell">
        <header className="canvas-toolbar">
          <div>
            <p className="eyebrow">Generative Canvas</p>
            <h2 className="panel-title">{canvasTitle}</h2>
          </div>
          {showSyncButton ? (
            <div className="button-row">
              <button
                className="secondary-button"
                type="button"
                onClick={onSyncCanvas}
                disabled={!isSyncEnabled}
              >
                Sync Canvas
              </button>
            </div>
          ) : null}
        </header>

        <div className="canvas-body">
          <div className="canvas-area">
            {isDiagramCanvasEnvelope(activeCanvas) && isDiagramCanvasEnvelope(workingCanvas) ? (
              <DrawioCanvas
                key={canvasKey}
                canvas={workingCanvas}
                onCanvasChange={onCanvasChange}
              />
            ) : isLiveQuizCanvasEnvelope(activeCanvas) ? (
              <LiveQuizCanvas key={canvasKey} canvas={activeCanvas} />
            ) : (
              <WelcomeState />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
