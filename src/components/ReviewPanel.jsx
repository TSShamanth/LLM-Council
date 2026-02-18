/**
 * ReviewPanel.jsx
 * Shows each reviewer's detailed analysis:
 * - Their vote + full reasoning
 * - Per-submission strengths/weaknesses
 * - Tradeoffs they identified in their winner
 * - Worst submission designation
 * - Bias check results
 */
import { MEMBER_MAP } from "../core/councilConfig.js";

function BiasWarning({ violations, severity }) {
  if (!violations || violations.length === 0) return null;
  const colors = { low: "var(--info)", medium: "var(--warning)", high: "var(--danger)" };
  const color = colors[severity] ?? "var(--warning)";
  return (
    <div style={{
      marginTop: 8, padding: "6px 10px",
      background: color + "10", border: `1px solid ${color}30`,
      borderRadius: "var(--r-sm)",
    }}>
      {violations.map((v, i) => (
        <div key={i} className="mono" style={{ fontSize: 9, color, letterSpacing: 1 }}>
          ⚠ {v}
        </div>
      ))}
    </div>
  );
}

function RankingBadge({ label, position, total }) {
  const isFirst = position === 0;
  const isLast = position === total - 1;
  const color = isFirst ? "var(--accent)" : isLast ? "var(--danger)" : "var(--text-muted)";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 4,
      padding: "3px 8px",
      background: isFirst ? "var(--accent-dim)" : "var(--bg-overlay)",
      border: `1px solid ${isFirst ? "var(--accent-glow)" : "var(--border-dim)"}`,
      borderRadius: "var(--r-sm)",
    }}>
      <span className="mono" style={{ fontSize: 9, color: "var(--text-muted)" }}>#{position + 1}</span>
      <span className="mono" style={{ fontSize: 9, color }}>{label}</span>
    </div>
  );
}

