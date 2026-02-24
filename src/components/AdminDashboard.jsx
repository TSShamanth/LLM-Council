import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const { token } = useAuth();

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/admin/stats', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (err) {
        console.error('Failed to fetch admin stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [token]);

  if (loading) return <div className="mono" style={{ padding: '2rem', color: 'var(--accent)' }}>LOADING AUDIT LOGS...</div>;
  if (!stats) return <div className="mono" style={{ padding: '2rem', color: 'var(--danger)' }}>ERROR LOADING STATISTICS</div>;

  return (
    <div style={{ color: 'white', padding: '2rem' }}>
      <header style={{ marginBottom: '3rem', borderBottom: '1px solid var(--border-soft)', paddingBottom: '1rem' }}>
        <h1 className="display" style={{ fontSize: '2rem', letterSpacing: '4px' }}>ADMIN CONTROL PANEL</h1>
        <p className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>GLOBAL LLM PERFORMANCE ANALYTICS</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
        
        {/* Row 1: Acceptance & Purpose */}
        <section style={{ background: 'var(--bg-surface)', padding: '1.5rem', borderRadius: 'var(--r-md)', border: '1px solid var(--border-soft)' }}>
          <h2 className="mono" style={{ fontSize: '1rem', color: 'var(--accent)', marginBottom: '1.5rem' }}>ACCEPTANCE RATES</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {stats.acceptanceRates.map(item => (
              <div key={item.winner_id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                  <span className="mono">{item.winner_id.toUpperCase()}</span>
                  <span className="mono">{item.rate.toFixed(1)}% ({item.wins} wins)</span>
                </div>
                <div style={{ height: '8px', background: 'var(--bg-void)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${item.rate}%`, height: '100%', background: 'var(--accent)', boxShadow: '0 0 10px var(--accent-glow)' }} />
                </div>
              </div>
            ))}
            {stats.acceptanceRates.length === 0 && <p className="mono" style={{ color: 'var(--text-muted)' }}>No data yet.</p>}
          </div>
        </section>

        <section style={{ background: 'var(--bg-surface)', padding: '1.5rem', borderRadius: 'var(--r-md)', border: '1px solid var(--border-soft)' }}>
          <h2 className="mono" style={{ fontSize: '1rem', color: 'var(--warning)', marginBottom: '1.5rem' }}>PERFORMANCE BY PURPOSE</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {['code', 'content', 'logical'].map(purpose => {
              const items = stats.performanceByPurpose.filter(p => p.prompt_purpose === purpose);
              return (
                <div key={purpose} style={{ marginBottom: '0.5rem' }}>
                  <h3 className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{purpose.toUpperCase()}</h3>
                  {items.length > 0 ? (
                    <div className="mono" style={{ fontSize: '0.8rem' }}>
                      Best: {items.sort((a,b) => b.count - a.count)[0].winner_id} ({items[0].count} wins)
                    </div>
                  ) : (
                    <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>No data</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Row 2: Provider Metrics (Latency/Tokens) */}
        <section style={{ background: 'var(--bg-surface)', padding: '1.5rem', borderRadius: 'var(--r-md)', border: '1px solid var(--border-soft)', gridColumn: 'span 2' }}>
          <h2 className="mono" style={{ fontSize: '1rem', color: 'var(--success)', marginBottom: '1.5rem' }}>PROVIDER PERFORMANCE</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-dim)' }}>
                <th style={{ textAlign: 'left', padding: '10px' }}>PROVIDER</th>
                <th style={{ textAlign: 'center', padding: '10px' }}>LATENCY</th>
                <th style={{ textAlign: 'center', padding: '10px' }}>AVG TOKENS</th>
                <th style={{ textAlign: 'center', padding: '10px' }}>FAILURES</th>
                <th style={{ textAlign: 'center', padding: '10px' }}>TOTAL CALLS</th>
              </tr>
            </thead>
            <tbody>
              {stats.providerMetrics.map(m => (
                <tr key={m.provider_id} style={{ borderBottom: '1px solid var(--border-void)', fontSize: '0.9rem' }}>
                  <td className="mono" style={{ padding: '10px' }}>{m.provider_id}</td>
                  <td className="mono" style={{ textAlign: 'center', padding: '10px' }}>{Math.round(m.avgLatency)}ms</td>
                  <td className="mono" style={{ textAlign: 'center', padding: '10px' }}>{Math.round(m.avgTokens)}</td>
                  <td className="mono" style={{ textAlign: 'center', padding: '10px', color: m.failureCount > 0 ? 'var(--danger)' : 'inherit' }}>{m.failureCount}</td>
                  <td className="mono" style={{ textAlign: 'center', padding: '10px' }}>{m.totalCalls}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Row 3: Top Users & Failures */}
        <section style={{ background: 'var(--bg-surface)', padding: '1.5rem', borderRadius: 'var(--r-md)', border: '1px solid var(--border-soft)' }}>
          <h2 className="mono" style={{ fontSize: '1rem', color: 'var(--accent)', marginBottom: '1.5rem' }}>TOP ACTIVE USERS</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {stats.topUsers.map(u => (
              <div key={u.email} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="mono" style={{ fontSize: '0.8rem' }}>{u.email}</span>
                <span className="mono" style={{ color: 'var(--accent)' }}>{u.sessions} SESSIONS</span>
              </div>
            ))}
          </div>
        </section>

        <section style={{ background: 'var(--bg-surface)', padding: '1.5rem', borderRadius: 'var(--r-md)', border: '1px solid var(--border-soft)' }}>
          <h2 className="mono" style={{ fontSize: '1rem', color: 'var(--danger)', marginBottom: '1.5rem' }}>RECENT FAILURE AUDIT</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
            {stats.recentFailures.map((f, i) => (
              <div key={i} style={{ borderBottom: '1px solid var(--border-void)', paddingBottom: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                  <span className="mono" style={{ color: 'var(--danger)' }}>{f.provider_id.toUpperCase()}</span>
                  <span className="mono" style={{ color: 'var(--text-dim)' }}>{new Date(f.created_at).toLocaleTimeString()}</span>
                </div>
                <div className="mono" style={{ fontSize: '0.75rem', marginTop: '0.2rem', color: 'var(--text-muted)' }}>{f.error_message}</div>
              </div>
            ))}
            {stats.recentFailures.length === 0 && <p className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No recent failures detected.</p>}
          </div>
        </section>

      </div>
    </div>
  );
};

export default AdminDashboard;
