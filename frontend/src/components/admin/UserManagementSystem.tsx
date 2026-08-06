import React, { useState, useEffect } from 'react';
import './UserManagementSystem.css';
import { API_BASE } from '../../config';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export interface UserManagementProps {
  isSuperAdmin?: boolean;
  adminEmail?: string;
  adminRole?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'trader' | 'admin' | 'super_admin';
  tier: string;
  status: 'active' | 'suspended' | 'paused' | 'pending_deletion' | 'expired';
  subscriptionStatus?: 'active' | 'trialing' | 'paused' | 'expired' | 'canceled';
  subscriptionStart?: string;
  subscriptionEnd?: string;
  billingCycle?: 'monthly' | 'yearly' | 'custom' | 'lifetime';
  pauseStartDate?: string;
  pauseResumeDate?: string;
  pausedRemainingDays?: number;
  isTrial?: boolean;
  trialExpiresAt?: string;
  trialDaysRemaining?: number;
  trialExtendedCount?: number;
  trialExpired?: boolean;
  createdAt: string;
  lastActive?: string;
  preferredMarket?: string;
  riskLimit?: string;
  tags?: string[];
  groups?: string[];
}

export interface Coupon {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed_amount' | 'trial_extension' | 'tier_upgrade';
  discountValue: number;
  validFrom: string;
  validUntil?: string;
  maxRedemptions: number;
  currentRedemptions: number;
  perUserLimit: number;
  applicableTiers: string;
  status: 'active' | 'disabled' | 'expired';
  createdBy?: string;
}

export interface UserTag {
  id: string;
  name: string;
  color: string;
  description?: string;
}

export interface UserGroup {
  id: string;
  name: string;
  description?: string;
  tierAssignment: string;
  memberCount?: number;
}

export interface AuditLog {
  id: string;
  adminEmail: string;
  adminRole: string;
  action: string;
  targetUserId?: string;
  detailsJson?: string;
  createdAt: string;
}

