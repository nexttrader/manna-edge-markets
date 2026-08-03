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

  const [activeTab, setActiveTab] = useState<'roster' | 'strategies' | 'admin_audit' | 'metrics' | 'health' | 'sentinel'>('roster');
  const [data, setData] = useState<any>(null);
  const [strategiesList, setStrategiesList] = useState<any[]>([]);

  const fetchSuperStrategies = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/super-admin/strategies/status`);
      if (res.ok) {
        const json = await res.json();
        if (json.strategies) setStrategiesList(json.strategies);
      }
    } catch {}
  };

  const handleToggleStrategyVisibility = async (strategyId: string, currentVisible: boolean) => {
    try {
      const res = await fetch(`${API_BASE}/api/super-admin/strategies/${strategyId}/visibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibleToAdmins: !currentVisible })
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to update visibility');
      if (resData.strategies) setStrategiesList(resData.strategies);
      alert(`👁️ Strategy "${strategyId}" visibility updated!`);
    } catch (err: any) {
      alert(`⚠️ ${err.message}`);
    }
  };

  const handleDeleteStrategy = async (strategyId: string, name: string) => {
    const confirmed = window.confirm(`⚠️ SUPER ADMIN PERMANENT DELETION:\n\nAre you sure you want to PERMANENTLY DELETE strategy "${name}" (${strategyId})?\n\nRegular admins will lose all access to this strategy.`);
    if (!confirmed) return;
    try {
      const res = await fetch(`${API_BASE}/api/super-admin/strategies/${strategyId}`, { method: 'DELETE' });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to delete strategy');
      if (resData.strategies) setStrategiesList(resData.strategies);
      alert(`🗑️ Strategy "${name}" deleted permanently.`);
    } catch (err: any) {
      alert(`⚠️ ${err.message}`);
    }
  };

  const handleSuperChangePassword = async (userId: string, userEmail: string) => {
    const newPass = window.prompt(`🔑 SUPER ADMIN OVERRIDE:\n\nEnter NEW password for ${userEmail}:`);
    if (!newPass) return;
    if (newPass.length < 4) {
      alert('⚠️ Password must be at least 4 characters long.');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/super-admin/users/${userId}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: newPass })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update password');
      alert(`✅ Password for "${userEmail}" updated successfully by Super Admin!`);
    } catch (err: any) {
      alert(`⚠️ ${err.message}`);
    }
  };

  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [newAccName, setNewAccName] = useState('');
  const [newAccEmail, setNewAccEmail] = useState('');
  const [newAccRole, setNewAccRole] = useState<'trader' | 'admin'>('trader');
  const [newAccTier, setNewAccTier] = useState<'free' | 'forex_only' | 'futures_forex'>('futures_forex');

  const handleSuperCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccName || !newAccEmail) {
      alert('Please provide display name and email');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/super-admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newAccName,
          email: newAccEmail,
          role: newAccRole,
          tier: newAccTier
        })
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to create account');

      setShowAddAccountModal(false);
      setNewAccName('');
      setNewAccEmail('');
      setNewAccRole('trader');
      setNewAccTier('futures_forex');
      alert(`✅ ${newAccRole.toUpperCase()} account for "${newAccName}" created successfully!`);
      fetchSuperAdminData();
    } catch (err: any) {
      alert(`⚠️ ${err.message}`);
    }
  };

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

  const [sentinelAnalytics, setSentinelAnalytics] = useState<any>(null);
  const [sentinelScanning, setSentinelScanning] = useState(false);

  const fetchSentinelAnalytics = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/super-admin/sentinel/analytics`);
      if (res.ok) { const json = await res.json(); if (json.analytics) setSentinelAnalytics(json.analytics); }
    } catch {}
  };

  const handleSentinelScan = async () => {
    try {
      setSentinelScanning(true);
      const res = await fetch(`${API_BASE}/api/super-admin/sentinel/scan`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scan failed');
      alert(`✅ Sentinel scan completed! ${data.result?.stats?.created || 0} signals created.`);
      fetchSentinelAnalytics();
    } catch (err: any) {
      alert(`⚠️ ${err.message}`);
    } finally {
      setSentinelScanning(false);
    }
  };

  useEffect(() => {
    fetchSuperAdminData();
    fetchSuperStrategies();
    fetchSentinelAnalytics();
    const interval = setInterval(() => {
      fetchSuperAdminData();
      fetchSentinelAnalytics();
    }, 5000);
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
              border: activeTab === 'strategies' ? '1px solid #00e5ff' : '1px solid rgba(255,255,255,0.1)',
              background: activeTab === 'strategies' ? 'rgba(0, 229, 255, 0.2)' : 'transparent',
              color: activeTab === 'strategies' ? '#00e5ff' : '#ccc'
            }}
            onClick={() => setActiveTab('strategies')}
          >
            ⚙️ Strategy Governance ({strategiesList.length})
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

          <button
            type="button"
            className="super-tab-btn"
            style={{
              border: activeTab === 'sentinel' ? '1px solid #ce93d8' : '1px solid rgba(255,255,255,0.1)',
              background: activeTab === 'sentinel' ? 'rgba(156, 39, 176, 0.2)' : 'transparent',
              color: activeTab === 'sentinel' ? '#ce93d8' : '#ccc'
            }}
            onClick={() => setActiveTab('sentinel')}
          >
            🎯 Sentinel V2 Intelligence
          </button>
        </div>

        {/* TAB 1: User & Admin Live Roster */}
        {activeTab === 'roster' && (
          <div className="super-card font-mono">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ margin: 0, color: '#b388ff' }}>👥 All Users &amp; Admins Real-Time Telemetry</h2>
                <span style={{ fontSize: '0.8rem', color: '#aaa' }}>Updates live every 5s • Super Admin Master Privilege</span>
              </div>

              <button
                type="button"
                className="font-mono"
                style={{
                  background: 'rgba(179, 136, 255, 0.15)',
                  border: '1px solid #b388ff',
                  color: '#b388ff',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
                onClick={() => setShowAddAccountModal(!showAddAccountModal)}
              >
                {showAddAccountModal ? '✖️ Close Form' : '➕ Create Account (User or Admin)'}
              </button>
            </div>

          {showAddAccountModal && (
            <form onSubmit={handleSuperCreateAccount} style={{ background: 'rgba(179, 136, 255, 0.05)', border: '1px solid rgba(179, 136, 255, 0.3)', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: '#b388ff' }}>➕ Super Admin: Create User or Admin Account</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '4px' }}>Display Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Master Trader or Admin User"
                    value={newAccName}
                    onChange={e => setNewAccName(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 12px', background: '#090314', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: '4px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '4px' }}>Email Address *</label>
                  <input
                    type="email"
                    placeholder="user@mannaedge.com"
                    value={newAccEmail}
                    onChange={e => setNewAccEmail(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 12px', background: '#090314', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: '4px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '4px' }}>Account Privileges / Role *</label>
                  <select
                    value={newAccRole}
                    onChange={e => setNewAccRole(e.target.value as any)}
                    style={{ width: '100%', padding: '8px 12px', background: '#090314', border: '1px solid #ffab00', color: '#ffab00', borderRadius: '4px', fontWeight: 800 }}
                  >
                    <option value="trader">👨‍💻 Standard Trader</option>
                    <option value="admin">⚙️ System Administrator</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '4px' }}>Subscription Access Tier</label>
                  <select
                    value={newAccTier}
                    onChange={e => setNewAccTier(e.target.value as any)}
                    style={{ width: '100%', padding: '8px 12px', background: '#090314', border: '1px solid #b388ff', color: '#b388ff', borderRadius: '4px', fontWeight: 700 }}
                  >
                    <option value="free">Free Tier (2 Futures + 2 Forex)</option>
                    <option value="forex_only">Forex Only Tier (All Forex)</option>
                    <option value="futures_forex">Futures &amp; Forex Tier (All Futures + Forex)</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="font-mono"
                style={{ background: '#b388ff', color: '#090314', border: 'none', padding: '8px 20px', borderRadius: '4px', fontWeight: 900, cursor: 'pointer' }}
              >
                Create Account
              </button>
            </form>
          )}

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
                        <div style={{ display: 'flex', gap: '6px' }}>
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

                          <button
                            type="button"
                            className="font-mono"
                            style={{
                              background: 'rgba(0, 229, 255, 0.15)',
                              border: '1px solid #00e5ff',
                              color: '#00e5ff',
                              padding: '4px 10px',
                              borderRadius: '4px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              fontSize: '0.8rem'
                            }}
                            onClick={() => handleSuperChangePassword(u.id || u.email, u.email)}
                          >
                            🔑 Password
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: Strategy Governance & Visibility (Super Admin Only) */}
        {activeTab === 'strategies' && (
          <div className="super-card font-mono">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ margin: 0, color: '#00e5ff' }}>⚙️ Strategy Access, Visibility &amp; Deletion Governance</h2>
                <span style={{ fontSize: '0.8rem', color: '#aaa' }}>
                  Super Admin Exclusive: Controls which strategies regular Admins can see/toggle, and permanently delete strategies.
                </span>
              </div>
            </div>

            <div className="table-responsive">
              <table className="runs-table">
                <thead>
                  <tr>
                    <th>Strategy ID &amp; Name</th>
                    <th>Execution Status</th>
                    <th>Admin Visibility Status</th>
                    <th>Governance Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {strategiesList.map((strat: any) => (
                    <tr key={strat.id}>
                      <td>
                        <strong>{strat.name}</strong> <span style={{ color: '#aaa', fontSize: '0.8rem' }}>({strat.id})</span>
                      </td>
                      <td>
                        <span className="market-tag font-mono" style={{ background: strat.enabled ? 'rgba(0, 230, 118, 0.2)' : 'rgba(255, 23, 68, 0.2)', color: strat.enabled ? '#00e676' : '#ff1744' }}>
                          {strat.enabled ? '🟢 ENABLED' : '🔴 DISABLED'}
                        </span>
                      </td>
                      <td>
                        <span className="market-tag font-mono" style={{ background: strat.visibleToAdmins ? 'rgba(0, 229, 255, 0.2)' : 'rgba(255, 171, 0, 0.2)', color: strat.visibleToAdmins ? '#00e5ff' : '#ffab00' }}>
                          {strat.visibleToAdmins ? '👁️ VISIBLE TO ADMINS' : '🙈 HIDDEN FROM ADMINS'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            className="font-mono"
                            style={{
                              background: strat.visibleToAdmins ? 'rgba(255, 171, 0, 0.15)' : 'rgba(0, 229, 255, 0.15)',
                              border: `1px solid ${strat.visibleToAdmins ? '#ffab00' : '#00e5ff'}`,
                              color: strat.visibleToAdmins ? '#ffab00' : '#00e5ff',
                              padding: '5px 12px',
                              borderRadius: '4px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              fontSize: '0.8rem'
                            }}
                            onClick={() => handleToggleStrategyVisibility(strat.id, strat.visibleToAdmins)}
                          >
                            {strat.visibleToAdmins ? '🙈 Hide from Admins' : '👁️ Make Visible to Admins'}
                          </button>

                          <button
                            type="button"
                            className="font-mono"
                            style={{
                              background: 'rgba(255, 23, 68, 0.2)',
                              border: '1px solid #ff1744',
                              color: '#ff1744',
                              padding: '5px 12px',
                              borderRadius: '4px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              fontSize: '0.8rem'
                            }}
                            onClick={() => handleDeleteStrategy(strat.id, strat.name)}
                          >
                            🗑️ Delete Strategy Permanently
                          </button>
                        </div>
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

        {/* TAB 4: Sentinel V2 Intelligence */}
        {activeTab === 'sentinel' && (
          <div className="super-card font-mono">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ margin: 0, color: '#ce93d8' }}>🎯 Sentinel V2 — Elite Fractal Swing Points Intelligence</h2>
                <span style={{ fontSize: '0.8rem', color: '#aaa' }}>Super Admin Exclusive: Multi-timeframe state machine analytics • Strategy ID: sentinel_v2</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="font-mono" style={{ background: 'rgba(0, 229, 255, 0.15)', border: '1px solid #00e5ff', color: '#00e5ff', padding: '8px 16px', borderRadius: '6px', fontWeight: 800, cursor: 'pointer' }} onClick={handleSentinelScan} disabled={sentinelScanning}>
                  {sentinelScanning ? '⏳ Scanning...' : '🔍 Trigger Manual Scan'}
                </button>
              </div>
            </div>
            
            <div className="stat-grid-4 font-mono" style={{ marginBottom: '20px' }}>
              <div className="stat-box" style={{ borderColor: '#ce93d8', background: 'rgba(156, 39, 176, 0.05)' }}>
                <div className="stat-box-title">Total Signals</div>
                <div className="stat-box-value" style={{ color: '#ce93d8' }}>{sentinelAnalytics?.totalSignals || 0}</div>
              </div>
              <div className="stat-box" style={{ borderColor: '#ce93d8', background: 'rgba(156, 39, 176, 0.05)' }}>
                <div className="stat-box-title">Win Rate</div>
                <div className="stat-box-value" style={{ color: '#ce93d8' }}>{sentinelAnalytics?.winRate || '0.0%'}</div>
              </div>
              <div className="stat-box" style={{ borderColor: '#ce93d8', background: 'rgba(156, 39, 176, 0.05)' }}>
                <div className="stat-box-title">Active Signals</div>
                <div className="stat-box-value" style={{ color: '#ce93d8' }}>{sentinelAnalytics?.activeSignals || 0}</div>
              </div>
              <div className="stat-box" style={{ borderColor: '#ce93d8', background: 'rgba(156, 39, 176, 0.05)' }}>
                <div className="stat-box-title">Total Realized R</div>
                <div className="stat-box-value" style={{ color: '#ce93d8' }}>{sentinelAnalytics?.totalRealizedR || '0.00R'}</div>
              </div>
            </div>
            
            <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(156, 39, 176, 0.05)', border: '1px solid rgba(156, 39, 176, 0.2)', borderRadius: '8px' }}>
              <h3 style={{ color: '#ce93d8', margin: '0 0 12px' }}>🔐 Visibility & Release Controls</h3>
              <p style={{ fontSize: '0.8rem', color: '#aaa', margin: '0 0 12px' }}>Control who can see Sentinel V2 signals and analytics.</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="font-mono" style={{ background: 'rgba(255, 171, 0, 0.15)', border: '1px solid #ffab00', color: '#ffab00', padding: '5px 12px', borderRadius: '4px', fontWeight: 800, cursor: 'pointer', fontSize: '0.8rem' }} onClick={() => handleToggleStrategyVisibility('sentinel_v2', true)}>
                  👁️ Toggle Admin Visibility
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
