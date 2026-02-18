/**
 * MemberStatus.jsx
 * Shows all 5 council members with live activity indicators.
 * During generation, shows which member is currently working.
 * During review, shows which member is currently reviewing.
 */
import { COUNCIL_MEMBERS } from "../core/councilConfig.js";
import { PHASES } from "../hooks/useCouncilSession.js";

function StatusDot({ color, pulse }) {
  return (
    <span style={{
      width: 6, height: 6, borderRadius: "50%",
      background: pulse ? color : "var(--text-muted)",
      display: "inline-block",
      flexShrink: 0,
      animation: pulse ? "pulse-dot 0.8s ease infinite" : "none",
      transition: "background 0.3s",
    }} />
  );
}

function MemberChip({ member, isActive, isComplete, phase }) {
  const label = phase === PHASES.REVIEWING ? "REVIEWING" :
                phase === PHASES.GENERATING ? "GENERATING" : "";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 14px",
      background: isActive ? member.accentDark : "var(--bg-raised)",
      border: `1px solid ${isActive ? member.color + "50" : isComplete ? member.color + "25" : "var(--border-dim)"}`,
      borderRadius: "var(--r-md)",
      transition: "all 0.3s ease",
      minWidth: 0,
      flex: "1 1 0",
    }}>
      <span style={{ fontSize: 14, color: isActive || isComplete ? member.color : "var(--text-muted)", flexShrink: 0 }}>
        {member.icon}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="mono" style={{
          fontSize: 10, fontWeight: 700,
          color: isActive ? member.color : isComplete ? "var(--text-secondary)" : "var(--text-muted)",
          letterSpacing: 1,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          transition: "color 0.3s",
        }}>
          {member.name.toUpperCase()}
        </div>
        {isActive && (
          <div className="mono" style={{ fontSize: 8, color: member.color, letterSpacing: 1, opacity: 0.8 }}>
            {label}
          </div>
        )}
        {isComplete && !isActive && (
          <div className="mono" style={{ fontSize: 8, color: "var(--success)", letterSpacing: 1 }}>
            DONE
          </div>
        )}
      </div>
      <StatusDot color={member.color} pulse={isActive} />
    </div>
  );
}

export default function MemberStatus({ phase, generatingFor, reviewingFor, completedGenerating, completedReviewing }) {
  return (
    <div style={{
      position: "relative", zIndex: 5,
      display: "flex", gap: "var(--sp-3)",
      padding: "var(--sp-3) var(--sp-8)",
      background: "var(--bg-surface)",
      borderBottom: "1px solid var(--border-dim)",
      overflowX: "auto",
    }}>
      {COUNCIL_MEMBERS.map((member) => {
        const isGenerating = generatingFor === member.id;
        const isReviewing = reviewingFor === member.id;
        const isActive = isGenerating || isReviewing;

        const isDoneGenerating = completedGenerating.has(member.id) && !isGenerating;
        const isDoneReviewing = completedReviewing.has(member.id) && !isReviewing;
        const isComplete = phase === PHASES.GENERATING ? isDoneGenerating :
                           phase === PHASES.REVIEWING  ? isDoneReviewing : false;

        return (
          <MemberChip
            key={member.id}
            member={member}
            isActive={isActive}
            isComplete={isComplete}
            phase={phase}
          />
        );
      })}
    </div>
  );
}
