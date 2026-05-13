import { describe, expect, it } from 'vitest';

import { extractLatestCanvas, getMessageText } from './stream';

describe('chat stream helpers', () => {
  /**
   * Verifies that the UI can still read ordinary assistant text from streamed
   * messages without depending on canvas parts.
   */
  it('extracts text from text parts', () => {
    expect(
      getMessageText({
        id: 'assistant-1',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'student.' },
        ],
      }),
    ).toBe('Hello student.');
  });

  /**
   * Ensures the latest assistant reply controls whether the canvas is visible.
   */
  it('returns null when the newest assistant reply is text only', () => {
    const result = extractLatestCanvas([
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [
          {
            type: 'data-canvas',
            data: {
              canvas_type: 'diagram',
              payload: {
                nodes: [],
                edges: [],
              },
            },
          },
        ],
      },
      {
        id: 'assistant-2',
        role: 'assistant',
        parts: [{ type: 'text', text: 'This one is chat only.' }],
      },
    ]);

    expect(result).toBeNull();
  });
});
