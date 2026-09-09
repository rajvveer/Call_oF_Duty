import type { GameUI } from "./engine";

export function ScopeOverlay({
  scope,
}: {
  scope: NonNullable<GameUI["scope"]>;
}) {
  return (
    <div className="scope-overlay" aria-label={`${scope.zoom}x scope`}>
      <div className="scope-lens">
        <div className="scope-v" />
        <div className="scope-h" />
        {[-3, -2, -1, 1, 2, 3].map((n) => (
          <span
            key={n}
            className="scope-tick"
            style={{ left: `${50 + n * 9}%` }}
          />
        ))}
        <i className="scope-center" />
        <span className="scope-magnification">{scope.zoom}×</span>
        <div className="scope-focus">
          <span>{scope.steady ? "STEADY" : "SHIFT · HOLD BREATH"}</span>
          <progress aria-label="Breath capacity" value={scope.focus} max={1} />
        </div>
      </div>
      <div className="scope-controls">
        {scope.label} <span>Z · CHANGE ZOOM</span>
      </div>
    </div>
  );
}
