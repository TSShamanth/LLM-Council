/**
 * OutputCard.jsx
 * Displays a single submission — anonymous during judging, revealed after verdict.
 * Shows rejection reason if this submission was not selected.
 */
import { PROVIDER_MAP } from "../core/councilConfig.js";

export default function OutputCard({
  label,
  content,
  isWinner = false,
  rejectionReason = null,
  revealedProviderId = null,
}) {
  const provider = revealedProviderId ? PROVIDER_MAP[revealedProviderId] : null;
  const accentColor = provider?.color ?? "var(--accent)";

  return (
    <div
      className="fade-in"
      style={{
        background: "var(--bg-surface)",
        border: `1px solid ${isWinner ? accentColor + "50" : rejectionReason ? "var(--border-dim)" : "var(--border-soft)"}`,
        borderRadius: "var(--r-lg)",
        overflow: "hidden",
        opacity: rejectionReason ? 0.85 : 1,
        transition: "all 0.3s",
        position: "relative",
      }}
    >
      {isWinner && (
        <div
          style={{
            position: "absolute",
            inset: -1,
            borderRadius: "var(--r-lg)",
            boxShadow: `0 0 20px ${accentColor}30, inset 0 0 20px ${accentColor}05`,
            pointerEvents: "none",
          }}
        />
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          background: "var(--bg-raised)",
          borderBottom: "1px solid var(--border-dim)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
          {provider && (
            <span style={{ color: provider.color, fontSize: 14 }}>{provider.icon}</span>
          )}
          <div>
            <div
              className="mono"
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1,
                color: provider ? provider.color : "var(--text-secondary)",
              }}
            >
              {provider ? provider.name.toUpperCase() : label.toUpperCase()}
            </div>
            {provider && (
              <div className="mono" style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: 1 }}>
                {label}
              </div>
            )}
          </div>
        </div>

        {isWinner && (
          <span
            style={{
              padding: "3px 10px",
              background: "var(--accent-dim)",
              border: "1px solid var(--accent-glow)",
              borderRadius: "var(--r-md)",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--accent)",
              letterSpacing: 1,
            }}
          >
            🏆 WINNER
          </span>
        )}
        {rejectionReason && !isWinner && (
          <span
            style={{
              padding: "3px 10px",
              background: "rgba(240,90,90,0.1)",
              border: "1px solid rgba(240,90,90,0.2)",
              borderRadius: "var(--r-md)",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--danger)",
              letterSpacing: 1,
            }}
          >
            REJECTED
          </span>
        )}
      </div>

      <div
        style={{
          padding: "var(--sp-4) var(--sp-4)",
          maxHeight: 280,
          overflowY: "auto",
        }}
      >
        <pre
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            lineHeight: 1.7,
            color: "var(--text-secondary)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            margin: 0,
          }}
        >
          {content}
        </pre>
      </div>

      {rejectionReason && (
        <div
          style={{
            borderTop: "1px solid var(--border-dim)",
            padding: "var(--sp-3) var(--sp-4)",
            background: "rgba(240,90,90,0.05)",
          }}
        >
          <div className="mono" style={{ fontSize: 9, color: "var(--danger)", letterSpacing: 2, marginBottom: 6 }}>
            WHY REJECTED
          </div>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
            {rejectionReason}
          </p>
        </div>
      )}
    </div>
  );
}
