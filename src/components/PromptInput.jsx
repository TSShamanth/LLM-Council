/**
 * PromptInput.jsx
 * Prompt entry with character count, purpose selection, file/image uploads,
 * and example prompts.
 *
 * Images are stored as base64 in state so they can be sent to LLM providers
 * for multimodal generation. Non-image files are uploaded to the server.
 *
 * Reusable: FileBadge, ImagePreview are standalone components.
 */
import { useState, useRef } from "react";

const EXAMPLE_PROMPTS = [
  "Write a function to find all prime numbers up to N",
  "Design a rate limiter for a REST API",
  "Implement a LRU cache with O(1) get and put",
  "Create a debounce function in JavaScript",
  "Write a binary search tree with insert, delete, and search",
];

const ACCEPTED_EXTENSIONS = ".txt,.md,.json,.js,.ts,.jsx,.tsx,.py,.css,.html,.csv,.jpg,.jpeg,.png,.gif,.webp,.svg,.pdf,.zip";
const MAX_FILE_SIZE_MB = 10;
const MAX_FILES = 5;

/**
 * Read a file as text.
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read file as text"));
    reader.readAsText(file);
  });
}

/**
 * Read a file as base64 data URL. Reusable utility.
 * @param {File} file
 * @returns {Promise<{base64: string, dataUrl: string}>}
 */
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(",")[1];
      resolve({ base64, dataUrl });
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Upload a non-image file to the server via base64 JSON.
 * Images are NOT uploaded to the server — they stay in-memory for multimodal LLM calls.
 */
