import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './DashboardHeader.css';
import { KillzoneClock } from './KillzoneClock';
import { CircuitBreakerIndicator } from './CircuitBreakerIndicator';
import { useAuth } from '../context/AuthContext';
import { useVoice } from '../context/VoiceContext';

export const DashboardHeader: React.FC = () => {
  const { user, logout } = useAuth();
  const { voiceEnabled, toggleVoice, testVoice } = useVoice();
  const location = useLocation();

  return (
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
            <Link to="/admin" className={`nav-link ${location.pathname === '/admin' ? 'active' : ''}`}>
              ⚙️ Admin
            </Link>
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
              <span className="user-email-chip">{user.email.split('@')[0]}</span>
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
  );
};
