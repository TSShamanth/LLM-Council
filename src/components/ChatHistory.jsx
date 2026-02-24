/**
 * ChatHistory.jsx
 * Slide-out sidebar listing past council sessions.
 * Sessions are loaded from the backend API (SQLite-backed).
 * Click to reload a session into the verdict view.
 */
import { useState, useEffect, useCallback } from "react";
import { PROVIDER_MAP } from "../core/councilConfig.js";

/**
 * Fetch user's chat sessions from backend.
 * @param {number} page
 * @param {number} limit
 * @returns {Promise<{sessions: Array, total: number}>}
 */
async function fetchSessions(page = 1, limit = 20) {
    try {
        const res = await fetch(`/api/sessions?page=${page}&limit=${limit}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
            },
        });
        if (!res.ok) throw new Error('Failed to fetch sessions');
        return res.json();
    } catch (err) {
        console.warn('Failed to fetch chat history:', err);
        return { sessions: [], total: 0 };
    }
}

/**
 * Delete a session by ID.
 */
async function deleteSession(id) {
    try {
        const res = await fetch(`/api/sessions/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
            },
        });
        return res.ok;
    } catch {
        return false;
    }
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function SessionItem({ session, onLoad, onDelete, isActive }) {
    const [confirmDelete, setConfirmDelete] = useState(false);

    let winnerName = "—";
    try {
        const verdict = typeof session.verdict_data === 'string'
            ? JSON.parse(session.verdict_data)
            : session.verdict_data;
        if (verdict?.winner?.providerId) {
            const prov = PROVIDER_MAP[verdict.winner.providerId];
            winnerName = prov ? `${prov.icon} ${prov.name}` : verdict.winner.providerId;
        }
    } catch { /* ignore parse errors */ }

    return (
        <div
            style={{
                padding: "12px 14px",
                background: isActive ? "var(--accent-dim)" : "transparent",
                border: `1px solid ${isActive ? "var(--accent-glow)" : "transparent"}`,
                borderRadius: "var(--r-md)",
                cursor: "pointer",
                transition: "all 0.2s",
            }}
            onClick={() => onLoad(session)}
            onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.02)";
            }}
            onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = "transparent";
            }}
        >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                <div className="mono" style={{
                    fontSize: 11, color: "var(--text-primary)", fontWeight: 600,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    maxWidth: "70%",
                }}>
                    {session.title || "Untitled Session"}
                </div>
                <span className="mono" style={{ fontSize: 8, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {formatDate(session.created_at)}
                </span>
            </div>

            <div className="mono" style={{
                fontSize: 10, color: "var(--text-muted)", lineHeight: 1.4,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
                {session.prompt?.substring(0, 80)}...
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span className="mono" style={{
                        fontSize: 8, color: "var(--accent)", letterSpacing: 1,
                        padding: "2px 6px", background: "var(--accent-dim)",
                        borderRadius: "var(--r-sm)", border: "1px solid var(--accent-glow)",
                    }}>
                        {session.purpose?.toUpperCase() ?? "CONTENT"}
                    </span>
                    <span className="mono" style={{ fontSize: 9, color: "var(--text-secondary)" }}>
                        🏆 {winnerName}
                    </span>
                </div>

                {/* Delete button */}
                {confirmDelete ? (
                    <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(session.id); setConfirmDelete(false); }}
                            className="mono"
                            style={{
                                fontSize: 8, padding: "2px 6px", background: "var(--danger)",
                                border: "none", borderRadius: "var(--r-sm)", color: "white",
                                cursor: "pointer",
                            }}
                        >
                            CONFIRM
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                            className="mono"
                            style={{
                                fontSize: 8, padding: "2px 6px", background: "var(--bg-overlay)",
                                border: "1px solid var(--border-dim)", borderRadius: "var(--r-sm)",
                                color: "var(--text-muted)", cursor: "pointer",
                            }}
                        >
                            ✕
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                        style={{
                            background: "transparent", border: "none",
                            color: "var(--text-muted)", cursor: "pointer", fontSize: 12,
                            opacity: 0.5, transition: "opacity 0.2s",
                            padding: "2px 4px",
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = 0.5}
                        title="Delete session"
                    >
                        🗑
                    </button>
                )}
            </div>
        </div>
    );
}

export default function ChatHistory({ onLoadSession, activeSessionId, isOpen, onClose }) {
    const [sessions, setSessions] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);

    const loadSessions = useCallback(async (p = 1) => {
        setLoading(true);
        const data = await fetchSessions(p, 20);
        setSessions(data.sessions ?? []);
        setTotal(data.total ?? 0);
        setPage(p);
        setLoading(false);
    }, []);

    useEffect(() => {
        if (isOpen) loadSessions(1);
    }, [isOpen, loadSessions]);

    const handleDelete = async (id) => {
        const ok = await deleteSession(id);
        if (ok) {
            setSessions((prev) => prev.filter((s) => s.id !== id));
            setTotal((t) => t - 1);
        }
    };

    const hasMore = sessions.length < total;

    return (
        <div style={{
            position: "fixed",
            top: 0,
            right: isOpen ? 0 : -380,
            width: 360,
            height: "100vh",
            background: "var(--bg-surface)",
            borderLeft: "1px solid var(--border-soft)",
            zIndex: 100,
            transition: "right 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
            display: "flex",
            flexDirection: "column",
            boxShadow: isOpen ? "-8px 0 40px rgba(0,0,0,0.5)" : "none",
        }}>
            {/* Header */}
            <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "16px 18px",
                borderBottom: "1px solid var(--border-dim)",
                background: "var(--bg-raised)",
            }}>
                <div className="mono" style={{ fontSize: 11, color: "var(--text-primary)", letterSpacing: 2, fontWeight: 700 }}>
                    📋 SESSION HISTORY
                </div>
                <button
                    onClick={onClose}
                    style={{
                        background: "transparent", border: "none",
                        color: "var(--text-muted)", cursor: "pointer", fontSize: 16,
                        padding: "4px 8px",
                    }}
                >
                    ✕
                </button>
            </div>

            {/* Session count */}
            <div style={{ padding: "8px 18px", borderBottom: "1px solid var(--border-dim)" }}>
                <span className="mono" style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: 1 }}>
                    {total} SESSION{total !== 1 ? "S" : ""} RECORDED
                </span>
            </div>

            {/* Session list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
                {loading && sessions.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "var(--sp-10)", color: "var(--text-muted)" }}>
                        <div className="mono" style={{ fontSize: 11 }}>Loading sessions...</div>
                    </div>
                ) : sessions.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "var(--sp-10)", color: "var(--text-muted)" }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                        <div className="mono" style={{ fontSize: 11 }}>No sessions yet</div>
                        <div className="mono" style={{ fontSize: 9, marginTop: 4, color: "var(--text-muted)" }}>
                            Submit a prompt to create your first session
                        </div>
                    </div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {sessions.map((session) => (
                            <SessionItem
                                key={session.id}
                                session={session}
                                onLoad={onLoadSession}
                                onDelete={handleDelete}
                                isActive={session.id === activeSessionId}
                            />
                        ))}

                        {hasMore && (
                            <button
                                onClick={() => loadSessions(page + 1)}
                                disabled={loading}
                                className="mono"
                                style={{
                                    padding: "8px", margin: "8px 0",
                                    background: "var(--bg-raised)",
                                    border: "1px solid var(--border-dim)",
                                    borderRadius: "var(--r-md)",
                                    color: "var(--text-muted)", fontSize: 10,
                                    cursor: "pointer", letterSpacing: 1,
                                }}
                            >
                                {loading ? "LOADING..." : "LOAD MORE"}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Refresh button */}
            <div style={{
                padding: "10px 18px",
                borderTop: "1px solid var(--border-dim)",
                background: "var(--bg-raised)",
            }}>
                <button
                    onClick={() => loadSessions(1)}
                    disabled={loading}
                    className="mono"
                    style={{
                        width: "100%", padding: "8px",
                        background: "var(--bg-overlay)",
                        border: "1px solid var(--border-dim)",
                        borderRadius: "var(--r-md)",
                        color: "var(--text-muted)", fontSize: 9,
                        cursor: "pointer", letterSpacing: 2,
                    }}
                >
                    ↻ REFRESH
                </button>
            </div>
        </div>
    );
}
