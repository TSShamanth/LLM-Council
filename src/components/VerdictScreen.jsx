/**
 * VerdictScreen.jsx
 * Production-ready verdict display with:
 * - Per-output accept/reject verdict with detailed reasoning
 * - Strengths/weaknesses lists per submission
 * - Radar chart of scores for all submissions
 * - Overall analysis explaining the council's decision
 * - Minority opinions
 * - User choice: Winner output vs Combined best-of output
 *
 * Reusable: Expandable, ScoreBar, CritiqueCard are standalone components.
 */
import { useState } from "react";
import { PROVIDER_MAP } from "../core/councilConfig.js";
import { SCORE_DIMENSIONS } from "../core/judge.js";
import RadarChart from "./RadarChart.jsx";

/* ── Reusable Expandable Section ────────────────────────────────── */
function Expandable({ title, titleColor, icon, defaultOpen = false, badge, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      background: "var(--bg-raised)",
      border: "1px solid var(--border-dim)",
      borderRadius: "var(--r-lg)",
      overflow: "hidden",
      transition: "all 0.3s",
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          transition: "background 0.2s",
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {icon && <span style={{ fontSize: 14 }}>{icon}</span>}
          <span className="mono" style={{
            fontSize: 10, color: titleColor ?? "var(--text-muted)",
            letterSpacing: 2, fontWeight: 700,
          }}>
            {title}
          </span>
          {badge && <span style={{ marginLeft: 4 }}>{badge}</span>}
        </div>
        <span style={{
          fontSize: 12, color: "var(--text-muted)",
          transform: open ? "rotate(180deg)" : "rotate(0)",
          transition: "transform 0.3s",
        }}>▾</span>
      </button>
      <div style={{
        maxHeight: open ? 2000 : 0,
        overflow: "hidden",
        transition: "max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
      }}>
        <div style={{ padding: "0 16px 16px" }}>{children}</div>
      </div>
    </div>
  );
}

/* ── Reusable Score Bar ──────────────────────────────────────────── */
function ScoreBar({ label, value, maxValue = 10 }) {
  const pct = (value / maxValue) * 100;
  const color = value >= 8 ? "var(--success)" : value >= 6 ? "var(--accent)" :
    value >= 4 ? "var(--warning)" : "var(--danger)";
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span className="mono" style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: 1, textTransform: "uppercase" }}>
          {label}
        </span>
        <span className="mono" style={{ fontSize: 9, color, fontWeight: 700 }}>{value}/10</span>
      </div>
      <div style={{ height: 4, background: "var(--bg-overlay)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`, background: color, borderRadius: 2,
          transition: "width 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
        }} />
      </div>
    </div>
  );
}

/* ── Verdict Badge ──────────────────────────────────────────────── */
function VerdictBadge({ verdict }) {
  const isAccepted = verdict === "ACCEPTED";
  return (
    <span className="mono" style={{
      fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
      padding: "3px 10px", borderRadius: "var(--r-sm)",
      background: isAccepted ? "rgba(34,208,122,0.12)" : "rgba(240,90,90,0.12)",
      border: `1px solid ${isAccepted ? "rgba(34,208,122,0.3)" : "rgba(240,90,90,0.3)"}`,
      color: isAccepted ? "var(--success)" : "var(--danger)",
    }}>
      {isAccepted ? "✓ ACCEPTED" : "✕ REJECTED"}
    </span>
  );
}

