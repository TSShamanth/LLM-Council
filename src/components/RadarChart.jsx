/**
 * RadarChart.jsx
 * Pure SVG radar chart for multi-dimensional score visualization.
 * Renders overlapping polygons on a 5-axis web with animated transitions.
 * 
 * @prop {Array<{label: string, color: string, scores: object}>} submissions
 *   Each scores object has: accuracy, completeness, clarity, relevance, usefulness (1-10)
 * @prop {number} [size=320] - Chart diameter in pixels
 */

const DIMENSIONS = [
    { key: "accuracy", label: "ACCURACY" },
    { key: "completeness", label: "COMPLETENESS" },
    { key: "clarity", label: "CLARITY" },
    { key: "relevance", label: "RELEVANCE" },
    { key: "usefulness", label: "USEFULNESS" },
];

const MAX_SCORE = 10;
const RINGS = [2, 4, 6, 8, 10];

function polarToCartesian(cx, cy, radius, angleDeg) {
    const angleRad = ((angleDeg - 90) * Math.PI) / 180;
    return {
        x: cx + radius * Math.cos(angleRad),
        y: cy + radius * Math.sin(angleRad),
    };
}

function getPolygonPoints(cx, cy, maxRadius, scores, dimensions) {
    const angleStep = 360 / dimensions.length;
    return dimensions
        .map((dim, i) => {
            const score = scores[dim.key] ?? 5;
            const r = (score / MAX_SCORE) * maxRadius;
            const { x, y } = polarToCartesian(cx, cy, r, i * angleStep);
            return `${x},${y}`;
        })
        .join(" ");
}

export default function RadarChart({ submissions = [], size = 320 }) {
    const padding = 48;
    const cx = size / 2;
    const cy = size / 2;
    const maxRadius = (size - padding * 2) / 2;
    const angleStep = 360 / DIMENSIONS.length;

    if (submissions.length === 0) return null;

    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <svg
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
                style={{ overflow: "visible" }}
            >
                {/* Background rings */}
                {RINGS.map((ringVal) => {
                    const r = (ringVal / MAX_SCORE) * maxRadius;
                    const points = DIMENSIONS.map((_, i) => {
                        const { x, y } = polarToCartesian(cx, cy, r, i * angleStep);
                        return `${x},${y}`;
                    }).join(" ");
                    return (
                        <polygon
                            key={`ring-${ringVal}`}
                            points={points}
                            fill="none"
                            stroke="rgba(255,255,255,0.06)"
                            strokeWidth={1}
                        />
                    );
                })}

                {/* Axis lines */}
                {DIMENSIONS.map((_, i) => {
                    const { x, y } = polarToCartesian(cx, cy, maxRadius, i * angleStep);
                    return (
                        <line
                            key={`axis-${i}`}
                            x1={cx}
                            y1={cy}
                            x2={x}
                            y2={y}
                            stroke="rgba(255,255,255,0.08)"
                            strokeWidth={1}
                        />
                    );
                })}

                {/* Data polygons */}
                {submissions.map((sub, idx) => {
                    const points = getPolygonPoints(cx, cy, maxRadius, sub.scores, DIMENSIONS);
                    const color = sub.color ?? "var(--accent)";
                    return (
                        <g key={sub.label}>
                            <polygon
                                points={points}
                                fill={color}
                                fillOpacity={0.12 - idx * 0.02}
                                stroke={color}
                                strokeWidth={2}
                                strokeOpacity={0.9}
                                style={{
                                    transition: "all 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
                                }}
                            />
                            {/* Score dots on vertices */}
                            {DIMENSIONS.map((dim, i) => {
                                const score = sub.scores[dim.key] ?? 5;
                                const r = (score / MAX_SCORE) * maxRadius;
                                const { x, y } = polarToCartesian(cx, cy, r, i * angleStep);
                                return (
                                    <circle
                                        key={`${sub.label}-${dim.key}`}
                                        cx={x}
                                        cy={y}
                                        r={3}
                                        fill={color}
                                        stroke="var(--bg-void)"
                                        strokeWidth={1.5}
                                        style={{ transition: "all 0.6s ease" }}
                                    />
                                );
                            })}
                        </g>
                    );
                })}

                {/* Axis labels */}
                {DIMENSIONS.map((dim, i) => {
                    const { x, y } = polarToCartesian(cx, cy, maxRadius + 22, i * angleStep);
                    return (
                        <text
                            key={`label-${dim.key}`}
                            x={x}
                            y={y}
                            textAnchor="middle"
                            dominantBaseline="central"
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: 8,
                                fill: "var(--text-muted)",
                                letterSpacing: 1,
                                textTransform: "uppercase",
                            }}
                        >
                            {dim.label}
                        </text>
                    );
                })}

                {/* Ring value labels */}
                {RINGS.filter((_, i) => i % 2 === 1).map((ringVal) => {
                    const r = (ringVal / MAX_SCORE) * maxRadius;
                    return (
                        <text
                            key={`rval-${ringVal}`}
                            x={cx + 4}
                            y={cy - r - 2}
                            style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: 7,
                                fill: "rgba(255,255,255,0.15)",
                            }}
                        >
                            {ringVal}
                        </text>
                    );
                })}
            </svg>

            {/* Legend */}
            <div style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                justifyContent: "center",
                marginTop: 12,
            }}>
                {submissions.map((sub) => (
                    <div
                        key={sub.label}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                        }}
                    >
                        <div style={{
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            background: sub.color ?? "var(--accent)",
                            opacity: 0.8,
                        }} />
                        <span
                            className="mono"
                            style={{
                                fontSize: 9,
                                color: sub.color ?? "var(--text-secondary)",
                                letterSpacing: 1,
                            }}
                        >
                            {sub.label}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