function ReviewCard({ review }) {
  const reviewer = MEMBER_MAP[review.reviewerId];
  if (!reviewer) return null;

  const ranking = review.ranking ?? [];
  const analysis = review.detailedAnalysis ?? {};
  const biasCheck = review.biasCheck ?? { passed: true, violations: [], severity: "low" };

  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-soft)",
      borderRadius: "var(--r-lg)",
      overflow: "hidden",
      animation: "fade-in 0.3s ease",
    }}>
      {/* Reviewer header */}
      <div style={{
        display: "flex", alignItems: "center", gap: "var(--sp-3)",
        padding: "12px 16px",
        background: reviewer.accentDark,
        borderBottom: "1px solid var(--border-dim)",
      }}>
        <span style={{ fontSize: 18, color: reviewer.color }}>{reviewer.icon}</span>
        <div style={{ flex: 1 }}>
          <div className="mono" style={{ fontSize: 11, color: reviewer.color, fontWeight: 700, letterSpacing: 1 }}>
            {reviewer.name.toUpperCase()}
          </div>
          <div className="mono" style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: 1 }}>
            {reviewer.reviewLens.split("\n")[0].replace("You evaluate through the lens of ", "LENS: ").toUpperCase()}
          </div>
        </div>
        <div style={{
          padding: "4px 12px",
          background: "var(--bg-surface)",
          border: `1px solid ${reviewer.color}40`,
          borderRadius: "var(--r-md)",
          fontFamily: "var(--font-mono)", fontSize: 10,
          color: reviewer.color, letterSpacing: 1,
        }}>
          VOTED: {review.vote}
        </div>
      </div>

      <div style={{ padding: "var(--sp-4) var(--sp-5)" }}>
        {/* Primary reasoning */}
        <div style={{ marginBottom: "var(--sp-4)" }}>
          <div className="mono" style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: 2, marginBottom: 6 }}>
            WHY THIS SUBMISSION WON
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 }}>
            {review.reason || "No reasoning provided."}
          </p>
        </div>

        {/* Ranking */}
        {ranking.length > 0 && (
          <div style={{ marginBottom: "var(--sp-4)" }}>
            <div className="mono" style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: 2, marginBottom: 6 }}>
              FULL RANKING
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {ranking.map((label, i) => (
                <RankingBadge key={label} label={label} position={i} total={ranking.length} />
              ))}
            </div>
          </div>
        )}

        {/* Per-submission detailed analysis */}
        {Object.keys(analysis).length > 0 && (
          <div style={{ marginBottom: "var(--sp-4)" }}>
            <div className="mono" style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: 2, marginBottom: 8 }}>
              PER-SUBMISSION ANALYSIS
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
              {Object.entries(analysis).map(([label, data]) => {
                if (!data) return null;
                const isVoted = label === review.vote;
                const score = typeof data.score === "number" ? data.score : null;
                const scoreColor = score >= 8 ? "var(--success)" : score >= 6 ? "var(--accent)" :
                                   score >= 4 ? "var(--warning)" : "var(--danger)";
                return (
                  <div key={label} style={{
                    padding: "var(--sp-3)",
                    background: isVoted ? reviewer.accentDark : "var(--bg-raised)",
                    border: `1px solid ${isVoted ? reviewer.color + "30" : "var(--border-dim)"}`,
                    borderRadius: "var(--r-md)",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span className="mono" style={{
                        fontSize: 10, fontWeight: 700,
                        color: isVoted ? reviewer.color : "var(--text-muted)",
                        letterSpacing: 1,
                      }}>
                        {label} {isVoted ? "★" : ""}
                      </span>
                      {score !== null && (
                        <span className="mono" style={{
                          fontSize: 11, fontWeight: 700, color: scoreColor,
                        }}>
                          {score}/10
                        </span>
                      )}
                    </div>
                    {data.strengths && (
                      <div className="mono" style={{ fontSize: 11, color: "var(--success)", lineHeight: 1.5 }}>
                        ＋ {data.strengths}
                      </div>
                    )}
                    {data.weaknesses && (
                      <div className="mono" style={{ fontSize: 11, color: "var(--danger)", lineHeight: 1.5, marginTop: 3 }}>
                        − {data.weaknesses}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tradeoffs */}
        {review.tradeoffs && (
          <div style={{ marginBottom: "var(--sp-3)" }}>
            <div className="mono" style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: 2, marginBottom: 6 }}>
              TRADEOFFS IN WINNING SUBMISSION
            </div>
            <div style={{
              padding: "var(--sp-3)",
              background: "rgba(245,166,35,0.06)",
              border: "1px solid rgba(245,166,35,0.2)",
              borderRadius: "var(--r-md)",
              fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--warning)", lineHeight: 1.6,
            }}>
              ⚠ {review.tradeoffs}
            </div>
          </div>
        )}

        {/* Worst submission */}
        {review.worstSubmission && (
          <div style={{ marginBottom: "var(--sp-3)" }}>
            <div className="mono" style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: 2, marginBottom: 6 }}>
              WEAKEST SUBMISSION
            </div>
            <div style={{
              padding: "var(--sp-3)",
              background: "rgba(240,90,90,0.06)",
              border: "1px solid rgba(240,90,90,0.2)",
              borderRadius: "var(--r-md)",
              fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--danger)", lineHeight: 1.6,
            }}>
              {review.worstSubmission}: {review.worstReason}
            </div>
          </div>
        )}

        {/* Bias check */}
        <BiasWarning violations={biasCheck.violations} severity={biasCheck.severity} />
      </div>
    </div>
  );
}

export default function ReviewPanel({ reviews }) {
  if (!reviews || reviews.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "var(--sp-10)", color: "var(--text-muted)" }}>
        <div className="mono" style={{ fontSize: 12 }}>Reviews loading...</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
      {reviews.map((review) => (
        <ReviewCard key={review.reviewerId} review={review} />
      ))}
    </div>
  );
}
