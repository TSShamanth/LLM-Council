/**
 * ProviderStatus.jsx
 * Shows all enabled providers with live activity indicators.
 * During generation: which provider is currently working.
 * During judging: shows Judge status.
 */
import { useState, useEffect } from "react";
import { PROVIDERS } from "../core/councilConfig.js";
import { getEnabledProviders } from "../api/providerRouter.js";
import { PHASES } from "../hooks/useCouncilSession.js";

function StatusDot({ color, pulse }) {
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: pulse ? color : "var(--text-muted)",
        display: "inline-block",
        flexShrink: 0,
        animation: pulse ? "pulse-dot 0.8s ease infinite" : "none",
        transition: "background 0.3s",
      }}
    />
  );
}

function ProviderChip({ provider, isActive, isComplete, phase }) {
  const label = phase === PHASES.GENERATING && isActive ? "GENERATING" : phase === PHASES.JUDGING ? "JUDGING" : "";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        background: isActive ? provider.accentDark : "var(--bg-raised)",
        border: `1px solid ${isActive ? provider.color + "50" : isComplete ? provider.color + "25" : "var(--border-dim)"}`,
        borderRadius: "var(--r-md)",
        transition: "all 0.3s ease",
        minWidth: 0,
        flex: "1 1 0",
      }}
    >
      <span
        style={{
          fontSize: 14,
          color: isActive || isComplete ? provider.color : "var(--text-muted)",
          flexShrink: 0,
        }}
      >
        {provider.icon}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          className="mono"
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: isActive ? provider.color : isComplete ? "var(--text-secondary)" : "var(--text-muted)",
            letterSpacing: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            transition: "color 0.3s",
          }}
        >
          {provider.name.toUpperCase()}
        </div>
        {isActive && (
          <div className="mono" style={{ fontSize: 8, color: provider.color, letterSpacing: 1, opacity: 0.8 }}>
            {label}
          </div>
        )}
        {isComplete && !isActive && phase === PHASES.GENERATING && (
          <div className="mono" style={{ fontSize: 8, color: "var(--success)", letterSpacing: 1 }}>
            DONE
          </div>
        )}
      </div>
      <StatusDot color={provider.color} pulse={isActive} />
    </div>
  );
}

function JudgeChip({ isActive }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        background: isActive ? "var(--accent-dim)" : "var(--bg-raised)",
        border: `1px solid ${isActive ? "var(--accent-glow)" : "var(--border-dim)"}`,
        borderRadius: "var(--r-md)",
        flex: "0 0 auto",
      }}
    >
      <span style={{ fontSize: 14, color: isActive ? "var(--accent)" : "var(--text-muted)" }}>⚖️</span>
      <div className="mono" style={{ fontSize: 10, fontWeight: 700, color: isActive ? "var(--accent)" : "var(--text-muted)", letterSpacing: 1 }}>
        JUDGE
      </div>
      <StatusDot color="var(--accent)" pulse={isActive} />
    </div>
  );
}

export default function ProviderStatus({ phase, generatingFor, completedGenerating }) {
  const [enabledIds, setEnabledIds] = useState([]);

  useEffect(() => {
    getEnabledProviders().then(setEnabledIds);
  }, []);

  const enabledProviders = PROVIDERS.filter((p) => enabledIds.includes(p.id));
  const isJudging = phase === PHASES.JUDGING;

  return (
    <div
      style={{
        position: "relative",
        zIndex: 5,
        display: "flex",
        gap: "var(--sp-3)",
        padding: "var(--sp-3) var(--sp-8)",
        background: "var(--bg-surface)",
        borderBottom: "1px solid var(--border-dim)",
        overflowX: "auto",
      }}
    >
      {enabledProviders.map((provider) => {
        const isGenerating = generatingFor === provider.id;
        const isDoneGenerating = completedGenerating.has(provider.id) && !isGenerating;
        const isActive = isGenerating;
        const isComplete = phase === PHASES.GENERATING ? isDoneGenerating : false;

        return (
          <ProviderChip
            key={provider.id}
            provider={provider}
            isActive={isActive}
            isComplete={isComplete}
            phase={phase}
          />
        );
      })}
      {phase !== PHASES.IDLE && <JudgeChip isActive={isJudging} />}
    </div>
  );
}