/* ── Bullet List (reusable for strengths/weaknesses) ─────────── */
function BulletList({ items, color, icon }) {
  if (!items || items.length === 0) return null;
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {items.map((item, i) => (
        <li key={i} style={{
          display: "flex", gap: 8, marginBottom: 6, alignItems: "flex-start",
        }}>
          <span style={{ color, fontSize: 10, flexShrink: 0, marginTop: 2 }}>{icon}</span>
          <span style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/* ── Per-Submission Critique Card ───────────────────────────────── */
function CritiqueCard({ label, scores, providerId, isWinner }) {
  const provider = PROVIDER_MAP[providerId];
  const totalScore = SCORE_DIMENSIONS.reduce((sum, dim) => sum + (scores?.[dim] ?? 5), 0);
  const avgScore = (totalScore / SCORE_DIMENSIONS.length).toFixed(1);
  const borderColor = isWinner ? (provider?.color ?? "var(--accent)") : "var(--border-dim)";

  return (
    <Expandable
      title={`${provider?.name?.toUpperCase() ?? label} — AVG ${avgScore}/10`}
      titleColor={isWinner ? (provider?.color ?? "var(--accent)") : "var(--text-secondary)"}
      icon={provider?.icon}
      defaultOpen={isWinner}
      badge={<VerdictBadge verdict={scores?.verdict} />}
    >
      <div style={{ borderLeft: `3px solid ${borderColor}`, paddingLeft: 12 }}>
        {/* Dimension scores */}
        <div style={{ marginBottom: 16 }}>
          {SCORE_DIMENSIONS.map((dim) => (
            <ScoreBar key={dim} label={dim} value={scores?.[dim] ?? 5} />
          ))}
        </div>

        {/* Verdict Reason — WHY accepted/rejected */}
        {scores?.verdictReason && (
          <div style={{
            marginBottom: 16, padding: "12px 14px",
            background: isWinner ? "rgba(34,208,122,0.06)" : "rgba(240,90,90,0.06)",
            border: `1px solid ${isWinner ? "rgba(34,208,122,0.15)" : "rgba(240,90,90,0.15)"}`,
            borderRadius: "var(--r-md)",
          }}>
            <div className="mono" style={{
              fontSize: 9, letterSpacing: 1.5, marginBottom: 6,
              color: isWinner ? "var(--success)" : "var(--danger)",
            }}>
              {isWinner ? "WHY THIS OUTPUT WAS SELECTED" : "WHY THIS OUTPUT WAS REJECTED"}
            </div>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7, margin: 0 }}>
              {scores.verdictReason}
            </p>
          </div>
        )}

        {/* Strengths */}
        <div style={{ marginBottom: 12 }}>
          <div className="mono" style={{ fontSize: 9, color: "var(--success)", letterSpacing: 1, marginBottom: 8 }}>
            ＋ STRENGTHS ({scores?.strengths?.length ?? 0})
          </div>
          <BulletList items={scores?.strengths} color="var(--success)" icon="✦" />
        </div>

        {/* Weaknesses */}
        <div>
          <div className="mono" style={{ fontSize: 9, color: "var(--danger)", letterSpacing: 1, marginBottom: 8 }}>
            − WEAKNESSES ({scores?.weaknesses?.length ?? 0})
          </div>
          <BulletList items={scores?.weaknesses} color="var(--danger)" icon="▸" />
        </div>
      </div>
    </Expandable>
  );
}

/* ═══════════════════════════════════════════════════════════════════
 * ── Main VerdictScreen ─────────────────────────────────────────── 
 * ═══════════════════════════════════════════════════════════════════ */
export default function VerdictScreen({ verdictBreakdown, combinedOutput }) {
  const [viewMode, setViewMode] = useState("winner"); // 'winner' | 'combined'

  if (!verdictBreakdown) return null;
  const isCombineMode = verdictBreakdown.mode === "combine";
  const { winner, scores, overallAnalysis, minorityOpinions, revealMap, components } = verdictBreakdown;
  const winnerProvider = winner ? PROVIDER_MAP[winner.providerId] : null;

  // Build radar chart data
  const radarSubmissions = [];
  if (scores) {
    for (const [label, submissionScores] of Object.entries(scores)) {
      const providerId = revealMap?.get(label);
      const prov = PROVIDER_MAP[providerId];
      radarSubmissions.push({
        label,
        color: prov?.color ?? "var(--text-muted)",
        scores: submissionScores,
      });
    }
    // Sort winner first
    if (winner) {
      radarSubmissions.sort((a, b) => {
        if (a.label === winner.label) return -1;
        if (b.label === winner.label) return 1;
        return 0;
      });
    }
  }

  // All submissions for critique cards
  const allSubmissions = scores
    ? Object.entries(scores).map(([label, s]) => ({
      label,
      providerId: revealMap?.get(label),
      isWinner: winner ? label === winner.label : false,
      scores: s,
    }))
    : [];
  // Sort: winner first
  allSubmissions.sort((a, b) => (a.isWinner ? -1 : b.isWinner ? 1 : 0));

  return (
    <div className="slide-up" style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>

      {/* ── Combine Mode: Component-wise Winners ────────────────────── */}
      {isCombineMode && components && (
        <div style={{
          background: "var(--bg-surface)", borderRadius: "var(--r-xl)",
          border: "1px solid var(--accent-glow)", padding: "var(--sp-6)",
        }}>
          <div className="mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: 3, marginBottom: 20, textAlign: "center" }}>
            🧩 COMPONENT-WISE VERDICT (COMBINE MODE)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {components.map((c, i) => {
              const prov = PROVIDER_MAP[c.providerId];
              return (
                <div key={i} style={{
                  background: "var(--bg-raised)", border: "1px solid var(--border-soft)",
                  borderRadius: "var(--r-lg)", padding: 16, borderTop: `4px solid ${prov?.color ?? "var(--accent)"}`
                }}>
                  <div className="display" style={{ fontSize: 14, color: "var(--text-primary)", marginBottom: 8, letterSpacing: 1 }}>
                    {c.name.toUpperCase()}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 18, color: prov?.color }}>{prov?.icon}</span>
                    <span className="mono" style={{ fontSize: 11, color: prov?.color ?? "var(--accent)", fontWeight: 700 }}>
                      {prov?.name ?? c.winner}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                    {c.reason}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Compare Mode: Winner Banner ─────────────────────────────── */}
      {!isCombineMode && winner && (
        <div style={{
          position: "relative", overflow: "hidden",
          background: "var(--bg-surface)", borderRadius: "var(--r-xl)",
          border: `1px solid ${winnerProvider?.color ?? "var(--accent)"}50`,
          padding: "var(--sp-8)", textAlign: "center",
        }}>
          <div style={{
            position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
            width: "60%", height: 120, pointerEvents: "none",
            background: `radial-gradient(ellipse at 50% 0%, ${winnerProvider?.color ?? "var(--accent)"}20, transparent 70%)`,
          }} />
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
                {winnerProvider?.name?.toUpperCase() ?? "UNKNOWN"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Integrated Output (always shown in result mode) ─────────── */}
      {combinedOutput && (
        <div style={{
          padding: "var(--sp-5)",
          background: "var(--bg-surface)",
          border: isCombineMode ? "1px solid var(--accent-glow)" : "1px solid var(--border-soft)",
          borderRadius: "var(--r-lg)",
        }}>
          <div className="mono" style={{ fontSize: 9, color: "var(--accent)", letterSpacing: 2, marginBottom: 12 }}>
            {isCombineMode ? "🔗 FINAL INTEGRATED SOLUTION" : "🔗 COMBINED BEST-OF-ALL OUTPUT"}
          </div>
          <pre style={{
            fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.8, margin: 0,
            fontFamily: "var(--font-body)", whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>
            {combinedOutput}
          </pre>
        </div>
      )}

      {/* ── Radar Chart (only for compare mode) ─────────────────────── */}
      {!isCombineMode && radarSubmissions.length > 0 && (
        <div style={{
          background: "var(--bg-surface)", borderRadius: "var(--r-xl)",
          border: "1px solid var(--border-soft)", padding: "var(--sp-6)",
        }}>
          <div className="mono" style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: 2, marginBottom: 16, textAlign: "center" }}>
            MULTI-DIMENSIONAL SCORE COMPARISON
          </div>
          <RadarChart submissions={radarSubmissions} size={340} />
        </div>
      )}

      {/* ── Why the Council Decided ─────────────────────────────────── */}
      {overallAnalysis && (
        <Expandable title="WHY THE COUNCIL DECIDED" icon="⚖️" titleColor="var(--accent)" defaultOpen={true}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.8, margin: 0 }}>
            {overallAnalysis}
          </p>
        </Expandable>
      )}

      {/* ── Combine Mode Strategy ───────────────────────────────────── */}
      {isCombineMode && verdictBreakdown.combineJudge?.overallStrategy && (
        <Expandable title="INTEGRATION STRATEGY" icon="🛠️" titleColor="var(--accent)" defaultOpen={true}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.8, margin: 0 }}>
            {verdictBreakdown.combineJudge.overallStrategy}
          </p>
        </Expandable>
      )}

      {/* ── Per-Submission Critiques (with accept/reject) ──────────── */}
      <div>
        <div className="mono" style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: 2, marginBottom: 12 }}>
          DETAILED PER-OUTPUT ANALYSIS
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
          {allSubmissions.map((sub) => (
            <CritiqueCard
              key={sub.label}
              label={sub.label}
              scores={sub.scores}
              providerId={sub.providerId}
              isWinner={sub.isWinner}
            />
          ))}
        </div>
      </div>

      {/* ── Minority Opinions ──────────────────────────────────────── */}
      {minorityOpinions && minorityOpinions.length > 0 && (
        <Expandable title="MINORITY OPINIONS — UNIQUE MERITS" icon="💡" titleColor="var(--info)" defaultOpen={false}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
            {minorityOpinions.map((m) => {
              const prov = PROVIDER_MAP[m.providerId];
              return (
                <div key={m.label} style={{
                  padding: "var(--sp-3) var(--sp-4)",
                  background: "var(--bg-overlay)", borderRadius: "var(--r-md)",
                  border: "1px solid var(--border-dim)",
                  borderLeft: `3px solid ${prov?.color ?? "var(--info)"}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    {prov && <span style={{ fontSize: 12, color: prov.color }}>{prov.icon}</span>}
                    <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: prov?.color ?? "var(--text-secondary)", letterSpacing: 1 }}>
                      {prov?.name ?? m.label}
                    </span>
                    <span className="mono" style={{ fontSize: 9, color: "var(--text-muted)" }}>({m.label})</span>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                    💡 {m.uniqueMerit}
                  </p>
                </div>
              );
            })}
          </div>
        </Expandable>
      )}
    </div>
  );
}
