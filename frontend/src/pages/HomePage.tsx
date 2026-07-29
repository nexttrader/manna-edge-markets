import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { KillzoneClock } from '../components/KillzoneClock';
import './HomePage.css';

export const HomePage: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <div className="home-page-container">
      <div className="home-backdrop-glow" />

      {/* Top Navigation Header */}
      <header className="home-nav glass-card">
        <div className="container nav-container">
          <Link to="/" className="nav-logo">
            <span className="logo-emblem">⚡</span>
            <span className="logo-text">MANNA EDGE MARKETS</span>
          </Link>

          <div className="nav-center">
            <KillzoneClock />
          </div>

          <div className="nav-actions">
            {user ? (
              <div className="user-badge-box">
                <span className="user-role-tag">{user.role.toUpperCase()}</span>
                <span className="user-email">{user.email}</span>
                <Link to="/dashboard" className="btn-nav-primary">
                  📊 Live Signals
                </Link>
                <button onClick={logout} className="btn-nav-logout">
                  Logout
                </button>
              </div>
            ) : (
              <div className="guest-actions">
                <Link to="/login" className="btn-nav-primary">
                  🔑 Sign In
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero-section container">
        <div className="hero-badge animate-fade-in">
          <span>✨ AUTOMATED MARKET SIGNAL PLATFORM</span>
        </div>

        <h1 className="hero-title animate-slide-up">
          MANNA EDGE MARKETS
        </h1>
        <p className="hero-subtitle animate-slide-up">
          Smart, automated trade signals for Futures & Forex. Spot high-probability setups, clear profit targets, and live market updates — all in one simple dashboard.
        </p>

        {/* Live Market Quote Ticker Preview */}
        <div className="market-ticker-bar animate-slide-up">
          <div className="ticker-item"><span className="t-name">NQ (Nasdaq)</span> <span className="t-price">18,992.50</span> <span className="t-change text-green">+1.45%</span></div>
          <div className="ticker-item"><span className="t-name">ES (S&P 500)</span> <span className="t-price">5,509.25</span> <span className="t-change text-green">+0.82%</span></div>
          <div className="ticker-item"><span className="t-name">GC (Gold)</span> <span className="t-price">$2,385.40</span> <span className="t-change text-green">+0.65%</span></div>
          <div className="ticker-item"><span className="t-name">SI (Silver)</span> <span className="t-price">$28.45</span> <span className="t-change text-red">-0.24%</span></div>
          <div className="ticker-item"><span className="t-name">EUR/USD</span> <span className="t-price">1.0854</span> <span className="t-change text-green">+0.12%</span></div>
          <div className="ticker-item"><span className="t-name">GBP/USD</span> <span className="t-price">1.2682</span> <span className="t-change text-green">+0.28%</span></div>
        </div>

        <div className="hero-cta-group animate-slide-up">
          <Link to="/dashboard" className="btn-hero-main">
            🚀 VIEW LIVE SIGNALS
          </Link>
          <Link to="/admin" className="btn-hero-secondary">
            ⚙️ ADMIN PANEL
          </Link>
          {!user && (
            <Link to="/login" className="btn-hero-outline">
              🔑 SIGN IN / REGISTER
            </Link>
          )}
        </div>
      </section>

      {/* Feature Showcase Grid */}
      <section className="features-section container">
        <h2 className="section-title">WHY TRADERS USE MANNA EDGE</h2>

        <div className="features-grid">
          <div className="feature-card glass-card">
            <div className="feature-icon">⏰</div>
            <h3>Peak Session Scans</h3>
            <p>Scans high-volume trading hours (Asian, London, and New York sessions) to spot high-probability market opportunities automatically.</p>
          </div>

          <div className="feature-card glass-card">
            <div className="feature-icon">📈</div>
            <h3>Clear Interactive Charts</h3>
            <p>Click any signal to see clear Entry Zones, Stop Loss safety levels, and Take Profit targets drawn directly on live charts.</p>
          </div>

          <div className="feature-card glass-card">
            <div className="feature-icon">🎯</div>
            <h3>Profit & Risk Tracking</h3>
            <p>Know your exact Risk-to-Reward ratio before entering. Automatically track profit targets and breakeven milestones in real time.</p>
          </div>

          <div className="feature-card glass-card">
            <div className="feature-icon">🛡️</div>
            <h3>Smart Signal Protection</h3>
            <p>Automated safety filters cancel outdated signals so you only focus on active, high-quality trading opportunities.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="home-footer container">
        <span>MANNA EDGE MARKETS — Automated Trading Intelligence</span>
        <span>© 2026 All Rights Reserved</span>
      </footer>
    </div>
  );
};