export interface NotificationLog {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export const UserManagementSystem: React.FC<UserManagementProps> = ({
  isSuperAdmin = false,
  adminEmail = 'admin@mannaedge.com',
  adminRole = 'admin'
}) => {
  const { impersonateUser } = useAuth();
  const navigate = useNavigate();

  const handleImpersonateUser = (targetUser: UserProfile) => {
    impersonateUser({
      id: targetUser.id,
      name: targetUser.name,
      email: targetUser.email,
      role: targetUser.role as any,
      tier: targetUser.tier as any,
      marketAccess: (targetUser.tier === 'forex_only' ? 'forex' : 'all') as any,
      isTrial: Boolean(targetUser.isTrial),
      trialExpiresAt: targetUser.trialExpiresAt,
      lastActive: targetUser.lastActive
    });
    navigate('/dashboard');
  };

  const [activeTab, setActiveTab] = useState<
    'users' | 'subscriptions' | 'coupons' | 'tags_groups' | 'notifications' | 'audit_logs'
  >('users');

  // State Stores
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [tags, setTags] = useState<UserTag[]>([]);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [notifications, setNotifications] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [tierFilter, setTierFilter] = useState<string>('');

  // Selection for Bulk Actions
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  // Modals
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [showAddUserModal, setShowAddUserModal] = useState<boolean>(false);
  const [showCouponModal, setShowCouponModal] = useState<boolean>(false);
  const [showTagModal, setShowTagModal] = useState<boolean>(false);
  const [showGroupModal, setShowGroupModal] = useState<boolean>(false);
  const [showBroadcastModal, setShowBroadcastModal] = useState<boolean>(false);

  // Forms
  const [newUserForm, setNewUserForm] = useState({
    name: '',
    email: '',
    role: 'trader',
    tier: 'futures_forex',
    isTrial: false,
    preferredMarket: 'Both',
    riskLimit: '1%'
  });

  const [newCouponForm, setNewCouponForm] = useState({
    code: '',
    discountType: 'percentage' as Coupon['discountType'],
    discountValue: 20,
    maxRedemptions: 100,
    perUserLimit: 1,
    applicableTiers: 'all',
    validDays: 30
  });

  // Custom Trial Builder State
  const [ctName, setCtName] = useState<string>('14-Day VIP Cohort Trial');
  const [ctDurationType, setCtDurationType] = useState<'days' | 'date'>('days');
  const [ctDays, setCtDays] = useState<number>(14);
  const [ctExpiryDate, setCtExpiryDate] = useState<string>('');
  const [ctTier, setCtTier] = useState<'futures_forex' | 'forex_only' | 'free'>('futures_forex');
  const [ctStrategyAccess, setCtStrategyAccess] = useState<'all' | 'sentinel_v2' | 'manna_snd'>('all');
  const [ctMaxSignals, setCtMaxSignals] = useState<number>(6);
  const [ctAllowCalculators, setCtAllowCalculators] = useState<boolean>(true);

  const [ctTargetType, setCtTargetType] = useState<'individual' | 'group' | 'tag'>('individual');
  const [ctSelectedUserIds, setCtSelectedUserIds] = useState<string[]>([]);
  const [ctSelectedGroupId, setCtSelectedGroupId] = useState<string>('');
  const [ctSelectedTagId, setCtSelectedTagId] = useState<string>('');

  const [assigningTrial, setAssigningTrial] = useState<boolean>(false);
  const [trialNotice, setTrialNotice] = useState<string | null>(null);

  const [newTagForm, setNewTagForm] = useState({ name: '', color: '#3b82f6', description: '' });
  const [newGroupForm, setNewGroupForm] = useState({ name: '', description: '', tierAssignment: 'futures_forex' });
  const [broadcastForm, setBroadcastForm] = useState({ targetType: 'all', targetId: '', title: '', message: '' });

  // Custom Dates / Pause form inside User Modal
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [autoResumeDate, setAutoResumeDate] = useState<string>('');
  const [applyCouponCode, setApplyCouponCode] = useState<string>('');

  const apiHeaders = {
    'Content-Type': 'application/json',
    'x-admin-email': adminEmail,
    'x-admin-role': isSuperAdmin ? 'super_admin' : adminRole
  };

  // Fetch Data on Load
  const fetchAllData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [uRes, cRes, tRes, gRes, aRes, nRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/system/users`, { headers: apiHeaders }),
        fetch(`${API_BASE}/api/admin/system/coupons`, { headers: apiHeaders }),
        fetch(`${API_BASE}/api/admin/system/tags`, { headers: apiHeaders }),
        fetch(`${API_BASE}/api/admin/system/groups`, { headers: apiHeaders }),
        fetch(`${API_BASE}/api/admin/system/audit-logs`, { headers: apiHeaders }),
        fetch(`${API_BASE}/api/admin/system/notifications/logs`, { headers: apiHeaders })
      ]);

      const uData = await uRes.json();
      const cData = await cRes.json();
      const tData = await tRes.json();
      const gData = await gRes.json();
      const aData = await aRes.json();
      const nData = await nRes.json();

      if (uData.users) setUsers(uData.users);
      if (cData.coupons) setCoupons(cData.coupons);
      if (tData.tags) setTags(tData.tags);
      if (gData.groups) setGroups(gData.groups);
      if (aData.auditLogs) setAuditLogs(aData.auditLogs);
      if (nData.notifications) setNotifications(nData.notifications);
    } catch (err: any) {
      setErrorMsg('Failed to sync system data from server: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const showNotification = (msg: string, isError = false) => {
    if (isError) {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(''), 4000);
    } else {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(''), 4000);
    }
  };

  // ==========================================
  // HANDLERS
  // ==========================================
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/admin/system/users`, {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify(newUserForm)
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`User ${data.user.name} created successfully!`);
        setShowAddUserModal(false);
        setNewUserForm({ name: '', email: '', role: 'trader', tier: 'futures_forex', isTrial: false, preferredMarket: 'Both', riskLimit: '1%' });
        fetchAllData();
      } else {
        showNotification(data.error || 'Failed to create user', true);
      }
    } catch (e: any) {
      showNotification(e.message, true);
    }
  };

  const handlePauseUser = async (userId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/system/users/${userId}/pause`, {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({ autoResumeDate: autoResumeDate || undefined })
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`Subscription paused for ${data.user.name}`);
        setSelectedUser(data.user);
        fetchAllData();
      } else {
        showNotification(data.error, true);
      }
    } catch (e: any) {
      showNotification(e.message, true);
    }
  };

  const handleResumeUser = async (userId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/system/users/${userId}/resume`, {
        method: 'POST',
        headers: apiHeaders
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`Subscription resumed for ${data.user.name}`);
        setSelectedUser(data.user);
        fetchAllData();
      } else {
        showNotification(data.error, true);
      }
    } catch (e: any) {
      showNotification(e.message, true);
    }
  };

  const handleCustomDates = async (userId: string) => {
    if (!customStartDate || !customEndDate) {
      showNotification('Please select both Start Date and End Date', true);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/admin/system/users/${userId}/custom-dates`, {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({ startDate: customStartDate, endDate: customEndDate, billingCycle: 'custom' })
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`Subscription dates updated for ${data.user.name}`);
        setSelectedUser(data.user);
        fetchAllData();
      } else {
        showNotification(data.error, true);
      }
    } catch (e: any) {
      showNotification(e.message, true);
    }
  };

  const handleExtendTrial = async (userId: string, days = 7) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/system/users/${userId}/extend-trial`, {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({ days })
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`Trial extended by ${days} days for ${data.user.name}`);
        setSelectedUser(data.user);
        fetchAllData();
      } else {
        showNotification(data.error, true);
      }
    } catch (e: any) {
      showNotification(e.message, true);
    }
  };

  const handleApplyCoupon = async (userEmail: string) => {
    if (!applyCouponCode) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/system/coupons/apply`, {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({ code: applyCouponCode, userEmail })
      });
      const data = await res.json();
      if (data.success) {
        showNotification(data.message);
        setApplyCouponCode('');
        fetchAllData();
      } else {
        showNotification(data.message || data.error, true);
      }
    } catch (e: any) {
      showNotification(e.message, true);
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const validUntil = new Date(Date.now() + newCouponForm.validDays * 86400000).toISOString();
      const res = await fetch(`${API_BASE}/api/admin/system/coupons`, {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({ ...newCouponForm, validUntil })
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`Coupon ${data.coupon.code} created!`);
        setShowCouponModal(false);
        fetchAllData();
      } else {
        showNotification(data.error, true);
      }
    } catch (e: any) {
      showNotification(e.message, true);
    }
  };

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/admin/system/tags`, {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify(newTagForm)
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`Tag ${data.tag.name} created!`);
        setShowTagModal(false);
        setNewTagForm({ name: '', color: '#3b82f6', description: '' });
        fetchAllData();
      }
    } catch (e: any) {
      showNotification(e.message, true);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/admin/system/groups`, {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify(newGroupForm)
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`Cohort Group ${data.group.name} created!`);
        setShowGroupModal(false);
        setNewGroupForm({ name: '', description: '', tierAssignment: 'futures_forex' });
        fetchAllData();
      }
    } catch (e: any) {
      showNotification(e.message, true);
    }
  };

  const handleBroadcastNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/admin/system/notifications/broadcast`, {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify(broadcastForm)
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`Announcement broadcasted to ${data.recipientCount} traders!`);
        setShowBroadcastModal(false);
        setBroadcastForm({ targetType: 'all', targetId: '', title: '', message: '' });
        fetchAllData();
      }
    } catch (e: any) {
      showNotification(e.message, true);
    }
  };

  const handleBulkAction = async (action: 'extend_trial_7d' | 'extend_sub_30d' | 'pause' | 'resume') => {
    if (selectedUserIds.length === 0) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/system/users/bulk`, {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({ userIds: selectedUserIds, action })
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`Bulk action completed on ${data.updatedCount} accounts.`);
        setSelectedUserIds([]);
        fetchAllData();
      }
    } catch (e: any) {
      showNotification(e.message, true);
    }
  };

  // Filtered Users List
  const filteredUsers = users.filter(u => {
    const matchSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchRole = !roleFilter || u.role === roleFilter;
    const matchStatus = !statusFilter || u.status === statusFilter;
    const matchTier = !tierFilter || u.tier === tierFilter;
    return matchSearch && matchRole && matchStatus && matchTier;
  });

  const handleAssignCustomTrial = async () => {
    setAssigningTrial(true);
    setTrialNotice(null);

    let targetIds: string[] = [];
    if (ctTargetType === 'individual') {
      targetIds = ctSelectedUserIds;
    } else if (ctTargetType === 'group') {
      if (!ctSelectedGroupId) {
        alert('Please select a Cohort Group');
        setAssigningTrial(false);
        return;
      }
      targetIds = [ctSelectedGroupId];
    } else if (ctTargetType === 'tag') {
      if (!ctSelectedTagId) {
        alert('Please select a Tag');
        setAssigningTrial(false);
        return;
      }
      targetIds = [ctSelectedTagId];
    }

    if (targetIds.length === 0) {
      alert('Please select at least one target user, group, or tag.');
      setAssigningTrial(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/user-management/trials/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-email': adminEmail
        },
        body: JSON.stringify({
          targetType: ctTargetType,
          targetIds,
          payload: {
            trialName: ctName,
            days: ctDurationType === 'days' ? Number(ctDays) : undefined,
            expiryDate: ctDurationType === 'date' ? ctExpiryDate : undefined,
            tier: ctTier,
            strategyAccess: ctStrategyAccess,
            maxSignals: Number(ctMaxSignals),
            allowCalculators: ctAllowCalculators
          }
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTrialNotice(`🎉 Custom Trial assigned successfully to ${data.affectedCount} user(s)!`);
        setTimeout(() => setTrialNotice(null), 5000);
        fetchAllData();
      } else {
        alert(`⚠️ ${data.error || 'Failed to assign custom trial'}`);
      }
    } catch (err: any) {
      alert(`⚠️ Error: ${err.message}`);
    } finally {
      setAssigningTrial(false);
    }
  };

  const handleCreateCouponFromTrial = async () => {
    const defaultCode = `${ctName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 5).toUpperCase()}${ctDays || 14}`;
    const code = prompt('Enter a new Coupon Code for this Custom Trial config:', defaultCode);
    if (!code) return;

    try {
      const res = await fetch(`${API_BASE}/api/user-management/coupons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-email': adminEmail },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          discountType: 'trial_extension',
          discountValue: ctDays || 14,
          maxRedemptions: 1000,
          applicableTiers: ctTier,
          status: 'active'
        })
      });
      const data = await res.json();
      if (res.ok) {
        alert(`🎟️ Custom Coupon "${code.toUpperCase()}" created successfully! Users redeeming this coupon will receive this Custom Trial.`);
        fetchAllData();
      } else {
        alert(`⚠️ ${data.error || 'Failed to create coupon'}`);
      }
    } catch (err: any) {
      alert(`⚠️ ${err.message}`);
    }
  };

  // Calculate Metrics
  const activeCount = users.filter(u => u.status === 'active').length;
  const trialistCount = users.filter(u => u.isTrial && !u.trialExpired).length;
  const pausedCount = users.filter(u => u.status === 'paused').length;
  const activeCouponsCount = coupons.filter(c => c.status === 'active').length;

  return (
    <div className="ums-container">
      {/* Header Bar */}
      <div className="ums-header">
        <div className="ums-title-box">
          <h2>
            🛡️ User Management System
            {isSuperAdmin ? (
              <span className="ums-badge-super">Superadmin Access</span>
            ) : (
              <span className="ums-badge-admin">Admin Control</span>
            )}
          </h2>
          <p>Manage traders, custom subscription dates, pause logic, trials, coupons, cohorts & automated alerts.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="ums-btn-secondary" onClick={fetchAllData} disabled={loading}>
            {loading ? 'Refreshing...' : '🔄 Refresh Data'}
          </button>
          <button className="ums-btn-primary" onClick={() => setShowAddUserModal(true)}>
            + Add New Trader
          </button>
        </div>
      </div>

      {/* Alerts */}
      {successMsg && <div style={{ background: 'rgba(16,185,129,0.2)', color: '#34d399', padding: '0.75rem', borderRadius: '8px', border: '1px solid #10b981' }}>{successMsg}</div>}
      {errorMsg && <div style={{ background: 'rgba(225,29,72,0.2)', color: '#f43f5e', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e11d48' }}>{errorMsg}</div>}

      {/* Metrics Grid */}
      <div className="ums-metrics-grid">
        <div className="ums-metric-card">
          <span className="ums-metric-label">Active Users</span>
          <span className="ums-metric-value">{activeCount}</span>
          <span className="ums-metric-sub">Total provisioned accounts</span>
        </div>
        <div className="ums-metric-card">
          <span className="ums-metric-label">Active VIP Trials</span>
          <span className="ums-metric-value">{trialistCount}</span>
          <span className="ums-metric-sub">Trial passes in progress</span>
        </div>
        <div className="ums-metric-card">
          <span className="ums-metric-label">Paused Subscriptions</span>
          <span className="ums-metric-value">{pausedCount}</span>
          <span className="ums-metric-sub">Frozen access days</span>
        </div>
        <div className="ums-metric-card">
          <span className="ums-metric-label">Active Coupons</span>
          <span className="ums-metric-value">{activeCouponsCount}</span>
          <span className="ums-metric-sub">Vouchers & Trial Passes</span>
        </div>
      </div>

      {/* Nav Tabs */}
      <div className="ums-nav-tabs">
        <button className={`ums-tab-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
          👥 Users Directory ({filteredUsers.length})
        </button>
        <button className={`ums-tab-btn ${activeTab === 'subscriptions' ? 'active' : ''}`} onClick={() => setActiveTab('subscriptions')}>
          ⚡ Subscription & Trial Control
        </button>
        <button className={`ums-tab-btn ${activeTab === 'coupons' ? 'active' : ''}`} onClick={() => setActiveTab('coupons')}>
          🎟️ Coupon Code Engine ({coupons.length})
        </button>
        <button className={`ums-tab-btn ${activeTab === 'tags_groups' ? 'active' : ''}`} onClick={() => setActiveTab('tags_groups')}>
          🏷️ Tags & Cohort Groups
        </button>
        <button className={`ums-tab-btn ${activeTab === 'notifications' ? 'active' : ''}`} onClick={() => setActiveTab('notifications')}>
          🔔 Notification Hub
        </button>
        <button className={`ums-tab-btn ${activeTab === 'audit_logs' ? 'active' : ''}`} onClick={() => setActiveTab('audit_logs')}>
          📜 System Audit Logs
        </button>
      </div>

      {/* TAB 1: USERS DIRECTORY */}
      {activeTab === 'users' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Toolbar */}
          <div className="ums-toolbar">
            <input
              type="text"
              className="ums-search-input"
              placeholder="🔍 Search name, email, or user ID..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <select className="ums-filter-select" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                <option value="">All Roles</option>
                <option value="trader">Trader</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
              <select className="ums-filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="expired">Expired</option>
                <option value="suspended">Suspended</option>
              </select>
              <select className="ums-filter-select" value={tierFilter} onChange={e => setTierFilter(e.target.value)}>
                <option value="">All Tiers</option>
                <option value="futures_forex">Futures & Forex</option>
                <option value="forex_only">Forex Only</option>
                <option value="free">Free Tier</option>
              </select>
            </div>
          </div>

          {/* Bulk Action Bar */}
          {selectedUserIds.length > 0 && (
            <div style={{ background: 'rgba(56,189,248,0.15)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid rgba(56,189,248,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Selected <strong>{selectedUserIds.length}</strong> user(s)</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="ums-btn-secondary" onClick={() => handleBulkAction('extend_trial_7d')}>+7d Trial</button>
                <button className="ums-btn-secondary" onClick={() => handleBulkAction('extend_sub_30d')}>+30d Sub</button>
                <button className="ums-btn-secondary" onClick={() => handleBulkAction('pause')}>Pause Selected</button>
                <button className="ums-btn-secondary" onClick={() => handleBulkAction('resume')}>Resume Selected</button>
              </div>
            </div>
          )}

          {/* Users Data Table */}
          <div className="ums-table-wrapper">
            <table className="ums-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>
                    <input
                      type="checkbox"
                      onChange={e => setSelectedUserIds(e.target.checked ? filteredUsers.map(u => u.id) : [])}
                      checked={selectedUserIds.length > 0 && selectedUserIds.length === filteredUsers.length}
                    />
                  </th>
                  <th>User Details</th>
                  <th>Role</th>
                  <th>Tier</th>
                  <th>Status</th>
                  <th>Subscription / Trial Expiry</th>
                  <th>Tags & Cohorts</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                      No matching users found.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map(user => (
                    <tr key={user.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedUserIds.includes(user.id)}
                          onChange={e => {
                            if (e.target.checked) setSelectedUserIds([...selectedUserIds, user.id]);
                            else setSelectedUserIds(selectedUserIds.filter(id => id !== user.id));
                          }}
                        />
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: '#f8fafc' }}>{user.name}</div>
                        <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{user.email}</div>
                      </td>
                      <td>
                        <span className={`status-pill ${user.role === 'super_admin' ? 'expired' : user.role === 'admin' ? 'active' : 'trialing'}`}>
                          {user.role}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#38bdf8' }}>{user.tier}</span>
                      </td>
                      <td>
                        <span className={`status-pill ${user.status}`}>
                          {user.status}
                        </span>
                      </td>
                      <td>
                        {user.isTrial ? (
                          <div>
                            <span style={{ fontSize: '0.75rem', background: 'rgba(168,85,247,0.2)', color: '#c084fc', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: 600 }}>VIP Trial</span>
                            <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '2px' }}>
                              Expires: {user.trialExpiresAt ? new Date(user.trialExpiresAt).toLocaleDateString() : 'N/A'}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span style={{ fontSize: '0.78rem', color: '#e2e8f0' }}>
                              {user.subscriptionEnd ? new Date(user.subscriptionEnd).toLocaleDateString() : 'Active (Custom)'}
                            </span>
                            {user.pauseStartDate && (
                              <div style={{ fontSize: '0.7rem', color: '#fbbf24' }}>
                                Paused ({user.pausedRemainingDays}d frozen)
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        {user.tags && user.tags.map(t => <span key={t} className="tag-badge" style={{ background: '#6366f1' }}>{t}</span>)}
                        {user.groups && user.groups.map(g => <span key={g} className="group-badge">{g}</span>)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button
                            className="ums-btn-secondary"
                            onClick={() => handleImpersonateUser(user)}
                            style={{ border: '1px solid #38bdf8', color: '#38bdf8' }}
                          >
                            🕵️ Impersonate
                          </button>
                          <button className="ums-btn-secondary" onClick={() => setSelectedUser(user)}>
                            ⚙️ Manage User
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: SUBSCRIPTIONS & TRIALS CONTROL */}
      {activeTab === 'subscriptions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h3>⚡ Subscription Pause, Resumption & Trial Control Center</h3>

          {/* CUSTOM TRIAL & FEATURE PERMISSION BUILDER */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 0 25px rgba(56, 189, 248, 0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h4 style={{ margin: 0, color: '#38bdf8', fontSize: '1.1rem', fontWeight: 900 }}>
                  🎨 CREATE & ASSIGN CUSTOM TRIAL WITH FEATURE PERMISSIONS
                </h4>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  Configure custom trial durations, market access tiers, strategy limits, and assign directly to individual users, cohort groups, or tags.
                </span>
              </div>
            </div>

            {trialNotice && (
              <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.15)', border: '1px solid #22c55e', color: '#4ade80', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 800, marginBottom: '16px' }}>
                {trialNotice}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '16px' }}>
              {/* Trial Name */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: '#e2e8f0', marginBottom: '6px' }}>
                  TRIAL NAME / COHORT TITLE
                </label>
                <input
                  type="text"
                  value={ctName}
                  onChange={e => setCtName(e.target.value)}
                  placeholder="e.g. Asia Launch Cohort 14-Day VIP Trial"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.85rem' }}
                />
              </div>

              {/* Duration Type & Length */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: '#fbbf24', marginBottom: '6px' }}>
                  TRIAL DURATION & EXPIRATION
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    value={ctDurationType}
                    onChange={e => setCtDurationType(e.target.value as any)}
                    style={{ padding: '8px 10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.85rem' }}
                  >
                    <option value="days">Duration (Days)</option>
                    <option value="date">Specific End Date</option>
                  </select>
                  {ctDurationType === 'days' ? (
                    <select
                      value={ctDays}
                      onChange={e => setCtDays(Number(e.target.value))}
                      style={{ flex: 1, padding: '8px 10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.85rem' }}
                    >
                      <option value={7}>7 Days</option>
                      <option value={14}>14 Days</option>
                      <option value={21}>21 Days</option>
                      <option value={30}>30 Days</option>
                      <option value={60}>60 Days</option>
                      <option value={90}>90 Days</option>
                    </select>
                  ) : (
                    <input
                      type="date"
                      value={ctExpiryDate}
                      onChange={e => setCtExpiryDate(e.target.value)}
                      style={{ flex: 1, padding: '8px 10px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.85rem' }}
                    />
                  )}
                </div>
              </div>

              {/* Access Tier */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: '#38bdf8', marginBottom: '6px' }}>
                  MARKET ACCESS TIER
                </label>
                <select
                  value={ctTier}
                  onChange={e => setCtTier(e.target.value as any)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.85rem' }}
                >
                  <option value="futures_forex">Futures & Forex (Full Access)</option>
                  <option value="forex_only">Forex Only</option>
                  <option value="free">Free Tier (Restricted)</option>
                </select>
              </div>

              {/* Strategy Access */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: '#c084fc', marginBottom: '6px' }}>
                  STRATEGY PERMISSIONS
                </label>
                <select
                  value={ctStrategyAccess}
                  onChange={e => setCtStrategyAccess(e.target.value as any)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.85rem' }}
                >
                  <option value="all">All Strategies (Sentinel V2 & Manna SnD)</option>
                  <option value="sentinel_v2">Sentinel V2 / Manna Elite V1 Only</option>
                  <option value="manna_snd">Manna SnD Only</option>
                </select>
              </div>

              {/* Max Viewable Signals */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: '#34d399', marginBottom: '6px' }}>
                  MAX SIGNALS VIEWABLE
                </label>
                <select
                  value={ctMaxSignals}
                  onChange={e => setCtMaxSignals(Number(e.target.value))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.85rem' }}
                >
                  <option value={1}>1 Live Signal</option>
                  <option value={3}>3 Live Signals</option>
                  <option value={6}>6 Live Signals</option>
                  <option value={999}>Unlimited Live Signals</option>
                </select>
              </div>

              {/* Position Calculator Toggle */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: '#f472b6', marginBottom: '6px' }}>
                  POSITION CALCULATOR ACCESS
                </label>
                <button
                  type="button"
                  onClick={() => setCtAllowCalculators(!ctAllowCalculators)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: ctAllowCalculators ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
                    border: `1px solid ${ctAllowCalculators ? '#22c55e' : '#ef4444'}`,
                    color: ctAllowCalculators ? '#4ade80' : '#f87171',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  {ctAllowCalculators ? '✅ Calculators & Tools Enabled' : '🔒 Calculators Disabled'}
                </button>
              </div>
            </div>

            {/* TARGET ASSIGNMENT SELECTION */}
            <div style={{ background: 'rgba(30, 41, 59, 0.6)', padding: '14px', borderRadius: '8px', border: '1px solid #334155', marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 900, color: '#fbbf24', marginBottom: '8px' }}>
                🎯 TARGET ASSIGNMENT (INDIVIDUAL USER, COHORT GROUP, OR TAG)
              </label>

              <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem', color: '#fff' }}>
                  <input type="radio" name="ctTarget" checked={ctTargetType === 'individual'} onChange={() => setCtTargetType('individual')} />
                  👤 Specific Individual User(s)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem', color: '#fff' }}>
                  <input type="radio" name="ctTarget" checked={ctTargetType === 'group'} onChange={() => setCtTargetType('group')} />
                  👥 Entire Cohort Group
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem', color: '#fff' }}>
                  <input type="radio" name="ctTarget" checked={ctTargetType === 'tag'} onChange={() => setCtTargetType('tag')} />
                  🏷️ Tagged User Group
                </label>
              </div>

              {ctTargetType === 'individual' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                    Select User(s) from directory (Hold Ctrl/Cmd to select multiple):
                  </label>
                  <select
                    multiple
                    value={ctSelectedUserIds}
                    onChange={e => {
                      const opts = Array.from(e.target.selectedOptions).map(o => o.value);
                      setCtSelectedUserIds(opts);
                    }}
                    style={{ width: '100%', height: '90px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.82rem', padding: '6px' }}
                  >
                    {users.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email}) — Tier: {u.tier}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {ctTargetType === 'group' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                    Select Cohort Group:
                  </label>
                  <select
                    value={ctSelectedGroupId}
                    onChange={e => setCtSelectedGroupId(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.85rem' }}
                  >
                    <option value="">Select a Group...</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.memberCount || 0} members)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {ctTargetType === 'tag' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                    Select Tagged Group:
                  </label>
                  <select
                    value={ctSelectedTagId}
                    onChange={e => setCtSelectedTagId(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.85rem' }}
                  >
                    <option value="">Select a Tag...</option>
                    {tags.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* ACTION BUTTONS */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="ums-btn-secondary"
                onClick={handleCreateCouponFromTrial}
                style={{ border: '1px solid #fbbf24', color: '#fbbf24' }}
              >
                🎟️ Generate Custom Coupon from this Config
              </button>
              <button
                type="button"
                className="ums-btn-primary"
                onClick={handleAssignCustomTrial}
                disabled={assigningTrial}
                style={{ background: 'linear-gradient(90deg, #0284c7 0%, #0369a1 100%)', color: '#fff', fontWeight: 900 }}
              >
                {assigningTrial ? '⏳ Assigning Trial...' : '⚡ ASSIGN CUSTOM TRIAL NOW'}
              </button>
            </div>
          </div>
          <div className="ums-table-wrapper">
            <table className="ums-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Current State</th>
                  <th>Subscription End Date</th>
                  <th>Pause / Auto-Resume Info</th>
                  <th>Quick Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{u.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{u.email}</div>
                    </td>
                    <td>
                      <span className={`status-pill ${u.status}`}>{u.status}</span>
                    </td>
                    <td>
                      {u.subscriptionEnd ? new Date(u.subscriptionEnd).toLocaleDateString() : 'Custom Date'}
                    </td>
                    <td>
                      {u.status === 'paused' ? (
                        <div style={{ color: '#fbbf24', fontSize: '0.8rem' }}>
                          Paused on {u.pauseStartDate ? new Date(u.pauseStartDate).toLocaleDateString() : 'Now'}
                          <div>Auto-Resume: {u.pauseResumeDate ? new Date(u.pauseResumeDate).toLocaleDateString() : 'Manual'}</div>
                        </div>
                      ) : (
                        <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Not paused</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        {u.status === 'paused' ? (
                          <button className="ums-btn-secondary" onClick={() => handleResumeUser(u.id)}>▶️ Resume Now</button>
                        ) : (
                          <button className="ums-btn-secondary" onClick={() => handlePauseUser(u.id)}>⏸️ Pause Access</button>
                        )}
                        <button className="ums-btn-secondary" onClick={() => handleExtendTrial(u.id, 7)}>+7d Trial</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: COUPONS ENGINE */}
      {activeTab === 'coupons' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>🎟️ System Coupon Codes & Vouchers</h3>
            <button className="ums-btn-primary" onClick={() => setShowCouponModal(true)}>+ Create New Coupon</button>
          </div>
          <div className="ums-coupons-grid">
            {coupons.map(coupon => (
              <div key={coupon.id} className="ums-coupon-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="ums-coupon-code">{coupon.code}</span>
                  <span className={`status-pill ${coupon.status}`}>{coupon.status}</span>
                </div>
                <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                  Type: <strong>{coupon.discountType}</strong> ({coupon.discountValue} {coupon.discountType === 'percentage' ? '%' : 'off'})
                </div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  Redemptions: {coupon.currentRedemptions} / {coupon.maxRedemptions}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Tiers: {coupon.applicableTiers}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: TAGS & COHORTS */}
      {activeTab === 'tags_groups' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          {/* Tags Box */}
          <div style={{ background: 'rgba(30,41,59,0.4)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h4>🏷️ Dynamic User Tags</h4>
              <button className="ums-btn-secondary" onClick={() => setShowTagModal(true)}>+ New Tag</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {tags.map(tag => (
                <div key={tag.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(15,23,42,0.6)', padding: '0.75rem', borderRadius: '8px' }}>
                  <div>
                    <span className="tag-badge" style={{ background: tag.color }}>{tag.name}</span>
                    <span style={{ fontSize: '0.78rem', color: '#94a3b8', marginLeft: '0.5rem' }}>{tag.description}</span>
                  </div>
                  <button
                    className="ums-btn-secondary"
                    onClick={() => {
                      setCtTargetType('tag');
                      setCtSelectedTagId(tag.id);
                      setActiveTab('subscriptions');
                    }}
                    style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                  >
                    ⚡ Assign Trial
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Cohort Groups Box */}
          <div style={{ background: 'rgba(30,41,59,0.4)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h4>👥 Cohort User Groups</h4>
              <button className="ums-btn-secondary" onClick={() => setShowGroupModal(true)}>+ New Cohort Group</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {groups.map(group => (
                <div key={group.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(15,23,42,0.6)', padding: '0.75rem', borderRadius: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#38bdf8' }}>{group.name}</div>
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{group.description}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.8rem', background: 'rgba(51,65,85,0.8)', padding: '0.2rem 0.6rem', borderRadius: '9999px' }}>
                      {group.memberCount || 0} members
                    </span>
                    <button
                      className="ums-btn-secondary"
                      onClick={() => {
                        setCtTargetType('group');
                        setCtSelectedGroupId(group.id);
                        setActiveTab('subscriptions');
                      }}
                      style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                    >
                      ⚡ Assign Custom Trial
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: NOTIFICATION HUB */}
      {activeTab === 'notifications' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>🔔 Automated Notifications & Announcements</h3>
            <button className="ums-btn-primary" onClick={() => setShowBroadcastModal(true)}>📢 Send Broadcast Announcement</button>
          </div>

          <div style={{ background: 'rgba(30,41,59,0.4)', padding: '1.25rem', borderRadius: '12px' }}>
            <h4>Notification Dispatch Log</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
              {notifications.length === 0 ? (
                <div style={{ color: '#64748b' }}>No notifications dispatched yet.</div>
              ) : (
                notifications.map(n => (
                  <div key={n.id} style={{ background: 'rgba(15,23,42,0.6)', padding: '0.75rem', borderRadius: '8px', borderLeft: '3px solid #38bdf8' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <strong style={{ color: '#f8fafc' }}>{n.title}</strong>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{new Date(n.createdAt).toLocaleTimeString()}</span>
                    </div>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.82rem', color: '#94a3b8' }}>{n.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: AUDIT LOGS */}
      {activeTab === 'audit_logs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h3>📜 System Admin Audit Trail</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {auditLogs.map(log => (
              <div key={log.id} className="audit-log-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: '#38bdf8' }}>{log.action}</span>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{new Date(log.createdAt).toLocaleString()}</span>
                </div>
                <div style={{ color: '#94a3b8' }}>
                  Executed by: <strong>{log.adminEmail}</strong> ({log.adminRole})
                </div>
                {log.detailsJson && (
                  <pre style={{ margin: 0, fontSize: '0.75rem', background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '4px', overflowX: 'auto' }}>
                    {log.detailsJson}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL 1: EDIT USER DRAWER */}
      {selectedUser && (
        <div className="ums-modal-overlay">
          <div className="ums-modal-card">
            <div className="ums-modal-header">
              <h3>⚙️ Manage User: {selectedUser.name}</h3>
              <button className="ums-modal-close" onClick={() => setSelectedUser(null)}>✕</button>
            </div>
            <div className="ums-modal-body">
              <button
                type="button"
                className="ums-btn-primary"
                onClick={() => {
                  handleImpersonateUser(selectedUser);
                  setSelectedUser(null);
                }}
                style={{
                  background: 'linear-gradient(90deg, #0284c7 0%, #0369a1 100%)',
                  color: '#fff',
                  fontWeight: 900,
                  width: '100%',
                  marginBottom: '1rem',
                  padding: '10px',
                  boxShadow: '0 0 15px rgba(2, 132, 199, 0.4)',
                  cursor: 'pointer'
                }}
              >
                🕵️ IMPERSONATE THIS USER ACCOUNT NOW
              </button>
              <div className="ums-form-group">
                <label>Email Address</label>
                <input type="text" value={selectedUser.email} disabled />
              </div>

              <div className="ums-form-row">
                <div className="ums-form-group">
                  <label>Role</label>
                  <select value={selectedUser.role} onChange={e => setSelectedUser({ ...selectedUser, role: e.target.value as any })}>
                    <option value="trader">Trader</option>
                    <option value="admin">Admin</option>
                    {isSuperAdmin && <option value="super_admin">Super Admin</option>}
                  </select>
                </div>
                <div className="ums-form-group">
                  <label>Tier</label>
                  <select value={selectedUser.tier} onChange={e => setSelectedUser({ ...selectedUser, tier: e.target.value })}>
                    <option value="futures_forex">Futures & Forex</option>
                    <option value="forex_only">Forex Only</option>
                    <option value="free">Free</option>
                  </select>
                </div>
              </div>

              {/* Custom Dates Box */}
              <div style={{ background: 'rgba(30,41,59,0.5)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: '#38bdf8' }}>📅 Custom Subscription Dates</h4>
                <div className="ums-form-row">
                  <div className="ums-form-group">
                    <label>Start Date</label>
                    <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} />
                  </div>
                  <div className="ums-form-group">
                    <label>End Date</label>
                    <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} />
                  </div>
                </div>
                <button className="ums-btn-secondary" style={{ marginTop: '0.75rem' }} onClick={() => handleCustomDates(selectedUser.id)}>
                  Save Custom Dates
                </button>
              </div>

              {/* Subscription Pause Box */}
              <div style={{ background: 'rgba(30,41,59,0.5)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: '#fbbf24' }}>⏸️ Subscription Pause & Auto-Resume</h4>
                {selectedUser.status === 'paused' ? (
                  <div>
                    <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Currently paused. {selectedUser.pausedRemainingDays} remaining days frozen.</p>
                    <button className="ums-btn-primary" onClick={() => handleResumeUser(selectedUser.id)}>Resume Subscription</button>
                  </div>
                ) : (
                  <div className="ums-form-group">
                    <label>Optional Auto-Resume Date</label>
                    <input type="date" value={autoResumeDate} onChange={e => setAutoResumeDate(e.target.value)} />
                    <button className="ums-btn-secondary" style={{ marginTop: '0.5rem' }} onClick={() => handlePauseUser(selectedUser.id)}>
                      Pause Access Now
                    </button>
                  </div>
                )}
              </div>

              {/* Coupon Applicator */}
              <div style={{ background: 'rgba(30,41,59,0.5)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: '#c084fc' }}>🎟️ Apply Coupon Code</h4>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input type="text" placeholder="Enter coupon code..." value={applyCouponCode} onChange={e => setApplyCouponCode(e.target.value)} />
                  <button className="ums-btn-secondary" onClick={() => handleApplyCoupon(selectedUser.email)}>Apply</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD USER */}
      {showAddUserModal && (
        <div className="ums-modal-overlay">
          <div className="ums-modal-card">
            <div className="ums-modal-header">
              <h3>+ Provision New Trader Account</h3>
              <button className="ums-modal-close" onClick={() => setShowAddUserModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAddUser} className="ums-modal-body">
              <div className="ums-form-group">
                <label>Full Name</label>
                <input type="text" required value={newUserForm.name} onChange={e => setNewUserForm({ ...newUserForm, name: e.target.value })} />
              </div>
              <div className="ums-form-group">
                <label>Email Address</label>
                <input type="email" required value={newUserForm.email} onChange={e => setNewUserForm({ ...newUserForm, email: e.target.value })} />
              </div>
              <div className="ums-form-row">
                <div className="ums-form-group">
                  <label>Role</label>
                  <select value={newUserForm.role} onChange={e => setNewUserForm({ ...newUserForm, role: e.target.value as any })}>
                    <option value="trader">Trader</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="ums-form-group">
                  <label>Tier</label>
                  <select value={newUserForm.tier} onChange={e => setNewUserForm({ ...newUserForm, tier: e.target.value })}>
                    <option value="futures_forex">Futures & Forex</option>
                    <option value="forex_only">Forex Only</option>
                    <option value="free">Free</option>
                  </select>
                </div>
              </div>
              <div className="ums-form-group">
                <label>
                  <input type="checkbox" checked={newUserForm.isTrial} onChange={e => setNewUserForm({ ...newUserForm, isTrial: e.target.checked })} />
                  Issue 21-Day VIP Trial Pass
                </label>
              </div>
              <button type="submit" className="ums-btn-primary">Create User Profile</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: CREATE COUPON */}
      {showCouponModal && (
        <div className="ums-modal-overlay">
          <div className="ums-modal-card">
            <div className="ums-modal-header">
              <h3>🎟️ Create Coupon Code</h3>
              <button className="ums-modal-close" onClick={() => setShowCouponModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateCoupon} className="ums-modal-body">
              <div className="ums-form-group">
                <label>Coupon Code</label>
                <input type="text" required placeholder="e.g. SUMMER50" value={newCouponForm.code} onChange={e => setNewCouponForm({ ...newCouponForm, code: e.target.value })} />
              </div>
              <div className="ums-form-row">
                <div className="ums-form-group">
                  <label>Discount Type</label>
                  <select value={newCouponForm.discountType} onChange={e => setNewCouponForm({ ...newCouponForm, discountType: e.target.value as any })}>
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed_amount">Fixed Amount ($)</option>
                    <option value="trial_extension">Trial Extension (Days)</option>
                  </select>
                </div>
                <div className="ums-form-group">
                  <label>Discount Value</label>
                  <input type="number" required value={newCouponForm.discountValue} onChange={e => setNewCouponForm({ ...newCouponForm, discountValue: Number(e.target.value) })} />
                </div>
              </div>
              <div className="ums-form-group">
                <label>Max Redemptions</label>
                <input type="number" value={newCouponForm.maxRedemptions} onChange={e => setNewCouponForm({ ...newCouponForm, maxRedemptions: Number(e.target.value) })} />
              </div>
              <button type="submit" className="ums-btn-primary">Generate Coupon Code</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: CREATE TAG */}
      {showTagModal && (
        <div className="ums-modal-overlay">
          <div className="ums-modal-card">
            <div className="ums-modal-header">
              <h3>🏷️ Create Dynamic Tag</h3>
              <button className="ums-modal-close" onClick={() => setShowTagModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateTag} className="ums-modal-body">
              <div className="ums-form-group">
                <label>Tag Name</label>
                <input type="text" required placeholder="e.g. High Volume Trader" value={newTagForm.name} onChange={e => setNewTagForm({ ...newTagForm, name: e.target.value })} />
              </div>
              <div className="ums-form-group">
                <label>Color</label>
                <input type="color" value={newTagForm.color} onChange={e => setNewTagForm({ ...newTagForm, color: e.target.value })} />
              </div>
              <button type="submit" className="ums-btn-primary">Save Tag</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: CREATE COHORT GROUP */}
      {showGroupModal && (
        <div className="ums-modal-overlay">
          <div className="ums-modal-card">
            <div className="ums-modal-header">
              <h3>👥 Create Cohort Group</h3>
              <button className="ums-modal-close" onClick={() => setShowGroupModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateGroup} className="ums-modal-body">
              <div className="ums-form-group">
                <label>Cohort Group Name</label>
                <input type="text" required placeholder="e.g. Q3 Mastery Cohort" value={newGroupForm.name} onChange={e => setNewGroupForm({ ...newGroupForm, name: e.target.value })} />
              </div>
              <div className="ums-form-group">
                <label>Description</label>
                <input type="text" placeholder="Cohort details..." value={newGroupForm.description} onChange={e => setNewGroupForm({ ...newGroupForm, description: e.target.value })} />
              </div>
              <button type="submit" className="ums-btn-primary">Save Cohort Group</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: BROADCAST ANNOUNCEMENT */}
      {showBroadcastModal && (
        <div className="ums-modal-overlay">
          <div className="ums-modal-card">
            <div className="ums-modal-header">
              <h3>📢 Broadcast Announcement Notification</h3>
              <button className="ums-modal-close" onClick={() => setShowBroadcastModal(false)}>✕</button>
            </div>
            <form onSubmit={handleBroadcastNotification} className="ums-modal-body">
              <div className="ums-form-group">
                <label>Target Audience</label>
                <select value={broadcastForm.targetType} onChange={e => setBroadcastForm({ ...broadcastForm, targetType: e.target.value })}>
                  <option value="all">All Active Users</option>
                  <option value="tag">Specific Tag Group</option>
                  <option value="group">Specific Cohort Group</option>
                </select>
              </div>
              <div className="ums-form-group">
                <label>Announcement Title</label>
                <input type="text" required placeholder="e.g. New Killzone Strategy Activated" value={broadcastForm.title} onChange={e => setBroadcastForm({ ...broadcastForm, title: e.target.value })} />
              </div>
              <div className="ums-form-group">
                <label>Message Content</label>
                <textarea rows={4} required placeholder="Write message..." value={broadcastForm.message} onChange={e => setBroadcastForm({ ...broadcastForm, message: e.target.value })} />
              </div>
              <button type="submit" className="ums-btn-primary">Dispatch Broadcast</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagementSystem;
