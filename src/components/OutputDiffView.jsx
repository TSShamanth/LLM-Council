/**
 * OutputDiffView.jsx
 * Side-by-side or inline diff of any two outputs.
 * Uses word-level diff algorithm (no external dependency).
 */
import { useState, useMemo } from "react";
import { PROVIDER_MAP } from "../core/councilConfig.js";

/* ── Word-level diff algorithm ─────────────────────────────────── */
function computeWordDiff(textA, textB) {
    const wordsA = textA.split(/(\s+)/);
    const wordsB = textB.split(/(\s+)/);

    // Simple LCS-based diff
    const m = wordsA.length;
    const n = wordsB.length;

    // Build LCS table (memory-optimized for reasonable sizes)
    const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (wordsA[i - 1] === wordsB[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    // Backtrack to produce diff
    const result = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && wordsA[i - 1] === wordsB[j - 1]) {
            result.unshift({ type: "equal", text: wordsA[i - 1] });
            i--; j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            result.unshift({ type: "add", text: wordsB[j - 1] });
            j--;
        } else {
            result.unshift({ type: "remove", text: wordsA[i - 1] });
            i--;
        }
    }

    return result;
}

/* ── Diff Render ───────────────────────────────────────────────── */
function DiffInline({ diff }) {
    return (
        <pre style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            lineHeight: 1.8,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            margin: 0,
            padding: "var(--sp-4)",
        }}>
            {diff.map((part, i) => {
                if (part.type === "equal") {
                    return <span key={i} style={{ color: "var(--text-secondary)" }}>{part.text}</span>;
                }
                if (part.type === "add") {
                    return (
                        <span key={i} style={{
                            background: "rgba(34,208,122,0.15)",
                            color: "var(--success)",
                            borderRadius: 2,
                            padding: "0 1px",
                        }}>
                            {part.text}
                        </span>
                    );
                }
                if (part.type === "remove") {
                    return (
                        <span key={i} style={{
                            background: "rgba(240,90,90,0.15)",
                            color: "var(--danger)",
                            textDecoration: "line-through",
                            borderRadius: 2,
                            padding: "0 1px",
                        }}>
                            {part.text}
                        </span>
                    );
                }
                return null;
            })}
        </pre>
    );
}

function SideBySide({ textA, textB, labelA, labelB, colorA, colorB }) {
    return (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-3)" }}>
            <div>
                <div className="mono" style={{
                    fontSize: 9, color: colorA, letterSpacing: 2,
                    padding: "8px 12px", background: "var(--bg-raised)",
                    borderRadius: "var(--r-md) var(--r-md) 0 0",
                    borderBottom: `2px solid ${colorA}40`,
                }}>
                    {labelA}
                </div>
                <pre style={{
                    fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.7,
                    color: "var(--text-secondary)", whiteSpace: "pre-wrap", wordBreak: "break-word",
                    margin: 0, padding: "var(--sp-3)", background: "var(--bg-surface)",
                    borderRadius: "0 0 var(--r-md) var(--r-md)",
                    border: "1px solid var(--border-dim)", borderTop: "none",
                    maxHeight: 400, overflowY: "auto",
                }}>
                    {textA}
                </pre>
            </div>
            <div>
                <div className="mono" style={{
                    fontSize: 9, color: colorB, letterSpacing: 2,
                    padding: "8px 12px", background: "var(--bg-raised)",
                    borderRadius: "var(--r-md) var(--r-md) 0 0",
                    borderBottom: `2px solid ${colorB}40`,
                }}>
                    {labelB}
                </div>
                <pre style={{
                    fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.7,
                    color: "var(--text-secondary)", whiteSpace: "pre-wrap", wordBreak: "break-word",
                    margin: 0, padding: "var(--sp-3)", background: "var(--bg-surface)",
                    borderRadius: "0 0 var(--r-md) var(--r-md)",
                    border: "1px solid var(--border-dim)", borderTop: "none",
                    maxHeight: 400, overflowY: "auto",
                }}>
                    {textB}
                </pre>
            </div>
        </div>
    );
}

