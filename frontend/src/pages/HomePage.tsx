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
            <span className="logo-emblem font-mono">⚡</span>
            <span className="logo-text font-mono">MANNA EDGE MARKETS</span>
          </Link>

          <div className="nav-center">
            <KillzoneClock />
          </div>

          <div className="nav-actions font-mono">
            {user ? (
              <div className="user-badge-box">
                <span className="user-role-tag">{user.role.toUpperCase()}</span>
                <span className="user-email">{user.email}</span>
                <Link to="/dashboard" className="btn-nav-primary">
                  📊 Dashboard
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
        <div className="hero-badge font-mono animate-fade-in">
          <span>📡 INSTITUTIONAL DISCOVERY ENGINE 2.0</span>
        </div>

        <h1 className="hero-title font-mono animate-slide-up">
          MANNA EDGE MARKETS
        </h1>
        <p className="hero-subtitle animate-slide-up">
          Automated Killzone Session Discovery, Multi-Timeframe Confluence Engine & Live Risk-to-Reward Trading Desk.
        </p>

        {/* Live Market Quote Ticker Preview */}
        <div className="market-ticker-bar font-mono animate-slide-up">
          <div className="ticker-item"><span className="t-name">NQ=F</span> <span className="t-price">18,992.50</span> <span className="t-change text-green">+1.45%</span></div>
          <div className="ticker-item"><span className="t-name">ES=F</span> <span className="t-price">5,509.25</span> <span className="t-change text-green">+0.82%</span></div>
          <div className="ticker-item"><span className="t-name">GC=F</span> <span className="t-price">$2,385.40</span> <span className="t-change text-green">+0.65%</span></div>
          <div className="ticker-item"><span className="t-name">SI=F</span> <span className="t-price">$28.45</span> <span className="t-change text-red">-0.24%</span></div>
          <div className="ticker-item"><span className="t-name">EUR/USD</span> <span className="t-price">1.0854</span> <span className="t-change text-green">+0.12%</span></div>
          <div className="ticker-item"><span className="t-name">GBP/USD</span> <span className="t-price">1.2682</span> <span className="t-change text-green">+0.28%</span></div>
        </div>

        <div className="hero-cta-group font-mono animate-slide-up">
          <Link to="/dashboard" className="btn-hero-main">
            🚀 LAUNCH TRADING DESK
          </Link>
          <Link to="/admin" className="btn-hero-secondary">
            ⚙️ ADMIN TELEMETRY
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
        <h2 className="section-title font-mono">CORE PLATFORM CAPABILITIES</h2>

        <div className="features-grid">
          <div className="feature-card glass-card">
            <div className="feature-icon font-mono">📡</div>
            <h3 className="font-mono">Killzone Session Scans</h3>
            <p>Automated boundary triggers aligned strictly to America/New_York session opens: Asian, London, NY AM (08:00 ET), and NY PM (14:00 ET).</p>
          </div>

          <div className="feature-card glass-card">
            <div className="feature-icon font-mono">📊</div>
            <h3 className="font-mono">TradingView Interactive Charts</h3>
            <p>Full-screen TradingView Lightweight Chart canvas with superimposed Entry Zone, Stop Loss, and Take Profit target price levels.</p>
          </div>

          <div className="feature-card glass-card">
            <div className="feature-icon font-mono">🔥</div>
            <h3 className="font-mono">Universal R-Multiple Analytics</h3>
            <p>Live Risk-to-Reward ($RR$) tracking for active positions and distance-to-entry metrics normalized in $R$-multiples across all account sizes.</p>
          </div>

          <div className="feature-card glass-card">
            <div className="feature-icon font-mono">🛡️</div>
            <h3 className="font-mono">Circuit Breaker & Audit</h3>
            <p>Automated safety circuit breakers, multi-trigger run separation (Scheduled vs Manual), and complete Manna AI Assistant invalidation auditing.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="home-footer font-mono container">
        <span>MANNA EDGE MARKETS — Killzone Discovery Engine 2.0</span>
        <span>© 2026 All Rights Reserved</span>
      </footer>
    </div>
  );
};
