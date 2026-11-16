import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { KillzoneClock } from '../components/KillzoneClock';
import './HomePage.css';

const LiveTickerWidget: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbols: [
        { proName: 'CME_MINI:NQ1!', title: 'NQ Futures' },
        { proName: 'CME_MINI:ES1!', title: 'ES Futures' },
        { proName: 'COMEX:GC1!', title: 'Gold' },
        { proName: 'COMEX:SI1!', title: 'Silver' },
        { proName: 'FX:EURUSD', title: 'EUR/USD' },
        { proName: 'FX:GBPUSD', title: 'GBP/USD' },
        { proName: 'NYMEX:CL1!', title: 'Crude Oil' }
      ],
      showSymbolLogo: false,
      colorTheme: 'dark',
      isTransparent: true,
      displayMode: 'adaptive',
      locale: 'en'
    });

    containerRef.current.appendChild(script);
  }, []);

  return (
    <div className="home-ticker-shell">
      <div
        ref={containerRef}
        className="tradingview-widget-container"
        style={{ width: '100%' }}
      />
    </div>
  );
};

export const HomePage: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <div className="home-page-container">
      <div className="home-backdrop-glow" aria-hidden="true" />

      {/* Sleek Sticky Obsidian Navigation Header */}
      <header className="home-nav">
        <div className="container nav-container">
          <Link to="/" className="nav-logo">
            <span className="logo-emblem" aria-hidden="true">M</span>
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
                  Live Signals
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Sign out of Manna Edge Markets?')) logout();
                  }}
                  className="btn-nav-logout"
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="guest-actions">
                <Link to="/login" className="btn-nav-outline">
                  Sign In
                </Link>
                <Link to="/signup" className="btn-nav-primary">
                  14-Day Free Trial
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Asymmetric Bento Hero Section */}
      <main>
        <section className="hero-section container">
          <div className="hero-bento-grid">
            <div className="hero-copy-col">
              <div className="hero-badge">
                <span className="hero-badge-dot" aria-hidden="true" />
                <span>AUTOMATED INSTITUTIONAL SIGNAL ENGINE</span>
                <span className="hero-vip-pill">14-DAY VIP TRIAL · NO CARD</span>
              </div>

              <h1 className="hero-title">
                Precision Futures &amp; Forex Signals. Built for Active Killzones.
              </h1>

              <p className="hero-subtitle">
                Automated trade setups across Asia, London, and New York sessions. Inspect exact entry zones, visual Stop-to-Target ladders, and live risk-to-reward updates in one calm institutional workspace.
              </p>

              <div className="hero-cta-group">
                {!user ? (
                  <>
                    <Link to="/signup" className="btn-hero-main">
                      Start 14-Day Free Trial →
                    </Link>
                    <Link to="/login" className="btn-hero-outline">
                      Member Sign In
                    </Link>
                  </>
                ) : (
                  <Link to="/dashboard" className="btn-hero-main">
                    Open Live Terminal →
                  </Link>
                )}
              </div>

              <div className="hero-kpi-strip font-mono">
                <div className="hero-kpi-item">
                  <span className="hero-kpi-val">4 Sessions</span>
                  <span className="hero-kpi-lbl">Asia · London · NY AM/PM</span>
                </div>
                <div className="hero-kpi-divider" aria-hidden="true" />
                <div className="hero-kpi-item">
                  <span className="hero-kpi-val">Futures &amp; FX</span>
                  <span className="hero-kpi-lbl">Indices, Metals &amp; Majors</span>
                </div>
                <div className="hero-kpi-divider" aria-hidden="true" />
                <div className="hero-kpi-item">
                  <span className="hero-kpi-val">Live R:R</span>
                  <span className="hero-kpi-lbl">Auto-Breakeven &amp; TP1/TP2</span>
                </div>
              </div>
            </div>

            {/* Right Column: Live Terminal Preview Bento Card */}
            <aside className="hero-preview-col" aria-label="Sample Signal Card Preview">
              <div className="hero-preview-card">
                <div className="hp-top-bar font-mono">
                  <span className="hp-preview-kicker">SAMPLE TERMINAL PREVIEW</span>
                  <span className="hp-live-pill">● IN ENTRY ZONE</span>
                </div>

                <div className="hp-header-row">
                  <div>
                    <div className="hp-symbol-line">
                      <span className="hp-symbol">EUR/USD</span>
                      <span className="hp-market font-mono">FOREX</span>
                      <span className="hp-strat font-mono">MANNA ELITE V1.2</span>
                    </div>
                    <div className="hp-sub-badges font-mono">
                      <span className="hp-dir-short">▼ SHORT</span>
                      <span className="hp-order">SELL LIMIT</span>
                      <span className="hp-tf">1H · 15M</span>
                    </div>
                  </div>
                  <div className="hp-conv-badge font-mono">92% Conviction</div>
                </div>

                {/* Visual Progress Ladder Preview */}
                <div className="hp-ladder-box font-mono">
                  <div className="hp-ladder-track">
                    <div className="hp-ladder-risk" />
                    <div className="hp-ladder-profit" />
                    <span className="hp-node is-stop" style={{ left: '4%' }} />
                    <span className="hp-entry-band" style={{ left: '34%' }} />
                    <span className="hp-live-dot" style={{ left: '36%' }} />
                    <span className="hp-node is-tp1" style={{ left: '72%' }} />
                    <span className="hp-node is-tp2" style={{ left: '96%' }} />
                  </div>
                  <div className="hp-ladder-cols">
                    <div>
                      <span className="hp-ll-k">STOP LOSS</span>
                      <span className="hp-ll-v is-red">1.08950</span>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <span className="hp-ll-k">ENTRY ZONE</span>
                      <span className="hp-ll-v is-gold">1.0840 – 1.0855</span>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <span className="hp-ll-k">TP1 (+2R)</span>
                      <span className="hp-ll-v is-green">1.07600</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span className="hp-ll-k">TP2 (+3R)</span>
                      <span className="hp-ll-v is-green">1.07150</span>
                    </div>
                  </div>
                </div>

                <div className="hp-tel-grid font-mono">
                  <div className="hp-tel-item">
                    <span className="hp-tel-k">LIVE FEED</span>
                    <span className="hp-tel-v">1.08480 ▲</span>
                  </div>
                  <div className="hp-tel-item">
                    <span className="hp-tel-k">PROXIMITY</span>
                    <span className="hp-tel-v is-green">In Zone (Ready)</span>
                  </div>
                </div>
              </div>
            </aside>
          </div>

          {/* Live Quote Ticker Strip */}
          <div className="hero-ticker-wrap">
            <LiveTickerWidget />
          </div>
        </section>

        {/* Bento Feature Showcase Grid */}
        <section className="features-section container">
          <div className="section-header-block">
            <span className="section-kicker font-mono">PLATFORM ARCHITECTURE</span>
            <h2 className="section-title">Why Traders Execute With Manna Edge</h2>
          </div>

          <div className="features-grid">
            <article className="feature-card">
              <div className="feature-icon-box" aria-hidden="true">01</div>
              <h3>Peak Killzone Scans</h3>
              <p>
                Scans high-volume institutional windows across Asia, London, NY AM, and NY PM sessions to surface high-probability opportunities automatically.
              </p>
            </article>

            <article className="feature-card">
              <div className="feature-icon-box" aria-hidden="true">02</div>
              <h3>Visual Trade Ladders</h3>
              <p>
                Read Stop Loss, Entry Zone, live price position, and TP1/TP2 profit milestones in under a second on every signal card.
              </p>
            </article>

            <article className="feature-card">
              <div className="feature-icon-box" aria-hidden="true">03</div>
              <h3>Live R:R &amp; Breakeven</h3>
              <p>
                Know your exact risk-to-reward ratio before entering. Track active runners, TP1 hits, and automated breakeven protection in real time.
              </p>
            </article>

            <article className="feature-card">
              <div className="feature-icon-box" aria-hidden="true">04</div>
              <h3>Smart Signal Protection</h3>
              <p>
                Automated invalidation and high-impact news scheduling filter out stale setups so you focus strictly on valid market structure.
              </p>
            </article>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="home-footer container">
        <span>MANNA EDGE MARKETS — Automated Trading Intelligence</span>
        <span>© 2026 All Rights Reserved</span>
      </footer>
    </div>
  );
};
