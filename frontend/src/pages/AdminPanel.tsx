import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './AdminPanel.css';
import { MetricsPanel } from '../components/MetricsPanel';
import { useAdmin, usePublishRuns, useSystemStatus, useStrategies } from '../hooks/useAdmin';
import { useAnalytics } from '../hooks/useAnalytics';
import { useSetups } from '../hooks/useSetups';
import { useAuth } from '../context/AuthContext';
import { formatETTime } from '../utils/time';
import { API_BASE } from '../config';
import { SignalReplaceModal } from '../components/SignalReplaceModal';
import { AdminSupportInbox } from '../components/AdminSupportInbox';

export const AdminPanel: React.FC = () => {
  const { user, originalAdmin, logout, impersonateUser, isImpersonating, stopImpersonating } = useAuth();
  const navigate = useNavigate();
  const { triggerRun, disableSignal } = useAdmin();
  const { runs } = usePublishRuns(15);
  const { resetCircuitBreaker, status } = useSystemStatus();
  const { strategies: dbStrategies, toggleStrategy } = useStrategies();
  const { setups: activeSetupsList, refetch: refetchActiveSetups } = useSetups();

  const [usersList, setUsersList] = useState<any[]>([]);
  const [holdingList, setHoldingList] = useState<any[]>([]);
  const [userSubTab, setUserSubTab] = useState<'active' | 'holding'>('active');
  const [selectedUserProfile, setSelectedUserProfile] = useState<any | null>(null);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/users`);
      const data = await res.json();
      if (data.users) setUsersList(data.users);
    } catch {}
  };

  const fetchHoldingUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/holding`);
      const data = await res.json();
      if (data.holding) setHoldingList(data.holding);
    } catch {}
  };

  useEffect(() => {
    fetchUsers();
    fetchHoldingUsers();
  }, []);

  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserTier, setNewUserTier] = useState<'free' | 'forex_only' | 'futures_forex'>('free');
  const [newPrefMarket, setNewPrefMarket] = useState<'Futures' | 'Forex' | 'Both'>('Both');
  const [newRiskLimit, setNewRiskLimit] = useState<'1%' | '2%' | '5%'>('1%');

  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [bulkCsvText, setBulkCsvText] = useState('');
  const [isTrialImport, setIsTrialImport] = useState(true);

  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkCsvText.trim()) {
      alert('Please paste CSV or lines of users to import.');
      return;
    }

    const lines = bulkCsvText.split('\n').map(l => l.trim()).filter(Boolean);
    const rawUsers: Array<{ name: string; email: string; tier?: 'free' | 'forex_only' | 'futures_forex' }> = [];

    for (const line of lines) {
      if (line.toLowerCase().startsWith('name,') || line.toLowerCase().startsWith('email,')) continue;
      const parts = line.split(',').map(p => p.trim());
      if (parts.length >= 2) {
        let name = parts[0];
        let email = parts[1];
        let tier: 'free' | 'forex_only' | 'futures_forex' = 'futures_forex';

        if (!name.includes('@') && email.includes('@')) {
          // Name, Email, Tier
        } else if (name.includes('@')) {
          const temp = name;
          name = email || temp.split('@')[0];
          email = temp;
        }

        if (parts[2]) {
          const t = parts[2].toLowerCase();
          if (t.includes('free')) tier = 'free';
          else if (t.includes('forex')) tier = 'forex_only';
        }

        rawUsers.push({ name, email, tier });
      }
    }

    if (rawUsers.length === 0) {
      alert('Could not parse any valid users. Format: Name, Email, Tier');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/admin/users/bulk-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawUsers, isTrial: isTrialImport })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to bulk import users');

      if (data.users) setUsersList(data.users);
      setShowBulkImportModal(false);
      setBulkCsvText('');
      alert(`✅ Preloaded ${data.importedCount} user accounts ${isTrialImport ? 'with 21-Day VIP Trial Passes' : ''}! All users will be forced to set their password on first sign-in.`);
    } catch (err: any) {
      alert(`⚠️ ${err.message}`);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName || !newUserEmail) {
      alert('Please provide display name and email');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newUserName, email: newUserEmail, tier: newUserTier, preferredMarket: newPrefMarket, riskLimit: newRiskLimit })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user');
      
      if (data.users) setUsersList(data.users);
      setShowAddUserModal(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserTier('free');
      alert(`✅ Account for "${newUserName}" created successfully!`);
    } catch (err: any) {
      alert(`⚠️ ${err.message}`);
    }
  };

  const handleSoftDeleteUser = async (userId: string, userName: string) => {
    const confirmed = window.confirm(`⚠️ SOFT-DELETE USER CONFIRMATION:\n\nAre you sure you want to delete ${userName}?\n\nThe user will be moved to the 30-Day Holding Zone / Recycle Bin before permanent deletion.\n\nNote: A new user with the SAME details can be created immediately in the meantime!`);
    if (!confirmed) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete user');
      if (data.users) setUsersList(data.users);
      if (data.holding) setHoldingList(data.holding);
      alert(`🗑️ Account for "${userName}" moved to 30-Day Holding Zone.`);
    } catch (err: any) {
      alert(`⚠️ ${err.message}`);
    }
  };

  const handleRestoreUser = async (userId: string, userName: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${userId}/restore`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to restore user');
      if (data.users) setUsersList(data.users);
      if (data.holding) setHoldingList(data.holding);
      alert(`♻️ Account for "${userName}" restored to Active Users!`);
    } catch (err: any) {
      alert(`⚠️ ${err.message}`);
    }
  };

  const handleAdminChangePassword = async (targetId: string, targetName: string, targetRole: string) => {
    if ((targetRole === 'admin' || targetRole === 'super_admin') && user?.role !== 'super_admin' && user?.email !== targetId) {
      alert('⛔ PERMISSION DENIED:\n\nRegular Admins CANNOT change another Admin account password.\nOnly Super Admin or the Admin themselves can change an Admin password.');
      return;
    }
    const newPass = window.prompt(`🔑 Enter NEW password for "${targetName}":`);
    if (!newPass) return;
    if (newPass.length < 4) {
      alert('⚠️ Password must be at least 4 characters long.');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${targetId}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newPassword: newPass,
          requesterRole: user?.role || 'admin',
          requesterEmail: user?.email
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update password');
      alert(`✅ Password for "${targetName}" updated successfully!`);
    } catch (err: any) {
      alert(`⚠️ ${err.message}`);
    }
  };

  const handleUpdateTier = async (userId: string, tier: 'free' | 'forex_only' | 'futures_forex') => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${userId}/tier`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update tier');
      if (data.users) setUsersList(data.users);
    } catch (err: any) {
      alert(`⚠️ ${err.message}`);
    }
  };

  const handleImpersonateUser = (u: any) => {
    impersonateUser({
      id: u.id,
      name: u.name,
      email: u.email,
      role: 'trader',
      tier: u.tier,
      marketAccess: u.marketAccess
    });
    navigate('/dashboard');
  };

  const [rescanCandidate, setRescanCandidate] = useState<any | null>(null);
  const [rescanCurrentSetup, setRescanCurrentSetup] = useState<any | null>(null);
  const [rescanningId, setRescanningId] = useState<string | null>(null);

  const [confirmDeleteSignals, setConfirmDeleteSignals] = useState(false);
  const [deleteSignalsScope, setDeleteSignalsScope] = useState<'all' | 'pending_only'>('all');
  const [isDeletingSignals, setIsDeletingSignals] = useState(false);

  const handleDeleteAllSignals = async () => {
    if (!confirmDeleteSignals) {
      alert('⚠️ Please check the confirmation checkbox first.');
      return;
    }

    const scopeText = deleteSignalsScope === 'all' 
      ? 'PERMANENTLY DELETE ALL SIGNALS & HISTORICAL RECORDS' 
      : 'DELETE ALL ACTIVE & PENDING SIGNALS';

    if (!window.confirm(`⚠️ CONFIRM DELETION:\n\nAre you sure you want to ${scopeText}?\n\nThis action cannot be undone.`)) {
      return;
    }

    try {
      setIsDeletingSignals(true);
      const res = await fetch(`${API_BASE}/api/admin/signals/delete-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmAll: true,
          scope: deleteSignalsScope
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete signals');

      alert(`✅ ${data.message}`);
      setConfirmDeleteSignals(false);
      refetchActiveSetups();
      if (typeof refetchAnalytics === 'function') refetchAnalytics();
    } catch (err: any) {
      alert(`⚠️ ${err.message || 'Deletion failed'}`);
    } finally {
      setIsDeletingSignals(false);
    }
  };

  const handleAdminSingleRescan = async (setup: any) => {
    try {
      setRescanningId(setup.id);
      const res = await fetch(`${API_BASE}/api/admin/single-asset-rescan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setupId: setup.id,
          instrument: setup.instrument,
          market: setup.market,
          strategy_id: setup.strategy_id || (setup as any).strategyId || 'manna_basic'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rescan failed');

      if (data.found && data.candidate) {
        setRescanCurrentSetup(setup);
        setRescanCandidate(data.candidate);
      } else {
        alert(data.message || `No new candidate setup discovered for ${setup.instrument}.`);
      }
    } catch (err: any) {
      alert(`⚠️ ${err.message || 'Rescan failed'}`);
    } finally {
      setRescanningId(null);
    }
  };

  const [adminTab, setAdminTab] = useState<'users' | 'engine' | 'analytics' | 'history' | 'support'>('users');
  const [supportUnreadCount, _setSupportUnreadCount] = useState(0);
  const [strategyFilter, setStrategyFilter] = useState<'all' | 'manna_basic' | 'manna_snd' | 'sentinel_v2'>('all');
  const { analytics, refetch: refetchAnalytics } = useAnalytics(strategyFilter);

  const handleDeleteArchive = async (archiveId: string, archiveName: string) => {
    if (!window.confirm(`⚠️ Are you sure you want to PERMANENTLY DELETE archive dataset '${archiveName}' (${archiveId})?\n\nThis action cannot be undone.`)) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/admin/analytics/archives/${archiveId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete archive');
      alert(`✅ ${data.message}`);
      refetchAnalytics();
    } catch (err: any) {
      alert(`⚠️ ${err.message || 'Deletion failed'}`);
    }
  };

  // Performance Reports Approval Pipeline State
  const [perfReports, setPerfReports] = useState<any[]>([]);
  const [reportTab, setReportTab] = useState<'drafts' | 'published' | 'recalled'>('drafts');
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [isReportActionLoading, setIsReportActionLoading] = useState(false);
  const [selectedReportSession, setSelectedReportSession] = useState<'asia' | 'london' | 'ny_am' | 'ny_pm' | 'all'>('asia');

  const fetchPerfReports = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/performance-reports`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.reports) setPerfReports(data.reports);
    } catch {}
  }, []);

  useEffect(() => {
    fetchPerfReports();
  }, [fetchPerfReports]);

  const handleGenerateReport = async (periodType: 'daily' | 'weekly' | 'monthly' | 'session', sessionName?: string) => {
    try {
      setIsReportActionLoading(true);
      const res = await fetch(`${API_BASE}/api/admin/performance-reports/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodType, sessionName: periodType === 'session' ? (sessionName || selectedReportSession) : undefined })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate report');
      alert(`✅ ${data.message}`);
      fetchPerfReports();
    } catch (err: any) {
      alert(`⚠️ ${err.message || 'Report generation failed'}`);
    } finally {
      setIsReportActionLoading(false);
    }
  };

  const [systemHealth, setSystemHealth] = useState<any | null>(null);
  const [isHealthChecking, setIsHealthChecking] = useState(false);

  const fetchSystemHealth = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/system-health`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.health) setSystemHealth(data.health);
    } catch {}
  }, []);

  const handleRunManualHealthCheck = async () => {
    try {
      setIsHealthChecking(true);
      const res = await fetch(`${API_BASE}/api/admin/system-health/run-check`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Health check failed');
      if (data.health) setSystemHealth(data.health);
    } catch (err: any) {
      alert(`⚠️ ${err.message || 'Health check failed'}`);
    } finally {
      setIsHealthChecking(false);
    }
  };

  useEffect(() => {
    fetchSystemHealth();
    const interval = setInterval(fetchSystemHealth, 60000);
    return () => clearInterval(interval);
  }, [fetchSystemHealth]);

  const handleApproveReport = async (reportId: string, notes: string) => {
    try {
      setIsReportActionLoading(true);
      const res = await fetch(`${API_BASE}/api/admin/performance-reports/${reportId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminNotes: notes, publishedBy: user?.name || 'Admin', publishedByEmail: user?.email || '' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to approve report');
      alert(`🚀 ${data.message}`);
      fetchPerfReports();
    } catch (err: any) {
      alert(`⚠️ ${err.message || 'Report approval failed'}`);
    } finally {
      setIsReportActionLoading(false);
    }
  };

  const handleRecallReport = async (reportId: string) => {
    if (!window.confirm('⚠️ RECALL REPORT:\n\nAre you sure you want to RECALL this published report? It will be hidden from traders\' mailboxes until resent.')) {
      return;
    }
    try {
      setIsReportActionLoading(true);
      const res = await fetch(`${API_BASE}/api/admin/performance-reports/${reportId}/recall`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to recall report');
      alert(`🛡️ ${data.message}`);
      fetchPerfReports();
    } catch (err: any) {
      alert(`⚠️ ${err.message || 'Recall failed'}`);
    } finally {
      setIsReportActionLoading(false);
    }
  };

  const handleSaveReportNotes = async (reportId: string, notes: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/performance-reports/${reportId}/update-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminNotes: notes })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save notes');
      alert('💾 Admin notes saved!');
      fetchPerfReports();
    } catch (err: any) {
      alert(`⚠️ ${err.message || 'Failed to save notes'}`);
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    if (!window.confirm('⚠️ Are you sure you want to delete this performance report?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/performance-reports/${reportId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete report');
      alert('🗑️ Report deleted.');
      fetchPerfReports();
    } catch (err: any) {
      alert(`⚠️ ${err.message || 'Failed to delete report'}`);
    }
  };
  
  const [mode, setMode] = useState<'live' | 'dry_run'>('live');
  const [market, setMarket] = useState<'FUTURES' | 'FOREX' | 'ALL'>('ALL');
  const [isTriggering, setIsTriggering] = useState(false);
  const [disablingId, setDisablingId] = useState<string | null>(null);

  // Reset & Archive state
  const [showResetModal, setShowResetModal] = useState(false);
  const [archiveName, setArchiveName] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [archives, setArchives] = useState<any[]>([]);

  const [outcomesPage, setOutcomesPage] = useState(1);
  const OUTCOMES_PER_PAGE = 10;

  const fetchArchives = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/analytics/archives`);
      if (res.ok) {
        const data = await res.json();
        setArchives(data.archives || []);
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    fetchArchives();
  }, []);

  const [triggerStrategy, setTriggerStrategy] = useState<'all' | 'manna_basic' | 'manna_snd' | 'sentinel_v2'>('all');

  const handleTrigger = async () => {
    setIsTriggering(true);
    await triggerRun(mode, market, triggerStrategy);
    setTimeout(() => {
      setIsTriggering(false);
      refetchActiveSetups();
      refetchAnalytics();
    }, 1000);
  };

  const handleToggleStrategy = async (strategyId: string, currentEnabled: boolean) => {
    const success = await toggleStrategy(strategyId, !currentEnabled);
    if (success) {
      refetchAnalytics();
    }
  };

  const handleDisableSignal = async (signalId: string, signalMarket?: string) => {
    setDisablingId(signalId);
    try {
      const m = signalMarket ? signalMarket.toLowerCase() : 'futures';
      const success = await disableSignal(signalId, m);
      if (success) {
        await refetchActiveSetups();
        await refetchAnalytics();
      }
    } finally {
      setDisablingId(null);
    }
  };

  const isSuperAdmin = user?.role === 'super_admin' || originalAdmin?.role === 'super_admin';

  const [showCsvExportModal, setShowCsvExportModal] = useState(false);

  const handleExportLiveCSV = () => {
    if (!isSuperAdmin) {
      alert('🔒 Access Restricted: Trade Analytics CSV Exports are available to Super Admins only.');
      return;
    }
    setShowCsvExportModal(true);
  };

  const executeCsvExport = (audience: 'public' | 'super_admin' | 'all') => {
    const params = new URLSearchParams();
    if (strategyFilter && strategyFilter !== 'all') params.append('strategy_id', strategyFilter);
    params.append('user_role', 'super_admin');
    if (user?.email) params.append('user_email', user.email);
    params.append('audience', audience);

    const url = `${API_BASE}/api/admin/analytics/export-csv?${params.toString()}`;
    window.open(url, '_blank');
    setShowCsvExportModal(false);
  };

  const handleResetAnalytics = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) {
      alert('🔒 Access Restricted: Resetting analytics and generating CSV archives is restricted to Super Admins.');
      return;
    }
    setIsResetting(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/analytics/reset`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-User-Role': 'super_admin',
          'X-User-Email': user?.email || ''
        },
        body: JSON.stringify({ archiveName: archiveName || `Archive Epoch (${new Date().toLocaleDateString()})` })
      });
      if (res.ok) {
        const data = await res.json();
        window.open(`${API_BASE}/api/admin/analytics/archives/${data.archiveId}/download?user_role=super_admin&user_email=${encodeURIComponent(user?.email || '')}`, '_blank');
        setShowResetModal(false);
        setArchiveName('');
        await refetchAnalytics();
        await fetchArchives();
        await refetchActiveSetups();
      }
    } catch (err) {
      alert('Failed to reset analytics: ' + err);
    } finally {
      setIsResetting(false);
    }
  };

  const summary = analytics?.summary;
  const strategies = analytics?.strategies || [];
  const killzones = analytics?.killzones;
  const recentOutcomes = analytics?.recentOutcomes || [];
  const convictionPerformance = analytics?.convictionPerformance;
  const totalOutcomePages = Math.ceil(recentOutcomes.length / OUTCOMES_PER_PAGE) || 1;
  const paginatedOutcomes = recentOutcomes.slice((outcomesPage - 1) * OUTCOMES_PER_PAGE, outcomesPage * OUTCOMES_PER_PAGE);
  const lastScheduled = analytics?.lastScheduledScan;
  const triggers = analytics?.triggers;

  return (
    <div className="admin-panel">
      <header className="admin-header glass-card">
        <div className="container header-container">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Link to="/" className="back-btn">← Back to Dashboard</Link>
            <h1 className="admin-title">Manna Edge Markets — Strategy & Performance Admin Desk</h1>
          </div>
          <div className="admin-user-profile font-mono" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="user-badge" style={{ background: 'rgba(255, 171, 0, 0.2)', border: '1px solid #ffab00', color: '#ffab00', padding: '4px 10px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 800 }}>
              ⚙️ ADMIN: {user?.name || 'System Admin'}
            </span>
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

      <main className="container admin-main">
        {/* Admin Section Tabs Navigation */}
        <div className="admin-nav-tabs glass-card font-mono" style={{ display: 'flex', gap: '8px', padding: '10px 14px', marginBottom: '24px', background: 'var(--kdt-purple-card)', border: '1px solid var(--kdt-purple-border)', borderRadius: '10px', overflowX: 'auto' }}>
          <button
            type="button"
            className={`admin-tab-btn ${adminTab === 'users' ? 'active' : ''}`}
            style={{
              padding: '10px 18px',
              borderRadius: '6px',
              border: adminTab === 'users' ? '1px solid #ffab00' : '1px solid rgba(255, 255, 255, 0.1)',
              background: adminTab === 'users' ? 'rgba(255, 171, 0, 0.18)' : 'transparent',
              color: adminTab === 'users' ? '#ffab00' : '#ccc',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: '0.88rem'
            }}
            onClick={() => setAdminTab('users')}
          >
            👤 User Accounts ({usersList.length})
          </button>

          <button
            type="button"
            className={`admin-tab-btn ${adminTab === 'engine' ? 'active' : ''}`}
            style={{
              padding: '10px 18px',
              borderRadius: '6px',
              border: adminTab === 'engine' ? '1px solid #00e5ff' : '1px solid rgba(255, 255, 255, 0.1)',
              background: adminTab === 'engine' ? 'rgba(0, 229, 255, 0.18)' : 'transparent',
              color: adminTab === 'engine' ? '#00e5ff' : '#ccc',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: '0.88rem'
            }}
            onClick={() => setAdminTab('engine')}
          >
            ⚡ Strategy Engine &amp; Manual Scans
          </button>

          <button
            type="button"
            className={`admin-tab-btn ${adminTab === 'analytics' ? 'active' : ''}`}
            style={{
              padding: '10px 18px',
              borderRadius: '6px',
              border: adminTab === 'analytics' ? '1px solid #e056fd' : '1px solid rgba(255, 255, 255, 0.1)',
              background: adminTab === 'analytics' ? 'rgba(224, 86, 253, 0.18)' : 'transparent',
              color: adminTab === 'analytics' ? '#e056fd' : '#ccc',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: '0.88rem'
            }}
            onClick={() => setAdminTab('analytics')}
          >
            🎯 Conviction &amp; Outcomes ({recentOutcomes.length})
          </button>

          <button
            type="button"
            className={`admin-tab-btn ${adminTab === 'history' ? 'active' : ''}`}
            style={{
              padding: '10px 18px',
              borderRadius: '6px',
              border: adminTab === 'history' ? '1px solid #00e676' : '1px solid rgba(255, 255, 255, 0.1)',
              background: adminTab === 'history' ? 'rgba(0, 230, 118, 0.18)' : 'transparent',
              color: adminTab === 'history' ? '#00e676' : '#ccc',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: '0.88rem'
            }}
            onClick={() => setAdminTab('history')}
          >
            📜 Run History &amp; Audits ({runs.length})
          </button>

          <button
            type="button"
            className={`admin-tab-btn ${adminTab === 'support' ? 'active' : ''}`}
            style={{
              padding: '10px 18px',
              borderRadius: '6px',
              border: adminTab === 'support' ? '1px solid #ffd700' : '1px solid rgba(255, 255, 255, 0.1)',
              background: adminTab === 'support' ? 'rgba(255,215,0,0.18)' : 'transparent',
              color: adminTab === 'support' ? '#ffd700' : '#ccc',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: '0.88rem',
              position: 'relative'
            }}
            onClick={() => setAdminTab('support')}
          >
            🎫 Support Centre
            {supportUnreadCount > 0 && (
              <span style={{
                position: 'absolute', top: -6, right: -6,
                background: '#ff3b3b', color: '#fff',
                fontSize: '0.6rem', fontWeight: 900,
                minWidth: 16, height: 16, borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 3px'
              }}>{supportUnreadCount}</span>
            )}
          </button>
        </div>

        {/* AUTOMATED SYSTEM HEALTH DIAGNOSTICS CARD */}
        <div className="glass-card font-mono" style={{ padding: '18px', marginBottom: '24px', borderRadius: '10px', background: 'rgba(0, 230, 118, 0.04)', border: '1px solid rgba(0, 230, 118, 0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 900, color: systemHealth?.heroStatus === 'critical' ? '#ff1744' : systemHealth?.heroStatus === 'warning' ? '#ffd700' : '#00e676', margin: 0 }}>
                🏥 AUTOMATED SYSTEM HEALTH OVERVIEW
              </h2>
              <span style={{ fontSize: '0.78rem', color: '#aaa' }}>
                Auto-diagnostics run every 15 minutes. Last checked: {systemHealth?.lastCheckedAt ? new Date(systemHealth.lastCheckedAt).toLocaleTimeString('en-US', { timeZone: 'America/New_York' }) + ' ET' : 'Just now'}
              </span>
            </div>
            <button
              type="button"
              className="font-mono"
              onClick={handleRunManualHealthCheck}
              disabled={isHealthChecking}
              style={{ background: 'rgba(0, 229, 255, 0.15)', border: '1px solid #00e5ff', color: '#00e5ff', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 800 }}
            >
              {isHealthChecking ? '⏳ Checking...' : '⚡ Run Diagnostic Check Now'}
            </button>
          </div>

          {/* Hero Status Banner */}
          <div style={{ background: systemHealth?.heroStatus === 'critical' ? 'rgba(255, 23, 68, 0.15)' : systemHealth?.heroStatus === 'warning' ? 'rgba(255, 215, 0, 0.15)' : 'rgba(0, 230, 118, 0.15)', borderLeft: `4px solid ${systemHealth?.heroStatus === 'critical' ? '#ff1744' : systemHealth?.heroStatus === 'warning' ? '#ffd700' : '#00e676'}`, padding: '10px 14px', borderRadius: '6px', marginBottom: '14px' }}>
            <strong style={{ fontSize: '0.9rem', color: systemHealth?.heroStatus === 'critical' ? '#ff1744' : systemHealth?.heroStatus === 'warning' ? '#ffd700' : '#00e676' }}>
              {systemHealth?.heroBadgeText || '🟢 ALL SYSTEMS GO! Everything is running smoothly and trade signals are active.'}
            </strong>
            <div style={{ fontSize: '0.82rem', color: '#e2e8f0', marginTop: '4px' }}>
              {systemHealth?.simpleSummary || 'All 5 core engine subsystems (Database, Live Prices, Session Scheduler, Live Feed Stream, and Support Inbox) are 100% healthy.'}
            </div>
          </div>

          {/* Subsystem Health Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
            {(systemHealth?.subsystems || []).map((sub: any) => (
              <div key={sub.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#fff' }}>
                    {sub.icon} {sub.name}
                  </span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: sub.status === 'healthy' ? '#00e676' : sub.status === 'warning' ? '#ffd700' : '#ff1744' }}>
                    {sub.status === 'healthy' ? 'OK' : sub.status.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#ccc', lineHeight: 1.3 }}>
                  {sub.plainEnglishStatus}
                </div>
                <div style={{ fontSize: '0.68rem', color: '#666', marginTop: '4px' }}>
                  Latency: {sub.latencyMs}ms
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* TAB 1: User Impersonation & Account Management Desk */}
        {adminTab === 'users' && (
          <div className="admin-strategy-toggles-container glass-card font-mono" style={{ padding: '20px', marginBottom: '24px', borderRadius: '10px', background: 'rgba(255, 171, 0, 0.05)', border: '1px solid rgba(255, 171, 0, 0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 className="section-title" style={{ fontSize: '1.1rem', fontWeight: 900, color: '#ffab00', margin: 0 }}>
                  👤 USER ACCOUNTS &amp; IMPERSONATION DESK
                </h2>
                <span style={{ fontSize: '0.8rem', color: '#e2e8f0' }}>
                  Manage custom trader profiles, adjust subscription tiers, or impersonate trader accounts to troubleshoot issues.
                </span>
              </div>

              <button
                type="button"
                className="font-mono"
                style={{
                  background: 'rgba(0, 229, 255, 0.15)',
                  border: '1px solid #00e5ff',
                  color: '#00e5ff',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
                onClick={() => setShowAddUserModal(!showAddUserModal)}
              >
                {showAddUserModal ? '✖️ Close Form' : '➕ Add Trader Account'}
              </button>

              <button
                type="button"
                className="font-mono"
                style={{
                  background: 'rgba(224, 86, 253, 0.15)',
                  border: '1px solid #e056fd',
                  color: '#e056fd',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
                onClick={() => setShowBulkImportModal(!showBulkImportModal)}
              >
                {showBulkImportModal ? '✖️ Close Import' : '📥 Bulk Preload Users (CSV)'}
              </button>
            </div>

          {showBulkImportModal && (
            <form onSubmit={handleBulkImport} style={{ background: 'rgba(224, 86, 253, 0.05)', border: '1px solid rgba(224, 86, 253, 0.3)', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '0.95rem', color: '#e056fd' }}>📥 Bulk Preload User Accounts (From Other Site)</h3>
              <p style={{ fontSize: '0.8rem', color: '#ccc', margin: '0 0 12px 0' }}>
                Paste CSV or line-separated user records. Preloaded users can log in using their email and set up their personal password on first sign-in.
              </p>
              <textarea
                rows={5}
                placeholder={`Name, Email, Access Tier\nJohn Doe, john@example.com, futures_forex\nSarah Jenkins, sarah@example.com, forex_only\nAlex Smith, alex@example.com, free`}
                value={bulkCsvText}
                onChange={e => setBulkCsvText(e.target.value)}
                style={{ width: '100%', padding: '10px', background: '#090314', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: '6px', fontSize: '0.82rem', fontFamily: 'monospace', marginBottom: '12px' }}
              />
              <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="trialPassCheck"
                  checked={isTrialImport}
                  onChange={e => setIsTrialImport(e.target.checked)}
                  style={{ accentColor: '#e056fd', width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="trialPassCheck" style={{ fontSize: '0.85rem', color: '#ffd700', fontWeight: 800, cursor: 'pointer' }}>
                  🎁 Issue 21-Day VIP Trial Pass (Futures &amp; Forex Access • Prompts to Pick a Plan after 21 Days)
                </label>
              </div>

              <button
                type="submit"
                className="font-mono"
                style={{ background: '#e056fd', color: '#090314', border: 'none', padding: '8px 20px', borderRadius: '4px', fontWeight: 900, cursor: 'pointer' }}
              >
                🚀 {isTrialImport ? 'Import & Issue 21-Day VIP Passes' : 'Import & Preload Accounts'}
              </button>
            </form>
          )}

          {showAddUserModal && (
            <form onSubmit={handleCreateUser} style={{ background: 'rgba(0, 229, 255, 0.05)', border: '1px solid rgba(0, 229, 255, 0.3)', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: '#00e5ff' }}>➕ Create New Trader Account</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '4px' }}>Custom Display Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. ApexTrader99"
                    value={newUserName}
                    onChange={e => setNewUserName(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 12px', background: '#090314', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: '4px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '4px' }}>Trader Email *</label>
                  <input
                    type="email"
                    placeholder="trader@domain.com"
                    value={newUserEmail}
                    onChange={e => setNewUserEmail(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 12px', background: '#090314', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: '4px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '4px' }}>Subscription Access Tier</label>
                  <select
                    value={newUserTier}
                    onChange={e => setNewUserTier(e.target.value as any)}
                    style={{ width: '100%', padding: '8px 12px', background: '#090314', border: '1px solid #00e5ff', color: '#00e5ff', borderRadius: '4px', fontWeight: 700 }}
                  >
                    <option value="free">🟢 Free Tier (2 Futures + 2 Forex)</option>
                    <option value="forex_only">🔵 Forex Only Tier (All Forex)</option>
                    <option value="futures_forex">🟡 Futures &amp; Forex Tier (All Futures + Forex)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '4px' }}>Preferred Market Focus</label>
                  <select
                    value={newPrefMarket}
                    onChange={e => setNewPrefMarket(e.target.value as any)}
                    style={{ width: '100%', padding: '8px 12px', background: '#090314', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: '4px' }}
                  >
                    <option value="Both">Both (Futures &amp; Forex)</option>
                    <option value="Futures">Futures Only</option>
                    <option value="Forex">Forex Only</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '4px' }}>Risk Preference</label>
                  <select
                    value={newRiskLimit}
                    onChange={e => setNewRiskLimit(e.target.value as any)}
                    style={{ width: '100%', padding: '8px 12px', background: '#090314', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: '4px' }}
                  >
                    <option value="1%">1% Max Risk per Trade</option>
                    <option value="2%">2% Max Risk per Trade</option>
                    <option value="5%">5% Max Risk per Trade</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="font-mono"
                style={{ background: '#00e5ff', color: '#090314', border: 'none', padding: '8px 20px', borderRadius: '4px', fontWeight: 900, cursor: 'pointer' }}
              >
                Create Trader Account
              </button>
            </form>
          )}

          {isImpersonating && (
            <div style={{ background: 'rgba(255, 171, 0, 0.15)', border: '1px solid #ffab00', padding: '12px 16px', borderRadius: '6px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                🥸 Currently impersonating <strong>{user?.name}</strong> ({user?.email}).
              </span>
              <button 
                className="btn-cancel font-mono" 
                style={{ background: '#090314', color: '#ffab00', border: '1px solid #ffab00', padding: '6px 12px', cursor: 'pointer', fontWeight: 800, borderRadius: '4px' }}
                onClick={stopImpersonating}
              >
                ⏹ Exit Impersonation
              </button>
            </div>
          )}

          {/* Sub-tab navigation for Active Users vs 30-Day Holding Zone */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
            <button
              type="button"
              className="font-mono"
              style={{
                padding: '6px 14px',
                borderRadius: '4px',
                border: userSubTab === 'active' ? '1px solid #ffab00' : '1px solid rgba(255,255,255,0.1)',
                background: userSubTab === 'active' ? 'rgba(255, 171, 0, 0.2)' : 'transparent',
                color: userSubTab === 'active' ? '#ffab00' : '#888',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: '0.82rem'
              }}
              onClick={() => setUserSubTab('active')}
            >
              👥 Active Accounts ({usersList.length})
            </button>

            <button
              type="button"
              className="font-mono"
              style={{
                padding: '6px 14px',
                borderRadius: '4px',
                border: userSubTab === 'holding' ? '1px solid #ff1744' : '1px solid rgba(255,255,255,0.1)',
                background: userSubTab === 'holding' ? 'rgba(255, 23, 68, 0.2)' : 'transparent',
                color: userSubTab === 'holding' ? '#ff1744' : '#888',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: '0.82rem'
              }}
              onClick={() => setUserSubTab('holding')}
            >
              🗑️ 30-Day Holding Zone / Recycle Bin ({holdingList.length})
            </button>
          </div>

          {userSubTab === 'active' ? (
            <div className="table-responsive">
              <table className="runs-table">
                <thead>
                  <tr>
                    <th>User Display Name</th>
                    <th>Institutional Email</th>
                    <th>Last Login</th>
                    <th>Account Role</th>
                    <th>Subscription Tier</th>
                    <th>Market Focus</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {usersList.map((u: any) => (
                    <tr key={u.id || u.email}>
                      <td>
                        <button
                          type="button"
                          style={{ background: 'none', border: 'none', color: '#ffab00', fontWeight: 900, cursor: 'pointer', textDecoration: 'underline' }}
                          onClick={() => setSelectedUserProfile(u)}
                        >
                          {u.name}
                        </button>
                      </td>
                      <td className="font-mono">{u.email}</td>
                      <td className="font-mono" style={{ fontSize: '0.78rem', color: u.lastActive?.includes('Just') ? '#00e676' : '#aaa' }}>
                        {u.lastActive || 'Preloaded - Pending Login'}
                      </td>
                      <td>
                        <span className="market-tag font-mono" style={{ background: u.role === 'admin' ? 'rgba(255,171,0,0.2)' : 'rgba(0,229,255,0.2)', color: u.role === 'admin' ? '#ffab00' : '#00e5ff' }}>
                          {(u.role || 'trader').toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <select
                          value={u.tier || 'free'}
                          onChange={e => handleUpdateTier(u.id || u.email, e.target.value as any)}
                          style={{
                            background: 'rgba(9, 3, 20, 0.8)',
                            border: `1px solid ${u.tier === 'futures_forex' ? '#ffd700' : u.tier === 'forex_only' ? '#00e5ff' : '#888'}`,
                            color: u.tier === 'futures_forex' ? '#ffd700' : u.tier === 'forex_only' ? '#00e5ff' : '#ccc',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontWeight: 700,
                            fontSize: '0.8rem'
                          }}
                        >
                          <option value="free">Free Tier</option>
                          <option value="forex_only">Forex Only</option>
                          <option value="futures_forex">Futures &amp; Forex</option>
                        </select>
                      </td>
                      <td className="font-mono text-gold">{u.preferredMarket || 'Both'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="font-mono"
                            style={{
                              background: 'rgba(255, 171, 0, 0.2)',
                              border: '1px solid #ffab00',
                              color: '#ffab00',
                              padding: '5px 10px',
                              borderRadius: '4px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              fontSize: '0.78rem'
                            }}
                            onClick={() => handleImpersonateUser(u)}
                          >
                            🥸 Impersonate
                          </button>

                          <button
                            type="button"
                            className="font-mono"
                            style={{
                              background: 'rgba(0, 229, 255, 0.15)',
                              border: '1px solid #00e5ff',
                              color: '#00e5ff',
                              padding: '5px 10px',
                              borderRadius: '4px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              fontSize: '0.78rem'
                            }}
                            onClick={() => handleAdminChangePassword(u.id || u.email, u.name, u.role || 'trader')}
                          >
                            🔑 Password
                          </button>

                          <button
                            type="button"
                            className="font-mono"
                            style={{
                              background: 'rgba(255, 23, 68, 0.15)',
                              border: '1px solid #ff1744',
                              color: '#ff1744',
                              padding: '5px 10px',
                              borderRadius: '4px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              fontSize: '0.78rem'
                            }}
                            onClick={() => handleSoftDeleteUser(u.id || u.email, u.name)}
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="runs-table">
                <thead>
                  <tr>
                    <th>Display Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Date Deleted</th>
                    <th>Days Remaining until Purge</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {holdingList.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: '#888', padding: '24px' }}>
                        No soft-deleted users in the holding zone.
                      </td>
                    </tr>
                  ) : (
                    holdingList.map((u: any) => (
                      <tr key={u.id || u.email}>
                        <td><strong>{u.name}</strong></td>
                        <td className="font-mono">{u.email}</td>
                        <td>
                          <span className="market-tag font-mono" style={{ background: 'rgba(255,23,68,0.2)', color: '#ff1744' }}>
                            PENDING DELETION
                          </span>
                        </td>
                        <td className="font-mono">{formatETTime(u.deletedAt)}</td>
                        <td className="font-mono" style={{ color: '#ff1744', fontWeight: 900 }}>
                          {u.daysRemaining ?? 30} days remaining
                        </td>
                        <td>
                          <button
                            type="button"
                            className="font-mono"
                            style={{
                              background: 'rgba(0, 230, 118, 0.2)',
                              border: '1px solid #00e676',
                              color: '#00e676',
                              padding: '5px 12px',
                              borderRadius: '4px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              fontSize: '0.8rem'
                            }}
                            onClick={() => handleRestoreUser(u.id || u.email, u.name)}
                          >
                            ♻️ Restore Account
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}

        {/* Rich User Profile Modal */}
        {selectedUserProfile && (
          <div className="modal-overlay font-mono" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(6,2,12,0.9)', backdropFilter: 'blur(10px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div className="glass-card" style={{ background: '#0f0620', border: '1px solid #ffab00', borderRadius: '12px', padding: '24px', maxWidth: '520px', width: '100%', color: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, color: '#ffab00', fontSize: '1.2rem' }}>👤 Full User Profile — {selectedUserProfile.name}</h3>
                <button type="button" style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '1.2rem', cursor: 'pointer' }} onClick={() => setSelectedUserProfile(null)}>✖</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px', fontSize: '0.85rem' }}>
                <div>
                  <span style={{ color: '#aaa', display: 'block' }}>Display Name:</span>
                  <strong style={{ fontSize: '1rem', color: '#fff' }}>{selectedUserProfile.name}</strong>
                </div>

                <div>
                  <span style={{ color: '#aaa', display: 'block' }}>Institutional Email:</span>
                  <strong style={{ color: '#00e5ff' }}>{selectedUserProfile.email}</strong>
                </div>

                <div>
                  <span style={{ color: '#aaa', display: 'block' }}>Account Privilege / Role:</span>
                  <span className="market-tag font-mono" style={{ background: selectedUserProfile.role === 'admin' ? 'rgba(255,171,0,0.2)' : 'rgba(0,229,255,0.2)', color: selectedUserProfile.role === 'admin' ? '#ffab00' : '#00e5ff' }}>
                    {(selectedUserProfile.role || 'trader').toUpperCase()}
                  </span>
                </div>

                <div>
                  <span style={{ color: '#aaa', display: 'block' }}>Subscription Access Tier:</span>
                  <strong style={{ color: '#ffd700' }}>{(selectedUserProfile.tier || 'free').toUpperCase()}</strong>
                </div>

                <div>
                  <span style={{ color: '#aaa', display: 'block' }}>Preferred Market Focus:</span>
                  <strong>{selectedUserProfile.preferredMarket || 'Both'}</strong>
                </div>

                <div>
                  <span style={{ color: '#aaa', display: 'block' }}>Risk Limit Preference:</span>
                  <strong>{selectedUserProfile.riskLimit || '1%'}</strong>
                </div>

                <div>
                  <span style={{ color: '#aaa', display: 'block' }}>Signals Viewed:</span>
                  <strong>{selectedUserProfile.signalsViewed || 0} setups</strong>
                </div>

                <div>
                  <span style={{ color: '#aaa', display: 'block' }}>Watchlist Size:</span>
                  <strong>{selectedUserProfile.watchlistCount || 0} setups</strong>
                </div>

                <div>
                  <span style={{ color: '#aaa', display: 'block' }}>Date Joined / Created:</span>
                  <strong>{formatETTime(selectedUserProfile.createdAt)}</strong>
                </div>

                <div>
                  <span style={{ color: '#aaa', display: 'block' }}>Account Status:</span>
                  <strong style={{ color: selectedUserProfile.status === 'active' ? '#00e676' : '#ff1744' }}>
                    {(selectedUserProfile.status || 'active').toUpperCase()}
                  </strong>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  style={{ background: 'rgba(0, 229, 255, 0.15)', border: '1px solid #00e5ff', color: '#00e5ff', padding: '8px 16px', borderRadius: '4px', fontWeight: 800, cursor: 'pointer' }}
                  onClick={() => {
                    const u = selectedUserProfile;
                    handleAdminChangePassword(u.id || u.email, u.name, u.role || 'trader');
                  }}
                >
                  🔑 Change Password
                </button>
                <button
                  type="button"
                  style={{ background: 'rgba(255, 171, 0, 0.2)', border: '1px solid #ffab00', color: '#ffab00', padding: '8px 16px', borderRadius: '4px', fontWeight: 800, cursor: 'pointer' }}
                  onClick={() => {
                    const u = selectedUserProfile;
                    setSelectedUserProfile(null);
                    handleImpersonateUser(u);
                  }}
                >
                  🥸 Impersonate Account
                </button>
                <button
                  type="button"
                  style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#ccc', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}
                  onClick={() => setSelectedUserProfile(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Strategy Engine & Manual Scans */}
        {adminTab === 'engine' && (
          <>
            {/* Strategy Control Panel (Enable / Disable Strategies) */}
            <div className="admin-strategy-toggles-container glass-card font-mono" style={{ padding: '20px', marginBottom: '24px', borderRadius: '10px', background: 'var(--kdt-purple-card)', border: '1px solid var(--kdt-purple-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 className="section-title" style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--kdt-gold)', margin: 0 }}>
                  ⚙️ STRATEGY ENGINE CONTROLS (ENABLE / DISABLE DISCOVERY)
                </h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--kdt-white-muted)' }}>
              Disabled strategies will be automatically skipped during scheduled & manual discovery runs.
            </span>
          </div>

          <div className="strategy-toggles-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
            {dbStrategies.map(strat => (
              <div 
                key={strat.id} 
                className="strategy-toggle-card glass-card"
                style={{
                  padding: '16px',
                  borderRadius: '8px',
                  border: `1px solid ${strat.enabled ? (strat.id === 'sentinel_v2' ? '#ce93d8' : (strat.id === 'manna_snd' ? '#ffab00' : '#00e5ff')) : 'rgba(255,255,255,0.1)'}`,
                  background: strat.enabled ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.3)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: strat.enabled ? '#ffffff' : 'rgba(255,255,255,0.4)', marginBottom: '4px' }}>
                    {strat.name} ({strat.id})
                  </div>
                  <div style={{ fontSize: '0.75rem', color: strat.enabled ? '#00e5ff' : '#ff1744' }}>
                    ● STATUS: {strat.enabled ? 'ONLINE & SCANNING' : 'OFFLINE (DISABLED BY ADMIN)'}
                  </div>
                </div>

                <button
                  className="font-mono"
                  onClick={() => handleToggleStrategy(strat.id, strat.enabled)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    fontWeight: 900,
                    cursor: 'pointer',
                    background: strat.enabled ? '#ff1744' : '#00e5ff',
                    color: strat.enabled ? '#ffffff' : '#090314',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                  }}
                >
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Danger Zone: Delete All Signals Control Desk */}
        <div className="glass-card font-mono" style={{ padding: '20px', marginBottom: '24px', borderRadius: '10px', background: 'rgba(255, 23, 68, 0.08)', border: '1px solid rgba(255, 23, 68, 0.4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 900, color: '#ff1744', margin: '0 0 4px 0' }}>
                🗑️ DANGER ZONE: DELETE SIGNALS
              </h2>
              <span style={{ fontSize: '0.8rem', color: '#ffcdd2' }}>
                Permanently purge active, pending, or historical signal records from the database.
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <select
                value={deleteSignalsScope}
                onChange={e => setDeleteSignalsScope(e.target.value as any)}
                style={{
                  background: '#090314',
                  border: '1px solid rgba(255, 23, 68, 0.5)',
                  color: '#fff',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '0.85rem'
                }}
              >
                <option value="all">🔥 Delete ALL Signals &amp; History</option>
                <option value="pending_only">⚡ Delete Active &amp; Pending Signals Only</option>
              </select>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', color: '#ff4081', fontWeight: 700 }}>
                <input
                  type="checkbox"
                  checked={confirmDeleteSignals}
                  onChange={e => setConfirmDeleteSignals(e.target.checked)}
                  style={{ accentColor: '#ff1744', width: '18px', height: '18px', cursor: 'pointer' }}
                />
                Confirm Deletion
              </label>

              <button
                type="button"
                className="font-mono"
                onClick={handleDeleteAllSignals}
                disabled={!confirmDeleteSignals || isDeletingSignals}
                style={{
                  background: confirmDeleteSignals ? '#ff1744' : 'rgba(255, 23, 68, 0.2)',
                  border: '1px solid #ff1744',
                  color: confirmDeleteSignals ? '#ffffff' : 'rgba(255, 255, 255, 0.4)',
                  padding: '9px 18px',
                  borderRadius: '6px',
                  fontWeight: 900,
                  cursor: confirmDeleteSignals ? 'pointer' : 'not-allowed',
                  fontSize: '0.85rem',
                  boxShadow: confirmDeleteSignals ? '0 0 12px rgba(255, 23, 68, 0.5)' : 'none',
                  transition: 'all 0.2s ease'
                }}
              >
                {isDeletingSignals ? '⏳ DELETING...' : '🗑️ DELETE SIGNALS'}
              </button>
            </div>
          </div>
        </div>

        {/* Active Signals Control Desk (Manual Signal Invalidation) */}
        <div className="admin-signal-control-desk glass-card font-mono" style={{ padding: '20px', marginBottom: '24px', borderRadius: '10px', background: 'var(--kdt-purple-card)', border: '1px solid var(--kdt-purple-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 className="section-title" style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--kdt-gold)', margin: 0 }}>
              📡 ACTIVE SIGNALS CONTROL DESK ({activeSetupsList.length} ACTIVE)
            </h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--kdt-white-muted)' }}>
              Manually disable or invalidate individual active signals across Futures & Forex.
            </span>
          </div>

          {activeSetupsList.length > 0 ? (
            <div className="table-responsive">
              <table className="runs-table">
                <thead>
                  <tr>
                    <th>Symbol & Market</th>
                    <th>Strategy</th>
                    <th>Bias</th>
                    <th>Entry Zone</th>
                    <th>Stop Loss</th>
                    <th>TP1 / TP2</th>
                    <th>State</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {activeSetupsList.map((setup: any) => {
                    const stratName = setup.strategy_id === 'manna_snd' ? 'Manna SnD' : 'Manna Basic';
                    const isDisabling = disablingId === setup.id;
                    const isLong = (setup.bias || 'long').toLowerCase() === 'long';

                    return (
                      <tr key={setup.id}>
                        <td>
                          <strong>{setup.instrument}</strong>{' '}
                          <span className="market-tag">{(setup.market || 'futures').toUpperCase()}</span>
                        </td>
                        <td>
                          <span className={`strat-badge badge-${setup.strategy_id || 'manna_basic'}`}>
                            {stratName}
                          </span>
                        </td>
                        <td>
                          <span className={isLong ? 'text-green' : 'text-red'}>
                            {isLong ? '▲ LONG' : '▼ SHORT'}
                          </span>
                        </td>
                        <td>{setup.entry_zone_mid || setup.entryMin}</td>
                        <td className="text-red">{setup.stop || setup.levels?.stopLoss}</td>
                        <td className="text-green">
                          {setup.tp1 || setup.levels?.takeProfit1} / {setup.tp2 || setup.levels?.takeProfit2 || '--'}
                        </td>
                        <td>
                          <span className="state-badge committed">
                            {(setup.signal_state || setup.state || 'active').toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {(setup.signal_state || setup.state || '').toLowerCase() === 'awaiting_entry' && (
                              <button
                                className="font-mono"
                                style={{
                                  background: 'rgba(0, 229, 255, 0.15)',
                                  border: '1px solid #00e5ff',
                                  color: '#00e5ff',
                                  padding: '4px 10px',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontWeight: 800,
                                  fontSize: '0.75rem'
                                }}
                                onClick={() => handleAdminSingleRescan(setup)}
                                disabled={rescanningId === setup.id}
                                title="Run single-asset rescan for this pending signal"
                              >
                                {rescanningId === setup.id ? '⏳ Scanning...' : '🔍 Rescan & Replace'}
                              </button>
                            )}
                            <button
                              className="btn-disable-signal font-mono"
                              style={{
                                background: 'rgba(255, 23, 68, 0.2)',
                                border: '1px solid #ff1744',
                                color: '#ff1744',
                                padding: '4px 10px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontWeight: 800,
                                fontSize: '0.75rem'
                              }}
                              onClick={() => {
                                const confirmed = window.confirm(`⚠️ CONFIRMATION REQUIRED:\n\nAre you sure you want to disable and invalidate the signal for ${setup.instrument}? This will mark it as non-tradable.`);
                                if (confirmed) {
                                  handleDisableSignal(setup.id, setup.market);
                                }
                              }}
                              disabled={isDisabling}
                            >
                              {isDisabling ? 'Disabling...' : '⛔ DISABLE SIGNAL'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ color: 'var(--kdt-white-muted)', padding: '16px 0' }}>
              No active signals currently open in the database.
            </div>
          )}
        </div>
        </>
        )}

        {/* TAB 3: Conviction & Trade Analytics */}
        {adminTab === 'analytics' && (
          <>
            {/* Strategy Filter Tabs */}
            <div className="strategy-filter-tabs glass-card font-mono">
              <span className="filter-title">STRATEGY ANALYTICS FILTER:</span>
          <button 
            className={`strat-tab ${strategyFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStrategyFilter('all')}
          >
            ⚡ All Strategies
          </button>
          <button 
            className={`strat-tab strat-basic ${strategyFilter === 'manna_basic' ? 'active' : ''}`}
            onClick={() => setStrategyFilter('manna_basic')}
          >
            🔵 Manna Basic
          </button>
          <button 
            className={`strat-tab strat-snd ${strategyFilter === 'manna_snd' ? 'active' : ''}`}
            onClick={() => setStrategyFilter('manna_snd')}
          >
            🟡 Manna SnD
          </button>
          <button 
            className={`strat-tab ${strategyFilter === 'sentinel_v2' ? 'active' : ''}`}
            onClick={() => setStrategyFilter('sentinel_v2')}
            style={{
              borderColor: strategyFilter === 'sentinel_v2' ? '#ce93d8' : undefined,
              color: strategyFilter === 'sentinel_v2' ? '#ce93d8' : undefined,
              background: strategyFilter === 'sentinel_v2' ? 'rgba(156, 39, 176, 0.2)' : undefined
            }}
          >
            🟣 {isSuperAdmin ? 'Chadwin Sentinel V2 Elite Framework (Manna Elite V1)' : 'Manna Elite V1'}
          </button>
        </div>

        <MetricsPanel />

        {/* Strategy Performance Matrix Comparison Cards */}
        <div className="strategy-matrix-container">
          <h2 className="section-title font-mono">⚡ STRATEGY PERFORMANCE MATRIX</h2>
          <div className="strategy-cards-grid font-mono">
            {analytics?.collective && (
              <div className="strategy-card glass-card strat-border-collective" style={{ borderColor: '#00e5ff', background: 'rgba(0, 229, 255, 0.05)' }}>
                <div className="strat-card-header">
                  <span className="strat-badge" style={{ background: '#00e5ff', color: '#090314', fontWeight: 800 }}>🌐 COLLECTIVE (ALL STRATEGIES)</span>
                  <span className="strat-tier-tag" style={{ borderColor: '#00e5ff', color: '#00e5ff' }}>PORTFOLIO WIDE</span>
                </div>

                <div className="strat-metric-row">
                  <span>Total Signals Generated:</span>
                  <span className="stat-val">{analytics.collective.totalSignals}</span>
                </div>

                <div className="strat-metric-row">
                  <span>Active Positions:</span>
                  <span className="stat-val text-gold">{analytics.collective.activeSignals}</span>
                </div>

                <div className="strat-metric-row">
                  <span>Resolved Trades:</span>
                  <span className="stat-val">{analytics.collective.resolvedSignals}</span>
                </div>

                <div className="strat-metric-row">
                  <span>Win Rate (%):</span>
                  <span className="stat-val text-green">{analytics.collective.winRate}% ({analytics.collective.wins}W / {analytics.collective.losses}L)</span>
                </div>

                <div className="strat-metric-row">
                  <span>Net Realized Return:</span>
                  <span className={`stat-val ${analytics.collective.totalRealizedR >= 0 ? 'text-green' : 'text-red'}`}>
                    {analytics.collective.totalRealizedR > 0 ? '+' : ''}{analytics.collective.totalRealizedR}R
                  </span>
                </div>
              </div>
            )}

            {strategies.map((strat) => (
              <div key={strat.id} className={`strategy-card glass-card strat-border-${strat.id}`}>
                <div className="strat-card-header">
                  <span className={`strat-badge badge-${strat.id}`}>{strat.name}</span>
                  <span className="strat-tier-tag">{strat.tier.toUpperCase()} TIER</span>
                </div>

                <div className="strat-metric-row">
                  <span>Total Signals Generated:</span>
                  <span className="stat-val">{strat.totalSignals}</span>
                </div>

                <div className="strat-metric-row">
                  <span>Active Positions:</span>
                  <span className="stat-val text-gold">{strat.activeSignals}</span>
                </div>

                <div className="strat-metric-row">
                  <span>Resolved Trades:</span>
                  <span className="stat-val">{strat.resolvedSignals}</span>
                </div>

                <div className="strat-metric-row">
                  <span>Win Rate (%):</span>
                  <span className="stat-val text-green">{strat.winRate}% ({strat.wins}W / {strat.losses}L)</span>
                </div>

                <div className="strat-metric-row">
                  <span>Net Realized Return:</span>
                  <span className={`stat-val ${strat.totalRealizedR >= 0 ? 'text-green' : 'text-red'}`}>
                    {strat.totalRealizedR > 0 ? '+' : ''}{strat.totalRealizedR}R
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Header for CSV Export & Reset */}
        <div className="analytics-action-bar glass-card font-mono">
          <div className="action-bar-left">
            <span className="bar-title">📊 ANALYTICS TRACKING ENGINE</span>
            <span className="bar-desc">
              Currently viewing: <strong>{strategyFilter === 'all' ? 'All Strategies (Unified)' : strategyFilter === 'manna_basic' ? 'Manna Basic Strategy' : 'Manna SnD Strategy'}</strong>. Export raw CSV or reset epoch tracking.
            </span>
          </div>
          <div className="action-bar-btns">
            <button className="btn-export-csv font-mono" onClick={handleExportLiveCSV}>
              📥 Export CSV ({strategyFilter.toUpperCase()})
            </button>
            <button className="btn-reset-analytics font-mono" onClick={() => setShowResetModal(true)}>
              🔄 Save & Reset Analytics
            </button>
          </div>
        </div>

        {/* CSV Export Target Audience Modal (Super Admin Only) */}
        {showCsvExportModal && (
          <div className="reset-modal-backdrop font-mono">
            <div className="reset-modal-card glass-card animate-scale-up" style={{ maxWidth: '520px' }}>
              <div className="modal-header">
                <h2 style={{ color: '#00e5ff', fontSize: '1.1rem' }}>📥 Select Target Export Audience Dataset</h2>
                <button className="close-btn" onClick={() => setShowCsvExportModal(false)}>✕</button>
              </div>
              <div className="modal-body" style={{ padding: '16px 0' }}>
                <p style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '16px' }}>
                  Choose which institutional dataset to generate and export. All datasets contain 134 structured machine-readable columns and calculated summary statistics headers.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <button
                    type="button"
                    className="font-mono"
                    style={{ background: 'rgba(0, 229, 255, 0.15)', border: '1px solid #00e5ff', color: '#00e5ff', padding: '12px 16px', borderRadius: '6px', textAlign: 'left', cursor: 'pointer' }}
                    onClick={() => executeCsvExport('public')}
                  >
                    <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>👥 Client & Admin Delivered Signals Dataset</div>
                    <div style={{ fontSize: '0.75rem', color: '#aaa', marginTop: '3px' }}>Exports trades delivered to clients/admins under the Manna Elite V1 public profile.</div>
                  </button>

                  <button
                    type="button"
                    className="font-mono"
                    style={{ background: 'rgba(179, 136, 255, 0.15)', border: '1px solid #b388ff', color: '#b388ff', padding: '12px 16px', borderRadius: '6px', textAlign: 'left', cursor: 'pointer' }}
                    onClick={() => executeCsvExport('super_admin')}
                  >
                    <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>👑 Super Admin Master Signals Dataset</div>
                    <div style={{ fontSize: '0.75rem', color: '#aaa', marginTop: '3px' }}>Exports signals generated under Chadwin Sentinel V2 Elite Framework master profile.</div>
                  </button>

                  <button
                    type="button"
                    className="font-mono"
                    style={{ background: 'rgba(255, 171, 0, 0.15)', border: '1px solid #ffab00', color: '#ffab00', padding: '12px 16px', borderRadius: '6px', textAlign: 'left', cursor: 'pointer' }}
                    onClick={() => executeCsvExport('all')}
                  >
                    <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>⚡ Unified System Complete Dataset</div>
                    <div style={{ fontSize: '0.75rem', color: '#aaa', marginTop: '3px' }}>Combines all signals across both feeds into a single institutional CSV file.</div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Reset Confirmation Modal */}
        {showResetModal && (
          <div className="reset-modal-backdrop">
            <div className="reset-modal-card glass-card animate-scale-up">
              <div className="modal-header">
                <h2>🔄 Archive Dataset & Reset Analytics</h2>
                <button className="close-btn" onClick={() => setShowResetModal(false)}>✕</button>
              </div>

              <div className="modal-body">
                <p>You are about to reset live analytics tracking. All current resolved trades, win rates, and durations will be **exported and saved to a permanent CSV archive** before resetting tracking anew.</p>
                
                <div className="archive-summary-box font-mono">
                  <div><strong>Total Trades to Archive:</strong> {summary?.totalTradesResolved || 0}</div>
                  <div><strong>Win Rate:</strong> {((summary?.winRate || 0) * 100).toFixed(1)}%</div>
                  <div><strong>Total Realized Return:</strong> {(summary?.totalRealizedR || 0) > 0 ? '+' : ''}{(summary?.totalRealizedR || 0).toFixed(2)}R</div>
                </div>

                <form onSubmit={handleResetAnalytics}>
                  <div className="form-group">
                    <label className="font-mono">Archive Epoch Name / Label</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Phase 1 — Baseline Strategy Test" 
                      value={archiveName}
                      onChange={e => setArchiveName(e.target.value)}
                      className="font-mono"
                      required
                    />
                  </div>

                  <div className="modal-actions">
                    <button type="button" className="btn-cancel font-mono" onClick={() => setShowResetModal(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn-confirm-reset font-mono" disabled={isResetting}>
                      {isResetting ? 'Archiving...' : '📥 SAVE TO CSV & RESET ANEW'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Performance Report Approval Queue & Control Desk */}
        <div className="glass-card font-mono" style={{ padding: '20px', marginBottom: '24px', borderRadius: '10px', background: 'rgba(0, 229, 255, 0.04)', border: '1px solid rgba(0, 229, 255, 0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 900, color: '#00e5ff', margin: '0 0 4px 0' }}>
                📊 PERFORMANCE REPORT APPROVAL DESK
              </h2>
              <span style={{ fontSize: '0.8rem', color: '#ccc' }}>
                Reports auto-generate at session boundaries (Asia, London, NY AM, NY PM). Review metrics, add admin commentary/notes, and approve to push to traders.
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                className="font-mono"
                onClick={() => handleGenerateReport('daily')}
                disabled={isReportActionLoading}
                style={{ background: 'rgba(0, 229, 255, 0.15)', border: '1px solid #00e5ff', color: '#00e5ff', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 800 }}
              >
                ➕ Generate Daily Draft
              </button>
              <button
                type="button"
                className="font-mono"
                onClick={() => handleGenerateReport('weekly')}
                disabled={isReportActionLoading}
                style={{ background: 'rgba(255, 215, 0, 0.15)', border: '1px solid #ffd700', color: '#ffd700', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 800 }}
              >
                ➕ Generate Weekly Draft
              </button>
              <button
                type="button"
                className="font-mono"
                onClick={() => handleGenerateReport('monthly')}
                disabled={isReportActionLoading}
                style={{ background: 'rgba(224, 86, 253, 0.15)', border: '1px solid #e056fd', color: '#e056fd', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 800 }}
              >
                ➕ Generate Monthly Draft
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0, 230, 118, 0.08)', padding: '2px 4px 2px 8px', borderRadius: '6px', border: '1px solid rgba(0, 230, 118, 0.3)' }}>
                <select
                  value={selectedReportSession}
                  onChange={(e: any) => setSelectedReportSession(e.target.value)}
                  className="font-mono"
                  style={{ background: '#090314', color: '#00e676', border: '1px solid rgba(0, 230, 118, 0.4)', borderRadius: '4px', padding: '4px 6px', fontSize: '0.78rem', fontWeight: 800 }}
                >
                  <option value="asia">🌏 Asia Session</option>
                  <option value="london">🏛️ London Session</option>
                  <option value="ny_am">📈 NY AM Session</option>
                  <option value="ny_pm">🎯 NY PM Session</option>
                  <option value="all">🌐 All Sessions</option>
                </select>
                <button
                  type="button"
                  className="font-mono"
                  onClick={() => handleGenerateReport('session', selectedReportSession)}
                  disabled={isReportActionLoading}
                  style={{ background: 'rgba(0, 230, 118, 0.2)', border: '1px solid #00e676', color: '#00e676', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 800 }}
                >
                  ➕ Generate Session Draft
                </button>
              </div>
            </div>
          </div>

          {/* Tab Filter */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '8px' }}>
            <button
              type="button"
              className="font-mono"
              onClick={() => setReportTab('drafts')}
              style={{
                padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 800,
                border: reportTab === 'drafts' ? '1px solid #ffd700' : '1px solid rgba(255,255,255,0.1)',
                background: reportTab === 'drafts' ? 'rgba(255, 215, 0, 0.2)' : 'transparent',
                color: reportTab === 'drafts' ? '#ffd700' : '#888'
              }}
            >
              ⏳ Drafts Pending Approval ({perfReports.filter(r => r.status === 'draft_pending_approval').length})
            </button>
            <button
              type="button"
              className="font-mono"
              onClick={() => setReportTab('published')}
              style={{
                padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 800,
                border: reportTab === 'published' ? '1px solid #00e676' : '1px solid rgba(255,255,255,0.1)',
                background: reportTab === 'published' ? 'rgba(0, 230, 118, 0.2)' : 'transparent',
                color: reportTab === 'published' ? '#00e676' : '#888'
              }}
            >
              🚀 Published to Traders ({perfReports.filter(r => r.status === 'published').length})
            </button>
            <button
              type="button"
              className="font-mono"
              onClick={() => setReportTab('recalled')}
              style={{
                padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 800,
                border: reportTab === 'recalled' ? '1px solid #ff1744' : '1px solid rgba(255,255,255,0.1)',
                background: reportTab === 'recalled' ? 'rgba(255, 23, 68, 0.2)' : 'transparent',
                color: reportTab === 'recalled' ? '#ff1744' : '#888'
              }}
            >
              🛡️ Recalled Reports ({perfReports.filter(r => r.status === 'recalled').length})
            </button>
          </div>

          {/* List of Reports */}
          {perfReports.filter(r => (reportTab === 'drafts' ? r.status === 'draft_pending_approval' : reportTab === 'published' ? r.status === 'published' : r.status === 'recalled')).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: '#666', fontSize: '0.85rem' }}>
              No {reportTab} performance reports found. Click a button above to generate a draft report manually!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {perfReports
                .filter(r => (reportTab === 'drafts' ? r.status === 'draft_pending_approval' : reportTab === 'published' ? r.status === 'published' : r.status === 'recalled'))
                .map(r => {
                  let summary: any = {};
                  try { summary = typeof r.summary_json === 'string' ? JSON.parse(r.summary_json) : r.summary_json; } catch {}
                  const notesVal = editingNotes[r.id] !== undefined ? editingNotes[r.id] : (r.admin_notes || '');

                  const isSessionType = r.period_type === 'session';
                  let sessionTitleStr = (r.period_type || 'daily').toUpperCase();
                  if (isSessionType) {
                    const sessName = (summary.sessionName || 'session').toLowerCase();
                    const sMap: Record<string, string> = { asia: 'ASIA', london: 'LONDON', ny_am: 'NY AM', ny_pm: 'NY PM', all: 'PER-SESSION' };
                    sessionTitleStr = `${sMap[sessName] || sessName.toUpperCase()} SESSION`;
                  }

                  return (
                    <div key={r.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                          <strong style={{ fontSize: '0.95rem', color: '#fff' }}>
                            📊 {sessionTitleStr} PERFORMANCE REPORT
                          </strong>
                          <span style={{ fontSize: '0.78rem', color: '#aaa', marginLeft: '10px' }}>
                            Period: {r.period_start?.slice(0, 10)} to {r.period_end?.slice(0, 10)}
                          </span>
                        </div>
                        <span className={`state-badge ${r.status === 'published' ? 'committed' : r.status === 'recalled' ? 'rolled_back' : ''}`}>
                          {r.status === 'published' ? '🚀 PUBLISHED' : r.status === 'recalled' ? '🛡️ RECALLED' : '⏳ DRAFT PENDING APPROVAL'}
                        </span>
                      </div>

                      {/* Metrics Bar */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '12px', background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '6px' }}>
                        <div><span style={{ color: '#888', fontSize: '0.72rem' }}>Total Trades:</span> <strong style={{ color: '#fff' }}>{summary.totalTrades ?? 0}</strong></div>
                        <div><span style={{ color: '#888', fontSize: '0.72rem' }}>Wins / Losses / BE:</span> <strong style={{ color: '#00e676' }}>{summary.wins ?? 0}W</strong> / <strong style={{ color: '#ff1744' }}>{summary.losses ?? 0}L</strong> / <strong style={{ color: '#ffd700' }}>{summary.breakevens ?? 0}BE</strong></div>
                        <div><span style={{ color: '#888', fontSize: '0.72rem' }}>Win Rate:</span> <strong style={{ color: '#00e676' }}>{summary.winRate ?? 0}%</strong></div>
                        <div><span style={{ color: '#888', fontSize: '0.72rem' }}>Net Realized R:</span> <strong className={(summary.totalRealizedR ?? 0) >= 0 ? 'text-green' : 'text-red'}>{(summary.totalRealizedR ?? 0) >= 0 ? '+' : ''}{summary.totalRealizedR ?? 0}R</strong></div>
                      </div>

                      {/* Admin Notes Box */}
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '0.78rem', color: '#ffd700', fontWeight: 800, marginBottom: '4px' }}>
                          ✏️ Admin Commentary / Corrections (Visible to Traders in Mailbox):
                        </div>
                        <textarea
                          rows={2}
                          placeholder="Add notes, error corrections, or market context before approving..."
                          value={notesVal}
                          onChange={e => setEditingNotes({ ...editingNotes, [r.id]: e.target.value })}
                          style={{ width: '100%', padding: '8px', background: '#090314', border: '1px solid rgba(255,215,0,0.3)', color: '#fff', borderRadius: '6px', fontSize: '0.8rem' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                          <button
                            type="button"
                            onClick={() => handleSaveReportNotes(r.id, notesVal)}
                            style={{ background: 'rgba(255,215,0,0.15)', border: '1px solid #ffd700', color: '#ffd700', padding: '3px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 800 }}
                          >
                            💾 Save Notes
                          </button>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
                        <span style={{ fontSize: '0.72rem', color: '#888' }}>
                          Created: {r.created_at?.slice(0, 16)} {r.published_at ? `| Approved & Pushed by: ${r.published_by || 'Admin'}${r.published_by_email ? ` (${r.published_by_email})` : ''} on ${r.published_at?.slice(0, 16)}` : ''}
                        </span>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          {r.status !== 'published' ? (
                            <button
                              type="button"
                              onClick={() => handleApproveReport(r.id, notesVal)}
                              disabled={isReportActionLoading}
                              style={{ background: '#00e676', border: 'none', color: '#090314', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 900, fontSize: '0.8rem' }}
                            >
                              🚀 APPROVE &amp; PUSH TO TRADERS
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleApproveReport(r.id, notesVal)}
                                disabled={isReportActionLoading}
                                style={{ background: 'rgba(0, 230, 118, 0.2)', border: '1px solid #00e676', color: '#00e676', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 800, fontSize: '0.78rem' }}
                              >
                                🔄 RESEND REPORT
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRecallReport(r.id)}
                                disabled={isReportActionLoading}
                                style={{ background: 'rgba(255, 23, 68, 0.2)', border: '1px solid #ff1744', color: '#ff1744', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 800, fontSize: '0.78rem' }}
                              >
                                🛡️ RECALL REPORT
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteReport(r.id)}
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)', color: '#888', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem' }}
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Archived Datasets History Table */}
        {archives.length > 0 && (
          <div className="runs-card glass-card font-mono" style={{ marginBottom: '24px' }}>
            <h2>Historical Archived Datasets ({archives.length})</h2>
            <div className="table-responsive">
              <table className="runs-table">
                <thead>
                  <tr>
                    <th>Archive Epoch Name</th>
                    <th>Captured Date Range</th>
                    <th>Resolved Trades</th>
                    <th>Win Rate</th>
                    <th>Net Realized R</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {archives.map((arch: any) => (
                    <tr key={arch.id}>
                      <td><strong>{arch.archive_name}</strong></td>
                      <td>{arch.captured_from?.slice(0, 10)} to {arch.captured_until?.slice(0, 10)}</td>
                      <td>{arch.total_resolved}</td>
                      <td className="text-green">{(arch.win_rate * 100).toFixed(1)}%</td>
                      <td className={arch.total_realized_r >= 0 ? 'text-green' : 'text-red'}>
                        {arch.total_realized_r > 0 ? '+' : ''}{arch.total_realized_r.toFixed(2)}R
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <a 
                            href={`${API_BASE}/api/admin/analytics/archives/${arch.id}/download?user_role=super_admin&user_email=${encodeURIComponent(user?.email || '')}`}
                            target="_blank" 
                            rel="noreferrer"
                            style={{ color: isSuperAdmin ? '#00e5ff' : '#888', textDecoration: 'none', fontWeight: 700, pointerEvents: isSuperAdmin ? 'auto' : 'none' }}
                            onClick={(e) => {
                              if (!isSuperAdmin) {
                                e.preventDefault();
                                alert('🔒 Access Restricted: Downloading CSV dataset archives is available to Super Admins only.');
                              }
                            }}
                          >
                            {isSuperAdmin ? '📥 Download CSV' : '🔒 Super Admin Only'}
                          </a>
                          <button
                            type="button"
                            className="font-mono"
                            onClick={() => handleDeleteArchive(arch.id, arch.archive_name)}
                            style={{
                              background: 'rgba(255, 23, 68, 0.15)',
                              border: '1px solid #ff1744',
                              color: '#ff1744',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.78rem',
                              fontWeight: 800
                            }}
                            title="Delete this historical archived dataset"
                          >
                            🗑️ Delete
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

        {/* Last Session Scan & Trigger Separation Grid */}
        <div className="admin-grid analytics-grid">
          {/* Last Scheduled Session Scan */}
          <div className="admin-card glass-card">
            <h2>Last Scheduled Session Scan</h2>
            {lastScheduled ? (
              <>
                <div className="analytics-stat-row">
                  <span className="stat-label">Session:</span>
                  <span className="stat-val font-mono text-gold">{lastScheduled.killzone?.toUpperCase()}</span>
                </div>
                <div className="analytics-stat-row">
                  <span className="stat-label">Execution Time (ET):</span>
                  <span className="stat-val font-mono">{formatETTime(lastScheduled.run_timestamp || lastScheduled.created_at)}</span>
                </div>
                <div className="analytics-stat-row">
                  <span className="stat-label">Setups Created:</span>
                  <span className="stat-val font-mono text-green">+{lastScheduled.setups_created || 0}</span>
                </div>
                <div className="analytics-stat-row">
                  <span className="stat-label">Setups Invalidated:</span>
                  <span className="stat-val font-mono text-red">{lastScheduled.setups_invalidated || 0}</span>
                </div>
                <div className="analytics-stat-row">
                  <span className="stat-label">Active Preserved:</span>
                  <span className="stat-val font-mono">{lastScheduled.setups_preserved || 0}</span>
                </div>
              </>
            ) : (
              <div className="card-desc">No scheduled session scans logged yet.</div>
            )}
          </div>

          {/* Trigger Separation Analytics */}
          <div className="admin-card glass-card">
            <h2>Trigger Source Metrics (Scheduled vs Manual)</h2>
            <div className="analytics-stat-row">
              <span className="stat-label">📅 Scheduled Runs:</span>
              <span className="stat-val font-mono">{triggers?.scheduled?.totalRuns || 0} runs (+{triggers?.scheduled?.created || 0} setups)</span>
            </div>
            <div className="analytics-stat-row">
              <span className="stat-label">⚙️ Manual Triggers:</span>
              <span className="stat-val font-mono">{triggers?.manual?.totalRuns || 0} triggers (+{triggers?.manual?.created || 0} setups)</span>
            </div>
          </div>
        </div>

        {/* Killzones Performance Table in R */}
        {killzones && (
          <div className="runs-card glass-card font-mono" style={{ marginBottom: '24px' }}>
            <h2>Killzone Session Performance (R)</h2>
            <div className="table-responsive">
              <table className="runs-table">
                <thead>
                  <tr>
                    <th>Killzone Session</th>
                    <th>Total Setups</th>
                    <th>Wins</th>
                    <th>Losses</th>
                    <th>Win Rate</th>
                    <th>Realized Return (R)</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(killzones as Record<string, any>).map(([kz, data]) => {
                    const wr = data.total > 0 ? `${((data.wins / data.total) * 100).toFixed(1)}%` : '--%';
                    const plR = data.plR || 0;
                    return (
                      <tr key={kz}>
                        <td><strong>{kz.toUpperCase().replace('_', ' ')}</strong></td>
                        <td>{data.total}</td>
                        <td className="text-green">{data.wins}</td>
                        <td className="text-red">{data.losses}</td>
                        <td>{wr}</td>
                        <td className={plR >= 0 ? 'text-green font-mono' : 'text-red font-mono'}>
                          {plR > 0 ? '+' : ''}{plR.toFixed(2)}R
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Conviction Score Performance Influence Tracker */}
        {convictionPerformance && (
          <div className="runs-card glass-card font-mono" style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h2 style={{ margin: 0, color: 'var(--kdt-gold)' }}>🎯 Conviction Score Performance Influence Tracker</h2>
              <span className="badge badge-manual font-mono">WIN RATE CORRELATION</span>
            </div>
            <p style={{ color: 'var(--kdt-text-muted)', fontSize: '0.85rem', marginBottom: '16px' }}>
              Tracks how AI conviction scores (0–100%) influence winning trade outcomes, profit factor, and return expectancy (R).
            </p>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '14px' }}>
              {Object.entries(convictionPerformance as Record<string, any>).map(([key, data]) => {
                const isHigh = key === 'high';
                const isMed = key === 'medium';
                return (
                  <div 
                    key={key} 
                    style={{ 
                      background: isHigh ? 'rgba(0, 229, 255, 0.08)' : isMed ? 'rgba(255, 215, 0, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                      border: `1px solid ${isHigh ? '#00e5ff' : isMed ? '#ffd700' : 'rgba(255, 255, 255, 0.1)'}`,
                      borderRadius: '8px',
                      padding: '14px'
                    }}
                  >
                    <div style={{ fontSize: '0.85rem', color: isHigh ? '#00e5ff' : isMed ? '#ffd700' : '#aaa', fontWeight: 800, marginBottom: '6px' }}>
                      {data.label}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                      <span style={{ fontSize: '1.3rem', fontWeight: 900 }} className={data.winRate >= 50 ? 'text-green' : 'text-red'}>
                        {data.total > 0 ? `${data.winRate}%` : '--'}
                      </span>
                      <span style={{ fontSize: '0.78rem', color: '#888' }}>
                        {data.wins}W / {data.losses}L ({data.total} trades)
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                      <span>Net Return:</span>
                      <span className={data.plR >= 0 ? 'text-green font-mono' : 'text-red font-mono'} style={{ fontWeight: 800 }}>
                        {data.plR > 0 ? '+' : ''}{data.plR.toFixed(2)}R
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Insights Banner */}
            <div style={{ background: 'rgba(0, 229, 255, 0.08)', borderLeft: '4px solid #00e5ff', padding: '10px 14px', borderRadius: '4px', fontSize: '0.82rem', color: '#e2e8f0' }}>
              <strong>💡 Conviction Insight:</strong> Setups with Ultra High Conviction (≥90%) demonstrate strong structure alignment and higher win rates. High conviction setups deliver consistent risk-adjusted returns (R).
            </div>
          </div>
        )}

        {/* Recent Resolved Trade Outcomes (10 per page pagination) */}
        {recentOutcomes.length > 0 && (
          <div className="runs-card glass-card font-mono" style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0 }}>Recent Resolved Trade Outcomes ({recentOutcomes.length})</h2>
              <span className="stat-val font-mono text-gold" style={{ fontSize: '0.85rem' }}>
                Showing 10 per page (Page {outcomesPage} of {totalOutcomePages})
              </span>
            </div>
            <div className="table-responsive">
              <table className="runs-table">
                <thead>
                  <tr>
                    <th>Symbol & Market</th>
                    <th>🎯 Conviction</th>
                    <th>📡 Discovered (ET)</th>
                    <th>⚡ Entered (ET)</th>
                    <th>🏁 Exited (ET)</th>
                    <th>⏱️ Fill Time</th>
                    <th>⏳ Duration</th>
                    <th>Outcome</th>
                    <th>Result (R)</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedOutcomes.map((o: any) => {
                    const isWin = o.outcome_type?.includes('tp');
                    const rVal = o.realized_r ?? 0;
                    return (
                      <tr key={o.id}>
                        <td>
                          <strong>{o.instrument || 'SETUP'}</strong>{' '}
                          <span className="market-tag font-mono">{(o.market || o.setup_market || 'futures').toUpperCase()}</span>
                        </td>
                        <td className="font-mono text-gold">
                          <strong>{o.conviction_score || 85}%</strong>
                        </td>
                        <td className="font-mono">{formatETTime(o.time_signaled || o.created_at)}</td>
                        <td className="font-mono text-gold">{o.time_entered ? formatETTime(o.time_entered) : '--'}</td>
                        <td className="font-mono text-green">{o.time_exited ? formatETTime(o.time_exited) : '--'}</td>
                        <td className="font-mono">{o.time_to_fill_min !== undefined ? `${o.time_to_fill_min}m` : '--'}</td>
                        <td className="font-mono">{o.holding_duration_min !== undefined ? `${o.holding_duration_min}m` : '--'}</td>
                        <td>
                          <span className={`state-badge ${isWin ? 'committed' : 'rolled_back'}`}>
                            {(o.outcome_type || '').toUpperCase()}
                          </span>
                        </td>
                        <td className={rVal >= 0 ? 'text-green font-mono' : 'text-red font-mono'}>
                          {rVal > 0 ? '+' : ''}{rVal.toFixed(2)}R
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalOutcomePages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--kdt-text-muted)' }}>
                  Showing {(outcomesPage - 1) * OUTCOMES_PER_PAGE + 1}–{Math.min(outcomesPage * OUTCOMES_PER_PAGE, recentOutcomes.length)} of {recentOutcomes.length} outcomes
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    className="btn-cancel font-mono"
                    style={{ padding: '5px 12px', fontSize: '0.8rem', cursor: outcomesPage === 1 ? 'not-allowed' : 'pointer', opacity: outcomesPage === 1 ? 0.5 : 1 }}
                    disabled={outcomesPage === 1}
                    onClick={() => setOutcomesPage(prev => Math.max(1, prev - 1))}
                  >
                    ← Prev
                  </button>

                  {Array.from({ length: totalOutcomePages }, (_, i) => i + 1).map(p => (
                    <button
                      key={p}
                      type="button"
                      className="font-mono"
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.8rem',
                        borderRadius: '4px',
                        border: p === outcomesPage ? '1px solid #00e5ff' : '1px solid rgba(255, 255, 255, 0.1)',
                        background: p === outcomesPage ? 'rgba(0, 229, 255, 0.2)' : 'transparent',
                        color: p === outcomesPage ? '#00e5ff' : '#ccc',
                        cursor: 'pointer',
                        fontWeight: p === outcomesPage ? 800 : 400
                      }}
                      onClick={() => setOutcomesPage(p)}
                    >
                      {p}
                    </button>
                  ))}

                  <button
                    type="button"
                    className="btn-cancel font-mono"
                    style={{ padding: '5px 12px', fontSize: '0.8rem', cursor: outcomesPage >= totalOutcomePages ? 'not-allowed' : 'pointer', opacity: outcomesPage >= totalOutcomePages ? 0.5 : 1 }}
                    disabled={outcomesPage >= totalOutcomePages}
                    onClick={() => setOutcomesPage(prev => Math.min(totalOutcomePages, prev + 1))}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        </>
        )}

        {/* TAB 4: Run History & Safety Audits */}
        {adminTab === 'history' && (
          <>
            {/* Recent Publish Runs */}
        {runs.length > 0 && (
          <div className="runs-card glass-card font-mono" style={{ marginBottom: '24px' }}>
            <h2>Publish Run History (Scheduled vs Manual)</h2>
            <div className="table-responsive">
              <table className="runs-table">
                <thead>
                  <tr>
                    <th>Time (ET)</th>
                    <th>Killzone</th>
                    <th>Trigger Source</th>
                    <th>Mode</th>
                    <th>State</th>
                    <th>Created</th>
                    <th>Invalidated</th>
                    <th>Preserved</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map(run => {
                    const runTimestamp = run.timestamp || (run as any).run_timestamp || (run as any).created_at;
                    const runMode = run.mode || (run as any).run_mode || 'live';
                    const runState = run.state || (run as any).run_state || 'committed';
                    const triggerType = (run as any).trigger_type || 'scheduled';
                    return (
                      <tr key={run.id}>
                        <td>{formatETTime(runTimestamp)}</td>
                        <td>{run.killzone}</td>
                        <td>
                          <span className={`badge ${triggerType === 'manual' ? 'badge-manual' : 'badge-scheduled'}`}>
                            {triggerType === 'manual' ? '⚙️ Manual' : '📅 Scheduled'}
                          </span>
                        </td>
                        <td>
                          <span className={`mode-badge ${runMode}`}>{String(runMode).replace('_', ' ')}</span>
                        </td>
                        <td>
                          <span className={`state-badge ${runState}`}>{runState}</span>
                          {(run as any).error_detail && (
                            <span style={{ fontSize: '0.7rem', display: 'block', color: '#ff1744', marginTop: '2px', maxWidth: '160px', wordBreak: 'break-word' }}>
                              {(run as any).error_detail}
                            </span>
                          )}
                        </td>
                        <td>{run.created ?? (run as any).setups_created ?? 0}</td>
                        <td>{run.invalidated ?? (run as any).setups_invalidated ?? 0}</td>
                        <td>{run.preserved ?? (run as any).setups_preserved ?? 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Controls Grid */}
        <div className="admin-grid">
          <div className="admin-card glass-card trigger-card">
            <h2>Trigger Manual Admin Run</h2>
            <p className="card-desc">Manually trigger the Discovery Engine. Tracked separately from scheduled boundary runs.</p>
            
            <div className="form-group">
              <label>Run Mode</label>
              <select value={mode} onChange={e => setMode(e.target.value as any)}>
                <option value="dry_run">Dry Run (No execution)</option>
                <option value="live">Live (Execute actions)</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Market Scope</label>
              <select value={market} onChange={e => setMarket(e.target.value as any)}>
                <option value="ALL">All Markets</option>
                <option value="FUTURES">Futures Only</option>
                <option value="FOREX">Forex Only</option>
              </select>
            </div>

            <div className="form-group">
              <label>Strategy Scope</label>
              <select value={triggerStrategy} onChange={e => setTriggerStrategy(e.target.value as any)}>
                <option value="all">⚡ All Strategies</option>
                <option value="manna_basic">🔵 Manna Basic Strategy</option>
                <option value="manna_snd">🟡 Manna SnD Strategy</option>
                <option value="sentinel_v2">🟣 Sentinel V2 Strategy</option>
              </select>
            </div>
            
            <button 
              className={`btn-trigger ${isTriggering ? 'loading' : ''}`}
              onClick={handleTrigger}
              disabled={isTriggering}
            >
              {isTriggering ? 'Triggering...' : '▶ TRIGGER MANUAL RUN'}
            </button>
          </div>

          <div className="admin-card glass-card cb-card">
            <h2>Circuit Breaker Safety</h2>
            <p className="card-desc">Safety mechanism for repeated strategy failures.</p>
            
            <div className={`cb-status-large ${status.status === 'ok' ? 'ok' : 'tripped'}`}>
              <div className="cb-icon">{status.status === 'ok' ? '✅' : '🚨'}</div>
              <div className="cb-info">
                <h3>{status.status === 'ok' ? 'System OK' : 'TRIPPED'}</h3>
                <span>Failures: {status.failureCount} / 5 threshold</span>
              </div>
            </div>
            
            <button 
              className="btn-reset-cb" 
              onClick={resetCircuitBreaker}
              disabled={status.status === 'ok'}
            >
              RESET CIRCUIT BREAKER
            </button>
          </div>
        </div>
        </>
        )}

        {/* TAB 5: Support Command Centre */}
        {adminTab === 'support' && (
          <div className="glass-card font-mono" style={{ padding: '20px', borderRadius: '10px', background: 'rgba(255,215,0,0.03)', border: '1px solid rgba(255,215,0,0.2)', minHeight: '600px', display: 'flex', flexDirection: 'column' }}>
            <h2 className="section-title" style={{ fontSize: '1.1rem', fontWeight: 900, color: '#ffd700', margin: '0 0 16px 0' }}>
              🎫 ADMIN SUPPORT COMMAND CENTRE
            </h2>
            <p style={{ fontSize: '0.78rem', color: '#888', margin: '0 0 16px 0', lineHeight: 1.5 }}>
              Manage upgrade requests, reply to users, send invoices, and transfer tickets to other admins. Users are notified in real-time when you respond.
            </p>
            <div style={{ flex: 1, minHeight: 0 }}>
              <AdminSupportInbox />
            </div>
          </div>
        )}

        {rescanCandidate && rescanCurrentSetup && (
          <SignalReplaceModal
            currentSetup={rescanCurrentSetup}
            candidate={rescanCandidate}
            onClose={() => {
              setRescanCandidate(null);
              setRescanCurrentSetup(null);
            }}
            onSuccess={() => {
              setRescanCandidate(null);
              setRescanCurrentSetup(null);
              refetchActiveSetups();
              refetchAnalytics();
            }}
          />
        )}
      </main>
    </div>
  );
};
