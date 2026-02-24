/**
 * App.jsx
 * Root component — wires all pieces together.
 * Tab navigation: Submissions | Verdict | Diff | History
 * Multi-provider: Gemini, Groq, OpenRouter.
 */
import { useState, useEffect } from "react";
import "../styles/globals.css";
import { useCouncilSession, PHASES } from "../hooks/useCouncilSession.js";
import { useAuth } from "../hooks/useAuth.jsx";
import CouncilHeader from "./CouncilHeader.jsx";
import ProviderStatus from "./ProviderStatus.jsx";
import PromptInput from "./PromptInput.jsx";
import OutputCard from "./OutputCard.jsx";
import VerdictScreen from "./VerdictScreen.jsx";
import OutputDiffView from "./OutputDiffView.jsx";
import ChatHistory from "./ChatHistory.jsx";
import ActivityLog from "./ActivityLog.jsx";
import AuthForm from "./AuthForm.jsx";
import AdminDashboard from "./AdminDashboard.jsx";

const TABS = [
  { id: "outputs", label: "SUBMISSIONS", icon: "◧" },
  { id: "verdict", label: "VERDICT", icon: "⬡" },
  { id: "diff", label: "DIFF", icon: "◫" },
];

export default function App() {
  const { state, runSession, reset, loadSession, setAttachments } = useCouncilSession();
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState("outputs");
  const [view, setView] = useState("council"); // 'council' or 'admin'
  const [historyOpen, setHistoryOpen] = useState(false);

  const {
    phase,
    promptWarnings,
    anonymizedOutputs,
    outputs,
    verdictBreakdown,
    combinedOutput,
    activityLog,
    generatingFor,
    totalTokensUsed,
    error,
    sessionId,
    attachments,
  } = state;

  const completedGenerating = new Set(outputs.map((o) => o.providerId));

  // Reset session and view when user changes (logout/login)
  useEffect(() => {
    reset();
    setView("council");
    setActiveTab("outputs");
  }, [user?.id, reset]);

  useEffect(() => {
    if (phase === PHASES.JUDGING) setActiveTab("verdict");
    if (phase === PHASES.COMBINING) setActiveTab("verdict");
    if (phase === PHASES.RESULTS) setActiveTab("verdict");
  }, [phase]);

  const handleLoadSession = (session) => {
    loadSession(session);
    setHistoryOpen(false);
    setActiveTab("verdict");
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg-void)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="mono" style={{ color: "var(--accent)" }}>INITIALIZING ENCRYPTED SESSION...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg-void)", position: "relative" }}>
        <div className="grid-bg" />
        <div style={{ padding: "var(--sp-8)", position: "relative", zIndex: 1 }}>
          <div style={{ textAlign: "center", marginBottom: "var(--sp-8)" }}>
            <div className="display" style={{ fontSize: 42, color: "var(--text-primary)", lineHeight: 1, letterSpacing: 4 }}>
              COUNCIL OF LLMs
            </div>
          </div>
          <AuthForm />
        </div>
      </div>
    );
  }

  const isIdle = phase === PHASES.IDLE;
  const isActive = !isIdle;
  const showOutputsTab = anonymizedOutputs.length > 0;
  const showVerdictTab = (phase === PHASES.RESULTS || phase === PHASES.COMBINING) && verdictBreakdown;
  const showDiffTab = phase === PHASES.RESULTS && anonymizedOutputs.length >= 2;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-void)", display: "flex", flexDirection: "column" }}>
      <div className="grid-bg" />
      <div className="corner-mark tl" />
      <div className="corner-mark tr" />
      <div className="corner-mark bl" />
      <div className="corner-mark br" />

      <CouncilHeader phase={phase} totalTokensUsed={totalTokensUsed} onReset={reset} />

      {/* Admin Toggle + History Button */}
      <div style={{
        padding: '10px var(--sp-8)',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-soft)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 10
      }}>
        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          {user.role === 'admin' && (
            <>
              <button
                onClick={() => setView('council')}
                style={{
                  background: view === 'council' ? 'var(--accent)' : 'transparent',
                  color: view === 'council' ? 'var(--bg-void)' : 'var(--text-muted)',
                  border: '1px solid var(--border-soft)',
                  padding: '4px 12px',
                  borderRadius: 'var(--r-md)',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer'
                }}
              >
                COUNCIL INTERFACE
              </button>
              <button
                onClick={() => setView('admin')}
                style={{
                  background: view === 'admin' ? 'var(--warning)' : 'transparent',
                  color: view === 'admin' ? 'var(--bg-void)' : 'var(--text-muted)',
                  border: '1px solid var(--border-soft)',
                  padding: '4px 12px',
                  borderRadius: 'var(--r-md)',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer'
                }}
              >
                ADMIN DASHBOARD
              </button>
            </>
          )}
        </div>

        {/* History toggle */}
        <button
          onClick={() => setHistoryOpen(!historyOpen)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: historyOpen ? "var(--accent-dim)" : "transparent",
            border: `1px solid ${historyOpen ? "var(--accent-glow)" : "var(--border-soft)"}`,
            padding: "4px 14px",
            borderRadius: "var(--r-md)",
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            color: historyOpen ? "var(--accent)" : "var(--text-muted)",
            cursor: "pointer",
            letterSpacing: 1,
            transition: "all 0.2s",
          }}
        >
          📋 HISTORY
        </button>
      </div>

      {/* Chat History Sidebar */}
      <ChatHistory
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onLoadSession={handleLoadSession}
        activeSessionId={sessionId}
      />

      {view === 'admin' && user.role === 'admin' ? (
        <main style={{ flex: 1, zIndex: 1, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
          <AdminDashboard />
        </main>
      ) : (
        <>
          {isActive && (
            <ProviderStatus
              phase={phase}
              generatingFor={generatingFor}
              completedGenerating={completedGenerating}
            />
          )}

          <main
            style={{
              flex: 1,
              position: "relative",
              zIndex: 1,
              maxWidth: 1100,
              margin: "0 auto",
              width: "100%",
              padding: "var(--sp-8) var(--sp-8)",
            }}
          >
            {error && (
              <div
                style={{
                  padding: "var(--sp-4)",
                  marginBottom: "var(--sp-5)",
                  background: "rgba(240,90,90,0.1)",
                  border: "1px solid rgba(240,90,90,0.3)",
                  borderRadius: "var(--r-md)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--danger)",
                }}
              >
                ✕ {error}
                <button
                  onClick={reset}
                  style={{
                    marginLeft: 12,
                    background: "transparent",
                    border: "none",
                    color: "var(--danger)",
                    cursor: "pointer",
                    textDecoration: "underline",
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                  }}
                >
                  Reset
                </button>
              </div>
            )}

            {isIdle && (
              <>
                <div style={{ marginBottom: "var(--sp-8)" }}>
                  <div style={{ textAlign: "center", marginBottom: "var(--sp-8)" }}>
                    <div className="display" style={{ fontSize: 52, color: "var(--text-primary)", lineHeight: 1, letterSpacing: 4 }}>
                      COUNCIL OF LLMs
                    </div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: 3, marginTop: 8 }}>
                      MULTI-PROVIDER · ANONYMOUS OUTPUTS · JUDGE VERDICT
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: "var(--sp-8)", flexWrap: "wrap" }}>
                    {[
                      "🛡️ Injection Guard",
                      "🔀 Crypto Shuffle",
                      "🚫 Identity Redaction",
                      "📊 Multi-Dimensional Scoring",
                      " Gemini · Groq · OpenRouter ",
                    ].map((badge) => (
                      <span
                        key={badge}
                        className="mono"
                        style={{
                          padding: "4px 10px",
                          background: "var(--bg-raised)",
                          border: "1px solid var(--border-soft)",
                          borderRadius: "var(--r-md)",
                          fontSize: 10,
                          color: "var(--text-secondary)",
                          letterSpacing: 1,
                        }}
                      >
                        {badge}
                      </span>
                    ))}
                  </div>

                  <PromptInput
                    onSubmit={runSession}
                    disabled={isActive}
                    warnings={promptWarnings}
                    attachments={attachments}
                    onAttachmentsChange={setAttachments}
                  />
                </div>
              </>
            )}

            {isActive && <ActivityLog entries={activityLog} />}

            {(showOutputsTab || showVerdictTab || showDiffTab) && (
              <div
                style={{
                  display: "flex",
                  gap: "var(--sp-2)",
                  marginBottom: "var(--sp-5)",
                  borderBottom: "1px solid var(--border-dim)",
                  paddingBottom: 0,
                }}
              >
                {TABS.map((tab) => {
                  if (tab.id === "outputs" && !showOutputsTab) return null;
                  if (tab.id === "verdict" && !showVerdictTab) return null;
                  if (tab.id === "diff" && !showDiffTab) return null;
                  const isActiveTab = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      style={{
                        padding: "10px 18px",
                        background: "transparent",
                        border: "none",
                        borderBottom: `2px solid ${isActiveTab ? "var(--accent)" : "transparent"}`,
                        color: isActiveTab ? "var(--accent)" : "var(--text-muted)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        letterSpacing: 2,
                        cursor: "pointer",
                        transition: "all 0.2s",
                        marginBottom: -1,
                      }}
                      onMouseEnter={(e) => { if (!isActiveTab) e.target.style.color = "var(--text-secondary)"; }}
                      onMouseLeave={(e) => { if (!isActiveTab) e.target.style.color = "var(--text-muted)"; }}
                    >
                      {tab.icon} {tab.label}
                    </button>
                  );
                })}
              </div>
            )}

            {activeTab === "outputs" && showOutputsTab && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))",
                  gap: "var(--sp-4)",
                }}
              >
                {anonymizedOutputs.map((o) => {
                  const isWinner = verdictBreakdown?.winner?.label === o.label;
                  const rejection = verdictBreakdown?.rejections?.find((r) => r.label === o.label);
                  const revealedProviderId = phase === PHASES.RESULTS && verdictBreakdown?.revealMap?.get(o.label);
                  return (
                    <OutputCard
                      key={o.label}
                      label={o.label}
                      content={o.content}
                      isWinner={isWinner}
                      rejectionReason={rejection?.reason}
                      revealedProviderId={revealedProviderId}
                    />
                  );
                })}
              </div>
            )}

            {activeTab === "verdict" && showVerdictTab && (
              <VerdictScreen verdictBreakdown={verdictBreakdown} combinedOutput={combinedOutput} />
            )}

            {activeTab === "diff" && showDiffTab && (
              <OutputDiffView
                anonymizedOutputs={anonymizedOutputs}
                revealMap={verdictBreakdown?.revealMap}
              />
            )}
          </main>
        </>
      )}
    </div>
  );
}
