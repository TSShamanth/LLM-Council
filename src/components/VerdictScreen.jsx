/**
 * VerdictScreen.jsx
 * Final reveal — winner, selection reasoning, rejection reasons, in-depth analysis.
 */
import { PROVIDER_MAP } from "../core/councilConfig.js";

export default function VerdictScreen({ verdictBreakdown }) {
  if (!verdictBreakdown) return null;
  const { winner, rejections } = verdictBreakdown;
  const winnerProvider = PROVIDER_MAP[winner.providerId];

  return (
    <div className="slide-up">
      {/* Winner banner */}
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          background: "var(--bg-surface)",
          border: `1px solid ${winnerProvider?.color ?? "var(--accent)"}50`,
          borderRadius: "var(--r-xl)",
          padding: "var(--sp-8)",
          marginBottom: "var(--sp-5)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: "60%",
            height: 120,
            background: `radial-gradient(ellipse at 50% 0%, ${winnerProvider?.color ?? "var(--accent)"}20, transparent 70%)`,
            pointerEvents: "none",
          }}
        />

        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🏆</div>
          <div className="display" style={{ fontSize: 40, color: winnerProvider?.color ?? "var(--accent)", letterSpacing: 4, lineHeight: 1 }}>
            {winner.label}
          </div>
          <div className="mono" style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: 3, margin: "8px 0 4px" }}>
            IDENTITY REVEALED
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span style={{ fontSize: 22, color: winnerProvider?.color }}>{winnerProvider?.icon}</span>
            <span className="display" style={{ fontSize: 24, color: winnerProvider?.color ?? "var(--accent)", letterSpacing: 3 }}>
              {winnerProvider?.name.toUpperCase() ?? "UNKNOWN"}
            </span>
          </div>
        </div>
      </div>

      {/* Selection reason */}
      {winner.selectionReason && (
        <div
          style={{
            padding: "var(--sp-4) var(--sp-5)",
            marginBottom: "var(--sp-4)",
            background: "var(--accent-dim)",
            border: "1px solid var(--accent-glow)",
            borderRadius: "var(--r-lg)",
          }}
        >
          <div className="mono" style={{ fontSize: 9, color: "var(--accent)", letterSpacing: 2, marginBottom: 12 }}>
            WHY THIS OUTPUT WAS SELECTED
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.8, margin: 0 }}>
            {winner.selectionReason}
          </p>
        </div>
      )}

      {/* In-depth reasoning */}
      {winner.inDepthReasoning && (
        <div
          style={{
            padding: "var(--sp-4) var(--sp-5)",
            marginBottom: "var(--sp-4)",
            background: "var(--bg-raised)",
            border: "1px solid var(--border-dim)",
            borderRadius: "var(--r-lg)",
          }}
        >
          <div className="mono" style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: 2, marginBottom: 12 }}>
            IN-DEPTH REASONING
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.8, margin: 0 }}>
            {winner.inDepthReasoning}
          </p>
        </div>
      )}

      {/* Rejection reasons */}
      {rejections && rejections.length > 0 && (
        <div style={{ marginTop: "var(--sp-5)" }}>
          <div className="mono" style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: 2, marginBottom: 12 }}>
            WHY OTHER OUTPUTS WERE REJECTED
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
            {rejections.map((r) => {
              const provider = PROVIDER_MAP[r.providerId];
              return (
                <div
                  key={r.label}
                  style={{
                    padding: "var(--sp-3) var(--sp-4)",
                    background: "var(--bg-raised)",
                    border: "1px solid var(--border-dim)",
                    borderRadius: "var(--r-md)",
                    borderLeft: `3px solid ${provider?.color ?? "var(--text-muted)"}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    {provider && (
                      <span style={{ color: provider.color, fontSize: 12 }}>{provider.icon}</span>
                    )}
                    <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: provider?.color ?? "var(--text-secondary)", letterSpacing: 1 }}>
                      {provider ? provider.name : r.label}
                    </span>
                    <span className="mono" style={{ fontSize: 9, color: "var(--text-muted)" }}>({r.label})</span>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                    {r.reason}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