/* ── Main Component ────────────────────────────────────────────── */
export default function OutputDiffView({ anonymizedOutputs, revealMap }) {
    const labels = anonymizedOutputs.map((o) => o.label);
    const [leftIdx, setLeftIdx] = useState(0);
    const [rightIdx, setRightIdx] = useState(Math.min(1, labels.length - 1));
    const [mode, setMode] = useState("inline"); // 'inline' | 'side-by-side'

    const leftOutput = anonymizedOutputs[leftIdx];
    const rightOutput = anonymizedOutputs[rightIdx];

    const leftProviderId = revealMap?.get(leftOutput?.label);
    const rightProviderId = revealMap?.get(rightOutput?.label);
    const leftProvider = PROVIDER_MAP[leftProviderId];
    const rightProvider = PROVIDER_MAP[rightProviderId];

    const diff = useMemo(() => {
        if (!leftOutput || !rightOutput) return [];
        return computeWordDiff(leftOutput.content, rightOutput.content);
    }, [leftOutput, rightOutput]);

    // Compute diff stats
    const addCount = diff.filter(d => d.type === "add").length;
    const removeCount = diff.filter(d => d.type === "remove").length;
    const equalCount = diff.filter(d => d.type === "equal").length;
    const totalParts = addCount + removeCount + equalCount;
    const similarityPct = totalParts > 0 ? Math.round((equalCount / totalParts) * 100) : 0;

    if (anonymizedOutputs.length < 2) {
        return (
            <div style={{ textAlign: "center", padding: "var(--sp-10)", color: "var(--text-muted)" }}>
                <div className="mono" style={{ fontSize: 12 }}>Need at least 2 outputs to compare</div>
            </div>
        );
    }

    return (
        <div className="slide-up" style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
            {/* Controls */}
            <div style={{
                display: "flex", flexWrap: "wrap", gap: "var(--sp-3)", alignItems: "center",
                padding: "var(--sp-4)",
                background: "var(--bg-surface)",
                border: "1px solid var(--border-soft)",
                borderRadius: "var(--r-lg)",
            }}>
                {/* Left selector */}
                <div style={{ flex: 1, minWidth: 160 }}>
                    <div className="mono" style={{ fontSize: 8, color: "var(--text-muted)", letterSpacing: 2, marginBottom: 4 }}>
                        COMPARE (A)
                    </div>
                    <select
                        value={leftIdx}
                        onChange={(e) => setLeftIdx(Number(e.target.value))}
                        style={{
                            width: "100%", padding: "6px 10px",
                            background: "var(--bg-raised)", border: "1px solid var(--border-dim)",
                            borderRadius: "var(--r-md)", color: "var(--text-primary)",
                            fontFamily: "var(--font-mono)", fontSize: 11,
                        }}
                    >
                        {labels.map((l, i) => {
                            const pid = revealMap?.get(l);
                            const prov = PROVIDER_MAP[pid];
                            return <option key={l} value={i}>{l}{prov ? ` (${prov.name})` : ""}</option>;
                        })}
                    </select>
                </div>

                {/* VS */}
                <div className="mono" style={{ fontSize: 14, color: "var(--text-muted)", fontWeight: 700, padding: "0 8px", marginTop: 14 }}>
                    VS
                </div>

                {/* Right selector */}
                <div style={{ flex: 1, minWidth: 160 }}>
                    <div className="mono" style={{ fontSize: 8, color: "var(--text-muted)", letterSpacing: 2, marginBottom: 4 }}>
                        COMPARE (B)
                    </div>
                    <select
                        value={rightIdx}
                        onChange={(e) => setRightIdx(Number(e.target.value))}
                        style={{
                            width: "100%", padding: "6px 10px",
                            background: "var(--bg-raised)", border: "1px solid var(--border-dim)",
                            borderRadius: "var(--r-md)", color: "var(--text-primary)",
                            fontFamily: "var(--font-mono)", fontSize: 11,
                        }}
                    >
                        {labels.map((l, i) => {
                            const pid = revealMap?.get(l);
                            const prov = PROVIDER_MAP[pid];
                            return <option key={l} value={i}>{l}{prov ? ` (${prov.name})` : ""}</option>;
                        })}
                    </select>
                </div>

                {/* Mode toggle */}
                <div style={{ display: "flex", gap: 4, marginTop: 14 }}>
                    {["inline", "side-by-side"].map((m) => (
                        <button
                            key={m}
                            onClick={() => setMode(m)}
                            style={{
                                padding: "5px 10px",
                                background: mode === m ? "var(--accent-dim)" : "var(--bg-raised)",
                                border: `1px solid ${mode === m ? "var(--accent-glow)" : "var(--border-dim)"}`,
                                borderRadius: "var(--r-md)",
                                color: mode === m ? "var(--accent)" : "var(--text-muted)",
                                fontFamily: "var(--font-mono)", fontSize: 9,
                                cursor: "pointer", letterSpacing: 1, textTransform: "uppercase",
                            }}
                        >
                            {m === "inline" ? "◧ INLINE" : "◫ SPLIT"}
                        </button>
                    ))}
                </div>
            </div>

            {/* Diff stats */}
            <div style={{
                display: "flex", gap: "var(--sp-4)", justifyContent: "center",
                padding: "var(--sp-3)",
                background: "var(--bg-surface)",
                border: "1px solid var(--border-dim)",
                borderRadius: "var(--r-md)",
            }}>
                <span className="mono" style={{ fontSize: 10, color: "var(--success)" }}>
                    +{addCount} added
                </span>
                <span className="mono" style={{ fontSize: 10, color: "var(--danger)" }}>
                    -{removeCount} removed
                </span>
                <span className="mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    {similarityPct}% similar
                </span>
            </div>

            {/* Diff content */}
            <div style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-soft)",
                borderRadius: "var(--r-lg)",
                overflow: "hidden",
            }}>
                {mode === "inline" ? (
                    <DiffInline diff={diff} />
                ) : (
                    <div style={{ padding: "var(--sp-3)" }}>
                        <SideBySide
                            textA={leftOutput?.content ?? ""}
                            textB={rightOutput?.content ?? ""}
                            labelA={`${leftOutput?.label}${leftProvider ? ` — ${leftProvider.name}` : ""}`}
                            labelB={`${rightOutput?.label}${rightProvider ? ` — ${rightProvider.name}` : ""}`}
                            colorA={leftProvider?.color ?? "var(--text-muted)"}
                            colorB={rightProvider?.color ?? "var(--accent)"}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
