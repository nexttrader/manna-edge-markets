import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './SuperAdminPanel.css';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';

export const SuperAdminPanel: React.FC = () => {
  const { logout, impersonateUser, login } = useAuth();
  const navigate = useNavigate();

  const handleReturnToAdmin = () => {
    login('admin@mannaedge.com', 'admin', 'System Administrator', 'futures_forex');
    navigate('/admin');
  };

  const [activeTab, setActiveTab] = useState<'roster' | 'marketing' | 'heatmap' | 'governance' | 'strategies' | 'admin_audit' | 'health' | 'sentinel'>('sentinel');
  const [data, setData] = useState<any>(null);
  const [strategiesList, setStrategiesList] = useState<any[]>([]);

  // Sentinel Specific State
  const [sentinelAnalytics, setSentinelAnalytics] = useState<any>(null);
  const [sentinelSetups, setSentinelSetups] = useState<any[]>([]);
  const [sentinelRollout, setSentinelRollout] = useState<{ visibleToAdmins: boolean; visibleToTraders: boolean }>({ visibleToAdmins: false, visibleToTraders: false });
  const [sentinelScanning, setSentinelScanning] = useState(false);

  // User Activity Audit Modal State
  const [activityModalEmail, setActivityModalEmail] = useState<string | null>(null);
  const [userActivityData, setUserActivityData] = useState<any>(null);
  const [loadingUserActivity, setLoadingUserActivity] = useState(false);

  // Edit User Governance Modal State
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<'trader' | 'admin' | 'super_admin'>('trader');
  const [editTier, setEditTier] = useState<'free' | 'forex_only' | 'futures_forex'>('futures_forex');
  const [editStatus, setEditStatus] = useState<'active' | 'suspended'>('active');

  // Sentinel Engine Tuning State
  const [superAdminMaxSignals, setSuperAdminMaxSignals] = useState(6);
  const [superAdminMinConviction, setSuperAdminMinConviction] = useState(75.0);
  const [publicMaxSignals, setPublicMaxSignals] = useState(3);
  const [publicMinConviction, setPublicMinConviction] = useState(85.0);
  const [savingTuning, setSavingTuning] = useState(false);

  const fetchTuningData = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/super-admin/sentinel/tuning`);
      if (res.ok) {
        const json = await res.json();
        if (json.tuning) {
          setSuperAdminMaxSignals(json.tuning.superAdminMaxSignals);
          setSuperAdminMinConviction(json.tuning.superAdminMinConviction);
          setPublicMaxSignals(json.tuning.publicMaxSignals);
          setPublicMinConviction(json.tuning.publicMinConviction);
        }
      }
    } catch {}
  };

  const handleSaveTuning = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTuning(true);
    try {
      const res = await fetch(`${API_BASE}/api/super-admin/sentinel/tuning`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          superAdminMaxSignals,
          superAdminMinConviction,
          publicMaxSignals,
          publicMinConviction
        })
      });
      if (res.ok) {
        alert('✅ Engine tuning parameters saved successfully!');
      } else {
        alert('⚠️ Failed to save tuning parameters.');
      }
    } catch (err: any) {
      alert(`⚠️ ${err.message}`);
    } finally {
      setSavingTuning(false);
    }
  };

  const fetchSuperStrategies = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/super-admin/strategies/status`);
      if (res.ok) {
        const json = await res.json();
        if (json.strategies) setStrategiesList(json.strategies);
      }
    } catch {}
  };

  const fetchSuperAdminData = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/super-admin/dashboard`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {}
  };

  const fetchSentinelData = async () => {
    try {
      const [analyticsRes, setupsRes] = await Promise.all([
        fetch(`${API_BASE}/api/super-admin/sentinel/analytics`),
        fetch(`${API_BASE}/api/super-admin/sentinel/setups`)
      ]);
      if (analyticsRes.ok) {
        const json = await analyticsRes.json();
        if (json.analytics) setSentinelAnalytics(json.analytics);
      }
      if (setupsRes.ok) {
        const json = await setupsRes.json();
        if (json.setups) setSentinelSetups(json.setups);
        if (json.rollout) setSentinelRollout(json.rollout);
      }
    } catch {}
  };

  const handleToggleRollout = async (target: 'admins' | 'traders', currentValue: boolean) => {
    try {
      const body = target === 'admins' ? { visibleToAdmins: !currentValue } : { visibleToTraders: !currentValue };
      const res = await fetch(`${API_BASE}/api/super-admin/sentinel/rollout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update rollout');
      if (data.rollout) setSentinelRollout(data.rollout);
      alert(`✅ Sentinel V2 rollout updated for ${target.toUpperCase()}!`);
    } catch (err: any) {
      alert(`⚠️ ${err.message}`);
    }
  };

  const fetchUserActivity = async (email: string) => {
    try {
      setLoadingUserActivity(true);
      setActivityModalEmail(email);
      const res = await fetch(`${API_BASE}/api/super-admin/users/${encodeURIComponent(email)}/activity`);
      if (res.ok) {
        const json = await res.json();
        setUserActivityData(json);
      }
    } catch (err: any) {
      alert(`⚠️ Failed to load user activity: ${err.message}`);
    } finally {
      setLoadingUserActivity(false);
    }
  };

  const handleOpenEditModal = (u: any) => {
    setEditingUser(u);
    setEditName(u.name || '');
    setEditRole(u.role || 'trader');
    setEditTier(u.tier || 'futures_forex');
    setEditStatus(u.status || 'active');
  };

  const handleSaveUserGovernance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      const res = await fetch(`${API_BASE}/api/super-admin/users/${editingUser.id || editingUser.email}/full`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          role: editRole,
          tier: editTier,
          status: editStatus
        })
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to update user');
      
      setEditingUser(null);
      alert(`✅ Account for "${editingUser.email}" updated successfully!`);
      fetchSuperAdminData();
    } catch (err: any) {
      alert(`⚠️ ${err.message}`);
    }
  };

  const handleToggleStrategyVisibility = async (strategyId: string, target: 'admins' | 'traders', currentVisible: boolean) => {
    try {
      const body = target === 'admins' ? { visibleToAdmins: !currentVisible } : { visibleToTraders: !currentVisible };
      const res = await fetch(`${API_BASE}/api/super-admin/strategies/${strategyId}/visibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to update visibility');
      if (resData.strategies) setStrategiesList(resData.strategies);
      alert(`👁️ Strategy "${strategyId}" visibility for ${target.toUpperCase()} updated successfully!`);
    } catch (err: any) {
      alert(`⚠️ ${err.message}`);
    }
  };

  const handleDeleteStrategy = async (strategyId: string, name: string) => {
    const confirmed = window.confirm(`⚠️ SUPER ADMIN PERMANENT DELETION:\n\nAre you sure you want to PERMANENTLY DELETE strategy "${name}" (${strategyId})?`);
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

  const handleSentinelScan = async () => {
    try {
      setSentinelScanning(true);
      const res = await fetch(`${API_BASE}/api/super-admin/sentinel/scan`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scan failed');
      alert(`✅ Sentinel scan completed! ${data.result?.stats?.created || 0} signals created.`);
      fetchSentinelData();
    } catch (err: any) {
      alert(`⚠️ ${err.message}`);
    } finally {
      setSentinelScanning(false);
    }
  };

  useEffect(() => {
    fetchSuperAdminData();
    fetchSuperStrategies();
    fetchSentinelData();
    fetchTuningData();
    const interval = setInterval(() => {
      fetchSuperAdminData();
      fetchSentinelData();
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
  const marketing = data?.marketing || {};
  const heatmap = data?.heatmap || {};

  return (
    <div className="super-admin-panel">
      {/* Secret Super Admin Header */}
      <header className="super-admin-header font-mono">
        <div className="super-header-container">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Link to="/" className="back-btn" style={{ color: '#b388ff' }}>← Back to Public Home</Link>
            <h1 className="super-title">
              👁️ MANNA EDGE — SENTINEL V2 &amp; MASTER SUPER ADMIN DESK
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
          <div className="stat-box" style={{ borderColor: '#ce93d8', background: 'rgba(156, 39, 176, 0.05)' }}>
            <div className="stat-box-title">🎯 Sentinel V2 Signals</div>
            <div className="stat-box-value" style={{ color: '#ce93d8' }}>{sentinelSetups.length}</div>
          </div>

          <div className="stat-box" style={{ borderColor: '#00e676', background: 'rgba(0, 230, 118, 0.05)' }}>
            <div className="stat-box-title">🏆 Sentinel Win Rate</div>
            <div className="stat-box-value" style={{ color: '#00e676' }}>{sentinelAnalytics?.winRate || 0}%</div>
          </div>

          <div className="stat-box" style={{ borderColor: '#00e5ff', background: 'rgba(0, 229, 255, 0.05)' }}>
            <div className="stat-box-title">💵 Estimated MRR</div>
            <div className="stat-box-value" style={{ color: '#00e5ff' }}>${marketing.estimatedMRR || 0}</div>
          </div>

          <div className="stat-box" style={{ borderColor: '#ffab00', background: 'rgba(255, 171, 0, 0.05)' }}>
            <div className="stat-box-title">🟢 Currently Online</div>
            <div className="stat-box-value" style={{ color: '#ffab00' }}>{metrics.onlineCount || 0}</div>
          </div>
        </div>

        {/* Super Admin Navigation Tabs */}
        <div className="super-nav-tabs font-mono">
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
            🎯 Sentinel V2 Intelligence ({sentinelSetups.length})
          </button>

          <button
            type="button"
            className="super-tab-btn"
            style={{
              border: activeTab === 'marketing' ? '1px solid #00e676' : '1px solid rgba(255,255,255,0.1)',
              background: activeTab === 'marketing' ? 'rgba(0, 230, 118, 0.2)' : 'transparent',
              color: activeTab === 'marketing' ? '#00e676' : '#ccc'
            }}
            onClick={() => setActiveTab('marketing')}
          >
            📈 Marketing &amp; Conversion Funnel
          </button>

          <button
            type="button"
            className="super-tab-btn"
            style={{
              border: activeTab === 'heatmap' ? '1px solid #00e5ff' : '1px solid rgba(255,255,255,0.1)',
              background: activeTab === 'heatmap' ? 'rgba(0, 229, 255, 0.2)' : 'transparent',
              color: activeTab === 'heatmap' ? '#00e5ff' : '#ccc'
            }}
            onClick={() => setActiveTab('heatmap')}
          >
            📊 Website Usage &amp; Feature Heatmap
          </button>

          <button
            type="button"
            className="super-tab-btn"
            style={{
              border: activeTab === 'roster' || activeTab === 'governance' ? '1px solid #b388ff' : '1px solid rgba(255,255,255,0.1)',
              background: activeTab === 'roster' || activeTab === 'governance' ? 'rgba(179, 136, 255, 0.2)' : 'transparent',
              color: activeTab === 'roster' || activeTab === 'governance' ? '#b388ff' : '#ccc'
            }}
            onClick={() => setActiveTab('roster')}
          >
            👥 User Governance Roster ({roster.length})
          </button>

          <button
            type="button"
            className="super-tab-btn"
            style={{
              border: activeTab === 'strategies' ? '1px solid #ffab00' : '1px solid rgba(255,255,255,0.1)',
              background: activeTab === 'strategies' ? 'rgba(255, 171, 0, 0.2)' : 'transparent',
              color: activeTab === 'strategies' ? '#ffab00' : '#ccc'
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
            🛡️ Admin Audit ({adminLogs.length})
          </button>
        </div>

        {/* TAB 1: Sentinel V2 Intelligence & Signal Cards */}
        {activeTab === 'sentinel' && (
          <div className="font-mono">
            {/* Sentinel Staged Rollout Control Bar */}
            <div className="super-card font-mono" style={{ borderColor: '#ce93d8', background: 'rgba(156, 39, 176, 0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <h2 style={{ margin: 0, color: '#ce93d8' }}>🎯 SENTINEL V2 — STAGED ROLLOUT GOVERNANCE</h2>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#aaa' }}>
                    Control where Sentinel V2 trade cards appear across the platform.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    type="button"
                    className="font-mono"
                    style={{
                      background: sentinelRollout.visibleToAdmins ? 'rgba(0, 230, 118, 0.2)' : 'rgba(255, 23, 68, 0.15)',
                      border: sentinelRollout.visibleToAdmins ? '1px solid #00e676' : '1px solid #ff1744',
                      color: sentinelRollout.visibleToAdmins ? '#00e676' : '#ff1744',
                      padding: '6px 14px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: 800
                    }}
                    onClick={() => handleToggleRollout('admins', sentinelRollout.visibleToAdmins)}
                  >
                    {sentinelRollout.visibleToAdmins ? '🟢 Visible to Admins (Stage 2 Active)' : '🔴 Hidden from Admins (Stage 1 Private)'}
                  </button>

                  <button
                    type="button"
                    className="font-mono"
                    style={{
                      background: sentinelRollout.visibleToTraders ? 'rgba(0, 230, 118, 0.2)' : 'rgba(255, 23, 68, 0.15)',
                      border: sentinelRollout.visibleToTraders ? '1px solid #00e676' : '1px solid #ff1744',
                      color: sentinelRollout.visibleToTraders ? '#00e676' : '#ff1744',
                      padding: '6px 14px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: 800
                    }}
                    onClick={() => handleToggleRollout('traders', sentinelRollout.visibleToTraders)}
                  >
                    {sentinelRollout.visibleToTraders ? '🚀 Live for Client Traders (Stage 3 Active)' : '🔒 Hidden from Client Traders'}
                  </button>

                  <button
                    type="button"
                    className="font-mono"
                    style={{ background: '#ce93d8', color: '#000', border: 'none', padding: '6px 16px', borderRadius: '6px', fontWeight: 900, cursor: 'pointer' }}
                    onClick={handleSentinelScan}
                    disabled={sentinelScanning}
                  >
                    {sentinelScanning ? 'Scanning...' : '⚡ Trigger Manual Sentinel Scan'}
                  </button>
                </div>
              </div>
            </div>

            {/* Sentinel Real-Time Performance Analytics */}
            {sentinelAnalytics && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ fontSize: '0.75rem', color: '#aaa' }}>TOTAL SIGNALS</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#ce93d8' }}>{sentinelAnalytics.totalSignals}</div>
                </div>
                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ fontSize: '0.75rem', color: '#aaa' }}>WIN RATE</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#00e676' }}>{sentinelAnalytics.winRate}%</div>
                </div>
                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ fontSize: '0.75rem', color: '#aaa' }}>REALIZED R-MULTIPLE</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#00e5ff' }}>+{sentinelAnalytics.totalRealizedR}R</div>
                </div>
                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ fontSize: '0.75rem', color: '#aaa' }}>POI DISTRIBUTION</div>
                  <div style={{ fontSize: '0.8rem', color: '#ffab00', fontWeight: 700 }}>
                    FVG: {sentinelAnalytics.poiTypeDistribution?.FVG || 0} • OC: {sentinelAnalytics.poiTypeDistribution?.OC || 0}
                  </div>
                </div>
              </div>
            )}

            {/* Sentinel Signal Cards Grid */}
            <div className="super-card font-mono">
              <h2 style={{ margin: '0 0 16px 0', color: '#ce93d8' }}>🎯 Sentinel V2 Live Trade Cards ({sentinelSetups.length})</h2>
              {sentinelSetups.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#aaa' }}>
                  No active Sentinel V2 setups at this moment. Trigger a manual scan or wait for the automatic killzone scanner.
                </div>
              ) : (
                <div className="powerhouse-grid">
                  {sentinelSetups.map((s: any) => {
                    const isLong = (s.bias || 'long').toLowerCase() === 'long';
                    let meta: any = {};
                    try { meta = JSON.parse(s.metadata || '{}'); } catch {}

                    return (
                      <div key={s.id} className="powerhouse-card" style={{ borderColor: 'rgba(206, 147, 216, 0.4)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#fff' }}>{s.instrument}</span>
                          <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, background: isLong ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255, 23, 68, 0.15)', color: isLong ? '#00e676' : '#ff1744' }}>
                            {isLong ? '▲ LONG' : '▼ SHORT'}
                          </span>
                        </div>

                        <div style={{ fontSize: '0.75rem', color: '#ce93d8', marginBottom: '10px', fontWeight: 700 }}>
                          POI: {meta.poi_type || 'FVG'} • Conviction: {s.conviction_score}% • Phase: {meta.sentinel_phase || 'ENTRY_ACTIVE'}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px', fontSize: '0.8rem' }}>
                          <div><span style={{ color: '#aaa' }}>ENTRY:</span> <strong style={{ color: '#fff' }}>{s.entry_zone_mid}</strong></div>
                          <div><span style={{ color: '#aaa' }}>STOP:</span> <strong style={{ color: '#ff1744' }}>{s.stop}</strong></div>
                          <div><span style={{ color: '#aaa' }}>TARGET 1:</span> <strong style={{ color: '#00e5ff' }}>{s.tp1} ({s.r_multiple_1}R)</strong></div>
                          <div><span style={{ color: '#aaa' }}>TARGET 2:</span> <strong style={{ color: '#ffab00' }}>{s.tp2 || 'N/A'} (3R)</strong></div>
                        </div>

                        <div style={{ fontSize: '0.72rem', color: '#aaa', fontStyle: 'italic', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px' }}>
                          {meta.selection_rationale || 'Sentinel V2 institutional expansion and POI retest setup.'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Marketing & Conversion Funnel */}
        {activeTab === 'marketing' && (
          <div className="font-mono">
            <div className="powerhouse-grid">
              <div className="powerhouse-card">
                <div className="powerhouse-card-title">📈 Conversion Funnel Stage Analysis</div>
                <div className="funnel-stage">
                  <span className="funnel-label">Total Registered Traders</span>
                  <span className="funnel-val">{marketing.totalTraders || 0}</span>
                </div>
                <div className="funnel-stage">
                  <span className="funnel-label">Free Tier Users</span>
                  <span className="funnel-val" style={{ color: '#aaa' }}>{marketing.freeTierCount || 0}</span>
                </div>
                <div className="funnel-stage">
                  <span className="funnel-label">Forex Only Paid Tier ($79/mo)</span>
                  <span className="funnel-val" style={{ color: '#00e5ff' }}>{marketing.forexTierCount || 0}</span>
                </div>
                <div className="funnel-stage">
                  <span className="funnel-label">Futures + Forex VIP Tier ($149/mo)</span>
                  <span className="funnel-val" style={{ color: '#00e676' }}>{marketing.futuresForexTierCount || 0}</span>
                </div>
              </div>

              <div className="powerhouse-card">
                <div className="powerhouse-card-title">💵 Revenue &amp; ARPU Intelligence</div>
                <div style={{ padding: '12px', background: 'rgba(0, 230, 118, 0.08)', borderRadius: '8px', marginBottom: '12px', border: '1px solid rgba(0, 230, 118, 0.3)' }}>
                  <div style={{ fontSize: '0.8rem', color: '#aaa' }}>ESTIMATED MONTHLY REVENUE (MRR)</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#00e676' }}>${marketing.estimatedMRR || 0} USD</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div style={{ padding: '10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                    <div style={{ fontSize: '0.72rem', color: '#aaa' }}>ARPU (AVG REV/USER)</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffab00' }}>${marketing.arpu || 0}</div>
                  </div>
                  <div style={{ padding: '10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '6px' }}>
                    <div style={{ fontSize: '0.72rem', color: '#aaa' }}>CONVERSION %</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#00e5ff' }}>{marketing.conversionRate || 0}%</div>
                  </div>
                </div>
              </div>

              <div className="powerhouse-card">
                <div className="powerhouse-card-title">🚨 At-Risk &amp; Inactive User Alerts</div>
                <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '12px' }}>
                  Traders registered over 7 days ago with low recent logins. Ideal for marketing re-engagement campaigns.
                </div>
                {marketing.atRiskUsers && marketing.atRiskUsers.length > 0 ? (
                  marketing.atRiskUsers.map((u: any) => (
                    <div key={u.email} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255, 23, 68, 0.1)', border: '1px solid rgba(255, 23, 68, 0.3)', borderRadius: '4px', marginBottom: '6px', fontSize: '0.8rem' }}>
                      <span style={{ color: '#fff' }}>{u.email}</span>
                      <span style={{ color: '#ff1744' }}>Inactive {u.lastActiveAgo}</span>
                    </div>
                  ))
                ) : (
                  <div style={{ color: '#00e676', fontSize: '0.85rem' }}>✅ All active traders are engaged! No churn risks detected.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Website Usage & Feature Heatmap */}
        {activeTab === 'heatmap' && (
          <div className="font-mono">
            <div className="powerhouse-grid">
              <div className="powerhouse-card">
                <div className="powerhouse-card-title">🔥 Top Visited Routes &amp; Pages</div>
                {Object.entries(heatmap.pageViewCounts || {}).map(([path, count]: any) => (
                  <div key={path} className="heatmap-item">
                    <span className="heatmap-label">{path}</span>
                    <span className="heatmap-count">{count} views</span>
                  </div>
                ))}
              </div>

              <div className="powerhouse-card">
                <div className="powerhouse-card-title">⚡ Feature Click Adoption Heatmap</div>
                {Object.entries(heatmap.featureClickCounts || {}).length > 0 ? (
                  Object.entries(heatmap.featureClickCounts || {}).map(([feat, count]: any) => (
                    <div key={feat} className="heatmap-item">
                      <span className="heatmap-label" style={{ color: '#ffab00' }}>{feat.toUpperCase()}</span>
                      <span className="heatmap-count" style={{ color: '#00e5ff' }}>{count} clicks</span>
                    </div>
                  ))
                ) : (
                  <div style={{ color: '#888', fontSize: '0.85rem' }}>No feature clicks recorded yet. Logging live in background...</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: User Governance & Roster */}
        {activeTab === 'roster' && (
          <div className="super-card font-mono">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ margin: 0, color: '#b388ff' }}>👥 All Users &amp; Admins Real-Time Governance Roster</h2>
                <span style={{ fontSize: '0.8rem', color: '#aaa' }}>Updates live every 5s • Full User Management &amp; Activity Timelines</span>
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

            <div className="table-responsive">
              <table className="runs-table">
                <thead>
                  <tr>
                    <th>Account &amp; Name</th>
                    <th>Role &amp; Tier</th>
                    <th>Status / Last Active</th>
                    <th>Current Page</th>
                    <th>Session Duration</th>
                    <th>Actions &amp; Governance</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((u: any) => (
                    <tr key={u.email}>
                      <td>
                        <strong>{u.name || u.email}</strong>
                        <div style={{ fontSize: '0.75rem', color: '#888' }}>{u.email}</div>
                      </td>
                      <td>
                        <span className="market-tag font-mono" style={{ background: u.role === 'admin' ? 'rgba(255, 171, 0, 0.2)' : 'rgba(0, 229, 255, 0.2)', color: u.role === 'admin' ? '#ffab00' : '#00e5ff', marginRight: '6px' }}>
                          {u.role.toUpperCase()}
                        </span>
                        <span style={{ fontSize: '0.78rem', color: '#b388ff' }}>{u.tier}</span>
                      </td>
                      <td style={{ color: u.isOnline ? '#00e676' : u.status === 'suspended' ? '#ff1744' : '#888' }}>
                        {u.status === 'suspended' ? '🚫 SUSPENDED' : u.lastActiveAgo}
                      </td>
                      <td className="font-mono text-gold">
                        {u.currentPath}
                      </td>
                      <td className="font-mono">
                        {u.totalDurationFormatted}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="font-mono"
                            style={{ background: 'rgba(179, 136, 255, 0.2)', border: '1px solid #b388ff', color: '#b388ff', padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}
                            onClick={() => handleSuperImpersonate(u)}
                            title="Log in as this user to view their screen"
                          >
                            👁️ View As
                          </button>

                          <button
                            type="button"
                            className="font-mono"
                            style={{ background: 'rgba(0, 229, 255, 0.2)', border: '1px solid #00e5ff', color: '#00e5ff', padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}
                            onClick={() => fetchUserActivity(u.email)}
                            title="Inspect complete activity timeline"
                          >
                            📜 Activity
                          </button>

                          <button
                            type="button"
                            className="font-mono"
                            style={{ background: 'rgba(255, 171, 0, 0.2)', border: '1px solid #ffab00', color: '#ffab00', padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}
                            onClick={() => handleOpenEditModal(u)}
                            title="Edit role, tier, and status"
                          >
                            ⚙️ Edit
                          </button>

                          <button
                            type="button"
                            className="font-mono"
                            style={{ background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}
                            onClick={() => handleSuperChangePassword(u.id || u.email, u.email)}
                            title="Reset password"
                          >
                            🔑 Pass
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

        {/* TAB 5: Strategy Governance */}
        {activeTab === 'strategies' && (
          <div className="super-card font-mono">
            <h2 style={{ margin: '0 0 16px 0', color: '#00e5ff' }}>⚙️ Strategy Governance &amp; Admin Access Control</h2>
            <div className="table-responsive">
              <table className="runs-table">
                <thead>
                  <tr>
                    <th>Strategy ID &amp; Name</th>
                    <th>Admin Visibility</th>
                    <th>Client / Trader Visibility</th>
                    <th>Governance Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {strategiesList.map((s: any) => {
                    const stratId = s.id || s.strategyId;
                    const stratName = stratId === 'sentinel_v2' ? 'Chadwin Sentinel V2 Elite Framework (Manna Elite V1)' : s.name;
                    return (
                      <tr key={stratId}>
                        <td>
                          <strong style={{ color: '#fff' }}>{stratName}</strong> ({stratId})
                        </td>
                        <td>
                          <span style={{ color: s.visibleToAdmins ? '#00e676' : '#ff1744', fontWeight: 800 }}>
                            {s.visibleToAdmins ? '👁️ VISIBLE TO ADMINS' : '🔒 HIDDEN FROM ADMINS'}
                          </span>
                        </td>
                        <td>
                          <span style={{ color: s.visibleToTraders ? '#00e5ff' : '#ff1744', fontWeight: 800 }}>
                            {s.visibleToTraders ? '🌐 VISIBLE TO CLIENTS' : '🔒 HIDDEN FROM CLIENTS'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="font-mono"
                              style={{
                                background: s.visibleToAdmins ? 'rgba(255, 23, 68, 0.15)' : 'rgba(0, 230, 118, 0.15)',
                                border: s.visibleToAdmins ? '1px solid #ff1744' : '1px solid #00e676',
                                color: s.visibleToAdmins ? '#ff1744' : '#00e676',
                                padding: '4px 10px',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                              onClick={() => handleToggleStrategyVisibility(stratId, 'admins', s.visibleToAdmins)}
                            >
                              {s.visibleToAdmins ? '🔒 Hide from Admins' : '👁️ Show to Admins'}
                            </button>

                            <button
                              type="button"
                              className="font-mono"
                              style={{
                                background: s.visibleToTraders ? 'rgba(255, 23, 68, 0.15)' : 'rgba(0, 229, 255, 0.15)',
                                border: s.visibleToTraders ? '1px solid #ff1744' : '1px solid #00e5ff',
                                color: s.visibleToTraders ? '#ff1744' : '#00e5ff',
                                padding: '4px 10px',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                              onClick={() => handleToggleStrategyVisibility(stratId, 'traders', s.visibleToTraders)}
                            >
                              {s.visibleToTraders ? '🔒 Hide from Clients' : '🌐 Show to Clients'}
                            </button>

                            <button
                              type="button"
                              className="font-mono"
                              style={{ background: 'rgba(255, 23, 68, 0.2)', border: '1px solid #ff1744', color: '#ff1744', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer' }}
                              onClick={() => handleDeleteStrategy(stratId, stratName)}
                            >
                              🗑️ Delete Strategy
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Twin-Profile Engine Tuning Controls */}
            <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <h3 style={{ margin: '0 0 12px 0', color: '#b388ff' }}>🎛️ Twin Independent Strategy Engine Tuning Profiles</h3>
              <p style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '16px' }}>
                Independently dial signal volume limits and conviction/aggressiveness cutoffs for Super Admin vs Public (Admins &amp; Clients).
              </p>

              <form onSubmit={handleSaveTuning} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                {/* Super Admin Profile */}
                <div style={{ background: 'rgba(179, 136, 255, 0.08)', border: '1px solid rgba(179, 136, 255, 0.3)', borderRadius: '8px', padding: '16px' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: '#b388ff' }}>👑 Super Admin Master Profile</h4>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#ccc', marginBottom: '4px' }}>Max Signals Per Session (1-10):</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={superAdminMaxSignals}
                      onChange={(e) => setSuperAdminMaxSignals(Number(e.target.value))}
                      style={{ width: '100%', background: '#111', border: '1px solid #444', color: '#fff', padding: '6px 10px', borderRadius: '4px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#ccc', marginBottom: '4px' }}>Min Conviction Cutoff (%):</label>
                    <input
                      type="number"
                      step={0.5}
                      min={70}
                      max={95}
                      value={superAdminMinConviction}
                      onChange={(e) => setSuperAdminMinConviction(Number(e.target.value))}
                      style={{ width: '100%', background: '#111', border: '1px solid #444', color: '#fff', padding: '6px 10px', borderRadius: '4px' }}
                    />
                  </div>
                </div>

                {/* Public Client Profile */}
                <div style={{ background: 'rgba(0, 229, 255, 0.08)', border: '1px solid rgba(0, 229, 255, 0.3)', borderRadius: '8px', padding: '16px' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: '#00e5ff' }}>👥 Client &amp; Admin Public Profile</h4>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#ccc', marginBottom: '4px' }}>Max Signals Per Session (1-10):</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={publicMaxSignals}
                      onChange={(e) => setPublicMaxSignals(Number(e.target.value))}
                      style={{ width: '100%', background: '#111', border: '1px solid #444', color: '#fff', padding: '6px 10px', borderRadius: '4px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#ccc', marginBottom: '4px' }}>Min Conviction Cutoff (%):</label>
                    <input
                      type="number"
                      step={0.5}
                      min={70}
                      max={95}
                      value={publicMinConviction}
                      onChange={(e) => setPublicMinConviction(Number(e.target.value))}
                      style={{ width: '100%', background: '#111', border: '1px solid #444', color: '#fff', padding: '6px 10px', borderRadius: '4px' }}
                    />
                  </div>
                </div>

                {/* Original Working Baseline Reference Card */}
                <div style={{ background: 'rgba(255, 171, 0, 0.08)', border: '1px solid rgba(255, 171, 0, 0.3)', borderRadius: '8px', padding: '16px' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: '#ffab00' }}>📌 Original Baseline Reference</h4>
                  <div style={{ fontSize: '0.8rem', color: '#ccc', marginBottom: '6px' }}>
                    <strong>Max Signals / Session:</strong> <span style={{ color: '#00e676', fontWeight: 800 }}>6</span> (3 Futures + 3 Forex)
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#ccc', marginBottom: '10px' }}>
                    <strong>Min Conviction Cutoff:</strong> <span style={{ color: '#00e676', fontWeight: 800 }}>70.0%</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#aaa', marginBottom: '12px' }}>
                    Original active Sentinel V2 performance baseline.
                  </div>
                  <button
                    type="button"
                    className="font-mono"
                    style={{ background: 'rgba(255, 171, 0, 0.2)', border: '1px solid #ffab00', color: '#ffab00', padding: '5px 10px', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}
                    onClick={() => {
                      setSuperAdminMaxSignals(6);
                      setSuperAdminMinConviction(70.0);
                      setPublicMaxSignals(6);
                      setPublicMinConviction(70.0);
                    }}
                  >
                    ↺ Reset Both Profiles to Baseline
                  </button>
                </div>

                <div style={{ gridColumn: '1 / -1', textAlign: 'right' }}>
                  <button
                    type="submit"
                    disabled={savingTuning}
                    className="font-mono"
                    style={{ background: '#00e5ff', color: '#000', fontWeight: 800, padding: '8px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer' }}
                  >
                    {savingTuning ? 'Saving...' : '💾 Save Engine Tuning Profiles'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB 6: Admin Audit Log */}
        {activeTab === 'admin_audit' && (
          <div className="super-card font-mono">
            <h2 style={{ margin: '0 0 16px 0', color: '#ffab00' }}>🛡️ Admin Command Audit Trail ({adminLogs.length} Events)</h2>
            <div className="table-responsive">
              <table className="runs-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Admin Email</th>
                    <th>Action</th>
                    <th>Target / Details</th>
                  </tr>
                </thead>
                <tbody>
                  {adminLogs.map((l: any, idx: number) => (
                    <tr key={idx}>
                      <td style={{ fontSize: '0.8rem', color: '#888' }}>{l.timestamp}</td>
                      <td style={{ color: '#ffab00' }}>{l.userEmail}</td>
                      <td><span className="market-tag font-mono" style={{ background: 'rgba(255, 171, 0, 0.2)', color: '#ffab00' }}>{l.actionDetails?.action || l.eventType}</span></td>
                      <td style={{ fontSize: '0.82rem', color: '#aaa' }}>{JSON.stringify(l.actionDetails || {})}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* User Activity Audit Modal */}
      {activityModalEmail && (
        <div className="super-modal-overlay">
          <div className="super-modal-content font-mono">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '12px' }}>
              <h2 style={{ margin: 0, color: '#00e5ff' }}>📜 Activity Audit Timeline: {activityModalEmail}</h2>
              <button onClick={() => setActivityModalEmail(null)} style={{ background: 'none', border: 'none', color: '#ff1744', fontSize: '1.2rem', cursor: 'pointer' }}>✖</button>
            </div>

            {loadingUserActivity ? (
              <div style={{ color: '#aaa', padding: '20px 0' }}>Loading user timeline...</div>
            ) : userActivityData?.logs?.length === 0 ? (
              <div style={{ color: '#aaa', padding: '20px 0' }}>No specific events recorded for this user session yet.</div>
            ) : (
              <div>
                {userActivityData?.logs?.map((l: any, idx: number) => (
                  <div key={idx} className="timeline-event">
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#888', marginBottom: '4px' }}>
                      <span>{l.timestamp}</span>
                      <span style={{ color: '#b388ff' }}>{l.eventType.toUpperCase()}</span>
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 700 }}>
                      Path: <span style={{ color: '#ffab00' }}>{l.path}</span>
                    </div>
                    {l.actionDetails && (
                      <div style={{ fontSize: '0.8rem', color: '#aaa', marginTop: '4px' }}>
                        Action: {l.actionDetails.action} {l.actionDetails.instrument ? `(${l.actionDetails.instrument})` : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit User Governance Modal */}
      {editingUser && (
        <div className="super-modal-overlay">
          <div className="super-modal-content font-mono" style={{ maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '12px' }}>
              <h2 style={{ margin: 0, color: '#b388ff' }}>⚙️ User Account Governance</h2>
              <button onClick={() => setEditingUser(null)} style={{ background: 'none', border: 'none', color: '#ff1744', fontSize: '1.2rem', cursor: 'pointer' }}>✖</button>
            </div>

            <form onSubmit={handleSaveUserGovernance}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#aaa', marginBottom: '4px' }}>Email Address</label>
                <input type="text" value={editingUser.email} disabled style={{ width: '100%', padding: '8px', background: '#111', border: '1px solid #333', color: '#888', borderRadius: '4px' }} />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#aaa', marginBottom: '4px' }}>Display Name</label>
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)} style={{ width: '100%', padding: '8px', background: '#090314', border: '1px solid #7c4dff', color: '#fff', borderRadius: '4px' }} />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#aaa', marginBottom: '4px' }}>Role Privileges</label>
                <select value={editRole} onChange={e => setEditRole(e.target.value as any)} style={{ width: '100%', padding: '8px', background: '#090314', border: '1px solid #ffab00', color: '#ffab00', borderRadius: '4px', fontWeight: 800 }}>
                  <option value="trader">👨‍💻 Standard Trader</option>
                  <option value="admin">⚙️ System Administrator</option>
                  <option value="super_admin">👁️ Master Super Admin</option>
                </select>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#aaa', marginBottom: '4px' }}>Subscription Access Tier</label>
                <select value={editTier} onChange={e => setEditTier(e.target.value as any)} style={{ width: '100%', padding: '8px', background: '#090314', border: '1px solid #b388ff', color: '#b388ff', borderRadius: '4px', fontWeight: 700 }}>
                  <option value="free">Free Tier</option>
                  <option value="forex_only">Forex Only Tier</option>
                  <option value="futures_forex">Futures &amp; Forex VIP Tier</option>
                </select>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#aaa', marginBottom: '4px' }}>Account Status</label>
                <select value={editStatus} onChange={e => setEditStatus(e.target.value as any)} style={{ width: '100%', padding: '8px', background: '#090314', border: '1px solid #00e676', color: editStatus === 'active' ? '#00e676' : '#ff1744', borderRadius: '4px', fontWeight: 800 }}>
                  <option value="active">🟢 Active Account</option>
                  <option value="suspended">🚫 Suspended Account</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setEditingUser(null)} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#ccc', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 20px', background: '#b388ff', border: 'none', color: '#090314', fontWeight: 900, borderRadius: '4px', cursor: 'pointer' }}>Save Governance Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Account Modal */}
      {showAddAccountModal && (
        <div className="super-modal-overlay">
          <div className="super-modal-content font-mono" style={{ maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '12px' }}>
              <h2 style={{ margin: 0, color: '#b388ff' }}>➕ Create User or Admin Account</h2>
              <button onClick={() => setShowAddAccountModal(false)} style={{ background: 'none', border: 'none', color: '#ff1744', fontSize: '1.2rem', cursor: 'pointer' }}>✖</button>
            </div>

            <form onSubmit={handleSuperCreateAccount}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#aaa', marginBottom: '4px' }}>Display Name</label>
                <input type="text" value={newAccName} onChange={e => setNewAccName(e.target.value)} required placeholder="e.g. Chadwin Solomon" style={{ width: '100%', padding: '8px', background: '#090314', border: '1px solid #7c4dff', color: '#fff', borderRadius: '4px' }} />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#aaa', marginBottom: '4px' }}>Email Address</label>
                <input type="email" value={newAccEmail} onChange={e => setNewAccEmail(e.target.value)} required placeholder="e.g. trader@example.com" style={{ width: '100%', padding: '8px', background: '#090314', border: '1px solid #7c4dff', color: '#fff', borderRadius: '4px' }} />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#aaa', marginBottom: '4px' }}>Role Privileges</label>
                <select value={newAccRole} onChange={e => setNewAccRole(e.target.value as any)} style={{ width: '100%', padding: '8px', background: '#090314', border: '1px solid #ffab00', color: '#ffab00', borderRadius: '4px', fontWeight: 800 }}>
                  <option value="trader">👨‍💻 Standard Trader</option>
                  <option value="admin">⚙️ System Administrator</option>
                </select>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#aaa', marginBottom: '4px' }}>Subscription Access Tier</label>
                <select value={newAccTier} onChange={e => setNewAccTier(e.target.value as any)} style={{ width: '100%', padding: '8px', background: '#090314', border: '1px solid #b388ff', color: '#b388ff', borderRadius: '4px', fontWeight: 700 }}>
                  <option value="free">Free Tier</option>
                  <option value="forex_only">Forex Only Tier</option>
                  <option value="futures_forex">Futures &amp; Forex VIP Tier</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowAddAccountModal(false)} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#ccc', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 20px', background: '#b388ff', border: 'none', color: '#090314', fontWeight: 900, borderRadius: '4px', cursor: 'pointer' }}>Create Account</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
