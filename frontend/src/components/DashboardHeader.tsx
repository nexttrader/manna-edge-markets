import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './DashboardHeader.css';
import { KillzoneClock } from './KillzoneClock';
import { CircuitBreakerIndicator } from './CircuitBreakerIndicator';
import { EconomicCalendarModal } from './EconomicCalendarModal';
import { FaqModal } from './FaqModal';
import { useAuth } from '../context/AuthContext';
import { useVoice } from '../context/VoiceContext';
import { useSignalNotifications } from '../context/SignalNotificationContext';
import { LiveActivityFeed } from './LiveActivityFeed';
import { VoiceSettingsModal } from './VoiceSettingsModal';
import { UserInbox } from './UserInbox';
import { UserInboxBanner } from './UserInboxBanner';
import { API_BASE } from '../config';

export const DashboardHeader: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout, originalAdmin, elevateToSuperAdmin } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || originalAdmin?.role === 'admin';
  const isSuperAdmin = user?.role === 'super_admin' || originalAdmin?.role === 'super_admin';
  const { voiceEnabled, toggleVoice, testVoice } = useVoice();
  const { activityLogs, setShowActivityFeed } = useSignalNotifications();
  const location = useLocation();
  const [showCalendar, setShowCalendar] = useState(false);
  const [showFaq, setShowFaq] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [inboxUnread, setInboxUnread] = useState(0);
  const [clickCount, setClickCount] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);

  const isTrader = user?.role === 'trader';

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.dropdown-wrapper')) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleLogout = () => {
    if (window.confirm('Sign out of Manna Edge Markets?')) {
      logout();
      navigate('/login');
    }
  };

  // Poll for unread messages every 20s (traders only)
  const fetchUnread = useCallback(async () => {
    if (!user?.email || !isTrader) return;
    try {
      const res = await fetch(`${API_BASE}/api/support/tickets/user/${encodeURIComponent(user.email)}`);
      const data = await res.json();
      if (data.tickets) {
        const total: number = data.tickets.reduce((s: number, t: any) => s + (t.unreadByUser || 0), 0);
        setInboxUnread(total);
      }
    } catch { /* ignore */ }
  }, [user?.email, isTrader]);

  useEffect(() => {
    fetchUnread();
    const iv = setInterval(fetchUnread, 20000);
    return () => clearInterval(iv);
  }, [fetchUnread]);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [myNewPass, setMyNewPass] = useState('');

  const handleChangeMyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myNewPass || myNewPass.length < 4) {
      alert('⚠️ Password must be at least 4 characters long');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${user?.email}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newPassword: myNewPass,
          requesterRole: user?.role || 'trader',
          requesterEmail: user?.email
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update password');

      setShowPasswordModal(false);
      setMyNewPass('');
      alert('✅ Your password has been changed successfully!');
    } catch (err: any) {
      alert(`⚠️ ${err.message}`);
    }
  };

  const handleAdminNameClick = () => {
    const now = Date.now();
    if (now - lastClickTime > 3000) {
      setClickCount(1);
    } else {
      const newCount = clickCount + 1;
      setClickCount(newCount);
      if (newCount >= 7) {
        elevateToSuperAdmin();
        setClickCount(0);
      }
    }
    setLastClickTime(now);
  };

  return (
    <>
      <header className="dashboard-header glass-card">
        <div className="container header-container">
          <div className="header-left">
            <Link to="/" className="header-logo font-mono" title="Manna Edge Markets — Click for Home">
              <span className="logo-emblem">⚡</span>
              <span className="logo-title-text">MANNA EDGE</span>
            </Link>
            
            <nav className="header-nav font-mono">
              <Link to="/dashboard" className={`nav-link ${location.pathname === '/dashboard' ? 'active' : ''}`}>
                📊 Dashboard
              </Link>
              <button 
                className="nav-link font-mono support-nav-btn"
                style={{
                  background: inboxUnread > 0 ? 'rgba(0,229,255,0.2)' : 'rgba(0,229,255,0.08)',
                  border: '1px solid rgba(0,229,255,0.3)',
                  cursor: 'pointer',
                  color: '#00e5ff',
                  fontWeight: 800,
                  position: 'relative',
                  borderRadius: '6px'
                }}
                onClick={() => setShowInbox(true)}
                title="Open Support Desk & Submit Tickets"
              >
                📬 Support
                {inboxUnread > 0 && (
                  <span className="support-badge-count">{inboxUnread}</span>
                )}
              </button>
              <button 
                className="nav-link font-mono" 
                style={{ background: 'none', border: 'none', cursor: 'pointer', position: 'relative', color: '#00e5ff' }}
                onClick={() => setShowActivityFeed(true)}
                title="Open Live Signal Activity Log & Timeline Feed"
              >
                📡 Live Feed
                {activityLogs.length > 0 && (
                  <span className="support-badge-count" style={{ background: '#00e5ff', color: '#090314' }}>
                    {activityLogs.length}
                  </span>
                )}
              </button>
              <button 
                className="nav-link font-mono" 
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={() => setShowCalendar(true)}
                title="View Economic News Calendar"
              >
                📅 Calendar
              </button>
              <button 
                className="nav-link font-mono" 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e056fd' }}
                onClick={() => setShowFaq(true)}
                title="View Platform Guides & Knowledge Base"
              >
                ❓ FAQ
              </button>

              {isAdmin && (
                <Link to="/admin" className={`nav-link ${location.pathname === '/admin' ? 'active' : ''}`}>
                  ⚙️ Admin
                </Link>
              )}
              {isSuperAdmin && (
                <Link to="/vault-5287" className={`nav-link ${location.pathname === '/vault-5287' ? 'active' : ''}`} style={{ color: '#b388ff' }}>
                  👁️ Master Desk
                </Link>
              )}
            </nav>
          </div>
          
          <div className="header-actions">
            {/* Voice Announcements Toggle & Settings */}
            <div className="voice-control-box font-mono">
              <button 
                className={`voice-toggle-btn ${voiceEnabled ? 'is-enabled' : 'is-disabled'}`}
                onClick={toggleVoice}
                title={voiceEnabled ? 'Click to Mute Voice Announcements' : 'Click to Enable Voice Announcements'}
              >
                {voiceEnabled ? '🔊 Voice' : '🔇 Muted'}
              </button>
              {voiceEnabled && (
                <>
                  <button 
                    className="voice-settings-btn" 
                    onClick={() => testVoice()}
                    title="Test Audio Voice Alert"
                  >
                    ▶
                  </button>
                  <button
                    className="voice-settings-btn"
                    onClick={() => setShowVoiceSettings(true)}
                    title="Configure Voice Settings"
                  >
                    ⚙️
                  </button>
                </>
              )}
            </div>

            <CircuitBreakerIndicator />

            {/* Account Dropdown Menu */}
            {user ? (
              <div className="dropdown-wrapper font-mono">
                <button 
                  className={`header-user-btn font-mono ${showUserMenu ? 'active' : ''}`}
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  title={`Account: ${user.name || user.email}`}
                >
                  <span className="user-icon-chip">👤</span>
                  <span className="user-name-short">{user.name || user.email.split('@')[0]}</span>
                  <span className="user-dropdown-arrow">{showUserMenu ? '▲' : '▼'}</span>
                </button>

                {showUserMenu && (
                  <div className="header-dropdown-menu user-dropdown-menu font-mono animate-slide-up">
                    <div className="user-info-card font-mono">
                      <div 
                        className="user-email-full"
                        onClick={handleAdminNameClick}
                        title="Click 7 times to unlock Master Desk"
                      >
                        {user.email} {isSuperAdmin ? '👁️' : ''}
                      </div>
                      <div className="user-role-badge">
                        Role: <strong>{user.role.toUpperCase()}</strong>
                      </div>
                      <div className="user-last-active">
                        🕒 Active: {user.lastActive || 'Just now'}
                      </div>
                    </div>

                    <div className="dropdown-divider" />

                    {isAdmin && (
                      <Link to="/admin" className="dropdown-item" onClick={() => setShowUserMenu(false)}>
                        ⚙️ Admin Panel
                      </Link>
                    )}
                    {isSuperAdmin && (
                      <Link to="/vault-5287" className="dropdown-item" style={{ color: '#b388ff' }} onClick={() => setShowUserMenu(false)}>
                        👁️ Master Desk
                      </Link>
                    )}

                    <button 
                      className="dropdown-item" 
                      onClick={() => { setShowPasswordModal(true); setShowUserMenu(false); }}
                    >
                      🔑 Change Password
                    </button>

                    <div className="dropdown-divider" />

                    <button 
                      className="dropdown-item item-logout" 
                      onClick={() => { setShowUserMenu(false); handleLogout(); }}
                    >
                      🚪 Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link to="/login" className="login-nav-btn">
                Sign In
              </Link>
            )}
          </div>
        </div>

        {/* Secondary Sub-Bar for Killzone Scanner Clock */}
        <div className="header-sub-bar font-mono">
          <div className="container sub-bar-container">
            <KillzoneClock />
          </div>
        </div>
      </header>

      {/* Change My Password Modal */}
      {showPasswordModal && (
        <div className="modal-overlay font-mono" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(6,2,12,0.85)', backdropFilter: 'blur(8px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="glass-card" style={{ background: '#0f0620', border: '1px solid #00e5ff', borderRadius: '12px', padding: '24px', maxWidth: '400px', width: '100%', color: '#fff' }}>
            <h3 style={{ margin: '0 0 12px 0', color: '#00e5ff', fontSize: '1.1rem' }}>🔑 Change Your Password</h3>
            <p style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '16px' }}>Account: {user?.email}</p>
            <form onSubmit={handleChangeMyPassword}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '6px' }}>New Password *</label>
                <input
                  type="password"
                  placeholder="Enter new password..."
                  value={myNewPass}
                  onChange={e => setMyNewPass(e.target.value)}
                  required
                  style={{ width: '100%', padding: '8px 12px', background: '#090314', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: '4px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#ccc', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}
                  onClick={() => setShowPasswordModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ background: '#00e5ff', color: '#090314', border: 'none', padding: '8px 18px', borderRadius: '4px', fontWeight: 900, cursor: 'pointer' }}
                >
                  Save New Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCalendar && (
        <EconomicCalendarModal onClose={() => setShowCalendar(false)} />
      )}

      {showFaq && (
        <FaqModal onClose={() => setShowFaq(false)} />
      )}

      {/* User Support Inbox Modal */}
      {showInbox && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(6,2,12,0.93)', backdropFilter: 'blur(16px)',
            zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px'
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowInbox(false); }}
        >
          <div style={{
            background: '#0f0620',
            border: '1px solid rgba(0,229,255,0.3)',
            borderRadius: '16px', width: '100%', maxWidth: '900px',
            height: '82vh', display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 0 60px rgba(0,229,255,0.12), 0 20px 60px rgba(0,0,0,0.5)'
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '18px 24px 14px',
              borderBottom: '1px solid rgba(255,255,255,0.08)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1.4rem' }}>📬</span>
                <div>
                  <div style={{ fontWeight: 900, color: '#00e5ff', fontSize: '1rem', fontFamily: 'inherit' }}>Support Inbox</div>
                  <div style={{ color: '#666', fontSize: '0.72rem' }}>Create tickets · Read admin replies · Track upgrade requests</div>
                </div>
              </div>
              <button
                onClick={() => setShowInbox(false)}
                style={{
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                  color: '#888', padding: '6px 14px', borderRadius: '6px',
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                onMouseLeave={e => (e.currentTarget.style.color = '#888')}
              >
                ✕ Close
              </button>
            </div>

            {/* Inbox content */}
            <div style={{ flex: 1, overflow: 'hidden', padding: '20px 24px 24px' }}>
              <UserInbox onUnreadChange={setInboxUnread} />
            </div>
          </div>
        </div>
      )}

      {/* Slide-in banner when admin sends new reply */}
      {isTrader && <UserInboxBanner onOpenInbox={() => setShowInbox(true)} />}

      {/* Voice Engine Settings Modal */}
      {showVoiceSettings && (
        <VoiceSettingsModal onClose={() => setShowVoiceSettings(false)} />
      )}

      {/* User-Facing Live Signal Activity Feed Side Drawer */}
      <LiveActivityFeed />
    </>
  );
};
