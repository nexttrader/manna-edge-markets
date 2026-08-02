import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './DashboardHeader.css';
import { KillzoneClock } from './KillzoneClock';
import { CircuitBreakerIndicator } from './CircuitBreakerIndicator';
import { EconomicCalendarModal } from './EconomicCalendarModal';
import { FaqModal } from './FaqModal';
import { useAuth } from '../context/AuthContext';
import { useVoice } from '../context/VoiceContext';

export const DashboardHeader: React.FC = () => {
  const { user, logout, originalAdmin, elevateToSuperAdmin } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || originalAdmin?.role === 'admin';
  const isSuperAdmin = user?.role === 'super_admin' || originalAdmin?.role === 'super_admin';
  const { voiceEnabled, toggleVoice, testVoice } = useVoice();
  const location = useLocation();
  const [showCalendar, setShowCalendar] = useState(false);
  const [showFaq, setShowFaq] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);

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

      {showCalendar && (
        <EconomicCalendarModal onClose={() => setShowCalendar(false)} />
      )}

      {showFaq && (
        <FaqModal onClose={() => setShowFaq(false)} />
      )}
    </>
  );
};
