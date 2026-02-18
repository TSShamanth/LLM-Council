/**
 * PromptInput.jsx
 * Prompt entry with character count, injection warnings, and examples.
 */
import { useState } from "react";

const EXAMPLE_PROMPTS = [
  "Write a function to find all prime numbers up to N",
  "Design a rate limiter for a REST API",
  "Implement a LRU cache with O(1) get and put",
  "Create a debounce function in JavaScript",
  "Write a binary search tree with insert, delete, and search",
];

export default function PromptInput({ onSubmit, disabled, warnings }) {
  const [value, setValue] = useState("");
  const maxLen = 4000;
  const remaining = maxLen - value.length;
  const isReady = value.trim().length >= 10 && !disabled;

  function handleKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && isReady) {
      e.preventDefault();
      onSubmit(value);
    }
  }

  return (
    <div style={{ animation: "slide-up 0.4s ease" }}>
      {/* Main prompt box */}
      <div style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-soft)",
        borderRadius: "var(--r-lg)",
        overflow: "hidden",
        transition: "border-color 0.2s",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid var(--border-dim)",
          background: "var(--bg-raised)",
        }}>
          <span className="mono" style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: 2 }}>
            COUNCIL PROMPT
          </span>
          <span className="mono" style={{
            fontSize: 10,
            color: remaining < 200 ? "var(--warning)" : "var(--text-muted)",
          }}>
            {remaining.toLocaleString()} chars remaining
          </span>
        </div>

        {/* Textarea */}
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, maxLen))}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Describe a problem, feature, or task for all 5 council members to solve independently..."
          style={{
            width: "100%", minHeight: 120,
            padding: "var(--sp-4) var(--sp-5)",
            background: "transparent", border: "none", outline: "none",
            color: "var(--text-primary)",
            fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.7,
            resize: "vertical",
          }}
        />

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 16px",
          borderTop: "1px solid var(--border-dim)",
          background: "var(--bg-raised)",
        }}>
          <span className="mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
            ⌘↵ or ctrl+↵ to submit
          </span>
          <button
            disabled={!isReady}
            onClick={() => onSubmit(value)}
            style={{
              padding: "8px 20px",
              background: isReady ? "var(--accent)" : "var(--bg-overlay)",
              border: "none", borderRadius: "var(--r-md)",
              color: isReady ? "var(--bg-void)" : "var(--text-muted)",
              fontFamily: "var(--font-display)", fontSize: 13, letterSpacing: 2,
              cursor: isReady ? "pointer" : "not-allowed",
              transition: "all 0.2s",
              fontWeight: 700,
            }}
            onMouseEnter={(e) => { if (isReady) e.target.style.transform = "translateY(-1px)"; }}
            onMouseLeave={(e) => { e.target.style.transform = "none"; }}
          >
            CONVENE COUNCIL
          </button>
        </div>
      </div>

      {/* Injection warnings */}
      {warnings && warnings.length > 0 && (
        <div style={{
          marginTop: "var(--sp-3)",
          padding: "var(--sp-3) var(--sp-4)",
          background: "rgba(245,166,35,0.08)",
          border: "1px solid rgba(245,166,35,0.25)",
          borderRadius: "var(--r-md)",
        }}>
          {warnings.map((w, i) => (
            <div key={i} className="mono" style={{ fontSize: 11, color: "var(--warning)" }}>
              ⚠ {w}
            </div>
          ))}
        </div>
      )}

      {/* Examples */}
      <div style={{ marginTop: "var(--sp-4)" }}>
        <div className="mono" style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: 2, marginBottom: "var(--sp-2)" }}>
          EXAMPLE PROMPTS
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)" }}>
          {EXAMPLE_PROMPTS.map((ex) => (
            <button
              key={ex}
              onClick={() => setValue(ex)}
              disabled={disabled}
              style={{
                padding: "5px 12px",
                background: "var(--bg-raised)",
                border: "1px solid var(--border-dim)",
                borderRadius: "var(--r-md)",
                color: "var(--text-secondary)",
                fontFamily: "var(--font-mono)", fontSize: 11,
                cursor: "pointer", whiteSpace: "nowrap",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                e.target.style.borderColor = "var(--border-mid)";
                e.target.style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                e.target.style.borderColor = "var(--border-dim)";
                e.target.style.color = "var(--text-secondary)";
              }}
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
