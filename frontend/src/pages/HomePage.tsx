import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { KillzoneClock } from '../components/KillzoneClock';
import { ThemeToggle } from '../components/ThemeToggle';
import { type DashboardStyleTab, useMtfPreview } from '../hooks/useMtfSignals';
import { useRecordWall } from '../hooks/useRecordWall';
import './HomePage.css';

interface MarketTickerItem {
  symbol: string;
  label: string;
  market: 'FUTURES' | 'FOREX';
  fallbackPrice: string;
}

const HOME_MARKETS: MarketTickerItem[] = [
  { symbol: 'NQ', label: 'Nasdaq 100', market: 'FUTURES', fallbackPrice: '20,528.50' },
  { symbol: 'ES', label: 'S&P 500', market: 'FUTURES', fallbackPrice: '5,942.25' },
  { symbol: 'GC', label: 'Gold', market: 'FUTURES', fallbackPrice: '2,659.40' },
  { symbol: 'SI', label: 'Silver', market: 'FUTURES', fallbackPrice: '31.420' },
  { symbol: 'CL', label: 'Crude Oil', market: 'FUTURES', fallbackPrice: '71.85' },
  { symbol: 'EUR/USD', label: 'Euro / Dollar', market: 'FOREX', fallbackPrice: '1.08480' },
  { symbol: 'GBP/USD', label: 'Pound / Dollar', market: 'FOREX', fallbackPrice: '1.29640' }
];

const LiveTickerWidget: React.FC<{
  scalpPrice?: string | number | null;
  scalpSymbol?: string | null;
  swingPrice?: string | number | null;
  swingSymbol?: string | null;
}> = ({ scalpPrice, scalpSymbol, swingPrice, swingSymbol }) => {
  const resolvePrice = (item: MarketTickerItem) => {
    if (scalpSymbol && scalpPrice && item.symbol.toUpperCase() === scalpSymbol.toUpperCase()) {
      return String(scalpPrice);
    }
    if (swingSymbol && swingPrice && item.symbol.toUpperCase() === swingSymbol.toUpperCase()) {
      return String(swingPrice);
    }
    return item.fallbackPrice;
  };

  return (
    <div className="home-ticker-shell" aria-label="Covered Markets Strip">
      <div className="home-ticker-header font-mono">
        <span className="home-ticker-badge">
          <span className="home-ticker-dot" aria-hidden="true" />
          24/5 MONITORED MARKETS
        </span>
        <span className="home-ticker-note">Futures · Metals · Energy · Major FX</span>
      </div>
      <div className="home-ticker-grid font-mono">
        {HOME_MARKETS.map((item) => (
          <div key={item.symbol} className="home-ticker-item">
            <div className="home-ticker-top">
              <span className="home-ticker-sym">{item.symbol}</span>
              <span className={`home-ticker-tag ${item.market === 'FUTURES' ? 'is-futures' : 'is-forex'}`}>
                {item.market}
              </span>
            </div>
            <div className="home-ticker-bottom">
              <span className="home-ticker-name">{item.label}</span>
              <span className="home-ticker-price">{resolvePrice(item)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const HomePage: React.FC = () => {
  const { user, logout } = useAuth();
  const [previewTab, setPreviewTab] = useState<DashboardStyleTab>('intraday');
  const mtfPreview = useMtfPreview();
  const { isAvailable: hasRecordWall } = useRecordWall();

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
            <ThemeToggle />
            {hasRecordWall && (
              <Link to="/record-wall" className="btn-nav-outline" style={{ borderColor: '#00e5ff', color: '#00e5ff' }}>
                🏛️ Verified Record Wall
              </Link>
            )}
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
                Clear Futures &amp; Forex Trade Ideas — Without Staring at Charts All Day.
              </h1>

              <p className="hero-subtitle">
                Whether you&apos;re a scalper catching fast moves, an intraday trader working daily sessions, or a swing trader riding multi-day trends — we scan the markets 24/5, rank the strongest pairs with EdgeFinder, and lay out your entry zone, stop loss, and profit targets in plain sight.
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

              <div className="hero-kpi-strip">
                <div className="hero-kpi-item is-emerald">
                  <div className="hero-kpi-icon is-emerald" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13 2L4.5 13.5H11.5L10.5 22L19.5 10.5H12.5L13 2Z" />
                    </svg>
                  </div>
                  <div className="hero-kpi-text">
                    <span className="hero-kpi-val">3 Trading Styles</span>
                    <span className="hero-kpi-lbl font-mono">Scalpers · Intraday · Swing</span>
                  </div>
                </div>
                <div className="hero-kpi-item is-gold">
                  <div className="hero-kpi-icon is-gold" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9" />
                      <circle cx="12" cy="12" r="4" />
                      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
                    </svg>
                  </div>
                  <div className="hero-kpi-text">
                    <span className="hero-kpi-val">EdgeFinder Ranked</span>
                    <span className="hero-kpi-lbl font-mono">Focus Only on Top Markets</span>
                  </div>
                </div>
                <div className="hero-kpi-item is-blue">
                  <div className="hero-kpi-icon is-blue" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 17L8.5 11.5L12.5 15L21 6.5" />
                      <path d="M16 6.5H21V11.5" />
                    </svg>
                  </div>
                  <div className="hero-kpi-text">
                    <span className="hero-kpi-val">2R–3R Targets</span>
                    <span className="hero-kpi-lbl font-mono">Clear Stop &amp; Profit Levels</span>
                  </div>
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
            <LiveTickerWidget
              scalpPrice={mtfPreview.scalp?.current_price}
              scalpSymbol={mtfPreview.scalp?.instrument}
              swingPrice={mtfPreview.swing?.current_price}
              swingSymbol={mtfPreview.swing?.instrument}
            />
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
              <h3>Built for Scalpers, Intraday &amp; Swing Traders</h3>
              <p>
                Want fast 5-to-15 minute moves, clean session trades, or multi-day swings? Pick your trading style and get setups matched to your pace without the clutter.
              </p>
            </article>

            <article className="feature-card">
              <div className="feature-icon-box" aria-hidden="true">02</div>
              <h3>EdgeFinder Ranks the Best Markets First</h3>
              <p>
                Stop wasting time flipping through 20 dead charts. EdgeFinder scores and ranks every market in real time so you immediately see where the strongest momentum is right now.
              </p>
            </article>

            <article className="feature-card">
              <div className="feature-icon-box" aria-hidden="true">03</div>
              <h3>See Entry, Stop, and Targets in 3 Seconds</h3>
              <p>
                No messy lines or confusing jargon. Every trade card lays out your entry zone, stop loss, and 2x–3x profit targets on one clean visual bar — plus breakeven alerts.
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
