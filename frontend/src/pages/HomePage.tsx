import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { KillzoneClock } from '../components/KillzoneClock';
import { type DashboardStyleTab, useMtfPreview } from '../hooks/useMtfSignals';
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
  const [previewTab, setPreviewTab] = useState<DashboardStyleTab>('intraday');
  const mtfPreview = useMtfPreview();

  const activePreviewData = (() => {
    if (previewTab === 'scalp') {
      const s = mtfPreview.scalp;
      const isLong = (s?.bias || 'long').toLowerCase() === 'long';
      return {
        kicker: 'SCALPING DESK · 15M / 5M',
        symbol: s?.instrument || 'NQ',
        market: (s?.market || 'futures').toUpperCase(),
        strategy: 'SCALPING (15M · 5M)',
        biasText: isLong ? '▲ LONG' : '▼ SHORT',
        isLong,
        orderType: isLong ? 'BUY LIMIT' : 'SELL LIMIT',
        tfs: '15M · 5M',
        conviction: Math.round(s?.conviction_score || 89),
        stop: s?.stop ?? '20,485.00',
        entry: s ? `${s.entry_zone_low} – ${s.entry_zone_high}` : '20,520 – 20,535',
        tp1: s?.tp1 ?? '20,610.00',
        tp2: s?.tp2 ?? '20,655.00',
        livePrice: s?.current_price ?? '20,528.50',
        statusPill: s?.signal_state === 'active' ? '● IN ENTRY ZONE' : '● SCALP SETUP'
      };
    }
    if (previewTab === 'swing') {
      const s = mtfPreview.swing;
      const isLong = (s?.bias || 'long').toLowerCase() === 'long';
      return {
        kicker: 'SWING DESK · D1 / 4H · 4H / 1H',
        symbol: s?.instrument || 'GC',
        market: (s?.market || 'futures').toUpperCase(),
        strategy: 'SWING (D1 · 4H)',
        biasText: isLong ? '▲ LONG' : '▼ SHORT',
        isLong,
        orderType: isLong ? 'BUY LIMIT' : 'SELL LIMIT',
        tfs: '1D · 4H',
        conviction: Math.round(s?.conviction_score || 91),
        stop: s?.stop ?? '2,618.00',
        entry: s ? `${s.entry_zone_low} – ${s.entry_zone_high}` : '2,652 – 2,664',
        tp1: s?.tp1 ?? '2,732.00',
        tp2: s?.tp2 ?? '2,772.00',
        livePrice: s?.current_price ?? '2,659.40',
        statusPill: s?.signal_state === 'active' ? '● IN ENTRY ZONE' : '● SWING SETUP'
      };
    }
    return {
      kicker: 'INTRADAY DESK · 1H / 15M',
      symbol: 'EUR/USD',
      market: 'FOREX',
      strategy: 'MANNA ELITE V1.2',
      biasText: '▼ SHORT',
      isLong: false,
      orderType: 'SELL LIMIT',
      tfs: '1H · 15M',
      conviction: 92,
      stop: '1.08950',
      entry: '1.0840 – 1.0855',
      tp1: '1.07600',
      tp2: '1.07150',
      livePrice: '1.08480',
      statusPill: '● IN ENTRY ZONE'
    };
  })();

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
                <span>STOP GUESSING YOUR TRADES</span>
                <span className="hero-vip-pill">14 DAYS FREE · NO CARD REQUIRED</span>
              </div>

              <h1 className="hero-title">
                Get Exact Futures &amp; Forex Trade Setups — Without Staring at Charts All Day.
              </h1>

              <p className="hero-subtitle">
                We scan the markets 24/5 and hand you the exact entry price, stop loss, and profit targets before the move happens. No complicated indicators. No second-guessing. Just clean setups you can act on in 30 seconds.
              </p>

              <div className="hero-cta-group">
                {!user ? (
                  <>
                    <Link to="/signup" className="btn-hero-main">
                      Claim Your 14-Day Free Trial →
                    </Link>
                    <Link to="/login" className="btn-hero-outline">
                      Member Sign In
                    </Link>
                  </>
                ) : (
                  <Link to="/dashboard" className="btn-hero-main">
                    Open Live Signals →
                  </Link>
                )}
              </div>

              <div className="hero-kpi-strip font-mono">
                <div className="hero-kpi-item">
                  <span className="hero-kpi-val">4 Market Windows</span>
                  <span className="hero-kpi-lbl">We Watch Every Session For You</span>
                </div>
                <div className="hero-kpi-divider" aria-hidden="true" />
                <div className="hero-kpi-item">
                  <span className="hero-kpi-val">Futures &amp; FX</span>
                  <span className="hero-kpi-lbl">Gold, Indices &amp; Major Pairs</span>
                </div>
                <div className="hero-kpi-divider" aria-hidden="true" />
                <div className="hero-kpi-item">
                  <span className="hero-kpi-val">2R–3R Targets</span>
                  <span className="hero-kpi-lbl">Clear Stop &amp; Profit Levels</span>
                </div>
              </div>
            </div>

            {/* Right Column: Interactive 3-Tab Terminal Preview Bento Card */}
            <aside className="hero-preview-col" aria-label="Multi-Timeframe Signal Card Preview">
              <div className={`hero-preview-card style-theme-${previewTab}`}>
                <div className="hp-style-tabs font-mono" role="tablist" aria-label="Home Trading Style Tabs">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={previewTab === 'scalp'}
                    className={`hp-style-tab ${previewTab === 'scalp' ? 'is-active' : ''}`}
                    onClick={() => setPreviewTab('scalp')}
                  >
                    ⚡ Scalping (15M/5M)
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={previewTab === 'intraday'}
                    className={`hp-style-tab ${previewTab === 'intraday' ? 'is-active' : ''}`}
                    onClick={() => setPreviewTab('intraday')}
                  >
                    ⏱️ Intraday (1H/15M)
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={previewTab === 'swing'}
                    className={`hp-style-tab ${previewTab === 'swing' ? 'is-active' : ''}`}
                    onClick={() => setPreviewTab('swing')}
                  >
                    🏛️ Swing (D1/4H)
                  </button>
                </div>

                <div className="hp-top-bar font-mono">
                  <span className="hp-preview-kicker">{activePreviewData.kicker}</span>
                  <span className="hp-live-pill">{activePreviewData.statusPill}</span>
                </div>

                <div className="hp-header-row">
                  <div>
                    <div className="hp-symbol-line">
                      <span className="hp-symbol">{activePreviewData.symbol}</span>
                      <span className="hp-market font-mono">{activePreviewData.market}</span>
                      <span className="hp-strat font-mono">{activePreviewData.strategy}</span>
                    </div>
                    <div className="hp-sub-badges font-mono">
                      <span className={activePreviewData.isLong ? 'hp-dir-long' : 'hp-dir-short'}>
                        {activePreviewData.biasText}
                      </span>
                      <span className="hp-order">{activePreviewData.orderType}</span>
                      <span className="hp-tf">{activePreviewData.tfs}</span>
                    </div>
                  </div>
                  <div className="hp-conv-badge font-mono">{activePreviewData.conviction}% Conviction</div>
                </div>

                {/* Visual Progress Ladder Preview */}
                <div className="hp-ladder-box font-mono">
                  <div className="hp-ladder-track">
                    <div className="hp-ladder-risk" />
                    <div className="hp-ladder-profit" />
                    <span className="hp-node is-stop" style={{ left: '4%' }} title={`Stop Loss: ${activePreviewData.stop}`} />
                    <span className="hp-entry-band" style={{ left: '34%' }} title={`Entry Zone: ${activePreviewData.entry}`} />
                    <span className="hp-live-dot" style={{ left: '36%' }} title={`Live Price: ${activePreviewData.livePrice}`} />
                    <span className="hp-node is-tp1" style={{ left: '72%' }} title={`TP1 (+2R): ${activePreviewData.tp1}`} />
                    <span className="hp-node is-tp2" style={{ left: '96%' }} title={`TP2 (+3R): ${activePreviewData.tp2}`} />
                  </div>
                  <div className="hp-ladder-cols">
                    <div title={`Stop Loss: ${activePreviewData.stop}`}>
                      <span className="hp-ll-k">STOP LOSS</span>
                      <span className="hp-ll-v is-red">{activePreviewData.stop}</span>
                    </div>
                    <div
                      className="hp-ll-col-entry"
                      style={{ textAlign: 'center' }}
                      tabIndex={0}
                      title={`Entry Zone: ${activePreviewData.entry}`}
                      aria-label={`Entry Zone: ${activePreviewData.entry}`}
                    >
                      <span className="hp-ll-k">ENTRY ZONE</span>
                      <span className="hp-ll-v is-gold">{activePreviewData.entry}</span>
                      <div className="hp-ll-tooltip font-mono" role="tooltip" aria-hidden="true">
                        <span className="hp-ll-tooltip-label">ENTRY ZONE</span>
                        <span className="hp-ll-tooltip-value">{activePreviewData.entry}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'center' }} title={`TP1 (+2R): ${activePreviewData.tp1}`}>
                      <span className="hp-ll-k">TP1 (+2R)</span>
                      <span className="hp-ll-v is-green">{activePreviewData.tp1}</span>
                    </div>
                    <div style={{ textAlign: 'right' }} title={`TP2 (+3R): ${activePreviewData.tp2}`}>
                      <span className="hp-ll-k">TP2 (+3R)</span>
                      <span className="hp-ll-v is-green">{activePreviewData.tp2}</span>
                    </div>
                  </div>
                </div>

                <div className="hp-tel-grid font-mono">
                  <div className="hp-tel-item">
                    <span className="hp-tel-k">LIVE FEED</span>
                    <span className="hp-tel-v">{activePreviewData.livePrice} ▲</span>
                  </div>
                  <div className="hp-tel-item">
                    <span className="hp-tel-k">TIMEFRAMES</span>
                    <span className="hp-tel-v is-green">{activePreviewData.tfs}</span>
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
            <span className="section-kicker font-mono">HOW IT WORKS</span>
            <h2 className="section-title">Everything You Need to Trade Faster — Without the Guesswork</h2>
          </div>

          <div className="features-grid">
            <article className="feature-card">
              <div className="feature-icon-box" aria-hidden="true">01</div>
              <h3>We Watch the Charts So You Don&apos;t Have To</h3>
              <p>
                Most traders burn out staring at screens for hours every day. We scan Asia, London, and New York sessions around the clock and only put real setups in front of you.
              </p>
            </article>

            <article className="feature-card">
              <div className="feature-icon-box" aria-hidden="true">02</div>
              <h3>Know Your Exact Numbers in 3 Seconds</h3>
              <p>
                No messy lines or confusing jargon. Every trade card shows your exact entry price, your stop loss, and where to take profit — laid out on one simple visual bar.
              </p>
            </article>

            <article className="feature-card">
              <div className="feature-icon-box" aria-hidden="true">03</div>
              <h3>Risk Small. Aim for 2x to 3x Back.</h3>
              <p>
                Stop risking big just to make small wins. Every setup is built on clear risk-to-reward math and shows you when to move your stop to breakeven so you protect your profits.
              </p>
            </article>

            <article className="feature-card">
              <div className="feature-icon-box" aria-hidden="true">04</div>
              <h3>Bad Setups Get Filtered Out Automatically</h3>
              <p>
                Big news spikes and stale trades are where accounts get wrecked. When a setup goes invalid or major news is about to drop, we flag it or pull it before you get caught.
              </p>
            </article>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="home-footer container">
        <span>MANNA EDGE MARKETS — Clear Numbers. Zero Guesswork.</span>
        <span>© 2026 All Rights Reserved</span>
      </footer>
    </div>
  );
};