async function uploadFileToServer(file, base64Data) {
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("token")}`,
    },
    body: JSON.stringify({
      fileName: file.name,
      fileData: base64Data,
      mimeType: file.type,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Upload failed");
  }
  return res.json();
}

/* ── Image Preview (reusable) ──────────────────────────────────── */
function ImagePreview({ src, name, onRemove }) {
  return (
    <div style={{
      position: "relative",
      width: 72, height: 72,
      borderRadius: "var(--r-md)",
      overflow: "hidden",
      border: "1px solid var(--border-dim)",
      flexShrink: 0,
    }}>
      <img
        src={src}
        alt={name}
        style={{
          width: "100%", height: "100%",
          objectFit: "cover",
        }}
      />
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        style={{
          position: "absolute", top: 2, right: 2,
          width: 18, height: 18,
          background: "rgba(0,0,0,0.7)", border: "none",
          borderRadius: "50%", color: "white",
          cursor: "pointer", fontSize: 10,
          display: "flex", alignItems: "center", justifyContent: "center",
          lineHeight: 1,
        }}
        title="Remove"
      >✕</button>
    </div>
  );
}

/* ── File Badge (reusable) ─────────────────────────────────────── */
function FileBadge({ file, onRemove }) {
  const sizeStr = file.sizeBytes
    ? file.sizeBytes > 1024 * 1024
      ? `${(file.sizeBytes / (1024 * 1024)).toFixed(1)}MB`
      : `${Math.round(file.sizeBytes / 1024)}KB`
    : "";

  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 10px",
      background: "var(--bg-raised)", border: "1px solid var(--border-dim)",
      borderRadius: "var(--r-md)", fontSize: 11,
      fontFamily: "var(--font-mono)", color: "var(--text-secondary)",
    }}>
      <span style={{ fontSize: 12 }}>📄</span>
      <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {file.originalName}
      </span>
      {sizeStr && <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{sizeStr}</span>}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        style={{
          background: "transparent", border: "none", color: "var(--text-muted)",
          cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1,
        }}
      >✕</button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
 * ── Main PromptInput ──────────────────────────────────────────── 
 * ═══════════════════════════════════════════════════════════════════ */
export default function PromptInput({ onSubmit, disabled, warnings, attachments = [], onAttachmentsChange }) {
  const [value, setValue] = useState("");
  const [purpose, setPurpose] = useState("content");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const maxLen = 50000;
  const remaining = maxLen - value.length;
  const isReady = value.trim().length >= 10 && !disabled && !uploading;

  const imageAttachments = attachments.filter((a) => a.mimeType?.startsWith("image/"));
  const fileAttachments = attachments.filter((a) => !a.mimeType?.startsWith("image/"));

  function handleKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && isReady) {
      e.preventDefault();
      onSubmit(value, purpose);
    }
  }

  async function handleFileSelect(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (attachments.length + files.length > MAX_FILES) {
      alert(`Maximum ${MAX_FILES} files allowed`);
      return;
    }

    for (const f of files) {
      if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        alert(`File "${f.name}" exceeds ${MAX_FILE_SIZE_MB}MB limit`);
        return;
      }
    }

    setUploading(true);
    try {
      const newAttachments = [];
      for (const file of files) {
        const { base64, dataUrl } = await readFileAsBase64(file);
        const isImage = file.type.startsWith("image/");

        if (isImage) {
          // Images: keep base64 in-memory for multimodal LLM calls
          newAttachments.push({
            filename: file.name,
            originalName: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
            base64,      // For LLM API
            dataUrl,     // For preview
          });
        } else {
          // Non-image files: upload to server for storage AND read text content for prompt context
          const result = await uploadFileToServer(file, base64);
          let textContent = result.textContent || null;
          
          if (!textContent) {
            try {
              // Only attempt to read if it's likely a text file
              const textMimeTypes = ["text/", "application/json", "application/javascript", "application/x-javascript", "application/typescript", "application/xml"];
              if (textMimeTypes.some(m => file.type.startsWith(m)) || 
                  [".txt", ".md", ".json", ".js", ".ts", ".jsx", ".tsx", ".py", ".css", ".html", ".csv", ".yaml", ".yml"].some(ext => file.name.endsWith(ext))) {
                textContent = await readFileAsText(file);
              }

            } catch (e) {
              console.warn("Could not read file as text:", file.name);
            }
          }

          newAttachments.push({
            ...result,
            base64: null,
            dataUrl: null,
            textContent, // Use server-extracted or client-read text
          });
        }
      }
      onAttachmentsChange?.([...attachments, ...newAttachments]);
    } catch (err) {
      console.error("Upload error:", err);
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeAttachment(index) {
    onAttachmentsChange?.(attachments.filter((_, i) => i !== index));
  }

  return (
    <div style={{ animation: "slide-up 0.4s ease" }}>
      {/* Purpose Selector */}
      <div style={{ display: "flex", gap: "var(--sp-2)", marginBottom: "var(--sp-4)" }}>
        {["code", "content", "logical"].map((p) => (
          <button
            key={p}
            onClick={() => setPurpose(p)}
            disabled={disabled}
            style={{
              padding: "6px 14px",
              background: purpose === p ? "var(--accent)" : "var(--bg-raised)",
              border: `1px solid ${purpose === p ? "var(--accent)" : "var(--border-dim)"}`,
              borderRadius: "var(--r-md)",
              color: purpose === p ? "var(--bg-void)" : "var(--text-muted)",
              fontFamily: "var(--font-mono)", fontSize: 10,
              cursor: "pointer", letterSpacing: 1, textTransform: "uppercase",
              transition: "all 0.2s", fontWeight: purpose === p ? 700 : 400,
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Main prompt box */}
      <div style={{
        background: "var(--bg-surface)", border: "1px solid var(--border-soft)",
        borderRadius: "var(--r-lg)", overflow: "hidden", transition: "border-color 0.2s",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", borderBottom: "1px solid var(--border-dim)",
          background: "var(--bg-raised)",
        }}>
          <span className="mono" style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: 2 }}>
            COUNCIL PROMPT ({purpose.toUpperCase()})
          </span>
          <span className="mono" style={{
            fontSize: 10, color: remaining < 200 ? "var(--warning)" : "var(--text-muted)",
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
          placeholder="Describe a problem, feature, or task for all council members to solve independently..."
          style={{
            width: "100%", minHeight: 120,
            padding: "var(--sp-4) var(--sp-5)",
            background: "transparent", border: "none", outline: "none",
            color: "var(--text-primary)",
            fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.7,
            resize: "vertical",
          }}
        />

        {/* Image Previews */}
        {imageAttachments.length > 0 && (
          <div style={{
            padding: "8px 16px", borderTop: "1px solid var(--border-dim)",
            display: "flex", gap: 8, flexWrap: "wrap",
          }}>
            <span className="mono" style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: 1, alignSelf: "center", marginRight: 4 }}>
              🖼 IMAGES ({imageAttachments.length}) — will be sent to LLMs:
            </span>
            {imageAttachments.map((img, i) => {
              const globalIdx = attachments.indexOf(img);
              return (
                <ImagePreview
                  key={img.filename}
                  src={img.dataUrl}
                  name={img.originalName}
                  onRemove={() => removeAttachment(globalIdx)}
                />
              );
            })}
          </div>
        )}

        {/* Non-image file badges */}
        {fileAttachments.length > 0 && (
          <div style={{
            padding: "8px 16px", borderTop: "1px solid var(--border-dim)",
            display: "flex", flexWrap: "wrap", gap: 6,
          }}>
            {fileAttachments.map((file) => {
              const globalIdx = attachments.indexOf(file);
              return (
                <FileBadge key={file.filename} file={file} onRemove={() => removeAttachment(globalIdx)} />
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 16px", borderTop: "1px solid var(--border-dim)",
          background: "var(--bg-raised)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
              ⌘↵ or ctrl+↵ to submit
            </span>

            {/* File upload button */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_EXTENSIONS}
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || uploading || attachments.length >= MAX_FILES}
              title={`Attach files or images (${attachments.length}/${MAX_FILES})`}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "4px 10px",
                background: "transparent",
                border: "1px solid var(--border-dim)",
                borderRadius: "var(--r-md)",
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono)", fontSize: 10,
                cursor: disabled || attachments.length >= MAX_FILES ? "not-allowed" : "pointer",
                transition: "all 0.2s",
                opacity: disabled || attachments.length >= MAX_FILES ? 0.4 : 1,
              }}
              onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.borderColor = "var(--border-mid)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-dim)"; }}
            >
              📎 {uploading ? "UPLOADING..." : `ATTACH (${attachments.length}/${MAX_FILES})`}
            </button>
          </div>

          <button
            disabled={!isReady}
            onClick={() => onSubmit(value, purpose)}
            style={{
              padding: "8px 20px",
              background: isReady ? "var(--accent)" : "var(--bg-overlay)",
              border: "none", borderRadius: "var(--r-md)",
              color: isReady ? "var(--bg-void)" : "var(--text-muted)",
              fontFamily: "var(--font-display)", fontSize: 13, letterSpacing: 2,
              cursor: isReady ? "pointer" : "not-allowed",
              transition: "all 0.2s", fontWeight: 700,
            }}
          >
            CONVENE COUNCIL
          </button>
        </div>
      </div>

      {/* Injection warnings */}
      {warnings && warnings.length > 0 && (
        <div style={{
          marginTop: "var(--sp-3)", padding: "var(--sp-3) var(--sp-4)",
          background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.25)",
          borderRadius: "var(--r-md)",
        }}>
          {warnings.map((w, i) => (
            <div key={i} className="mono" style={{ fontSize: 11, color: "var(--warning)" }}>⚠ {w}</div>
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
                background: "var(--bg-raised)", border: "1px solid var(--border-dim)",
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
