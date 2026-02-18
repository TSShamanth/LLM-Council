/**
 * ActivityLog.jsx
 * Real-time log of session events — errors, warnings, completions.
 * Auto-scrolls to latest entry.
 */
import { useEffect, useRef } from "react";

const LEVEL_STYLES = {
  info:    { color: "var(--text-muted)",    prefix: "" },
  warn:    { color: "var(--warning)",       prefix: "" },
  error:   { color: "var(--danger)",        prefix: "" },
  success: { color: "var(--success)",       prefix: "" },
};

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function ActivityLog({ entries }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  if (entries.length === 0) return null;

  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-soft)",
      borderRadius: "var(--r-lg)",
      overflow: "hidden",
      marginBottom: "var(--sp-5)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 14px",
        background: "var(--bg-raised)",
        borderBottom: "1px solid var(--border-dim)",
      }}>
        <span className="mono" style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: 2 }}>
          SESSION LOG
        </span>
        <span className="mono" style={{ fontSize: 9, color: "var(--text-muted)" }}>
          {entries.length} entries
        </span>
      </div>

      <div style={{
        maxHeight: 160, overflowY: "auto",
        padding: "var(--sp-3) var(--sp-4)",
      }}>
        {entries.map((entry, i) => {
          const style = LEVEL_STYLES[entry.level] ?? LEVEL_STYLES.info;
          return (
            <div key={i} style={{
              display: "flex", gap: "var(--sp-3)", alignItems: "baseline",
              marginBottom: 4,
              animation: i === entries.length - 1 ? "fade-in 0.2s ease" : "none",
            }}>
              <span className="mono" style={{ fontSize: 9, color: "var(--text-faint)", flexShrink: 0 }}>
                {formatTime(entry.timestamp)}
              </span>
              <span className="mono" style={{ fontSize: 11, color: style.color, lineHeight: 1.5 }}>
                {entry.message}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
