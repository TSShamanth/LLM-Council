/**
 * CouncilHeader.jsx
 * Top navigation bar — shows phase, token usage, and session controls.
 */
import { PHASES } from "../hooks/useCouncilSession.js";
import { useAuth } from "../hooks/useAuth.jsx";

const PHASE_LABELS = {
  [PHASES.IDLE]:       { label: "STANDBY",    color: "var(--text-muted)" },
  [PHASES.GENERATING]: { label: "GENERATING", color: "var(--accent)" },
  [PHASES.JUDGING]:    { label: "JUDGING",   color: "var(--warning)" },
  [PHASES.RESULTS]:    { label: "COMPLETE",   color: "var(--success)" },
};

export default function CouncilHeader({ phase, totalTokensUsed, onReset }) {
  const { user, logout } = useAuth();
  const phaseInfo = PHASE_LABELS[phase] ?? PHASE_LABELS[PHASES.IDLE];
  const isActive = phase !== PHASES.IDLE && phase !== PHASES.RESULTS;

  return (
    <header style={{
      position: "relative", zIndex: 10,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 var(--sp-8)",
      height: 56,
      background: "var(--bg-surface)",
      borderBottom: "1px solid var(--border-soft)",
    }}>
      {/* Left: Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
        <div style={{
          width: 28, height: 28,
          border: "1px solid var(--accent)",
          borderRadius: "var(--r-sm)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14,
          color: "var(--accent)",
          boxShadow: "0 0 10px var(--accent-glow)",
        }}>
          ⬡
        </div>
        <span className="display" style={{ fontSize: 18, color: "var(--text-primary)", letterSpacing: 4 }}>
          COUNCIL
        </span>
        <span className="mono" style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: 2, marginLeft: 2 }}>
          OF LLMS
        </span>
      </div>

      {/* Center: Phase badge */}
      <div style={{
        display: "flex", alignItems: "center", gap: "var(--sp-2)",
        padding: "4px 12px",
        background: "var(--bg-raised)",
        border: "1px solid var(--border-dim)",
        borderRadius: "var(--r-md)",
      }}>
        {isActive && (
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: phaseInfo.color,
            display: "inline-block",
            animation: "pulse-dot 1.2s ease infinite",
          }} />
        )}
        <span className="mono" style={{ fontSize: 10, color: phaseInfo.color, letterSpacing: 2 }}>
          {phaseInfo.label}
        </span>
      </div>

      {/* Right: Tokens + User + Reset */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-4)" }}>
        {user && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginRight: "var(--sp-2)" }}>
            <span className="mono" style={{ fontSize: 9, color: "var(--text-muted)", borderRight: "1px solid var(--border-dim)", paddingRight: 12 }}>
              {user.email}
            </span>
            <button
              onClick={logout}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                cursor: "pointer",
                padding: 0,
                textDecoration: "underline"
              }}
            >
              LOGOUT
            </button>
          </div>
        )}
        {totalTokensUsed > 0 && (
          <span className="mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
            ~{totalTokensUsed.toLocaleString()} tokens
          </span>
        )}
        {phase === PHASES.RESULTS && (
          <button
            onClick={onReset}
            style={{
              padding: "6px 14px",
              background: "transparent",
              border: "1px solid var(--border-soft)",
              borderRadius: "var(--r-md)",
              color: "var(--text-secondary)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              cursor: "pointer",
              letterSpacing: 1,
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => { e.target.style.borderColor = "var(--border-mid)"; e.target.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.target.style.borderColor = "var(--border-soft)"; e.target.style.color = "var(--text-secondary)"; }}
          >
            ↺ NEW SESSION
          </button>
        )}
      </div>
    </header>
  );
}
