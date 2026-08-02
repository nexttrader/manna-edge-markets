import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './DashboardHeader.css';
import { KillzoneClock } from './KillzoneClock';
import { CircuitBreakerIndicator } from './CircuitBreakerIndicator';
import { EconomicCalendarModal } from './EconomicCalendarModal';
import { FaqModal } from './FaqModal';
import { useAuth } from '../context/AuthContext';
import { useVoice } from '../context/VoiceContext';
import { UserInbox } from './UserInbox';
import { UserInboxBanner } from './UserInboxBanner';
import { API_BASE } from '../config';

export const DashboardHeader: React.FC = () => {
  const { user, logout, originalAdmin, elevateToSuperAdmin } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || originalAdmin?.role === 'admin';
  const isSuperAdmin = user?.role === 'super_admin' || originalAdmin?.role === 'super_admin';
  const { voiceEnabled, toggleVoice, testVoice } = useVoice();
  const location = useLocation();
  const [showCalendar, setShowCalendar] = useState(false);
  const [showFaq, setShowFaq] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [inboxUnread, setInboxUnread] = useState(0);
  const [clickCount, setClickCount] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);

  const isTrader = user?.role === 'trader';

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
            <Link to="/" className="header-logo font-mono">
              <span className="logo-emblem">⚡</span>
              MANNA EDGE MARKETS
            </Link>
            
            <nav className="header-nav font-mono">
              <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}>
                🏠 Home
              </Link>
              <Link to="/dashboard" className={`nav-link ${location.pathname === '/dashboard' ? 'active' : ''}`}>
                📊 Dashboard
              </Link>
              <button 
                className="nav-link font-mono" 
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={() => setShowCalendar(true)}
              >
                📅 Calendar
              </button>
              <button 
                className="nav-link font-mono" 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e056fd' }}
                onClick={() => setShowFaq(true)}
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
              {isTrader && (
                <button
                  className="nav-link font-mono"
                  style={{
                    background: inboxUnread > 0 ? 'rgba(0,229,255,0.15)' : 'none',
                    border: inboxUnread > 0 ? '1px solid rgba(0,229,255,0.4)' : 'none',
                    cursor: 'pointer',
                    color: inboxUnread > 0 ? '#00e5ff' : '#aaa',
                    fontWeight: inboxUnread > 0 ? 900 : 600,
                    position: 'relative',
                    borderRadius: '6px',
                    padding: '4px 10px'
                  }}
                  onClick={() => setShowInbox(true)}
                  title="Open Support Inbox"
                >
                  📬 Inbox
                  {inboxUnread > 0 && (
                    <span style={{
                      position: 'absolute', top: -5, right: -5,
                      background: '#ff3b3b', color: '#fff',
                      fontSize: '0.55rem', fontWeight: 900,
                      minWidth: 15, height: 15, borderRadius: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '0 3px'
                    }}>{inboxUnread}</span>
                  )}
                </button>
              )}
            </nav>
          </div>
          
          <div className="header-center">
            <KillzoneClock />
          </div>
          
          <div className="header-actions">
            {/* Voice Announcements Toggle Button */}
            <div className="voice-control-box font-mono">
              <button 
                className={`voice-toggle-btn ${voiceEnabled ? 'is-enabled' : 'is-disabled'}`}
                onClick={toggleVoice}
                title={voiceEnabled ? 'Click to Mute Voice Announcements' : 'Click to Enable Voice Announcements'}
              >
                {voiceEnabled ? '🔊 VOICE ON' : '🔇 VOICE OFF'}
              </button>
              {voiceEnabled && (
                <button 
                  className="voice-test-btn" 
                  onClick={testVoice}
                  title="Test Audio Voice Alert"
                >
                  ▶ Test
                </button>
              )}
            </div>

            <CircuitBreakerIndicator />

            {user ? (
              <div className="header-user-menu font-mono">
                <span 
                  className="user-email-chip"
                  onClick={handleAdminNameClick}
                  style={{ cursor: 'pointer', userSelect: 'none', border: isSuperAdmin ? '1px solid #b388ff' : undefined }}
                  title="Trader Profile"
                >
                  {user.email.split('@')[0]} {isSuperAdmin ? '👁️' : ''}
                </span>
                <button
                  type="button"
                  className="voice-toggle-btn"
                  style={{ padding: '4px 8px', fontSize: '0.75rem', border: '1px solid #00e5ff', color: '#00e5ff', background: 'rgba(0,229,255,0.1)' }}
                  onClick={() => setShowPasswordModal(true)}
                  title="Change My Password"
                >
                  🔑 Pass
                </button>
                <button onClick={logout} className="logout-btn" title="Sign Out">
                  🚪
                </button>
              </div>
            ) : (
              <Link to="/login" className="login-nav-btn font-mono">
                🔑 Sign In
              </Link>
            )}
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
      {showInbox && isTrader && (
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
    </>
  );
};
