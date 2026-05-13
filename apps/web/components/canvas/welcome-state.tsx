/**
 * Provides a neutral fallback state so text-only conversations still feel like
 * a polished workspace instead of an empty panel.
 */
export function WelcomeState() {
  return (
    <div className="welcome-state">
      <div className="welcome-card">
        <p className="eyebrow">Dynamic Canvas</p>
        <h2 className="panel-title">The canvas wakes up only when a response needs visuals.</h2>
        <p className="panel-subtitle">
          Ask for a diagram or a timed mock exam to activate the canvas. Text-only questions stay
          in chat mode automatically until a module is actually needed.
        </p>
        <div className="welcome-grid">
          <span>&quot;Map out a semester revision workflow.&quot;</span>
          <span>&quot;Turn this architecture idea into a diagram.&quot;</span>
          <span>&quot;Generate a live quiz on operating systems.&quot;</span>
        </div>
      </div>
    </div>
  );
}
