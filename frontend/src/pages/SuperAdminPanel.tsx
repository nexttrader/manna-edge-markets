import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './SuperAdminPanel.css';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';
import { UserManagementSystem } from '../components/admin/UserManagementSystem';
import { MaintenanceControlCard } from '../components/admin/MaintenanceControlCard';
import { StrategyComparisonDashboard } from '../components/admin/StrategyComparisonDashboard';
import { AssetControlHub } from '../components/admin/AssetControlHub';

export const SuperAdminPanel: React.FC = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleReturnToAdmin = () => {
    navigate('/admin');
  };

  const [activeTab, setActiveTab] = useState<'assets' | 'sentinel' | 'strategy_comparison' | 'roster' | 'marketing' | 'heatmap' | 'governance' | 'strategies' | 'admin_audit' | 'health' | 'client_accuracy' | 'notifications'>('assets');
  const [data, setData] = useState<any>(null);
  const [strategiesList, setStrategiesList] = useState<any[]>([]);

  // Notification toggles state & multi-market governance
  const [notifSettings, setNotifSettings] = useState<Array<{ key: string; label: string; description: string; category?: string; market?: string; enabled: boolean }>>([]);
  const [registeredMarkets, setRegisteredMarkets] = useState<Array<{ market: string; label: string }>>([
    { market: 'futures', label: 'Futures' },
    { market: 'forex', label: 'Forex' }
  ]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifSaving, setNotifSaving] = useState<string | null>(null);
  const [showAddMarketModal, setShowAddMarketModal] = useState(false);
  const [newMarketName, setNewMarketName] = useState('');
  const [newMarketLabel, setNewMarketLabel] = useState('');

  // Sentinel Specific State
  const [sentinelAnalytics, setSentinelAnalytics] = useState<any>(null);
  const [sentinelSetups, setSentinelSetups] = useState<any[]>([]);
  const [sentinelRollout, setSentinelRollout] = useState<{ visibleToAdmins: boolean; visibleToTraders: boolean }>({ visibleToAdmins: false, visibleToTraders: false });
  const [sentinelScanning, setSentinelScanning] = useState(false);

  // Client Accuracy Intelligence State
  const [clientAccuracy, setClientAccuracy] = useState<any>(null);
  const [loadingClientAccuracy, setLoadingClientAccuracy] = useState(false);

  const fetchClientAccuracy = async () => {
    setLoadingClientAccuracy(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/client-accuracy-analytics?role=super_admin`);
      if (res.ok) {
        const json = await res.json();
        setClientAccuracy(json);
      }
    } catch {} finally {
      setLoadingClientAccuracy(false);
    }
  };

  const fetchNotifSettings = async () => {
    setNotifLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/super-admin/notification-settings`);
      if (res.ok) {
        const json = await res.json();
        setNotifSettings(json.settings || []);
        if (json.markets) setRegisteredMarkets(json.markets);
      }
    } catch {} finally {
      setNotifLoading(false);
    }
  };

  const toggleNotifSetting = async (key: string, enabled: boolean) => {
    setNotifSaving(key);
    try {
      const res = await fetch(`${API_BASE}/api/super-admin/notification-settings/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      if (res.ok) {
        const json = await res.json();
        setNotifSettings(json.settings || []);
        if (json.markets) setRegisteredMarkets(json.markets);
      }
    } catch {} finally {
      setNotifSaving(null);
    }
  };

  const handleBulkToggle = async (filter: { market?: string; category?: string; keys?: string[] }, enabled: boolean) => {
    setNotifSaving('bulk');
    try {
      const res = await fetch(`${API_BASE}/api/super-admin/notification-settings/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...filter, enabled })
      });
      if (res.ok) {
        const json = await res.json();
        setNotifSettings(json.settings || []);
        if (json.markets) setRegisteredMarkets(json.markets);
      }
    } catch {} finally {
      setNotifSaving(null);
    }
  };

  const handleRegisterMarket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMarketName.trim()) return;
    setNotifSaving('new_market');
    try {
      const res = await fetch(`${API_BASE}/api/super-admin/notification-settings/markets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market: newMarketName.trim().toLowerCase(), label: newMarketLabel.trim() || undefined })
      });
      if (res.ok) {
        const json = await res.json();
        setNotifSettings(json.settings || []);
        if (json.markets) setRegisteredMarkets(json.markets);
        setNewMarketName('');
        setNewMarketLabel('');
        setShowAddMarketModal(false);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to add market');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setNotifSaving(null);
    }
  };

  const handleDeleteMarket = async (market: string) => {
    if (!confirm(`Are you sure you want to remove the custom market "${market.toUpperCase()}" and its notification toggles?`)) return;
    setNotifSaving(`del_${market}`);
    try {
      const res = await fetch(`${API_BASE}/api/super-admin/notification-settings/markets/${market}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        const json = await res.json();
        setNotifSettings(json.settings || []);
        if (json.markets) setRegisteredMarkets(json.markets);
      }
    } catch {} finally {
      setNotifSaving(null);
    }
  };

  // User Activity Audit Modal State
  const [activityModalEmail, setActivityModalEmail] = useState<string | null>(null);
  const [userActivityData] = useState<any>(null);
  const [loadingUserActivity] = useState(false);

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
        const errJson = await res.json().catch(() => ({}));
        alert(`⚠️ Failed to save tuning parameters: ${errJson.error || errJson.details || res.statusText || 'Server Error'}`);
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
    } catch (err: any) {
      alert(`⚠️ ${err.message}`);
    }
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

  const handleToggleStrategyEngine = async (strategyId: string, currentEnabled: boolean) => {
    try {
      const res = await fetch(`${API_BASE}/api/super-admin/strategies/${strategyId}/visibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentEnabled })
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to toggle strategy engine');
      if (resData.strategies) setStrategiesList(resData.strategies);
      alert(`⚡ Strategy "${strategyId}" engine ${!currentEnabled ? 'ENABLED (ON)' : 'DISABLED (OFF)'} successfully!`);
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
    fetchClientAccuracy();
    const interval = setInterval(() => {
      fetchSuperAdminData();
      fetchSentinelData();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

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
              ⚙️ Switch to Admin View
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

        {/* SYSTEM MAINTENANCE MODE CONTROL CARD */}
        <MaintenanceControlCard />

        {/* Quick-Access: Telegram Notification Controls */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
          <button
            type="button"
            className="font-mono"
            onClick={() => { setActiveTab('notifications'); fetchNotifSettings(); setTimeout(() => { document.getElementById('notif-tab-section')?.scrollIntoView({ behavior: 'smooth' }); }, 50); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 18px',
              background: 'rgba(41, 182, 246, 0.12)',
              border: '1px solid #29b6f6',
              borderRadius: '8px',
              color: '#29b6f6',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
              letterSpacing: '0.03em'
            }}
          >
            📡 Telegram Notification Toggles →
          </button>
        </div>

        <div className="super-nav-tabs font-mono">
          <button
            type="button"
            className="super-tab-btn"
            style={{
              border: activeTab === 'assets' ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.1)',
              background: activeTab === 'assets' ? 'rgba(99, 102, 241, 0.25)' : 'transparent',
              color: activeTab === 'assets' ? '#a5b4fc' : '#ccc',
              fontWeight: activeTab === 'assets' ? 800 : 600
            }}
            onClick={() => setActiveTab('assets')}
          >
            🎯 Asset &amp; Signal Visibility
          </button>

          <button
            type="button"
            className="super-tab-btn"
            style={{
              border: activeTab === 'strategy_comparison' ? '1px solid #ffab00' : '1px solid rgba(255,255,255,0.1)',
              background: activeTab === 'strategy_comparison' ? 'rgba(255, 171, 0, 0.25)' : 'transparent',
              color: activeTab === 'strategy_comparison' ? '#ffab00' : '#ccc',
              fontWeight: activeTab === 'strategy_comparison' ? 800 : 600
            }}
            onClick={() => setActiveTab('strategy_comparison')}
          >
            ⚔️ Strategy Analytics &amp; Results
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
            🤖 Sentinel Engine Tuning ({sentinelSetups.length})
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
            👥 User &amp; Admin Roster ({roster.length})
          </button>

          <button
            type="button"
            className="super-tab-btn"
            style={{
              border: activeTab === 'notifications' ? '1px solid #29b6f6' : '1px solid rgba(255,255,255,0.1)',
              background: activeTab === 'notifications' ? 'rgba(41, 182, 246, 0.2)' : 'transparent',
              color: activeTab === 'notifications' ? '#29b6f6' : '#ccc'
            }}
            onClick={() => { setActiveTab('notifications'); fetchNotifSettings(); }}
          >
            📡 Notification Governance
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
              border: activeTab === 'marketing' ? '1px solid #00e676' : '1px solid rgba(255,255,255,0.1)',
              background: activeTab === 'marketing' ? 'rgba(0, 230, 118, 0.2)' : 'transparent',
              color: activeTab === 'marketing' ? '#00e676' : '#ccc'
            }}
            onClick={() => setActiveTab('marketing')}
          >
            📈 Marketing &amp; Conversion
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
            📊 Usage Heatmap
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

          <button
            type="button"
            className="super-tab-btn"
            style={{
              border: activeTab === 'client_accuracy' ? '1px solid #00e676' : '1px solid rgba(255,255,255,0.1)',
              background: activeTab === 'client_accuracy' ? 'rgba(0, 230, 118, 0.2)' : 'transparent',
              color: activeTab === 'client_accuracy' ? '#00e676' : '#ccc'
            }}
            onClick={() => { setActiveTab('client_accuracy'); fetchClientAccuracy(); }}
          >
            🏷️ Client Accuracy
          </button>
        </div>

        {/* TAB: Asset & Signal Visibility Hub */}
        {activeTab === 'assets' && (
          <div style={{ marginBottom: '24px' }}>
            <AssetControlHub />
          </div>
        )}

        {/* TAB: Telegram Feature Toggles */}
        {activeTab === 'notifications' && (
          <div id="notif-tab-section" className="font-mono">
            {/* Header & Controls */}
            <div className="super-card font-mono" style={{ borderColor: '#29b6f6', background: 'rgba(41, 182, 246, 0.06)', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ margin: 0, color: '#29b6f6', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span>📡</span> TELEGRAM MULTI-MARKET BROADCAST CONTROL CENTER
                  </h2>
                  <p style={{ margin: '6px 0 0 0', fontSize: '0.82rem', color: '#aaa', lineHeight: '1.4' }}>
                    Granularly toggle <b>Signals</b>, <b>Trade Management</b>, and <b>Status Updates</b> globally, per-market (<b>Futures</b>, <b>Forex</b>), or for <b>custom markets</b>. All toggle states are saved to persistent database &amp; disk snapshot and remembered across Render server reboots.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setShowAddMarketModal(true)}
                    style={{ padding: '7px 16px', background: 'rgba(0, 230, 118, 0.15)', border: '1px solid #00e676', color: '#00e676', borderRadius: '6px', cursor: 'pointer', fontWeight: 800, fontSize: '0.82rem' }}
                  >
                    ➕ Add New Market
                  </button>
                  <button
                    type="button"
                    onClick={fetchNotifSettings}
                    style={{ padding: '7px 16px', background: 'rgba(41, 182, 246, 0.15)', border: '1px solid #29b6f6', color: '#29b6f6', borderRadius: '6px', cursor: 'pointer', fontWeight: 800, fontSize: '0.82rem' }}
                  >
                    🔄 Refresh Toggles
                  </button>
                </div>
              </div>
            </div>

            {/* Add Market Modal */}
            {showAddMarketModal && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
                <div className="super-card font-mono" style={{ maxWidth: '480px', width: '100%', borderColor: '#00e676', background: '#0d061a', padding: '24px' }}>
                  <h3 style={{ margin: '0 0 12px 0', color: '#00e676' }}>➕ Register New Market Stream</h3>
                  <p style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '16px' }}>
                    Adding a market automatically creates its dedicated <b>Signals</b>, <b>Manage</b>, and <b>Status</b> toggles in the database with reboot persistence.
                  </p>
                  <form onSubmit={handleRegisterMarket}>
                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ display: 'block', fontSize: '0.78rem', color: '#ccc', marginBottom: '6px' }}>Market Identifier (Code)</label>
                      <input
                        type="text"
                        placeholder="e.g. crypto, indices, commodities"
                        value={newMarketName}
                        onChange={e => setNewMarketName(e.target.value)}
                        required
                        style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: '#fff', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div style={{ marginBottom: '20px' }}>
                      <label style={{ display: 'block', fontSize: '0.78rem', color: '#ccc', marginBottom: '6px' }}>Display Label (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. Crypto Majors, US Indices"
                        value={newMarketLabel}
                        onChange={e => setNewMarketLabel(e.target.value)}
                        style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: '#fff', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={() => setShowAddMarketModal(false)}
                        style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #666', color: '#ccc', borderRadius: '6px', cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={notifSaving === 'new_market'}
                        style={{ padding: '8px 20px', background: '#00e676', border: 'none', color: '#000', borderRadius: '6px', fontWeight: 800, cursor: 'pointer' }}
                      >
                        {notifSaving === 'new_market' ? 'Saving…' : 'Register Market'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {notifLoading && (
              <p style={{ color: '#888', textAlign: 'center', padding: '30px' }}>Loading broadcast feature toggles…</p>
            )}

            {!notifLoading && (
              <>
                {/* ── SECTION 1: GLOBAL MASTER CATEGORY TOGGLES ── */}
                <div className="super-card font-mono" style={{ borderColor: '#7c4dff', background: 'rgba(124, 77, 255, 0.05)', marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, color: '#b388ff', fontSize: '1rem' }}>🌐 GLOBAL MASTER CATEGORY SWITCHES</h3>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => handleBulkToggle({ category: 'master' }, true)}
                        style={{ padding: '4px 10px', fontSize: '0.72rem', background: 'rgba(0, 230, 118, 0.15)', border: '1px solid #00e676', color: '#00e676', borderRadius: '4px', cursor: 'pointer', fontWeight: 700 }}
                      >
                        Turn All ON
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBulkToggle({ category: 'master' }, false)}
                        style={{ padding: '4px 10px', fontSize: '0.72rem', background: 'rgba(255, 23, 68, 0.15)', border: '1px solid #ff1744', color: '#ff5252', borderRadius: '4px', cursor: 'pointer', fontWeight: 700 }}
                      >
                        Turn All OFF
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                    {[
                      { key: 'notify_all_signal', icon: '🟡', title: 'ALL SIGNALS (GLOBAL)', desc: 'Master toggle for all new trade alerts across every market', color: '#ffd54f' },
                      { key: 'notify_all_manage', icon: '🛡️', title: 'ALL TRADE MANAGEMENT (GLOBAL)', desc: 'Master toggle for Invalidations, BE, TP1, TP2, and Superseded cancels', color: '#29b6f6' },
                      { key: 'notify_all_status', icon: '⚡', title: 'ALL STATUS UPDATES (GLOBAL)', desc: 'Master toggle for Order Filled, Stop Loss Hit, and Breakeven Exits', color: '#00e676' },
                    ].map(item => {
                      const setting = notifSettings.find(s => s.key === item.key);
                      const isEnabled = setting ? setting.enabled : true;
                      return (
                        <div
                          key={item.key}
                          style={{
                            padding: '16px',
                            borderRadius: '8px',
                            border: isEnabled ? `1px solid ${item.color}55` : '1px solid rgba(255,255,255,0.08)',
                            background: isEnabled ? `${item.color}10` : 'rgba(255,255,255,0.02)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '12px'
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '0.88rem', color: isEnabled ? item.color : '#888' }}>
                              {item.icon} {item.title}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#888', marginTop: '4px' }}>{item.desc}</div>
                          </div>
                          <button
                            type="button"
                            disabled={notifSaving === item.key}
                            onClick={() => toggleNotifSetting(item.key, !isEnabled)}
                            style={{
                              padding: '6px 14px',
                              borderRadius: '6px',
                              border: isEnabled ? '1px solid #00e676' : '1px solid #ff1744',
                              background: isEnabled ? 'rgba(0, 230, 118, 0.2)' : 'rgba(255, 23, 68, 0.15)',
                              color: isEnabled ? '#00e676' : '#ff5252',
                              fontWeight: 800,
                              cursor: notifSaving === item.key ? 'wait' : 'pointer',
                              fontSize: '0.78rem',
                              minWidth: '78px'
                            }}
                          >
                            {notifSaving === item.key ? '…' : isEnabled ? '🟢 ON' : '🔴 OFF'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── SECTION 2: PER-MARKET STREAM MATRIX ── */}
                <div className="super-card font-mono" style={{ borderColor: '#ffd54f', background: 'rgba(255, 213, 79, 0.04)', marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
                    <div>
                      <h3 style={{ margin: 0, color: '#ffd54f', fontSize: '1rem' }}>📊 PER-MARKET CONTROL MATRIX</h3>
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.76rem', color: '#aaa' }}>
                        Independently toggle Signals, Management, and Status for Futures, Forex, and any dynamically added market.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                    {registeredMarkets.map(m => {
                      const mKey = m.market.toLowerCase().trim();
                      const masterKey = `market_${mKey}_all`;
                      const sigKey = `${mKey}_signals`;
                      const manKey = `${mKey}_manage`;
                      const statKey = `${mKey}_status`;

                      const masterSetting = notifSettings.find(s => s.key === masterKey);
                      const isMasterOn = masterSetting ? masterSetting.enabled : true;

                      const sigSetting = notifSettings.find(s => s.key === sigKey);
                      const isSigOn = sigSetting ? sigSetting.enabled : true;

                      const manSetting = notifSettings.find(s => s.key === manKey);
                      const isManOn = manSetting ? manSetting.enabled : true;

                      const statSetting = notifSettings.find(s => s.key === statKey);
                      const isStatOn = statSetting ? statSetting.enabled : true;

                      const isCustom = mKey !== 'futures' && mKey !== 'forex';

                      return (
                        <div
                          key={mKey}
                          style={{
                            background: 'rgba(15, 6, 32, 0.85)',
                            border: isMasterOn ? '1px solid rgba(255, 213, 79, 0.35)' : '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '10px',
                            padding: '16px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px'
                          }}
                        >
                          {/* Market Card Header */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
                            <div>
                              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', padding: '2px 8px', borderRadius: '4px', background: isCustom ? 'rgba(156, 39, 176, 0.2)' : 'rgba(41, 182, 246, 0.2)', color: isCustom ? '#ce93d8' : '#29b6f6', fontWeight: 800 }}>
                                {isCustom ? 'CUSTOM MARKET' : 'CORE MARKET'}
                              </span>
                              <div style={{ fontWeight: 900, color: '#fff', fontSize: '1.05rem', marginTop: '4px' }}>
                                {m.label || mKey.toUpperCase()}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {isCustom && (
                                <button
                                  type="button"
                                  title="Delete Custom Market"
                                  onClick={() => handleDeleteMarket(mKey)}
                                  style={{ padding: '4px 8px', background: 'rgba(255,23,68,0.15)', border: '1px solid #ff1744', color: '#ff5252', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
                                >
                                  🗑️
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={notifSaving === masterKey}
                                onClick={() => toggleNotifSetting(masterKey, !isMasterOn)}
                                style={{
                                  padding: '5px 12px',
                                  borderRadius: '5px',
                                  border: isMasterOn ? '1px solid #00e676' : '1px solid #ff1744',
                                  background: isMasterOn ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255, 23, 68, 0.15)',
                                  color: isMasterOn ? '#00e676' : '#ff5252',
                                  fontWeight: 800,
                                  fontSize: '0.75rem',
                                  cursor: notifSaving === masterKey ? 'wait' : 'pointer'
                                }}
                              >
                                {isMasterOn ? '🟢 MARKET ACTIVE' : '🔴 MUTED'}
                              </button>
                            </div>
                          </div>

                          {/* 3 Streams inside Market */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {/* Signals */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: isSigOn ? 'rgba(255, 213, 79, 0.06)' : 'rgba(255,255,255,0.02)', borderRadius: '6px', border: isSigOn ? '1px solid rgba(255, 213, 79, 0.2)' : '1px solid rgba(255,255,255,0.05)' }}>
                              <div>
                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: isSigOn ? '#ffd54f' : '#777' }}>🟡 Signals (SIGNAL)</div>
                                <div style={{ fontSize: '0.68rem', color: '#666' }}>New setup alerts for {m.label}</div>
                              </div>
                              <button
                                type="button"
                                disabled={notifSaving === sigKey}
                                onClick={() => toggleNotifSetting(sigKey, !isSigOn)}
                                style={{ padding: '4px 10px', borderRadius: '4px', border: isSigOn ? '1px solid #00e676' : '1px solid #ff1744', background: isSigOn ? 'rgba(0,230,118,0.15)' : 'rgba(255,23,68,0.15)', color: isSigOn ? '#00e676' : '#ff5252', fontWeight: 800, fontSize: '0.72rem', cursor: notifSaving === sigKey ? 'wait' : 'pointer' }}
                              >
                                {isSigOn ? 'ON' : 'OFF'}
                              </button>
                            </div>

                            {/* Management */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: isManOn ? 'rgba(41, 182, 246, 0.06)' : 'rgba(255,255,255,0.02)', borderRadius: '6px', border: isManOn ? '1px solid rgba(41, 182, 246, 0.2)' : '1px solid rgba(255,255,255,0.05)' }}>
                              <div>
                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: isManOn ? '#29b6f6' : '#777' }}>🛡️ Management (MANAGE)</div>
                                <div style={{ fontSize: '0.68rem', color: '#666' }}>Invalidations, BE, TP1 &amp; TP2 for {m.label}</div>
                              </div>
                              <button
                                type="button"
                                disabled={notifSaving === manKey}
                                onClick={() => toggleNotifSetting(manKey, !isManOn)}
                                style={{ padding: '4px 10px', borderRadius: '4px', border: isManOn ? '1px solid #00e676' : '1px solid #ff1744', background: isManOn ? 'rgba(0,230,118,0.15)' : 'rgba(255,23,68,0.15)', color: isManOn ? '#00e676' : '#ff5252', fontWeight: 800, fontSize: '0.72rem', cursor: notifSaving === manKey ? 'wait' : 'pointer' }}
                              >
                                {isManOn ? 'ON' : 'OFF'}
                              </button>
                            </div>

                            {/* Status */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: isStatOn ? 'rgba(0, 230, 118, 0.06)' : 'rgba(255,255,255,0.02)', borderRadius: '6px', border: isStatOn ? '1px solid rgba(0, 230, 118, 0.2)' : '1px solid rgba(255,255,255,0.05)' }}>
                              <div>
                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: isStatOn ? '#00e676' : '#777' }}>⚡ Status Updates (STATUS)</div>
                                <div style={{ fontSize: '0.68rem', color: '#666' }}>Order Fill, Stop Loss &amp; BE exits for {m.label}</div>
                              </div>
                              <button
                                type="button"
                                disabled={notifSaving === statKey}
                                onClick={() => toggleNotifSetting(statKey, !isStatOn)}
                                style={{ padding: '4px 10px', borderRadius: '4px', border: isStatOn ? '1px solid #00e676' : '1px solid #ff1744', background: isStatOn ? 'rgba(0,230,118,0.15)' : 'rgba(255,23,68,0.15)', color: isStatOn ? '#00e676' : '#ff5252', fontWeight: 800, fontSize: '0.72rem', cursor: notifSaving === statKey ? 'wait' : 'pointer' }}
                              >
                                {isStatOn ? 'ON' : 'OFF'}
                              </button>
                            </div>
                          </div>

                          {/* Quick Market Actions */}
                          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                            <button
                              type="button"
                              onClick={() => handleBulkToggle({ market: mKey }, true)}
                              style={{ flex: 1, padding: '4px', fontSize: '0.68rem', background: 'rgba(0,230,118,0.1)', border: '1px solid rgba(0,230,118,0.3)', color: '#00e676', borderRadius: '4px', cursor: 'pointer' }}
                            >
                              Enable All {m.label}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleBulkToggle({ market: mKey }, false)}
                              style={{ flex: 1, padding: '4px', fontSize: '0.68rem', background: 'rgba(255,23,68,0.1)', border: '1px solid rgba(255,23,68,0.3)', color: '#ff5252', borderRadius: '4px', cursor: 'pointer' }}
                            >
                              Mute All {m.label}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── SECTION 3: GRANULAR ACTION EVENT TOGGLES ── */}
                <div className="super-card font-mono" style={{ borderColor: '#29b6f6', background: 'rgba(41, 182, 246, 0.04)' }}>
                  <h3 style={{ margin: '0 0 16px 0', color: '#29b6f6', fontSize: '1rem' }}>⚙️ GRANULAR ACTION EVENT TOGGLES</h3>

                  {/* Grouped Lists */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* MANAGE Group (Highlight Pre-Entry Invalidation) */}
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#29b6f6', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>🛡️</span> TRADE MANAGEMENT ACTIONS (MANAGE)
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {notifSettings
                          .filter(s => s.category === 'manage' && s.market === 'all')
                          .map(s => (
                            <div
                              key={s.key}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '12px 16px',
                                borderRadius: '8px',
                                border: s.enabled ? '1px solid rgba(41, 182, 246, 0.35)' : '1px solid rgba(255,255,255,0.08)',
                                background: s.key === 'notify_invalidation' ? (s.enabled ? 'rgba(41, 182, 246, 0.12)' : 'rgba(255,255,255,0.03)') : (s.enabled ? 'rgba(41, 182, 246, 0.06)' : 'rgba(255,255,255,0.03)'),
                                gap: '16px',
                                flexWrap: 'wrap'
                              }}
                            >
                              <div style={{ flex: 1, minWidth: '220px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontWeight: 800, color: s.enabled ? '#e0e0e0' : '#888', fontSize: '0.88rem' }}>{s.label}</span>
                                  <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '3px', background: 'rgba(41, 182, 246, 0.2)', color: '#29b6f6', fontWeight: 800 }}>MANAGE</span>
                                </div>
                                <div style={{ fontSize: '0.74rem', color: '#888', marginTop: '3px' }}>{s.description}</div>
                                <div style={{ fontSize: '0.68rem', color: '#555', marginTop: '2px', fontFamily: 'monospace' }}>{s.key}</div>
                              </div>
                              <button
                                type="button"
                                disabled={notifSaving === s.key}
                                onClick={() => toggleNotifSetting(s.key, !s.enabled)}
                                style={{
                                  padding: '6px 16px',
                                  borderRadius: '6px',
                                  border: s.enabled ? '1px solid #00e676' : '1px solid #ff1744',
                                  background: s.enabled ? 'rgba(0, 230, 118, 0.18)' : 'rgba(255, 23, 68, 0.15)',
                                  color: s.enabled ? '#00e676' : '#ff5252',
                                  fontWeight: 800,
                                  cursor: notifSaving === s.key ? 'wait' : 'pointer',
                                  fontSize: '0.78rem',
                                  minWidth: '85px'
                                }}
                              >
                                {notifSaving === s.key ? '…' : s.enabled ? '🟢 ON' : '🔴 OFF'}
                              </button>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* STATUS Group */}
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#00e676', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>⚡</span> LIFECYCLE &amp; EXECUTION STATUS UPDATES (STATUS)
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {notifSettings
                          .filter(s => s.category === 'status' && s.market === 'all')
                          .map(s => (
                            <div
                              key={s.key}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '12px 16px',
                                borderRadius: '8px',
                                border: s.enabled ? '1px solid rgba(0, 230, 118, 0.35)' : '1px solid rgba(255,255,255,0.08)',
                                background: s.enabled ? 'rgba(0, 230, 118, 0.06)' : 'rgba(255,255,255,0.03)',
                                gap: '16px',
                                flexWrap: 'wrap'
                              }}
                            >
                              <div style={{ flex: 1, minWidth: '220px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontWeight: 800, color: s.enabled ? '#e0e0e0' : '#888', fontSize: '0.88rem' }}>{s.label}</span>
                                  <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '3px', background: 'rgba(0, 230, 118, 0.2)', color: '#00e676', fontWeight: 800 }}>STATUS</span>
                                </div>
                                <div style={{ fontSize: '0.74rem', color: '#888', marginTop: '3px' }}>{s.description}</div>
                                <div style={{ fontSize: '0.68rem', color: '#555', marginTop: '2px', fontFamily: 'monospace' }}>{s.key}</div>
                              </div>
                              <button
                                type="button"
                                disabled={notifSaving === s.key}
                                onClick={() => toggleNotifSetting(s.key, !s.enabled)}
                                style={{
                                  padding: '6px 16px',
                                  borderRadius: '6px',
                                  border: s.enabled ? '1px solid #00e676' : '1px solid #ff1744',
                                  background: s.enabled ? 'rgba(0, 230, 118, 0.18)' : 'rgba(255, 23, 68, 0.15)',
                                  color: s.enabled ? '#00e676' : '#ff5252',
                                  fontWeight: 800,
                                  cursor: notifSaving === s.key ? 'wait' : 'pointer',
                                  fontSize: '0.78rem',
                                  minWidth: '85px'
                                }}
                              >
                                {notifSaving === s.key ? '…' : s.enabled ? '🟢 ON' : '🔴 OFF'}
                              </button>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* SIGNAL & REPORT Group */}
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#ffd54f', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>🟡</span> SIGNALS &amp; REPORTS
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {notifSettings
                          .filter(s => (s.category === 'signal' || s.category === 'report') && s.market === 'all')
                          .map(s => (
                            <div
                              key={s.key}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '12px 16px',
                                borderRadius: '8px',
                                border: s.enabled ? '1px solid rgba(255, 213, 79, 0.35)' : '1px solid rgba(255,255,255,0.08)',
                                background: s.enabled ? 'rgba(255, 213, 79, 0.06)' : 'rgba(255,255,255,0.03)',
                                gap: '16px',
                                flexWrap: 'wrap'
                              }}
                            >
                              <div style={{ flex: 1, minWidth: '220px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontWeight: 800, color: s.enabled ? '#e0e0e0' : '#888', fontSize: '0.88rem' }}>{s.label}</span>
                                  <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '3px', background: s.category === 'signal' ? 'rgba(255, 213, 79, 0.2)' : 'rgba(156, 39, 176, 0.2)', color: s.category === 'signal' ? '#ffd54f' : '#ce93d8', fontWeight: 800 }}>
                                    {(s.category || 'signal').toUpperCase()}
                                  </span>
                                </div>
                                <div style={{ fontSize: '0.74rem', color: '#888', marginTop: '3px' }}>{s.description}</div>
                                <div style={{ fontSize: '0.68rem', color: '#555', marginTop: '2px', fontFamily: 'monospace' }}>{s.key}</div>
                              </div>
                              <button
                                type="button"
                                disabled={notifSaving === s.key}
                                onClick={() => toggleNotifSetting(s.key, !s.enabled)}
                                style={{
                                  padding: '6px 16px',
                                  borderRadius: '6px',
                                  border: s.enabled ? '1px solid #00e676' : '1px solid #ff1744',
                                  background: s.enabled ? 'rgba(0, 230, 118, 0.18)' : 'rgba(255, 23, 68, 0.15)',
                                  color: s.enabled ? '#00e676' : '#ff5252',
                                  fontWeight: 800,
                                  cursor: notifSaving === s.key ? 'wait' : 'pointer',
                                  fontSize: '0.78rem',
                                  minWidth: '85px'
                                }}
                              >
                                {notifSaving === s.key ? '…' : s.enabled ? '🟢 ON' : '🔴 OFF'}
                              </button>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

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
          <UserManagementSystem isSuperAdmin={true} adminEmail="chadwinsolomon@gmail.com" />
        )}

        {/* TAB 5: Strategy Governance */}
        {activeTab === 'strategies' && (
          <div className="super-card font-mono">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <h2 style={{ margin: 0, color: '#00e5ff' }}>⚙️ Strategy Governance &amp; Admin Access Control</h2>
              <button
                type="button"
                className="font-mono"
                style={{ background: 'rgba(255, 171, 0, 0.15)', border: '1px solid #ffab00', color: '#ffab00', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 800, fontSize: '0.8rem' }}
                onClick={() => setActiveTab('strategy_comparison')}
              >
                ⚔️ View Strategy Success &amp; Comparison Matrix →
              </button>
            </div>
            <div className="table-responsive">
              <table className="runs-table">
                <thead>
                  <tr>
                    <th>Strategy ID &amp; Name</th>
                    <th>Engine Status</th>
                    <th>Admin Visibility</th>
                    <th>Client / Trader Visibility</th>
                    <th>Governance Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {strategiesList.map((s: any) => {
                    const stratId = s.id || s.strategyId;
                    const stratName = stratId === 'sentinel_v2' ? 'Chadwin Sentinel V2 Elite Framework (Manna Elite V1)' : (stratId === 'manna_basic' ? 'Manna Basic' : s.name);
                    const isEnabled = s.enabled !== undefined ? Boolean(s.enabled) : true;
                    return (
                      <tr key={stratId}>
                        <td>
                          <strong style={{ color: '#fff' }}>{stratName}</strong> ({stratId})
                        </td>
                        <td>
                          <span style={{ color: isEnabled ? '#00e676' : '#ff1744', fontWeight: 800 }}>
                            {isEnabled ? '⚡ ENGINE ON' : '🛑 ENGINE OFF'}
                          </span>
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
                                background: isEnabled ? 'rgba(255, 23, 68, 0.15)' : 'rgba(0, 230, 118, 0.15)',
                                border: isEnabled ? '1px solid #ff1744' : '1px solid #00e676',
                                color: isEnabled ? '#ff1744' : '#00e676',
                                padding: '4px 10px',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                              onClick={() => handleToggleStrategyEngine(stratId, isEnabled)}
                            >
                              {isEnabled ? '🛑 Turn Engine OFF' : '⚡ Turn Engine ON'}
                            </button>

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

            {/* Twin-Profile Engine Tuning Controls for Sentinel V2 */}
            <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <h3 style={{ margin: '0 0 12px 0', color: '#b388ff' }}>🎛️ MANNA ELITE V1 (SENTINEL V2) SPECIALIZED ENGINE TUNING PROFILES</h3>
              <p style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '16px' }}>
                Specialized tuning tool strictly for Manna Elite V1 (Sentinel V2). Independently dial signal volume limits (1-10) and conviction cutoffs for Super Admin vs Public (Admins &amp; Clients).
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

        {/* TAB: Strategy Analytics & LLM Export */}
        {activeTab === 'strategy_comparison' && (
          <StrategyComparisonDashboard />
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

        {/* TAB: Client Accuracy Intelligence */}
        {activeTab === 'client_accuracy' && (
          <div className="font-mono">
            {/* Header / Summary Bar */}
            <div className="super-card font-mono" style={{ borderColor: '#00e676', background: 'rgba(0, 230, 118, 0.04)', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <h2 style={{ margin: 0, color: '#00e676', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    🏷️ CLIENT SIGNAL SELECTION ACCURACY INTELLIGENCE
                  </h2>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#aaa' }}>
                    Tracking community demo-trading signal picks vs Manna's Institutional Decision Matrix.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    className="font-mono"
                    style={{
                      background: 'rgba(0, 230, 118, 0.15)',
                      border: '1px solid #00e676',
                      color: '#00e676',
                      padding: '7px 16px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: 800,
                      fontSize: '0.8rem'
                    }}
                    onClick={fetchClientAccuracy}
                    disabled={loadingClientAccuracy}
                  >
                    {loadingClientAccuracy ? '⏳ Refreshing...' : '🔄 Refresh Data'}
                  </button>
                  <a
                    href={`${API_BASE}/api/admin/analytics/export-csv`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono"
                    style={{
                      background: 'rgba(255, 171, 0, 0.15)',
                      border: '1px solid #ffab00',
                      color: '#ffab00',
                      padding: '7px 16px',
                      borderRadius: '6px',
                      textDecoration: 'none',
                      fontWeight: 800,
                      fontSize: '0.8rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    📥 Download CSV Analytics
                  </a>
                </div>
              </div>
            </div>

            {/* KPI Cards Grid */}
            <div className="stat-grid-4 font-mono" style={{ marginBottom: '20px' }}>
              <div className="stat-box" style={{ borderColor: '#00e5ff', background: 'rgba(0, 229, 255, 0.05)' }}>
                <div className="stat-box-title">🏷️ Total Signals Tagged</div>
                <div className="stat-box-value" style={{ color: '#00e5ff' }}>{clientAccuracy?.totalTags || 0}</div>
                <div style={{ fontSize: '0.72rem', color: '#888', marginTop: '4px' }}>
                  {clientAccuracy?.uniqueTaggers || 0} Unique Traders
                </div>
              </div>

              <div className="stat-box" style={{ borderColor: '#00e676', background: 'rgba(0, 230, 118, 0.05)' }}>
                <div className="stat-box-title">🎯 Client Win Rate</div>
                <div className="stat-box-value" style={{ color: '#00e676' }}>
                  {clientAccuracy?.clientWinRate !== undefined ? `${clientAccuracy.clientWinRate}%` : '0%'}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#888', marginTop: '4px' }}>
                  {clientAccuracy?.clientWins || 0} Wins / {clientAccuracy?.resolvedCount || 0} Resolved
                </div>
              </div>

              <div className="stat-box" style={{ borderColor: '#ce93d8', background: 'rgba(156, 39, 176, 0.05)' }}>
                <div className="stat-box-title">📊 System Win Rate</div>
                <div className="stat-box-value" style={{ color: '#ce93d8' }}>
                  {clientAccuracy?.systemWinRate !== undefined ? `${clientAccuracy.systemWinRate}%` : '0%'}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#888', marginTop: '4px' }}>
                  Decision Matrix Baseline
                </div>
              </div>

              <div className="stat-box" style={{ borderColor: (clientAccuracy?.edgeDelta || 0) >= 0 ? '#00e676' : '#ffab00', background: 'rgba(255, 171, 0, 0.05)' }}>
                <div className="stat-box-title">⚡ Client Edge Delta</div>
                <div className="stat-box-value" style={{ color: (clientAccuracy?.edgeDelta || 0) >= 0 ? '#00e676' : '#ffab00' }}>
                  {clientAccuracy?.edgeDelta !== undefined ? `${clientAccuracy.edgeDelta >= 0 ? '+' : ''}${clientAccuracy.edgeDelta}%` : '0.0%'}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#888', marginTop: '4px' }}>
                  Client Alpha vs Matrix
                </div>
              </div>
            </div>

            {/* Breakdown Section: Instruments & Strategies */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '20px' }}>
              <div className="super-card font-mono" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                <h3 style={{ margin: '0 0 12px 0', color: '#00e5ff', fontSize: '0.95rem' }}>📈 Most Tagged Instruments</h3>
                {(!clientAccuracy?.topInstruments || clientAccuracy.topInstruments.length === 0) ? (
                  <div style={{ color: '#888', fontSize: '0.8rem', padding: '12px 0' }}>No signals tagged yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {clientAccuracy.topInstruments.map(([sym, count]: [string, number]) => (
                      <div key={sym} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <span style={{ fontWeight: 800, color: '#ffd700' }}>{sym}</span>
                        <span className="market-tag font-mono" style={{ background: 'rgba(0, 229, 255, 0.15)', color: '#00e5ff' }}>{count} tags</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="super-card font-mono" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                <h3 style={{ margin: '0 0 12px 0', color: '#ce93d8', fontSize: '0.95rem' }}>⚙️ Strategy Selection Distribution</h3>
                {(!clientAccuracy?.topStrategies || clientAccuracy.topStrategies.length === 0) ? (
                  <div style={{ color: '#888', fontSize: '0.8rem', padding: '12px 0' }}>No strategy tags recorded.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {clientAccuracy.topStrategies.map(([strat, count]: [string, number]) => (
                      <div key={strat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <span style={{ fontWeight: 700, color: '#fff' }}>{strat === 'manna_snd' ? 'Manna SnD' : 'Sentinel V2'}</span>
                        <span className="market-tag font-mono" style={{ background: 'rgba(156, 39, 176, 0.2)', color: '#ce93d8' }}>{count} tags</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Trader Accuracy Leaderboard */}
            <div className="super-card font-mono" style={{ marginBottom: '20px' }}>
              <h3 style={{ margin: '0 0 14px 0', color: '#ffab00', fontSize: '1rem' }}>
                🏆 Trader Selection Accuracy Leaderboard
              </h3>
              {(!clientAccuracy?.perUserStats || clientAccuracy.perUserStats.length === 0) ? (
                <div style={{ color: '#888', fontSize: '0.82rem', padding: '16px 0' }}>
                  No trader tags recorded yet. As clients tag signals on their dashboard, their accuracy will appear here.
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="runs-table">
                    <thead>
                      <tr>
                        <th>Trader Email</th>
                        <th>Total Tags</th>
                        <th>Wins</th>
                        <th>Losses</th>
                        <th>Win Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientAccuracy.perUserStats.map((u: any, idx: number) => (
                        <tr key={idx}>
                          <td style={{ color: '#fff', fontWeight: 700 }}>{u.email}</td>
                          <td style={{ color: '#00e5ff' }}>{u.tags}</td>
                          <td style={{ color: '#00e676' }}>{u.wins}</td>
                          <td style={{ color: '#ff1744' }}>{u.losses}</td>
                          <td>
                            {u.winRate !== null ? (
                              <span style={{ fontWeight: 800, color: u.winRate >= 60 ? '#00e676' : u.winRate >= 50 ? '#ffab00' : '#ff1744' }}>
                                {u.winRate}%
                              </span>
                            ) : (
                              <span style={{ color: '#888' }}>Pending</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Recent Tags Feed */}
            <div className="super-card font-mono">
              <h3 style={{ margin: '0 0 14px 0', color: '#00e676', fontSize: '1rem' }}>
                📡 Live Community Signal Tags Feed
              </h3>
              {(!clientAccuracy?.recentTags || clientAccuracy.recentTags.length === 0) ? (
                <div style={{ color: '#888', fontSize: '0.82rem', padding: '16px 0' }}>
                  No tagged signals yet.
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="runs-table">
                    <thead>
                      <tr>
                        <th>Tagged At</th>
                        <th>Trader</th>
                        <th>Instrument</th>
                        <th>Bias</th>
                        <th>Conviction</th>
                        <th>Outcome</th>
                        <th>Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientAccuracy.recentTags.map((t: any) => (
                        <tr key={t.id}>
                          <td style={{ fontSize: '0.78rem', color: '#888' }}>
                            {t.tagged_at ? new Date(t.tagged_at).toLocaleString() : '-'}
                          </td>
                          <td style={{ color: '#aaa', fontSize: '0.82rem' }}>{t.user_email}</td>
                          <td style={{ color: '#ffd700', fontWeight: 800 }}>{t.instrument}</td>
                          <td>
                            <span style={{ color: (t.bias || '').toLowerCase() === 'long' ? '#00e676' : '#ff1744', fontWeight: 700 }}>
                              {(t.bias || 'LONG').toUpperCase()}
                            </span>
                          </td>
                          <td style={{ color: '#00e5ff' }}>{t.conviction_score ? `${t.conviction_score}%` : '-'}</td>
                          <td>
                            <span className="market-tag font-mono" style={{ background: t.outcome_type ? 'rgba(255,255,255,0.08)' : 'rgba(255, 171, 0, 0.1)', color: t.outcome_type ? '#fff' : '#ffab00' }}>
                              {t.outcome_type ? t.outcome_type.toUpperCase() : '⏳ PENDING'}
                            </span>
                          </td>
                          <td>
                            {t.outcome_type ? (
                              <span style={{ fontWeight: 800, color: t.was_correct === 1 ? '#00e676' : '#ff1744' }}>
                                {t.was_correct === 1 ? '✅ WIN' : '❌ LOSS'}
                              </span>
                            ) : (
                              <span style={{ color: '#666' }}>—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
