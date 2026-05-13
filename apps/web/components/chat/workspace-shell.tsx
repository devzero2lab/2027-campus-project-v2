'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { CanvasShell } from '@/components/canvas/canvas-shell';
import { ChatMessage } from '@/components/chat/chat-message';
import type { CanvasEnvelope } from '@/lib/canvas/types';
import { getBackendUrl } from '@/lib/chat/backend';
import {
  appendAssistantText,
  consumeUiMessageStream,
  createChatMessage,
  extractLatestCanvas,
  getMessageText,
  toBackendMessages,
  type ChatMessageLike,
  upsertAssistantCanvas,
} from '@/lib/chat/stream';

/**
 * Hosts the shared chat/canvas experience so future modules inherit the same
 * orchestration behavior and transport contract.
 */
export function WorkspaceShell() {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessageLike[]>([]);
  const [status, setStatus] = useState<'submitted' | 'streaming' | 'ready'>('ready');
  const [error, setError] = useState<string | null>(null);
  const [activeCanvas, setActiveCanvas] = useState<CanvasEnvelope | null>(null);
  const [workingCanvas, setWorkingCanvas] = useState<CanvasEnvelope | null>(null);
  const [queuedCanvasSync, setQueuedCanvasSync] = useState<CanvasEnvelope | null>(null);
  const queuedCanvasRef = useRef<CanvasEnvelope | null>(null);
  const backendUrl = getBackendUrl();
  const chatMessages = messages;

  useEffect(() => {
    queuedCanvasRef.current = queuedCanvasSync;
  }, [queuedCanvasSync]);

  useEffect(() => {
    const latestCanvas = extractLatestCanvas(chatMessages);
    if (latestCanvas) {
      setActiveCanvas(latestCanvas);
      setWorkingCanvas(latestCanvas);
      return;
    }

    if (status === 'ready') {
      setActiveCanvas(null);
      setWorkingCanvas(null);
    }
  }, [chatMessages, status]);

  /**
   * Sends the latest prompt and clears the one-time sync snapshot immediately
   * after dispatch so it applies to exactly one turn.
   */
  async function handleSendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextPrompt = draft.trim();
    if (!nextPrompt || status !== 'ready') {
      return;
    }

    const userMessage = createChatMessage('user', nextPrompt);
    const assistantMessage = createChatMessage('assistant', '');
    const requestMessages = [...chatMessages, userMessage];

    setMessages([...requestMessages, assistantMessage]);
    setDraft('');
    setError(null);
    setStatus('submitted');

    try {
      const response = await fetch(`${backendUrl}/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: toBackendMessages(requestMessages),
          canvasState: queuedCanvasRef.current,
        }),
      });

      if (!response.ok) {
        const responseText = await response.text();
        throw new Error(responseText || 'The chat request failed.');
      }

      if (!response.body) {
        throw new Error('The response body is empty.');
      }

      setStatus('streaming');
      await consumeUiMessageStream(response.body, {
        onTextDelta(delta) {
          setMessages((currentMessages) =>
            appendAssistantText(currentMessages, assistantMessage.id, delta),
          );
        },
        onCanvas(canvas) {
          setMessages((currentMessages) =>
            upsertAssistantCanvas(currentMessages, assistantMessage.id, canvas),
          );
        },
      });

      setStatus('ready');
      setQueuedCanvasSync(null);
      queuedCanvasRef.current = null;
    } catch (cause) {
      const nextError = cause instanceof Error ? cause.message : 'Streaming failed.';
      setError(nextError);
      setStatus('ready');
    }
  }

  /**
   * Queues the current working canvas for the next backend request instead of
   * sending it eagerly, which keeps the user's chat flow in control.
   */
  const handleQueueCanvasSync = useCallback(function handleQueueCanvasSync() {
    if (!workingCanvas) {
      return;
    }

    setQueuedCanvasSync(workingCanvas);
  }, [workingCanvas]);

  /**
   * Receives live canvas edits from the module renderer so the latest diagram
   * can be synced back to the backend on demand.
   */
  const handleCanvasChange = useCallback(function handleCanvasChange(nextCanvas: CanvasEnvelope) {
    setWorkingCanvas(nextCanvas);
  }, []);

  const isCanvasVisible = activeCanvas !== null;
  const isDiagramCanvas = activeCanvas?.canvas_type === 'diagram';

  return (
    <main className="workspace-shell">
      <div className="workspace-grid" data-canvas={String(isCanvasVisible)}>
        <section className="chat-panel">
          <header className="panel-header">
            <p className="eyebrow">Universal Chat Window</p>
            <h1 className="panel-title">Study, ask, and visualize from one workspace.</h1>
            <p className="panel-subtitle">
              Standard questions stay text-first. Canvas modules open only when needed, starting
              with editable diagrams and live mock exams for focused practice.
            </p>
          </header>

          <div className="chat-scroll">
            {chatMessages.length === 0 ? (
              <article className="message-card" data-role="assistant">
                <p className="message-role">Campus AI</p>
                <div>
                  Ask a normal question like &quot;How should I prepare for finals?&quot;, request a
                  visual like &quot;Create a diagram for my software architecture.&quot;, or say
                  &quot;Generate a live quiz on database normalization.&quot;
                </div>
              </article>
            ) : null}

            {chatMessages.map((message) => {
              const content = getMessageText(message);
              if (!content || (message.role !== 'user' && message.role !== 'assistant')) {
                return null;
              }

              return (
                <ChatMessage
                  key={message.id ?? `${message.role}-${content.slice(0, 20)}`}
                  role={message.role}
                  content={content}
                />
              );
            })}
          </div>

          <form className="composer" onSubmit={handleSendMessage}>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Ask a question, request a diagram, or generate a live quiz..."
              />
            <div className="composer-row">
              <div className="button-row">
                <span className="status-pill">
                  {queuedCanvasSync
                    ? 'Canvas synced for the next message'
                    : isCanvasVisible
                      ? isDiagramCanvas
                        ? 'Canvas ready to sync'
                        : 'Interactive canvas active'
                      : 'Chat-only mode'}
                </span>
                {status !== 'ready' ? <span className="status-pill">Streaming response...</span> : null}
                {error ? <span className="status-pill error-note">{error}</span> : null}
              </div>
              <div className="button-row">
                <button className="primary-button" type="submit" disabled={status !== 'ready'}>
                  Send
                </button>
              </div>
            </div>
          </form>
        </section>

        {isCanvasVisible ? (
            <CanvasShell
              activeCanvas={activeCanvas}
              workingCanvas={workingCanvas}
              onCanvasChange={handleCanvasChange}
              onSyncCanvas={handleQueueCanvasSync}
              isSyncEnabled={Boolean(workingCanvas) && isDiagramCanvas}
            />
          ) : null}
      </div>
    </main>
  );
}
