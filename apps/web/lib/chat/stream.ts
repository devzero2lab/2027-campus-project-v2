import { isCanvasEnvelope, type CanvasEnvelope } from '../canvas/types';

export type ChatRole = 'user' | 'assistant';

export type ChatPartLike = {
  type: string;
  text?: string;
  data?: unknown;
};

export type ChatMessageLike = {
  id: string;
  role: ChatRole;
  parts?: ChatPartLike[];
};

export type BackendChatMessage = {
  id: string;
  role: ChatRole;
  parts: Array<{
    type: 'text';
    text: string;
  }>;
};

type StreamPartPayload = {
  type: string;
  delta?: string;
  data?: unknown;
};

/**
 * Extracts readable text from message parts so the UI does not couple itself to
 * one internal SDK representation.
 */
export function getMessageText(message: ChatMessageLike): string {
  const textParts =
    message.parts?.filter((part) => part.type === 'text' && typeof part.text === 'string') ?? [];

  if (textParts.length === 0) {
    return '';
  }

  return textParts.map((part) => part.text ?? '').join('');
}

/**
 * Looks only at the latest assistant reply so the canvas hides again when a new
 * response is text-only, matching the requested chat-first experience.
 */
export function extractLatestCanvas(messages: ChatMessageLike[]): CanvasEnvelope | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'assistant') {
      continue;
    }

    return extractCanvasFromMessage(message);
  }

  return null;
}

/**
 * Finds the custom `data-canvas` part within one assistant message.
 */
export function extractCanvasFromMessage(message: ChatMessageLike): CanvasEnvelope | null {
  const canvasPart = message.parts?.find((part) => part.type === 'data-canvas');
  if (!canvasPart || !isCanvasEnvelope(canvasPart.data)) {
    return null;
  }

  return canvasPart.data;
}

/**
 * Creates one local chat message using the same part-based structure that the
 * UI consumes during streaming updates.
 */
export function createChatMessage(role: ChatRole, text: string): ChatMessageLike {
  return {
    id: crypto.randomUUID(),
    role,
    parts: text ? [{ type: 'text', text }] : [],
  };
}

/**
 * Converts local UI messages into the backend request format while stripping
 * non-text parts such as canvas payloads that the chat transcript does not need.
 */
export function toBackendMessages(messages: ChatMessageLike[]): BackendChatMessage[] {
  return messages
    .map((message) => {
      const text = getMessageText(message);
      return {
        id: message.id,
        role: message.role,
        parts: text ? [{ type: 'text' as const, text }] : [],
      };
    })
    .filter((message) => message.parts.length > 0);
}

/**
 * Appends streamed assistant text to the targeted message without disturbing
 * any existing custom parts such as `data-canvas`.
 */
export function appendAssistantText(
  messages: ChatMessageLike[],
  messageId: string,
  delta: string,
): ChatMessageLike[] {
  return messages.map((message) => {
    if (message.id !== messageId) {
      return message;
    }

    const nextParts = [...(message.parts ?? [])];
    const textPart = nextParts.find((part) => part.type === 'text');
    if (textPart) {
      textPart.text = `${textPart.text ?? ''}${delta}`;
    } else {
      nextParts.push({ type: 'text', text: delta });
    }

    return {
      ...message,
      parts: nextParts,
    };
  });
}

/**
 * Stores the latest canvas payload on the assistant message so the renderer can
 * switch modules based on the final streamed result.
 */
export function upsertAssistantCanvas(
  messages: ChatMessageLike[],
  messageId: string,
  canvas: CanvasEnvelope,
): ChatMessageLike[] {
  return messages.map((message) => {
    if (message.id !== messageId) {
      return message;
    }

    const nonCanvasParts = (message.parts ?? []).filter((part) => part.type !== 'data-canvas');
    return {
      ...message,
      parts: [
        ...nonCanvasParts,
        {
          type: 'data-canvas',
          data: canvas,
        },
      ],
    };
  });
}

/**
 * Parses the backend's SSE UI stream so the frontend can stay compatible with
 * the Python service even when the installed AI SDK version differs.
 */
export async function consumeUiMessageStream(
  stream: ReadableStream<Uint8Array>,
  handlers: {
    onTextDelta: (delta: string) => void;
    onCanvas: (canvas: CanvasEnvelope) => void;
  },
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;

  /**
   * Processes one complete SSE event block from the backend stream.
   */
  function handleEventBlock(block: string) {
    const payloadText = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
      .trim();

    if (!payloadText) {
      return;
    }

    if (payloadText === '[DONE]') {
      finished = true;
      return;
    }

    const payload = JSON.parse(payloadText) as StreamPartPayload;

    // ── DEBUG ────────────────────────────────────────────────────────────
    console.groupCollapsed(`[stream] event: ${payload.type}`);
    console.debug('raw payload:', payload);
    console.groupEnd();
    // ─────────────────────────────────────────────────────────────────────

    if (payload.type === 'text-delta' && typeof payload.delta === 'string') {
      handlers.onTextDelta(payload.delta);
      return;
    }

    if (payload.type === 'data-canvas') {
      const guardPassed = isCanvasEnvelope(payload.data);
      console.group('[stream] data-canvas received');
      console.debug('canvas data:', JSON.stringify(payload.data, null, 2));
      console.debug('isCanvasEnvelope guard passed:', guardPassed);
      console.groupEnd();
      if (guardPassed) {
        handlers.onCanvas(payload.data as import('../canvas/types').CanvasEnvelope);
        return;
      }
    }

    if (payload.type === 'finish') {
      finished = true;
    }
  }

  while (!finished) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    let separatorIndex = buffer.indexOf('\n\n');
    while (separatorIndex !== -1) {
      const block = buffer.slice(0, separatorIndex).trim();
      buffer = buffer.slice(separatorIndex + 2);

      if (block) {
        handleEventBlock(block);
      }

      if (finished) {
        return;
      }

      separatorIndex = buffer.indexOf('\n\n');
    }

    if (done) {
      if (buffer.trim()) {
        handleEventBlock(buffer.trim());
      }

      return;
    }
  }
}
