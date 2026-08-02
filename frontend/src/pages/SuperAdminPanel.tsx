import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './SuperAdminPanel.css';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';
import { formatETTime } from '../utils/time';

export const SuperAdminPanel: React.FC = () => {
  const { logout, impersonateUser, login } = useAuth();
  const navigate = useNavigate();

  const handleReturnToAdmin = () => {
    login('admin@mannaedge.com', 'admin', 'System Administrator', 'futures_forex');
    navigate('/admin');
  };

  const [activeTab, setActiveTab] = useState<'roster' | 'admin_audit' | 'metrics' | 'health'>('roster');
  const [data, setData] = useState<any>(null);

  const fetchSuperAdminData = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/super-admin/dashboard`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    fetchSuperAdminData();
    const interval = setInterval(fetchSuperAdminData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSuperImpersonate = (u: any) => {
    impersonateUser({
      id: u.id || `usr_${Date.now()}`,
      name: u.name || u.email.split('@')[0],
      email: u.email,
      role: u.role || 'trader',
      tier: u.tier || 'futures_forex'
    });
    navigate('/dashboard');
  };

  const roster = data?.roster || [];
  const adminLogs = data?.adminLogs || [];
  const metrics = data?.metrics || {};

  return (
    <div className="super-admin-panel">
      {/* Secret Super Admin Header */}
      <header className="super-admin-header font-mono">
        <div className="super-header-container">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Link to="/" className="back-btn" style={{ color: '#b388ff' }}>← Back to Public Home</Link>
            <h1 className="super-title">
              👁️ MANNA EDGE — MASTER SUPER ADMIN TELEMETRY DESK
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="super-badge">
              🛡️ MASTER PRIVILEGE ACTIVE
            </span>
            <button
              type="button"
              className="font-mono"
              style={{
                background: 'rgba(255, 171, 0, 0.2)',
                border: '1px solid #ffab00',
                color: '#ffab00',
                padding: '6px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: '0.82rem'
              }}
              onClick={handleReturnToAdmin}
            >
              ⚙️ Switch to Admin Mode
            </button>
            <button 
              className="btn-logout font-mono" 
              style={{ background: 'rgba(255, 23, 68, 0.2)', border: '1px solid #ff1744', color: '#ff1744', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}
              onClick={() => { logout(); navigate('/login'); }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="container" style={{ maxWidth: '1400px', margin: '24px auto', padding: '0 20px' }}>
        {/* High-Level Executive Summary Cards */}
        <div className="stat-grid-4 font-mono">
          <div className="stat-box" style={{ borderColor: '#b388ff', background: 'rgba(179, 136, 255, 0.05)' }}>
            <div className="stat-box-title">👥 Active Users Tracked</div>
            <div className="stat-box-value" style={{ color: '#b388ff' }}>{metrics.totalTrackedUsers || 0}</div>
          </div>

          <div className="stat-box" style={{ borderColor: '#00e676', background: 'rgba(0, 230, 118, 0.05)' }}>
            <div className="stat-box-title">🟢 Currently Online</div>
            <div className="stat-box-value" style={{ color: '#00e676' }}>{metrics.onlineCount || 0}</div>
          </div>

          <div className="stat-box" style={{ borderColor: '#ffab00', background: 'rgba(255, 171, 0, 0.05)' }}>
            <div className="stat-box-title">⚙️ Tracked Admins</div>
            <div className="stat-box-value" style={{ color: '#ffab00' }}>{metrics.adminCount || 0}</div>
          </div>

          <div className="stat-box" style={{ borderColor: '#00e5ff', background: 'rgba(0, 229, 255, 0.05)' }}>
            <div className="stat-box-title">📊 Total Events Recorded</div>
            <div className="stat-box-value" style={{ color: '#00e5ff' }}>{metrics.totalEventsLogged || 0}</div>
          </div>
        </div>

        {/* Super Admin Navigation Tabs */}
        <div className="super-nav-tabs font-mono">
          <button
            type="button"
            className="super-tab-btn"
            style={{
              border: activeTab === 'roster' ? '1px solid #b388ff' : '1px solid rgba(255,255,255,0.1)',
              background: activeTab === 'roster' ? 'rgba(179, 136, 255, 0.2)' : 'transparent',
              color: activeTab === 'roster' ? '#b388ff' : '#ccc'
            }}
            onClick={() => setActiveTab('roster')}
          >
            👥 User &amp; Admin Live Roster ({roster.length})
          </button>

          <button
            type="button"
            className="super-tab-btn"
            style={{
              border: activeTab === 'admin_audit' ? '1px solid #ffab00' : '1px solid rgba(255,255,255,0.1)',
              background: activeTab === 'admin_audit' ? 'rgba(255, 171, 0, 0.2)' : 'transparent',
              color: activeTab === 'admin_audit' ? '#ffab00' : '#ccc'
            }}
            onClick={() => setActiveTab('admin_audit')}
          >
            🛡️ Admin Command Audit Log ({adminLogs.length})
          </button>

          <button
            type="button"
            className="super-tab-btn"
            style={{
              border: activeTab === 'health' ? '1px solid #00e676' : '1px solid rgba(255,255,255,0.1)',
              background: activeTab === 'health' ? 'rgba(0, 230, 118, 0.2)' : 'transparent',
              color: activeTab === 'health' ? '#00e676' : '#ccc'
            }}
            onClick={() => setActiveTab('health')}
          >
            ⚡ System Telemetry &amp; Circuit Breaker
          </button>
        </div>

        {/* TAB 1: User & Admin Live Roster */}
        {activeTab === 'roster' && (
          <div className="super-card font-mono">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, color: '#b388ff' }}>👥 All Users &amp; Admins Real-Time Telemetry</h2>
              <span style={{ fontSize: '0.8rem', color: '#aaa' }}>Updates live every 5s</span>
            </div>

            <div className="table-responsive">
              <table className="runs-table">
                <thead>
                  <tr>
                    <th>Account &amp; Role</th>
                    <th>Status</th>
                    <th>Current Active Page</th>
                    <th>Total Session Time</th>
                    <th>Time Spent Per Page</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((u: any) => (
                    <tr key={u.email}>
                      <td>
                        <strong>{u.email}</strong>{' '}
                        <span className="market-tag font-mono" style={{ background: u.role === 'admin' ? 'rgba(255, 171, 0, 0.2)' : 'rgba(0, 229, 255, 0.2)', color: u.role === 'admin' ? '#ffab00' : '#00e5ff' }}>
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ color: u.isOnline ? '#00e676' : '#888' }}>
                        {u.lastActiveAgo}
                      </td>
                      <td className="font-mono text-gold">
                        {u.currentPath}
                      </td>
                      <td className="font-mono">
                        {u.totalDurationFormatted}
                      </td>
                      <td className="font-mono" style={{ fontSize: '0.8rem' }}>
                        {Object.entries(u.timePerPageFormatted || {}).map(([p, t]: any) => (
                          <div key={p}>
                            <span style={{ color: '#b388ff' }}>{p}:</span> {t}
                          </div>
                        ))}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="font-mono"
                          style={{
                            background: 'rgba(179, 136, 255, 0.2)',
                            border: '1px solid #b388ff',
                            color: '#b388ff',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            fontSize: '0.8rem'
                          }}
                          onClick={() => handleSuperImpersonate(u)}
                        >
                          🥸 Super-Impersonate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: Admin Command Audit Log */}
        {activeTab === 'admin_audit' && (
          <div className="super-card font-mono">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, color: '#ffab00' }}>🛡️ Admin Command Audit Trail</h2>
              <span style={{ fontSize: '0.8rem', color: '#aaa' }}>Tracks every rescan, replacement, and manual trigger by Admins</span>
            </div>

            <div className="table-responsive">
              <table className="runs-table">
                <thead>
                  <tr>
                    <th>Timestamp (ET)</th>
                    <th>Admin Email</th>
                    <th>Executed Command / Action</th>
                    <th>Target Instrument</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {adminLogs.map((log: any, i: number) => (
                    <tr key={i}>
                      <td>{formatETTime(log.timestamp)}</td>
                      <td className="text-gold"><strong>{log.userEmail}</strong></td>
                      <td>
                        <span className="badge badge-manual">
                          {log.actionDetails?.action?.toUpperCase() || log.eventType.toUpperCase()}
                        </span>
                      </td>
                      <td className="font-mono">{log.actionDetails?.instrument || '--'}</td>
                      <td className="font-mono" style={{ fontSize: '0.8rem', color: '#ccc' }}>
                        {JSON.stringify(log.actionDetails?.extra || log.actionDetails || {})}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: System Health & Telemetry */}
        {activeTab === 'health' && (
          <div className="super-card font-mono">
            <h2 style={{ color: '#00e676', marginBottom: '16px' }}>⚡ System Telemetry &amp; Health Matrix</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              <div className="stat-box">
                <div className="stat-box-title">Circuit Breaker Status</div>
                <div className="stat-box-value" style={{ color: metrics.circuitBreakerStatus === 'ok' ? '#00e676' : '#ff1744' }}>
                  {metrics.circuitBreakerStatus?.toUpperCase() || 'OK'}
                </div>
              </div>

              <div className="stat-box">
                <div className="stat-box-title">Market Session Status</div>
                <div className="stat-box-value" style={{ color: metrics.isMarketOpen ? '#00e676' : '#ffab00' }}>
                  {metrics.isMarketOpen ? '🟢 OPEN (TRADING)' : '🔴 CLOSED (PAUSED)'}
                </div>
              </div>

              <div className="stat-box">
                <div className="stat-box-title">Strategy Failure Count</div>
                <div className="stat-box-value" style={{ color: metrics.circuitBreakerFailures === 0 ? '#00e676' : '#ffab00' }}>
                  {metrics.circuitBreakerFailures || 0} / 5
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
