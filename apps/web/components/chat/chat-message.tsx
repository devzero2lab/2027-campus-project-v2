type ChatMessageProps = {
  role: 'user' | 'assistant';
  content: string;
};

/**
 * Renders one chat bubble with role-aware styling while keeping the message
 * component intentionally small and reusable.
 */
export function ChatMessage({ role, content }: ChatMessageProps) {
  return (
    <article className="message-card" data-role={role}>
      <p className="message-role">{role === 'user' ? 'Student' : 'Campus AI'}</p>
      <div>{content}</div>
    </article>
  );
}

