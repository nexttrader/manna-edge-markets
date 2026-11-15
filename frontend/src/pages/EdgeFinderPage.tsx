import React, { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CotHistoryChartSvg,
  CountryHistoryTrendSvg,
  GoldVsDxyChartSvg,
  HistoricalScorePriceSvg,
  ScoreGaugeSvg,
  SeasonalityBarChartSvg,
  YieldCurveSvg
} from '../components/edge-finder/EdgeFinderCharts';
import {
  type AssetEdgeScorecard,
  type EconomyCode,
  type MacroEconomyData,
  useEdgeFinderAccess,
  useEdgeFinderData
} from '../hooks/useEdgeFinder';
import './EdgeFinderPage.css';

type WorkspaceTab =
  | 'scanner'
  | 'scorecard'
  | 'gold'
  | 'carry'
  | 'cot'
  | 'smart_money'
  | 'sentiment'
  | 'seasonality'
  | 'macro';

type AssetFilterMode = 'ALL' | 'FOREX' | 'FUTURES' | 'CRYPTO' | 'EXTREME_COT' | 'ALIGNED' | 'STRONG' | 'WATCHLIST';
type SortKey =
  | 'instrument'
  | 'currentPrice'
  | 'totalScore'
  | 'cotScore'
  | 'retailScore'
  | 'seasonalityScore'
  | 'trendScore'
  | 'fundamentalScore'
  | 'mannaFlowScore'
  | 'volatilityPct';

type CarrySortKey = 'instrument' | 'rateSpreadPct' | 'carryAtrRatio' | 'assetTotalScore';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WATCHLIST_STORAGE_KEY = 'manna_edge_finder_watchlist_v1';

const TAB_ITEMS: Array<{ id: WorkspaceTab; label: string; icon: string }> = [
  { id: 'scanner', label: 'Top Setups & Matrix', icon: '📊' },
  { id: 'scorecard', label: 'Asset Scorecard', icon: '🎯' },
  { id: 'gold', label: 'Gold Scorecard', icon: '🥇' },
  { id: 'carry', label: 'Carry Scanner', icon: '💱' },
  { id: 'cot', label: 'COT Smart Money', icon: '🏦' },
  { id: 'smart_money', label: 'Smart Money & Targets', icon: '🏛️' },
  { id: 'sentiment', label: 'Retail Contrarian', icon: '🧭' },
  { id: 'seasonality', label: 'Seasonality & Killzones', icon: '🗓️' },
  { id: 'macro', label: 'Global Macro & Yields', icon: '🌐' }
];

const KEY_CORR_ASSETS = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'USD/CHF', 'NZD/USD', 'GBP/JPY',
  'ES', 'NQ', 'ZN', 'GC', 'SI', 'CL', 'BTC/USD', 'ETH/USD'
];

function formatUsdCompact(val: number): string {
  if (!val || !Number.isFinite(val)) return '—';
  const abs = Math.abs(val);
  if (abs >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(val / 1e3).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

const COLLATOR = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

function formatSigned(val: number, decimals = 2): string {
  const fixed = val.toFixed(decimals);
  return val > 0 ? `+${fixed}` : fixed;
}

function scoreCellStyle(score: number): React.CSSProperties {
  if (score >= 4 || score >= 1.2) {
    return { background: 'rgba(0, 230, 118, 0.22)', color: '#69F0AE', border: '1px solid rgba(0, 230, 118, 0.45)' };
  }
  if (score > 0.2) {
    return { background: 'rgba(0, 230, 118, 0.11)', color: '#B9F6CA', border: '1px solid rgba(0, 230, 118, 0.26)' };
  }
  if (score <= -4 || score <= -1.2) {
    return { background: 'rgba(255, 82, 82, 0.22)', color: '#FF8A80', border: '1px solid rgba(255, 82, 82, 0.48)' };
  }
  if (score < -0.2) {
    return { background: 'rgba(255, 82, 82, 0.11)', color: '#FFCDD2', border: '1px solid rgba(255, 82, 82, 0.26)' };
  }
  return { background: 'rgba(255, 193, 7, 0.11)', color: '#FFE082', border: '1px solid rgba(255, 193, 7, 0.26)' };
}

function biasBadgeClass(bias: AssetEdgeScorecard['biasLabel']): string {
  switch (bias) {
    case 'Strong Buy': return 'ef-bias-badge ef-bias-strong-buy';
    case 'Buy': return 'ef-bias-badge ef-bias-buy';
    case 'Sell': return 'ef-bias-badge ef-bias-sell';
    case 'Strong Sell': return 'ef-bias-badge ef-bias-strong-sell';
    default: return 'ef-bias-badge ef-bias-neutral';
  }
}

function seasonalityCellStyle(val: number, isWinRate: boolean): React.CSSProperties {
  if (isWinRate) {
    if (val >= 70) return { background: 'rgba(0, 230, 118, 0.25)', color: '#69F0AE' };
    if (val >= 55) return { background: 'rgba(0, 230, 118, 0.1)', color: '#B9F6CA' };
    if (val <= 35) return { background: 'rgba(255, 82, 82, 0.24)', color: '#FF8A80' };
    if (val <= 45) return { background: 'rgba(255, 82, 82, 0.1)', color: '#FFCDD2' };
    return { background: 'rgba(255, 255, 255, 0.04)', color: '#cfc5e8' };
  }
  if (val >= 1.2) return { background: 'rgba(0, 230, 118, 0.26)', color: '#69F0AE' };
  if (val > 0.2) return { background: 'rgba(0, 230, 118, 0.12)', color: '#B9F6CA' };
  if (val <= -1.2) return { background: 'rgba(255, 82, 82, 0.26)', color: '#FF8A80' };
  if (val < -0.2) return { background: 'rgba(255, 82, 82, 0.12)', color: '#FFCDD2' };
  return { background: 'rgba(255, 255, 255, 0.04)', color: '#cfc5e8' };
}

function loadWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) return ['EUR/USD', 'GC', 'NQ'];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : ['EUR/USD', 'GC', 'NQ'];
  } catch {
    return ['EUR/USD', 'GC', 'NQ'];
  }
}

export const EdgeFinderPage: React.FC = () => {
  const {
    isSuperAdmin,
    isAdmin,
    effectiveRole,
    rollout,
    updatingRollout,
    updateRollout
  } = useEdgeFinderAccess();

  const {
    snapshot,
    loading,
    refreshing,
    error,
    refreshData,
    updateMacroEconomy
  } = useEdgeFinderData(true);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('scanner');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('EUR/USD');
  const [filterMode, setFilterMode] = useState<AssetFilterMode>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortKey, setSortKey] = useState<SortKey>('totalScore');
  const [sortDir, setSortDir] = useState<'ascending' | 'descending'>('descending');
  const [watchlist, setWatchlist] = useState<string[]>(loadWatchlist);
  const [seasonalityMetric, setSeasonalityMetric] = useState<'return' | 'winRate'>('return');
  const [showCorrelations, setShowCorrelations] = useState<boolean>(false);
  const [carrySortKey, setCarrySortKey] = useState<CarrySortKey>('carryAtrRatio');
  const [carrySortDir, setCarrySortDir] = useState<'ascending' | 'descending'>('descending');
  const [selectedHistoryCurrency, setSelectedHistoryCurrency] = useState<EconomyCode>('USD');
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);
  const [editingEcon, setEditingEcon] = useState<MacroEconomyData | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const toggleWatchlist = (instrument: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setWatchlist((prev) => {
      const next = prev.includes(instrument)
        ? prev.filter((item) => item !== instrument)
        : [...prev, instrument];
      try {
        localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage quota errors
      }
      return next;
    });
  };

  const handleCarrySort = (key: CarrySortKey) => {
    if (carrySortKey === key) {
      setCarrySortDir((prev) => (prev === 'descending' ? 'ascending' : 'descending'));
    } else {
      setCarrySortKey(key);
      setCarrySortDir(key === 'instrument' ? 'ascending' : 'descending');
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'descending' ? 'ascending' : 'descending'));
    } else {
      setSortKey(key);
      setSortDir(key === 'instrument' ? 'ascending' : 'descending');
    }
  };

  const handleTabKeyDown = (idx: number, e: React.KeyboardEvent) => {
    let targetIdx = idx;
    if (e.key === 'ArrowRight') targetIdx = (idx + 1) % TAB_ITEMS.length;
    else if (e.key === 'ArrowLeft') targetIdx = (idx - 1 + TAB_ITEMS.length) % TAB_ITEMS.length;
    else if (e.key === 'Home') targetIdx = 0;
    else if (e.key === 'End') targetIdx = TAB_ITEMS.length - 1;
    else return;

    e.preventDefault();
    const targetTab = TAB_ITEMS[targetIdx];
    setActiveTab(targetTab.id);
    tabRefs.current[targetIdx]?.focus();
  };

  const handleToggleRollout = async (field: 'visibleToAdmins' | 'visibleToTraders') => {
    try {
      const nextVal = !rollout[field];
      const updated = await updateRollout({ [field]: nextVal });
      const label = field === 'visibleToAdmins' ? 'Admins' : 'All Clients';
      setBannerNotice(`Manna EdgeFinder Pro is now ${updated[field] ? 'ENABLED' : 'LOCKED'} for ${label}.`);
      window.setTimeout(() => setBannerNotice(null), 4000);
    } catch (err: any) {
      setBannerNotice(err?.message || 'Rollout update failed.');
    }
  };

  const handleSelectAssetForDeepDive = (instrument: string) => {
    setSelectedSymbol(instrument);
    setActiveTab('scorecard');
  };

  const scorecards = snapshot?.scorecards || [];

  const filteredScorecards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = scorecards.filter((sc) => {
      if (filterMode === 'FOREX' && sc.assetClass !== 'forex') return false;
      if (filterMode === 'FUTURES' && sc.assetClass !== 'futures') return false;
      if (filterMode === 'CRYPTO' && sc.category !== 'Crypto') return false;
      if (filterMode === 'EXTREME_COT' && sc.cot.extremeFlag === 'NONE') return false;
      if (filterMode === 'ALIGNED' && sc.killzoneAlignment.alignmentStatus !== 'ALIGNED') return false;
      if (filterMode === 'STRONG' && Math.abs(sc.totalScore) < 5) return false;
      if (filterMode === 'WATCHLIST' && !watchlist.includes(sc.instrument)) return false;
      if (q) {
        const hay = `${sc.instrument} ${sc.displayName} ${sc.category}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'instrument') {
        cmp = COLLATOR.compare(a.instrument, b.instrument);
      } else if (sortKey === 'volatilityPct') {
        cmp = a.technical.dayRangePctOfAtr - b.technical.dayRangePctOfAtr;
      } else {
        cmp = (a[sortKey] as number) - (b[sortKey] as number);
      }
      return sortDir === 'ascending' ? cmp : -cmp;
    });
  }, [scorecards, filterMode, searchQuery, sortKey, sortDir, watchlist]);

  const sortedCarryTrades = useMemo(() => {
    const list = snapshot?.carryTrades || [];
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (carrySortKey === 'instrument') {
        cmp = COLLATOR.compare(a.instrument, b.instrument);
      } else {
        cmp = a[carrySortKey] - b[carrySortKey];
      }
      return carrySortDir === 'ascending' ? cmp : -cmp;
    });
  }, [snapshot?.carryTrades, carrySortKey, carrySortDir]);

  const corrAssets = useMemo(() => {
    const all = snapshot?.correlations.assets || [];
    const subset = KEY_CORR_ASSETS.filter((sym) => all.includes(sym));
    return subset.length > 0 ? subset : all.slice(0, 16);
  }, [snapshot?.correlations.assets]);

  const topSetupsPreview = useMemo(
    () => [...scorecards].sort((a, b) => Math.abs(b.totalScore) - Math.abs(a.totalScore)).slice(0, 8),
    [scorecards]
  );

  const activeScorecard = useMemo(() => {
    return scorecards.find((s) => s.instrument === selectedSymbol) || scorecards[0] || null;
  }, [scorecards, selectedSymbol]);

  const alignedCount = useMemo(
    () => scorecards.filter((s) => s.killzoneAlignment.alignmentStatus === 'ALIGNED').length,
    [scorecards]
  );

  const cotExtremeCount = useMemo(
    () => scorecards.filter((s) => s.cot.extremeFlag !== 'NONE').length,
    [scorecards]
  );

  const crowdedRetailCount = useMemo(
    () => scorecards.filter((s) => s.retailSentiment.crowdedWarning).length,
    [scorecards]
  );

  const handleSaveMacro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEcon) return;
    const ok = await updateMacroEconomy(editingEcon.currency, {
      rate: editingEcon.rate,
      stance: editingEcon.stance,
      rateExpectation: editingEcon.rateExpectation,
      nextMeeting: editingEcon.nextMeeting,
      gdpQoQ: editingEcon.gdpQoQ,
      cpiYoY: editingEcon.cpiYoY,
      coreCpiYoY: editingEcon.coreCpiYoY,
      pmiManufacturing: editingEcon.pmiManufacturing,
      pmiServices: editingEcon.pmiServices,
      unemploymentRate: editingEcon.unemploymentRate,
      retailSalesMoM: editingEcon.retailSalesMoM,
      notes: editingEcon.notes
    });
    if (ok) {
      setBannerNotice(`${editingEcon.currency} Central Bank & Macro profile updated — all ${scorecards.length} asset scores & carry spreads recalculated.`);
      setEditingEcon(null);
      window.setTimeout(() => setBannerNotice(null), 4000);
    }
  };

  return (
    <div className="ef-page">
      <div className="ef-container">
        {/* Top Utility Navigation */}
        <header className="ef-topbar">
          <div className="ef-brand-cluster">
            <div className="ef-brand-badge" aria-hidden="true">🧭</div>
            <div>
              <h1 className="ef-title">
                MANNA EDGEFINDER
                <span className="ef-pro-pill">PRO MATRIX</span>
              </h1>
              <p className="ef-subtitle">
                COT Institutional Flow · Contrarian Sentiment · 10Y Seasonality · G8 Macro · Manna Killzone Alignment
              </p>
            </div>
          </div>

          <div className="ef-nav-actions">
            <span className="ef-mini-chip">
              Role: {effectiveRole.replace('_', ' ').toUpperCase()}
            </span>
            <button
              type="button"
              className="ef-btn ef-btn-gold"
              onClick={refreshData}
              disabled={refreshing || loading}
            >
              {refreshing ? '⟳ Syncing Feeds...' : '⟳ Live Sync'}
            </button>
            <Link to="/dashboard" className="ef-btn">
              ← Terminal
            </Link>
            {(isAdmin || isSuperAdmin) && (
              <Link to="/admin" className="ef-btn">
                ⚙️ Admin
              </Link>
            )}
            {isSuperAdmin && (
              <Link to="/vault-5287" className="ef-btn ef-btn-vault">
                👑 Master Vault
              </Link>
            )}
          </div>
        </header>

        {/* Super Admin Phased Rollout Control Bar */}
        {isSuperAdmin && (
          <section className="ef-governance-bar" aria-label="Super Admin Rollout Governance">
            <div className="ef-gov-info">
              <span style={{ fontSize: '1.35rem' }} aria-hidden="true">👑</span>
              <div>
                <div className="ef-gov-title">Super Admin Rollout Governance</div>
                <div className="ef-gov-desc">
                  Control independent visibility across Manna Edge Markets tiers. Changes apply immediately to navigation and route access.
                </div>
              </div>
            </div>

            <div className="ef-gov-controls">
              <button
                type="button"
                className={`ef-toggle-pill ${rollout.visibleToAdmins ? 'is-on' : ''}`}
                onClick={() => handleToggleRollout('visibleToAdmins')}
                disabled={updatingRollout}
              >
                <span className="ef-toggle-dot" />
                Admins Access: {rollout.visibleToAdmins ? 'ON' : 'OFF'}
              </button>

              <button
                type="button"
                className={`ef-toggle-pill ${rollout.visibleToTraders ? 'is-on' : ''}`}
                onClick={() => handleToggleRollout('visibleToTraders')}
                disabled={updatingRollout}
              >
                <span className="ef-toggle-dot" />
                All Clients Access: {rollout.visibleToTraders ? 'ON' : 'OFF'}
              </button>
            </div>
          </section>
        )}

        {bannerNotice && (
          <div
            role="status"
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              background: 'rgba(0, 230, 118, 0.14)',
              border: '1px solid rgba(0, 230, 118, 0.45)',
              color: '#86efac',
              fontSize: '0.84rem',
              fontWeight: 600
            }}
          >
            ✓ {bannerNotice}
          </div>
        )}

        {error && (
          <div
            role="alert"
            style={{
              padding: '12px 16px',
              borderRadius: 10,
              background: 'rgba(255, 82, 82, 0.16)',
              border: '1px solid rgba(255, 82, 82, 0.45)',
              color: '#ff8a80',
              fontSize: '0.86rem'
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {loading && !snapshot ? (
          <div className="ef-card" style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#DFC46B' }}>
              Initializing Manna EdgeFinder Pro Quantitative Matrix...
            </div>
            <p style={{ color: '#a99bc9', marginTop: 8, fontSize: '0.86rem' }}>
              Aggregating CFTC COT contracts, G8 Central Bank matrices, 10-year seasonal windows, and Manna Killzone order-flow.
            </p>
          </div>
        ) : snapshot && (
          <>
            {/* Executive Pulse Telemetry Ribbon */}
            <section className="ef-pulse-grid ef-perf-section" aria-label="Global Macro and Currency Strength Pulse">
              {/* Risk On / Off Gauge */}
              <div className="ef-card">
                <div className="ef-card-header">
                  <h2 className="ef-card-title">Global Risk Regime</h2>
                  <span className="ef-card-meta">{snapshot.riskGauge.regime}</span>
                </div>
                <div className="ef-risk-score-row">
                  <span className="ef-risk-big">{snapshot.riskGauge.score} / 100</span>
                  <span
                    className={
                      snapshot.riskGauge.score >= 60
                        ? 'ef-bias-badge ef-bias-buy'
                        : snapshot.riskGauge.score <= 40
                          ? 'ef-bias-badge ef-bias-sell'
                          : 'ef-bias-badge ef-bias-neutral'
                    }
                  >
                    {snapshot.riskGauge.score >= 60 ? 'RISK-ON' : snapshot.riskGauge.score <= 40 ? 'RISK-OFF' : 'BALANCED'}
                  </span>
                </div>
                <div className="ef-risk-bar-track" aria-hidden="true">
                  <div className="ef-risk-marker" style={{ left: `${snapshot.riskGauge.score}%` }} />
                </div>
                <div className="ef-risk-drivers">
                  {snapshot.riskGauge.drivers.slice(0, 4).map((d) => (
                    <span key={d.label} className="ef-mini-chip">
                      {d.label}: <strong>{d.impact}</strong>
                    </span>
                  ))}
                </div>
              </div>

              {/* G8 Currency Strength Meter */}
              <div className="ef-card">
                <div className="ef-card-header">
                  <h2 className="ef-card-title">G8 Currency Strength Meter</h2>
                  <span className="ef-card-meta">Macro + FX Flow Composite</span>
                </div>
                <div className="ef-strength-list">
                  {snapshot.currencyStrength.map((item) => {
                    const pct = Math.max(8, Math.min(100, ((item.strengthScore + 10) / 20) * 100));
                    const isBull = item.strengthScore >= 0.8;
                    const isBear = item.strengthScore <= -0.8;
                    const barColor = isBull ? '#00E676' : isBear ? '#FF5252' : '#FFC107';
                    return (
                      <div key={item.currency} className="ef-strength-tile">
                        <div className="ef-strength-head">
                          <span>#{item.macroRank} {item.currency}</span>
                          <span style={{ color: barColor }}>{formatSigned(item.strengthScore, 1)}</span>
                        </div>
                        <div className="ef-strength-bar-bg">
                          <div className="ef-strength-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#9f91c2' }}>
                          <span>{item.policyRate.toFixed(2)}%</span>
                          <span>{item.stance}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Manna Synergy & Data Health */}
              <div className="ef-card">
                <div className="ef-card-header">
                  <h2 className="ef-card-title">Manna Synergy Telemetry</h2>
                  <span className="ef-card-meta">{new Date(snapshot.generatedAt).toLocaleTimeString()}</span>
                </div>
                <div className="ef-sync-stats">
                  <div className="ef-stat-box">
                    <div className="ef-stat-label">Killzone Aligned</div>
                    <div className="ef-stat-val" style={{ color: '#DFC46B' }}>
                      {alignedCount} / {snapshot.scorecards.length}
                    </div>
                  </div>
                  <div className="ef-stat-box">
                    <div className="ef-stat-label">Live Market Feeds</div>
                    <div className="ef-stat-val" style={{ color: snapshot.syncStatus.livePriceCount > 0 ? '#69F0AE' : '#FFE082' }}>
                      {snapshot.syncStatus.livePriceCount} / {snapshot.syncStatus.totalAssets}
                    </div>
                  </div>
                  <div className="ef-stat-box">
                    <div className="ef-stat-label">CFTC COT Source</div>
                    <div className="ef-stat-val" style={{ fontSize: '0.8rem' }}>
                      {snapshot.syncStatus.cftcSource === 'CFTC_LIVE' ? 'LIVE SOCRATA' : 'INSTITUTIONAL'}
                    </div>
                  </div>
                  <div className="ef-stat-box">
                    <div className="ef-stat-label">Crowded Retail</div>
                    <div className="ef-stat-val" style={{ color: '#FF8A80' }}>
                      {crowdedRetailCount} Alerts
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Primary Navigation Tabs (Single Row — modern-web-guidance) */}
            <nav aria-label="EdgeFinder Analysis Views">
              <div role="tablist" aria-label="EdgeFinder Modules" className="ef-tablist">
                {TAB_ITEMS.map((tab, idx) => {
                  const selected = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      ref={(el) => { tabRefs.current[idx] = el; }}
                      type="button"
                      role="tab"
                      id={`tab-${tab.id}`}
                      aria-selected={selected}
                      aria-controls={`panel-${tab.id}`}
                      tabIndex={selected ? 0 : -1}
                      className="ef-tab"
                      onClick={() => setActiveTab(tab.id)}
                      onKeyDown={(e) => handleTabKeyDown(idx, e)}
                    >
                      <span aria-hidden="true">{tab.icon}</span>
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </nav>

            {/* TAB 1: TOP SETUPS & SCANNER MATRIX */}
            {activeTab === 'scanner' && (
              <div
                role="tabpanel"
                id="panel-scanner"
                aria-labelledby="tab-scanner"
                className="ef-tabpanel"
              >
                {/* Diverging Conviction Leaders */}
                <section className="ef-card ef-perf-section" aria-label="Top Conviction Leaders">
                  <div className="ef-card-header">
                    <h2 className="ef-card-title">Top Conviction Diverging Radar (-10 to +10)</h2>
                    <button
                      type="button"
                      className="ef-btn"
                      onClick={() => setShowCorrelations((v) => !v)}
                    >
                      {showCorrelations ? 'Hide Correlation Matrix' : 'Show G16 Correlation Heatmap'}
                    </button>
                  </div>
                  <div className="ef-diverging-list">
                    {topSetupsPreview.map((sc) => {
                      const pctHalf = Math.min(50, (Math.abs(sc.totalScore) / 10) * 50);
                      const isPos = sc.totalScore >= 0;
                      return (
                        <div
                          key={sc.instrument}
                          className="ef-diverging-row"
                          onClick={() => handleSelectAssetForDeepDive(sc.instrument)}
                          title="Inspect 11-pillar Scorecard"
                        >
                          <span className="ef-num" style={{ fontWeight: 700, color: '#ffffff' }}>
                            {sc.instrument}
                          </span>
                          <div className="ef-diverging-track">
                            <div className="ef-diverging-center" />
                            <div
                              className="ef-diverging-fill"
                              style={{
                                left: isPos ? '50%' : `${50 - pctHalf}%`,
                                width: `${Math.max(2, pctHalf)}%`,
                                background: isPos ? '#00E676' : '#FF5252'
                              }}
                            />
                          </div>
                          <span
                            className="ef-num"
                            style={{
                              textAlign: 'right',
                              fontWeight: 700,
                              color: isPos ? '#69F0AE' : '#FF8A80'
                            }}
                          >
                            {formatSigned(sc.totalScore, 1)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Filter Toolbar */}
                <div className="ef-toolbar">
                  <div className="ef-filter-pills" role="group" aria-label="Scanner Asset Filters">
                    {(
                      [
                        ['ALL', `All Assets (${scorecards.length})`],
                        ['FOREX', '28 FX Pairs'],
                        ['FUTURES', 'Futures & Commodities'],
                        ['CRYPTO', 'Crypto (BTC/ETH)'],
                        ['EXTREME_COT', `52W COT Extremes (${cotExtremeCount})`],
                        ['ALIGNED', `Killzone Aligned (${alignedCount})`],
                        ['STRONG', 'Strong Bias (|Score| >= 5)'],
                        ['WATCHLIST', `★ Watchlist (${watchlist.length})`]
                      ] as Array<[AssetFilterMode, string]>
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        className={`ef-filter-btn ${filterMode === mode ? 'is-active' : ''}`}
                        onClick={() => setFilterMode(mode)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <input
                    type="search"
                    className="ef-search-input"
                    placeholder="Filter instrument or class..."
                    aria-label="Filter scanner instruments"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                {/* Responsive Sortable Scanner Table */}
                <div
                  tabIndex={0}
                  role="region"
                  aria-labelledby="ef-scanner-caption"
                  className="ef-table-wrapper ef-perf-section"
                >
                  <table className="ef-table">
                    <caption id="ef-scanner-caption">
                      Manna EdgeFinder Institutional Matrix ({scorecards.length} Assets) — Click any column header to sort or click a row to inspect the 11-pillar Asset Scorecard.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col" aria-sort={sortKey === 'instrument' ? sortDir : undefined}>
                          <button type="button" className="ef-sort-btn" onClick={() => handleSort('instrument')}>
                            <span>Instrument</span>
                            <span>{sortKey === 'instrument' ? (sortDir === 'ascending' ? '▲' : '▼') : '↕'}</span>
                          </button>
                        </th>
                        <th scope="col" aria-sort={sortKey === 'currentPrice' ? sortDir : undefined}>
                          <button type="button" className="ef-sort-btn" onClick={() => handleSort('currentPrice')}>
                            <span>Price / 1D</span>
                            <span>{sortKey === 'currentPrice' ? (sortDir === 'ascending' ? '▲' : '▼') : '↕'}</span>
                          </button>
                        </th>
                        <th scope="col" aria-sort={sortKey === 'totalScore' ? sortDir : undefined}>
                          <button type="button" className="ef-sort-btn" onClick={() => handleSort('totalScore')}>
                            <span>Edge Score</span>
                            <span>{sortKey === 'totalScore' ? (sortDir === 'ascending' ? '▲' : '▼') : '↕'}</span>
                          </button>
                        </th>
                        <th scope="col" aria-sort={sortKey === 'cotScore' ? sortDir : undefined}>
                          <button type="button" className="ef-sort-btn" onClick={() => handleSort('cotScore')}>
                            <span>COT Flow</span>
                            <span>{sortKey === 'cotScore' ? (sortDir === 'ascending' ? '▲' : '▼') : '↕'}</span>
                          </button>
                        </th>
                        <th scope="col" aria-sort={sortKey === 'retailScore' ? sortDir : undefined}>
                          <button type="button" className="ef-sort-btn" onClick={() => handleSort('retailScore')}>
                            <span>Retail Fade</span>
                            <span>{sortKey === 'retailScore' ? (sortDir === 'ascending' ? '▲' : '▼') : '↕'}</span>
                          </button>
                        </th>
                        <th scope="col" aria-sort={sortKey === 'seasonalityScore' ? sortDir : undefined}>
                          <button type="button" className="ef-sort-btn" onClick={() => handleSort('seasonalityScore')}>
                            <span>Seasonal</span>
                            <span>{sortKey === 'seasonalityScore' ? (sortDir === 'ascending' ? '▲' : '▼') : '↕'}</span>
                          </button>
                        </th>
                        <th scope="col" aria-sort={sortKey === 'trendScore' ? sortDir : undefined}>
                          <button type="button" className="ef-sort-btn" onClick={() => handleSort('trendScore')}>
                            <span>Trend</span>
                            <span>{sortKey === 'trendScore' ? (sortDir === 'ascending' ? '▲' : '▼') : '↕'}</span>
                          </button>
                        </th>
                        <th scope="col" aria-sort={sortKey === 'volatilityPct' ? sortDir : undefined}>
                          <button type="button" className="ef-sort-btn" onClick={() => handleSort('volatilityPct')}>
                            <span>Vol / MTF</span>
                            <span>{sortKey === 'volatilityPct' ? (sortDir === 'ascending' ? '▲' : '▼') : '↕'}</span>
                          </button>
                        </th>
                        <th scope="col" aria-sort={sortKey === 'fundamentalScore' ? sortDir : undefined}>
                          <button type="button" className="ef-sort-btn" onClick={() => handleSort('fundamentalScore')}>
                            <span>Macro Diff</span>
                            <span>{sortKey === 'fundamentalScore' ? (sortDir === 'ascending' ? '▲' : '▼') : '↕'}</span>
                          </button>
                        </th>
                        <th scope="col" aria-sort={sortKey === 'mannaFlowScore' ? sortDir : undefined}>
                          <button type="button" className="ef-sort-btn" onClick={() => handleSort('mannaFlowScore')}>
                            <span>Manna KZ</span>
                            <span>{sortKey === 'mannaFlowScore' ? (sortDir === 'ascending' ? '▲' : '▼') : '↕'}</span>
                          </button>
                        </th>
                        <th scope="col">
                          <span style={{ display: 'block', padding: '11px 12px' }}>Confluence Bias</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredScorecards.map((sc) => {
                        const isStarred = watchlist.includes(sc.instrument);
                        const isSelected = activeScorecard?.instrument === sc.instrument;
                        return (
                          <tr
                            key={sc.instrument}
                            className={isSelected ? 'is-selected' : ''}
                            onClick={() => handleSelectAssetForDeepDive(sc.instrument)}
                          >
                            <th scope="row">
                              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                                <button
                                  type="button"
                                  onClick={(e) => toggleWatchlist(sc.instrument, e)}
                                  aria-label={isStarred ? `Remove ${sc.instrument} from watchlist` : `Add ${sc.instrument} to watchlist`}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: isStarred ? '#DFC46B' : '#6b5b95',
                                    fontSize: '0.95rem',
                                    padding: 0
                                  }}
                                >
                                  {isStarred ? '★' : '☆'}
                                </button>
                                <div>
                                  <div style={{ fontWeight: 700, color: '#ffffff' }}>{sc.instrument}</div>
                                  <div style={{ fontSize: '0.7rem', color: '#9f91c2', fontWeight: 400 }}>{sc.category}</div>
                                </div>
                              </div>
                            </th>
                            <td>
                              <div className="ef-num" style={{ color: '#ffffff', fontWeight: 600 }}>{sc.currentPrice}</div>
                              <div
                                className="ef-num"
                                style={{
                                  fontSize: '0.73rem',
                                  color: sc.dailyChangePct >= 0 ? '#69F0AE' : '#FF8A80'
                                }}
                              >
                                {formatSigned(sc.dailyChangePct, 2)}%
                              </div>
                            </td>
                            <td>
                              <span className="ef-heatmap-cell" style={scoreCellStyle(sc.totalScore)}>
                                {formatSigned(sc.totalScore, 1)}
                              </span>
                            </td>
                            <td>
                              <span className="ef-heatmap-cell" style={scoreCellStyle(sc.cotScore)}>
                                {formatSigned(sc.cotScore, 1)}
                              </span>
                            </td>
                            <td>
                              <span className="ef-heatmap-cell" style={scoreCellStyle(sc.retailScore)}>
                                {formatSigned(sc.retailScore, 1)}
                              </span>
                            </td>
                            <td>
                              <span className="ef-heatmap-cell" style={scoreCellStyle(sc.seasonalityScore)}>
                                {formatSigned(sc.seasonalityScore, 2)}
                              </span>
                            </td>
                            <td>
                              <span className="ef-heatmap-cell" style={scoreCellStyle(sc.trendScore)}>
                                {formatSigned(sc.trendScore, 2)}
                              </span>
                            </td>
                            <td>
                              <div className="ef-num" style={{ fontSize: '0.76rem', fontWeight: 700, color: sc.technical.dayRangePctOfAtr >= 100 ? '#FF8A80' : '#DFC46B' }}>
                                {sc.technical.dayRangePctOfAtr.toFixed(0)}% ADR · {formatSigned(sc.technical.return5dPct, 1)}% 5D
                              </div>
                              <div style={{ fontSize: '0.68rem', color: '#a99bc9' }}>
                                MTF {sc.technical.mtfAlignment.alignedCount}/4 · {sc.technical.volatilityPercentile30d}%ile Vol
                              </div>
                            </td>
                            <td>
                              <span className="ef-heatmap-cell" style={scoreCellStyle(sc.fundamentalScore)}>
                                {formatSigned(sc.fundamentalScore, 2)}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`ef-kz-pill ${
                                  sc.killzoneAlignment.alignmentStatus === 'ALIGNED'
                                    ? 'ef-kz-aligned'
                                    : sc.killzoneAlignment.alignmentStatus === 'CONFLICT'
                                      ? 'ef-kz-conflict'
                                      : 'ef-kz-standby'
                                }`}
                              >
                                {sc.killzoneAlignment.activeSetupCount > 0
                                  ? `${sc.killzoneAlignment.direction} · ${sc.killzoneAlignment.killzone}`
                                  : `BEST: ${sc.seasonality.bestKillzone}`}
                              </span>
                            </td>
                            <td>
                              <span className={biasBadgeClass(sc.biasLabel)}>{sc.biasLabel}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Optional Cross-Asset Correlation Matrix */}
                {showCorrelations && (
                  <section className="ef-card ef-perf-section" aria-label="Cross-Asset Daily Return Correlations">
                    <div className="ef-card-header">
                      <h2 className="ef-card-title">30-Day Cross-Asset Return Correlation Matrix (Key Benchmarks)</h2>
                      <span className="ef-card-meta">Pearson r (-1.00 inverse to +1.00 coupled)</span>
                    </div>
                    <div className="ef-seasonality-grid">
                      <table className="ef-seasonality-table">
                        <thead>
                          <tr>
                            <th>Asset</th>
                            {corrAssets.map((col) => (
                              <th key={col}>{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {corrAssets.map((row) => (
                            <tr key={row}>
                              <td>{row}</td>
                              {corrAssets.map((col) => {
                                const val = snapshot.correlations.matrix[row]?.[col] ?? 0;
                                const bg =
                                  row === col
                                    ? 'rgba(201, 168, 76, 0.22)'
                                    : val >= 0.6
                                      ? 'rgba(0, 230, 118, 0.25)'
                                      : val <= -0.6
                                        ? 'rgba(255, 82, 82, 0.25)'
                                        : 'transparent';
                                return (
                                  <td key={col} style={{ background: bg }}>
                                    {val.toFixed(2)}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </div>
            )}

            {/* TAB 2: ASSET SCORECARD DEEP-DIVE */}
            {activeTab === 'scorecard' && activeScorecard && (
              <div
                role="tabpanel"
                id="panel-scorecard"
                aria-labelledby="tab-scorecard"
                className="ef-tabpanel"
              >
                <div className="ef-toolbar">
                  <div className="ef-filter-pills" role="group" aria-label="Select Asset Scorecard">
                    {scorecards.map((sc) => (
                      <button
                        key={sc.instrument}
                        type="button"
                        className={`ef-filter-btn ${activeScorecard.instrument === sc.instrument ? 'is-active' : ''}`}
                        onClick={() => setSelectedSymbol(sc.instrument)}
                      >
                        {sc.instrument}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ef-deepdive-grid">
                  {/* Left: Score Gauge + Key Technicals + Manna Killzone Confluence */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <section className="ef-card ef-perf-section">
                      <div className="ef-card-header">
                        <h2 className="ef-card-title">{activeScorecard.instrument} Edge Gauge</h2>
                        <span className="ef-card-meta">{activeScorecard.priceSource} FEED</span>
                      </div>
                      <ScoreGaugeSvg score={activeScorecard.totalScore} biasLabel={activeScorecard.biasLabel} />
                      <div style={{ textAlign: 'center', marginTop: 6, color: '#cfc5e8', fontSize: '0.84rem' }}>
                        {activeScorecard.displayName} ·{' '}
                        <strong className="ef-num" style={{ color: '#ffffff' }}>{activeScorecard.currentPrice}</strong>{' '}
                        <span className="ef-num" style={{ color: activeScorecard.dailyChangePct >= 0 ? '#69F0AE' : '#FF8A80' }}>
                          ({formatSigned(activeScorecard.dailyChangePct, 2)}%)
                        </span>
                      </div>
                    </section>

                    <section className="ef-card ef-perf-section">
                      <div className="ef-card-header">
                        <h2 className="ef-card-title">Manna Killzone Synergy</h2>
                        <span
                          className={`ef-kz-pill ${
                            activeScorecard.killzoneAlignment.alignmentStatus === 'ALIGNED'
                              ? 'ef-kz-aligned'
                              : activeScorecard.killzoneAlignment.alignmentStatus === 'CONFLICT'
                                ? 'ef-kz-conflict'
                                : 'ef-kz-standby'
                          }`}
                        >
                          {activeScorecard.killzoneAlignment.alignmentStatus}
                        </span>
                      </div>
                      <p style={{ margin: '0 0 10px', fontSize: '0.82rem', color: '#dcd3f2' }}>
                        {activeScorecard.seasonality.killzoneAffinityNotes}
                      </p>
                      <div className="ef-sync-stats">
                        <div className="ef-stat-box">
                          <div className="ef-stat-label">Active Signals</div>
                          <div className="ef-stat-val">{activeScorecard.killzoneAlignment.activeSetupCount}</div>
                        </div>
                        <div className="ef-stat-box">
                          <div className="ef-stat-label">Optimal Session</div>
                          <div className="ef-stat-val" style={{ color: '#DFC46B' }}>
                            {activeScorecard.seasonality.bestKillzone}
                          </div>
                        </div>
                        <div className="ef-stat-box">
                          <div className="ef-stat-label">RSI (14D) / ADR%</div>
                          <div className="ef-stat-val">
                            {activeScorecard.technical.rsi14.toFixed(1)} · {activeScorecard.technical.dayRangePctOfAtr.toFixed(0)}%
                          </div>
                        </div>
                        <div className="ef-stat-box">
                          <div className="ef-stat-label">5D / 20D Mom</div>
                          <div
                            className="ef-stat-val"
                            style={{ color: activeScorecard.technical.return5dPct >= 0 ? '#69F0AE' : '#FF8A80' }}
                          >
                            {formatSigned(activeScorecard.technical.return5dPct, 1)}% / {formatSigned(activeScorecard.technical.return20dPct, 1)}%
                          </div>
                        </div>
                        <div className="ef-stat-box">
                          <div className="ef-stat-label">30D Vol %ile</div>
                          <div className="ef-stat-val">{activeScorecard.technical.volatilityPercentile30d}%ile</div>
                        </div>
                        <div className="ef-stat-box">
                          <div className="ef-stat-label">52W COT Index</div>
                          <div className="ef-stat-val" style={{ color: '#38bdf8' }}>
                            {activeScorecard.cot.cotIndex52w.toFixed(1)}% (Z {activeScorecard.cot.cotZScore52w.toFixed(2)})
                          </div>
                        </div>
                      </div>
                      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
                        {(
                          [
                            ['5D', activeScorecard.technical.mtfAlignment.d5],
                            ['20D', activeScorecard.technical.mtfAlignment.d20],
                            ['50D', activeScorecard.technical.mtfAlignment.d50],
                            ['Monthly', activeScorecard.technical.mtfAlignment.monthly]
                          ] as Array<[string, 'Bullish' | 'Bearish' | 'Flat']>
                        ).map(([tf, dir]) => (
                          <div
                            key={tf}
                            style={{
                              padding: '5px 6px',
                              borderRadius: 6,
                              textAlign: 'center',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              background:
                                dir === 'Bullish'
                                  ? 'rgba(0,230,118,0.14)'
                                  : dir === 'Bearish'
                                    ? 'rgba(255,82,82,0.14)'
                                    : 'rgba(255,255,255,0.05)',
                              color: dir === 'Bullish' ? '#69F0AE' : dir === 'Bearish' ? '#FF8A80' : '#cfc5e8'
                            }}
                          >
                            {tf}: {dir}
                          </div>
                        ))}
                      </div>
                    </section>

                    {/* Base vs Quote Macro Tug of War */}
                    <section className="ef-card ef-perf-section">
                      <div className="ef-card-header">
                        <h2 className="ef-card-title">Base vs Quote Tug-of-War</h2>
                        <span className="ef-card-meta">
                          {activeScorecard.tugOfWar.baseLabel} vs {activeScorecard.tugOfWar.quoteLabel}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {activeScorecard.tugOfWar.rows.map((row) => (
                          <div key={row.metric} className="ef-tug-row">
                            <span
                              className="ef-num"
                              style={{
                                fontWeight: row.advantage === 'BASE' ? 700 : 400,
                                color: row.advantage === 'BASE' ? '#69F0AE' : '#b7a8d6'
                              }}
                            >
                              {row.baseValue}
                            </span>
                            <span style={{ textAlign: 'center', color: '#DFC46B', fontSize: '0.73rem', fontWeight: 600 }}>
                              {row.metric}
                            </span>
                            <span
                              className="ef-num"
                              style={{
                                textAlign: 'right',
                                fontWeight: row.advantage === 'QUOTE' ? 700 : 400,
                                color: row.advantage === 'QUOTE' ? '#FF8A80' : '#b7a8d6'
                              }}
                            >
                              {row.quoteValue}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>

                  {/* Right: Price vs Score Dual Chart + 11-Pillar Breakdown */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <section className="ef-card ef-perf-section">
                      <div className="ef-card-header">
                        <h2 className="ef-card-title">30-Day Price (Gold) vs Historical Edge Score (Cyan)</h2>
                        <span className="ef-card-meta">
                          EMA5: {activeScorecard.technical.ema5} · EMA20: {activeScorecard.technical.ema20} · EMA50: {activeScorecard.technical.ema50}
                        </span>
                      </div>
                      <HistoricalScorePriceSvg
                        series={activeScorecard.historicalSeries}
                        instrument={activeScorecard.instrument}
                      />
                    </section>

                    <section className="ef-card ef-perf-section">
                      <div className="ef-card-header">
                        <h2 className="ef-card-title">11-Pillar Institutional Weight Breakdown</h2>
                        <span className="ef-card-meta">Weighted Sum Normalized to [-10, +10]</span>
                      </div>
                      <div className="ef-pill-grid">
                        {activeScorecard.factors.map((f) => (
                          <div key={f.key} className="ef-pillar-card">
                            <div className="ef-pillar-top">
                              <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#a99bc9', letterSpacing: '0.04em' }}>
                                {f.category}
                              </span>
                              <span className="ef-heatmap-cell" style={scoreCellStyle(f.contribution * 2)}>
                                {formatSigned(f.contribution, 2)} (w={f.weight})
                              </span>
                            </div>
                            <div style={{ fontWeight: 700, color: '#ffffff', fontSize: '0.88rem' }}>{f.label}</div>
                            <div style={{ fontSize: '0.77rem', color: '#b7a8d6', lineHeight: 1.4 }}>{f.detail}</div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2B: DEDICATED GOLD SCORECARD (REAL YIELDS / DXY / VIX / GC-SI / COT) */}
            {activeTab === 'gold' && snapshot.goldScorecard && (
              <div
                role="tabpanel"
                id="panel-gold"
                aria-labelledby="tab-gold"
                className="ef-tabpanel"
              >
                <div className="ef-deepdive-grid">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <section className="ef-card ef-perf-section">
                      <div className="ef-card-header">
                        <h2 className="ef-card-title">COMEX Gold (GC / XAU) Edge Gauge</h2>
                        <span className="ef-card-meta">7-Pillar Precious Metals Model</span>
                      </div>
                      <ScoreGaugeSvg
                        score={snapshot.goldScorecard.totalScore}
                        biasLabel={snapshot.goldScorecard.biasLabel}
                      />
                      <div style={{ textAlign: 'center', marginTop: 6, color: '#cfc5e8', fontSize: '0.86rem' }}>
                        GCSpot/Fut <strong className="ef-num" style={{ color: '#ffffff' }}>${snapshot.goldScorecard.gcPrice.toFixed(2)}</strong>{' '}
                        <span className="ef-num" style={{ color: snapshot.goldScorecard.gcChangePct >= 0 ? '#69F0AE' : '#FF8A80' }}>
                          ({formatSigned(snapshot.goldScorecard.gcChangePct, 2)}%)
                        </span>
                      </div>
                    </section>

                    <section className="ef-card ef-perf-section">
                      <div className="ef-card-header">
                        <h2 className="ef-card-title">Macro Gold Inputs (Live)</h2>
                        <span className="ef-card-meta">FRED + Yahoo + CFTC</span>
                      </div>
                      <div className="ef-sync-stats">
                        <div className="ef-stat-box">
                          <div className="ef-stat-label">10Y TIPS Real Yield</div>
                          <div className="ef-stat-val" style={{ color: snapshot.goldScorecard.realYield10y >= 2.2 ? '#FF8A80' : '#69F0AE' }}>
                            {snapshot.goldScorecard.realYield10y.toFixed(2)}%
                          </div>
                        </div>
                        <div className="ef-stat-box">
                          <div className="ef-stat-label">US Dollar Index (DXY)</div>
                          <div className="ef-stat-val">{snapshot.goldScorecard.dxy.toFixed(2)}</div>
                        </div>
                        <div className="ef-stat-box">
                          <div className="ef-stat-label">Gold / Silver Ratio</div>
                          <div className="ef-stat-val" style={{ color: '#DFC46B' }}>
                            {snapshot.goldScorecard.goldSilverRatio.toFixed(1)}x
                          </div>
                        </div>
                        <div className="ef-stat-box">
                          <div className="ef-stat-label">Silver (SI) / VIX</div>
                          <div className="ef-stat-val">
                            ${snapshot.goldScorecard.silverPrice.toFixed(2)} · {snapshot.goldScorecard.vix.toFixed(1)}
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <section className="ef-card ef-perf-section">
                      <div className="ef-card-header">
                        <h2 className="ef-card-title">30-Day COMEX Gold (Gold) vs US Dollar Index DXY (Cyan)</h2>
                        <span className="ef-card-meta">52W COT Index: {snapshot.goldScorecard.cotIndex52w.toFixed(1)}%</span>
                      </div>
                      <GoldVsDxyChartSvg series={snapshot.goldScorecard.series30d} />
                    </section>

                    <section className="ef-card ef-perf-section">
                      <div className="ef-card-header">
                        <h2 className="ef-card-title">7-Pillar Gold Model Attribution</h2>
                        <span className="ef-card-meta">Real Rate · Dollar Inverse · Haven · COT</span>
                      </div>
                      <div className="ef-pill-grid">
                        {snapshot.goldScorecard.drivers.map((d) => (
                          <div key={d.key} className="ef-pillar-card">
                            <div className="ef-pillar-top">
                              <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#a99bc9' }}>{d.category}</span>
                              <span className="ef-heatmap-cell" style={scoreCellStyle(d.contribution)}>
                                {formatSigned(d.contribution, 2)} (w={d.weight})
                              </span>
                            </div>
                            <div style={{ fontWeight: 700, color: '#ffffff', fontSize: '0.88rem' }}>{d.label}</div>
                            <div style={{ fontSize: '0.77rem', color: '#b7a8d6', lineHeight: 1.4 }}>{d.detail}</div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2C: CARRY TRADE SCANNER (ALL 28 FX PAIRS) */}
            {activeTab === 'carry' && (
              <div
                role="tabpanel"
                id="panel-carry"
                aria-labelledby="tab-carry"
                className="ef-tabpanel"
              >
                <div tabIndex={0} role="region" aria-labelledby="ef-carry-caption" className="ef-table-wrapper ef-perf-section">
                  <table className="ef-table">
                    <caption id="ef-carry-caption">
                      G8 FX Carry Trade Scanner (All 28 Currency Pairs) — Ranked by Live BIS Central Bank Rate Differential &amp; Carry-to-ATR Efficiency.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col" aria-sort={carrySortKey === 'instrument' ? carrySortDir : undefined}>
                          <button type="button" className="ef-sort-btn" onClick={() => handleCarrySort('instrument')}>
                            <span>FX Pair</span>
                            <span>{carrySortKey === 'instrument' ? (carrySortDir === 'ascending' ? '▲' : '▼') : '↕'}</span>
                          </button>
                        </th>
                        <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Base / Quote Rate</span></th>
                        <th scope="col" aria-sort={carrySortKey === 'rateSpreadPct' ? carrySortDir : undefined}>
                          <button type="button" className="ef-sort-btn" onClick={() => handleCarrySort('rateSpreadPct')}>
                            <span>Yield Spread (bps)</span>
                            <span>{carrySortKey === 'rateSpreadPct' ? (carrySortDir === 'ascending' ? '▲' : '▼') : '↕'}</span>
                          </button>
                        </th>
                        <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Optimal Carry Side</span></th>
                        <th scope="col" aria-sort={carrySortKey === 'carryAtrRatio' ? carrySortDir : undefined}>
                          <button type="button" className="ef-sort-btn" onClick={() => handleCarrySort('carryAtrRatio')}>
                            <span>Carry / ATR Ratio</span>
                            <span>{carrySortKey === 'carryAtrRatio' ? (carrySortDir === 'ascending' ? '▲' : '▼') : '↕'}</span>
                          </button>
                        </th>
                        <th scope="col" aria-sort={carrySortKey === 'assetTotalScore' ? carrySortDir : undefined}>
                          <button type="button" className="ef-sort-btn" onClick={() => handleCarrySort('assetTotalScore')}>
                            <span>Edge Score</span>
                            <span>{carrySortKey === 'assetTotalScore' ? (carrySortDir === 'ascending' ? '▲' : '▼') : '↕'}</span>
                          </button>
                        </th>
                        <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Confluence &amp; Trend</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedCarryTrades.map((ct) => (
                        <tr key={ct.instrument} onClick={() => handleSelectAssetForDeepDive(ct.instrument)}>
                          <th scope="row">
                            <div style={{ fontWeight: 700, color: '#ffffff' }}>{ct.instrument}</div>
                            <div style={{ fontSize: '0.7rem', color: '#9f91c2', fontWeight: 400 }}>
                              {ct.baseCurrency} vs {ct.quoteCurrency}
                            </div>
                          </th>
                          <td className="ef-num">
                            {ct.baseRate.toFixed(2)}% / {ct.quoteRate.toFixed(2)}%
                          </td>
                          <td>
                            <span className="ef-heatmap-cell" style={scoreCellStyle(ct.rateSpreadPct)}>
                              {ct.rateSpreadBps >= 0 ? `+${ct.rateSpreadBps}` : ct.rateSpreadBps} bps ({formatSigned(ct.rateSpreadPct, 2)}%)
                            </span>
                          </td>
                          <td>
                            <span
                              className={`ef-kz-pill ${
                                ct.carryDirection === 'LONG'
                                  ? 'ef-bias-buy'
                                  : ct.carryDirection === 'SHORT'
                                    ? 'ef-bias-sell'
                                    : 'ef-kz-standby'
                              }`}
                            >
                              {ct.carryDirection === 'NEUTRAL' ? 'FLAT SPREAD' : `POSITIVE CARRY ${ct.carryDirection}`}
                            </span>
                          </td>
                          <td className="ef-num" style={{ fontWeight: 700, color: '#DFC46B' }}>
                            {ct.carryAtrRatio.toFixed(2)}x
                          </td>
                          <td>
                            <span className="ef-heatmap-cell" style={scoreCellStyle(ct.assetTotalScore)}>
                              {formatSigned(ct.assetTotalScore, 1)} ({ct.biasLabel})
                            </span>
                          </td>
                          <td>
                            <span className={`ef-kz-pill ${ct.alignedWithEdge ? 'ef-kz-aligned' : 'ef-kz-standby'}`}>
                              {ct.alignedWithEdge ? 'CARRY + EDGE ALIGNED' : `TREND: ${ct.technicalTrend}`}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 3: COT SMART MONEY */}
            {activeTab === 'cot' && (
              <div
                role="tabpanel"
                id="panel-cot"
                aria-labelledby="tab-cot"
                className="ef-tabpanel"
              >
                {activeScorecard && (
                  <section className="ef-card ef-perf-section">
                    <div className="ef-card-header">
                      <h2 className="ef-card-title">
                        12-Week Managed Money Net Positioning — {activeScorecard.instrument} ({activeScorecard.cot.contractName})
                      </h2>
                      <span className="ef-card-meta">
                        Source: {activeScorecard.cot.source} · 52W Index: {activeScorecard.cot.cotIndex52w.toFixed(1)}% · Z: {activeScorecard.cot.cotZScore52w.toFixed(2)} · Report {activeScorecard.cot.reportDate}
                      </span>
                    </div>
                    <div className="ef-filter-pills" style={{ marginBottom: 12 }}>
                      {scorecards.map((sc) => (
                        <button
                          key={sc.instrument}
                          type="button"
                          className={`ef-filter-btn ${activeScorecard.instrument === sc.instrument ? 'is-active' : ''}`}
                          onClick={() => setSelectedSymbol(sc.instrument)}
                        >
                          {sc.instrument}
                        </button>
                      ))}
                    </div>
                    <CotHistoryChartSvg
                      history={activeScorecard.cot.history12w}
                      instrument={activeScorecard.instrument}
                    />
                  </section>
                )}

                <div tabIndex={0} role="region" aria-labelledby="ef-cot-caption" className="ef-table-wrapper ef-perf-section">
                  <table className="ef-table">
                    <caption id="ef-cot-caption">
                      CFTC Commitments of Traders — Non-Commercial &amp; Commercial Hedger Positioning + 52-Week Percentile Index Across All {scorecards.length} Tracked Assets.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Instrument</span></th>
                        <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>CFTC Code</span></th>
                        <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Non-Comm Long / Short</span></th>
                        <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Non-Comm Net (WoW)</span></th>
                        <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Commercial Hedgers Net</span></th>
                        <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>52W Index / Z-Score</span></th>
                        <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Spec Long %</span></th>
                        <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Open Interest</span></th>
                        <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>COT Bias &amp; Extreme</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {scorecards.map((sc) => (
                        <tr key={sc.instrument} onClick={() => setSelectedSymbol(sc.instrument)}>
                          <th scope="row">
                            <div style={{ fontWeight: 700, color: '#ffffff' }}>{sc.instrument}</div>
                            <div style={{ fontSize: '0.7rem', color: '#9f91c2', fontWeight: 400 }}>{sc.cot.reportDate}</div>
                          </th>
                          <td className="ef-num">{sc.cot.cftcCode}</td>
                          <td className="ef-num">
                            <span style={{ color: '#69F0AE' }}>{sc.cot.nonCommercialLong.toLocaleString()}</span> /{' '}
                            <span style={{ color: '#FF8A80' }}>{sc.cot.nonCommercialShort.toLocaleString()}</span>
                          </td>
                          <td className="ef-num">
                            <div style={{ fontWeight: 700, color: sc.cot.nonCommercialNet >= 0 ? '#69F0AE' : '#FF8A80' }}>
                              {sc.cot.nonCommercialNet >= 0 ? '+' : ''}{sc.cot.nonCommercialNet.toLocaleString()}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: sc.cot.netChangeWoW >= 0 ? '#B9F6CA' : '#FFCDD2' }}>
                              WoW {sc.cot.netChangeWoW >= 0 ? '+' : ''}{sc.cot.netChangeWoW.toLocaleString()}
                            </div>
                          </td>
                          <td className="ef-num">
                            <div style={{ fontWeight: 600, color: sc.cot.commercialNet >= 0 ? '#38bdf8' : '#ffb74d' }}>
                              {sc.cot.commercialNet >= 0 ? '+' : ''}{sc.cot.commercialNet.toLocaleString()}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#a99bc9' }}>
                              {sc.cot.commercialLongPct.toFixed(1)}% Comm Long
                            </div>
                          </td>
                          <td className="ef-num">
                            <div style={{ fontWeight: 700, color: sc.cot.cotIndex52w >= 80 ? '#69F0AE' : sc.cot.cotIndex52w <= 20 ? '#FF8A80' : '#DFC46B' }}>
                              {sc.cot.cotIndex52w.toFixed(1)}%
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#a99bc9' }}>
                              Z {sc.cot.cotZScore52w >= 0 ? '+' : ''}{sc.cot.cotZScore52w.toFixed(2)}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div className="ef-split-bar" style={{ width: 84 }}>
                                <div className="ef-split-long" style={{ width: `${sc.cot.longPct}%` }} />
                                <div className="ef-split-short" style={{ width: `${sc.cot.shortPct}%` }} />
                              </div>
                              <span className="ef-num">{sc.cot.longPct.toFixed(1)}%</span>
                            </div>
                          </td>
                          <td className="ef-num">{sc.cot.openInterest.toLocaleString()}</td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <span className="ef-heatmap-cell" style={scoreCellStyle(sc.cotScore)}>
                                {sc.cot.sentimentLabel}
                              </span>
                              {sc.cot.extremeFlag !== 'NONE' && (
                                <span
                                  className={`ef-kz-pill ${sc.cot.extremeFlag === 'BULLISH_EXTREME' ? 'ef-bias-buy' : 'ef-kz-conflict'}`}
                                  style={{ fontSize: '0.66rem' }}
                                >
                                  {sc.cot.extremeFlag.replace('_', ' ')}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 3B: SMART MONEY TRACKER (SEC FORM 4, 13F WHALES, WALL STREET TARGETS) */}
            {activeTab === 'smart_money' && snapshot.smartMoney && (
              <div
                role="tabpanel"
                id="panel-smart_money"
                aria-labelledby="tab-smart_money"
                className="ef-tabpanel"
              >
                <div tabIndex={0} role="region" aria-labelledby="ef-targets-caption" className="ef-table-wrapper ef-perf-section">
                  <table className="ef-table">
                    <caption id="ef-targets-caption">
                      Wall Street Institutional Analyst Consensus Targets Across Macro &amp; Sector Bellwethers (Live Yahoo Finance Consensus).
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Ticker</span></th>
                        <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Current Price</span></th>
                        <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Target Low</span></th>
                        <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Mean Consensus</span></th>
                        <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Target High</span></th>
                        <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Implied Upside</span></th>
                        <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Rating (Analysts)</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.smartMoney.bankAndStreetTargets.map((item) => (
                        <tr key={item.ticker}>
                          <th scope="row">
                            <div style={{ fontWeight: 700, color: '#ffffff' }}>{item.ticker}</div>
                            <div style={{ fontSize: '0.7rem', color: '#9f91c2', fontWeight: 400 }}>{item.name}</div>
                          </th>
                          <td className="ef-num">${item.currentPrice.toFixed(2)}</td>
                          <td className="ef-num" style={{ color: '#b7a8d6' }}>${item.targetLow.toFixed(2)}</td>
                          <td className="ef-num" style={{ fontWeight: 700, color: '#DFC46B' }}>${item.targetMean.toFixed(2)}</td>
                          <td className="ef-num" style={{ color: '#69F0AE' }}>${item.targetHigh.toFixed(2)}</td>
                          <td>
                            <span className="ef-heatmap-cell" style={scoreCellStyle(item.upsidePct / 5)}>
                              {formatSigned(item.upsidePct, 1)}%
                            </span>
                          </td>
                          <td>
                            <span className="ef-kz-pill ef-kz-aligned" style={{ textTransform: 'uppercase' }}>
                              {item.recommendationKey} ({item.analystsCount})
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="ef-two-col-grid">
                  <div tabIndex={0} role="region" aria-labelledby="ef-insiders-caption" className="ef-table-wrapper ef-perf-section">
                    <table className="ef-table">
                      <caption id="ef-insiders-caption">
                        SEC Form 4 Corporate Insider Filings (Live Officers &amp; Directors Buys/Sales).
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Ticker / Date</span></th>
                          <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Insider &amp; Role</span></th>
                          <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Action</span></th>
                          <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Shares / Value</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapshot.smartMoney.insiders.map((ins, i) => (
                          <tr key={`${ins.ticker}-${ins.filerName}-${i}`}>
                            <th scope="row">
                              <div style={{ fontWeight: 700, color: '#ffffff' }}>{ins.ticker}</div>
                              <div style={{ fontSize: '0.7rem', color: '#9f91c2', fontWeight: 400 }}>{ins.date}</div>
                            </th>
                            <td>
                              <div style={{ fontWeight: 600, color: '#e9e2fb', fontSize: '0.8rem' }}>{ins.filerName}</div>
                              <div style={{ fontSize: '0.7rem', color: '#9f91c2' }}>{ins.relation}</div>
                            </td>
                            <td>
                              <span
                                className={`ef-kz-pill ${
                                  ins.direction === 'BUY'
                                    ? 'ef-bias-buy'
                                    : ins.direction === 'SELL'
                                      ? 'ef-bias-sell'
                                      : 'ef-kz-standby'
                                }`}
                              >
                                {ins.direction}
                              </span>
                            </td>
                            <td className="ef-num">
                              <div>{ins.shares.toLocaleString()} sh</div>
                              <div style={{ fontSize: '0.72rem', color: '#DFC46B' }}>{formatUsdCompact(ins.valueUsd)}</div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div tabIndex={0} role="region" aria-labelledby="ef-whales-caption" className="ef-table-wrapper ef-perf-section">
                    <table className="ef-table">
                      <caption id="ef-whales-caption">
                        13F Institutional Whale Holdings (Largest Reported Equity Stakes &amp; QoQ Change).
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Ticker / Report</span></th>
                          <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Institution</span></th>
                          <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Stake % (Chg)</span></th>
                          <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Position Value</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapshot.smartMoney.whales.map((w, i) => (
                          <tr key={`${w.ticker}-${w.holder}-${i}`}>
                            <th scope="row">
                              <div style={{ fontWeight: 700, color: '#ffffff' }}>{w.ticker}</div>
                              <div style={{ fontSize: '0.7rem', color: '#9f91c2', fontWeight: 400 }}>{w.reportDate}</div>
                            </th>
                            <td style={{ fontWeight: 600, color: '#e9e2fb', fontSize: '0.8rem' }}>{w.holder}</td>
                            <td className="ef-num">
                              <div>{w.pctHeld.toFixed(2)}%</div>
                              <div style={{ fontSize: '0.7rem', color: w.pctChange >= 0 ? '#69F0AE' : '#FF8A80' }}>
                                {formatSigned(w.pctChange, 2)}% QoQ
                              </div>
                            </td>
                            <td className="ef-num">
                              <div style={{ fontWeight: 700, color: '#DFC46B' }}>{formatUsdCompact(w.valueUsd)}</div>
                              <div style={{ fontSize: '0.7rem', color: '#9f91c2' }}>{w.position.toLocaleString()} sh</div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: RETAIL SENTIMENT CONTRARIAN RADAR */}
            {activeTab === 'sentiment' && (
              <div
                role="tabpanel"
                id="panel-sentiment"
                aria-labelledby="tab-sentiment"
                className="ef-tabpanel"
              >
                <section className="ef-card ef-perf-section">
                  <div className="ef-card-header">
                    <h2 className="ef-card-title">Retail Crowd Contrarian Radar</h2>
                    <span className="ef-card-meta">
                      Crowd Long &ge; 58% → Contrarian Bearish · Crowd Short &ge; 58% → Contrarian Bullish
                    </span>
                  </div>
                  <div className="ef-pill-grid">
                    {scorecards.map((sc) => {
                      const rs = sc.retailSentiment;
                      return (
                        <div
                          key={sc.instrument}
                          className="ef-pillar-card"
                          style={{
                            cursor: 'pointer',
                            borderColor: rs.crowdedWarning ? 'rgba(201, 168, 76, 0.65)' : undefined
                          }}
                          onClick={() => handleSelectAssetForDeepDive(sc.instrument)}
                        >
                          <div className="ef-pillar-top">
                            <strong style={{ color: '#ffffff', fontSize: '0.96rem' }}>{sc.instrument}</strong>
                            {rs.crowdedWarning && (
                              <span className="ef-kz-pill ef-kz-aligned">CROWD EXTREME</span>
                            )}
                          </div>
                          <div className="ef-split-bar">
                            <div className="ef-split-long" style={{ width: `${rs.longPct}%` }} />
                            <div className="ef-split-short" style={{ width: `${rs.shortPct}%` }} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem' }} className="ef-num">
                            <span style={{ color: '#69F0AE' }}>{rs.longPct.toFixed(1)}% Crowd Long</span>
                            <span style={{ color: '#FF8A80' }}>{rs.shortPct.toFixed(1)}% Crowd Short</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                            <span style={{ fontSize: '0.74rem', color: '#9f91c2' }}>Contrarian Signal</span>
                            <span className="ef-heatmap-cell" style={scoreCellStyle(sc.retailScore)}>
                              {rs.contrarianBias.toUpperCase()} ({formatSigned(sc.retailScore, 0)})
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            )}

            {/* TAB 5: SEASONALITY & KILLZONE TENDENCIES */}
            {activeTab === 'seasonality' && (
              <div
                role="tabpanel"
                id="panel-seasonality"
                aria-labelledby="tab-seasonality"
                className="ef-tabpanel"
              >
                {activeScorecard && (
                  <section className="ef-card ef-perf-section">
                    <div className="ef-card-header">
                      <h2 className="ef-card-title">
                        10-Year Monthly Seasonality Distribution — {activeScorecard.instrument}
                      </h2>
                      <span className="ef-card-meta">
                        Best Session: {activeScorecard.seasonality.bestKillzone} · Current Month Avg:{' '}
                        {formatSigned(activeScorecard.seasonality.currentMonthAvgReturn, 2)}% ({activeScorecard.seasonality.currentMonthWinRate}% Win)
                      </span>
                    </div>
                    <SeasonalityBarChartSvg
                      monthlyReturns={activeScorecard.seasonality.monthlyReturns10Y}
                      currentMonthIndex={activeScorecard.seasonality.currentMonthIndex}
                      instrument={activeScorecard.instrument}
                    />
                  </section>
                )}

                <div className="ef-toolbar">
                  <div className="ef-filter-pills">
                    <button
                      type="button"
                      className={`ef-filter-btn ${seasonalityMetric === 'return' ? 'is-active' : ''}`}
                      onClick={() => setSeasonalityMetric('return')}
                    >
                      Avg Monthly Return (%)
                    </button>
                    <button
                      type="button"
                      className={`ef-filter-btn ${seasonalityMetric === 'winRate' ? 'is-active' : ''}`}
                      onClick={() => setSeasonalityMetric('winRate')}
                    >
                      10Y Positive Win Rate (%)
                    </button>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: '#DFC46B' }}>
                    Gold outline marks current calendar month ({MONTHS[new Date().getUTCMonth()]})
                  </span>
                </div>

                <div className="ef-seasonality-grid ef-perf-section">
                  <table className="ef-seasonality-table">
                    <thead>
                      <tr>
                        <th>Asset / Killzone</th>
                        {MONTHS.map((m) => (
                          <th key={m}>{m}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {scorecards.map((sc) => {
                        const values =
                          seasonalityMetric === 'return'
                            ? sc.seasonality.monthlyReturns10Y
                            : sc.seasonality.monthlyWinRate10Y;
                        return (
                          <tr
                            key={sc.instrument}
                            style={{ cursor: 'pointer' }}
                            onClick={() => setSelectedSymbol(sc.instrument)}
                          >
                            <td>
                              <div>{sc.instrument}</div>
                              <div style={{ fontSize: '0.68rem', color: '#DFC46B', fontWeight: 400 }}>
                                KZ: {sc.seasonality.bestKillzone}
                              </div>
                            </td>
                            {values.map((val, mIdx) => {
                              const isCurr = mIdx === sc.seasonality.currentMonthIndex;
                              return (
                                <td
                                  key={mIdx}
                                  className={isCurr ? 'ef-month-current' : ''}
                                  style={seasonalityCellStyle(val, seasonalityMetric === 'winRate')}
                                >
                                  {seasonalityMetric === 'return'
                                    ? `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`
                                    : `${Math.round(val)}%`}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 6: GLOBAL MACRO, CENTRAL BANK HUB & ECONOMIC CALENDAR */}
            {activeTab === 'macro' && (
              <div
                role="tabpanel"
                id="panel-macro"
                aria-labelledby="tab-macro"
                className="ef-tabpanel"
              >
                {/* US Treasury Yield Curve & Live FRED Macro Valuation */}
                {snapshot.macroInternals && (
                  <div className="ef-two-col-grid">
                    <section className="ef-card ef-perf-section">
                      <div className="ef-card-header">
                        <h2 className="ef-card-title">US Treasury Yield Curve &amp; Intermarket Regime</h2>
                        <span
                          className={`ef-kz-pill ${
                            snapshot.macroInternals.yieldCurve.curveRegime.includes('Inverted')
                              ? 'ef-kz-conflict'
                              : snapshot.macroInternals.yieldCurve.curveRegime.includes('Normal')
                                ? 'ef-kz-aligned'
                                : 'ef-kz-standby'
                          }`}
                        >
                          {snapshot.macroInternals.yieldCurve.curveRegime}
                        </span>
                      </div>
                      <YieldCurveSvg
                        m3={snapshot.macroInternals.yieldCurve.m3}
                        y2={snapshot.macroInternals.yieldCurve.y2}
                        y5={snapshot.macroInternals.yieldCurve.y5}
                        y10={snapshot.macroInternals.yieldCurve.y10}
                        y30={snapshot.macroInternals.yieldCurve.y30}
                        realYield10y={snapshot.macroInternals.yieldCurve.realYield10y}
                        curveRegime={snapshot.macroInternals.yieldCurve.curveRegime}
                      />
                      <div className="ef-sync-stats" style={{ marginTop: 10 }}>
                        <div className="ef-stat-box">
                          <div className="ef-stat-label">10Y - 2Y Spread</div>
                          <div
                            className="ef-stat-val"
                            style={{ color: snapshot.macroInternals.yieldCurve.spread10y2y < 0 ? '#FF8A80' : '#69F0AE' }}
                          >
                            {formatSigned(snapshot.macroInternals.yieldCurve.spread10y2y, 2)}%
                          </div>
                        </div>
                        <div className="ef-stat-box">
                          <div className="ef-stat-label">10Y - 3M Spread</div>
                          <div
                            className="ef-stat-val"
                            style={{ color: snapshot.macroInternals.yieldCurve.spread10y3m < 0 ? '#FF8A80' : '#69F0AE' }}
                          >
                            {formatSigned(snapshot.macroInternals.yieldCurve.spread10y3m, 2)}%
                          </div>
                        </div>
                        <div className="ef-stat-box">
                          <div className="ef-stat-label">US Dollar Index (DXY)</div>
                          <div className="ef-stat-val">
                            {snapshot.macroInternals.dxy.toFixed(2)}{' '}
                            <span style={{ fontSize: '0.72rem', color: snapshot.macroInternals.dxyChangePct >= 0 ? '#69F0AE' : '#FF8A80' }}>
                              ({formatSigned(snapshot.macroInternals.dxyChangePct, 2)}%)
                            </span>
                          </div>
                        </div>
                        <div className="ef-stat-box">
                          <div className="ef-stat-label">CBOE VIX / S&amp;P 500</div>
                          <div className="ef-stat-val">
                            {snapshot.macroInternals.vix.toFixed(1)} · {snapshot.macroInternals.sp500Price.toFixed(0)}
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="ef-card ef-perf-section">
                      <div className="ef-card-header">
                        <h2 className="ef-card-title">Live FRED US Macro Health &amp; Valuation</h2>
                        <span className="ef-card-meta">Updated {snapshot.macroInternals.fredUsMacro.updatedAt}</span>
                      </div>
                      <div className="ef-sync-stats">
                        <div className="ef-stat-box">
                          <div className="ef-stat-label">Nonfarm Payrolls (PAYEMS)</div>
                          <div className="ef-stat-val">{snapshot.macroInternals.fredUsMacro.nfpTotalK.toLocaleString()}K</div>
                          <div style={{ fontSize: '0.7rem', color: snapshot.macroInternals.fredUsMacro.nfpMonthlyChangeK >= 0 ? '#69F0AE' : '#FF8A80' }}>
                            MoM {snapshot.macroInternals.fredUsMacro.nfpMonthlyChangeK >= 0 ? '+' : ''}{snapshot.macroInternals.fredUsMacro.nfpMonthlyChangeK}K Jobs
                          </div>
                        </div>
                        <div className="ef-stat-box">
                          <div className="ef-stat-label">Buffett Indicator (W5K/GDP)</div>
                          <div
                            className="ef-stat-val"
                            style={{ color: snapshot.macroInternals.fredUsMacro.buffettIndicatorPct >= 160 ? '#FF8A80' : '#69F0AE' }}
                          >
                            {snapshot.macroInternals.fredUsMacro.buffettIndicatorPct.toFixed(1)}%
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#a99bc9' }}>
                            {snapshot.macroInternals.fredUsMacro.buffettIndicatorPct >= 160 ? 'Stretched Valuation' : 'Fair Value Zone'}
                          </div>
                        </div>
                        <div className="ef-stat-box">
                          <div className="ef-stat-label">M2 Money Supply</div>
                          <div className="ef-stat-val" style={{ color: '#DFC46B' }}>
                            ${(snapshot.macroInternals.fredUsMacro.m2Billions / 1000).toFixed(2)}T
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#a99bc9' }}>FRED M2SL Liquidity</div>
                        </div>
                        <div className="ef-stat-box">
                          <div className="ef-stat-label">US Housing Starts</div>
                          <div className="ef-stat-val">{snapshot.macroInternals.fredUsMacro.housingStartsK.toLocaleString()}K</div>
                          <div style={{ fontSize: '0.7rem', color: '#a99bc9' }}>SAAR Units (HOUST)</div>
                        </div>
                        <div className="ef-stat-box">
                          <div className="ef-stat-label">US Nominal GDP</div>
                          <div className="ef-stat-val">${(snapshot.macroInternals.fredUsMacro.nominalGdpBillions / 1000).toFixed(2)}T</div>
                        </div>
                        <div className="ef-stat-box">
                          <div className="ef-stat-label">Wilshire 5000 Cap</div>
                          <div className="ef-stat-val">${(snapshot.macroInternals.wilshire5000Price / 1000).toFixed(2)}T</div>
                        </div>
                      </div>
                    </section>
                  </div>
                )}

                <div tabIndex={0} role="region" aria-labelledby="ef-macro-caption" className="ef-table-wrapper ef-perf-section">
                  <table className="ef-table">
                    <caption id="ef-macro-caption">
                      G8 Sovereign Economies, Central Bank Rate Probabilities &amp; Policy Matrix — {isSuperAdmin ? 'Super Admin can edit macro parameters live.' : 'Live macro differential feeds.'}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Currency</span></th>
                        <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Policy Rate</span></th>
                        <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Stance / Next</span></th>
                        <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Implied Rate Odds</span></th>
                        <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>GDP QoQ</span></th>
                        <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>CPI / Core</span></th>
                        <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>PMI Mfg / Svc</span></th>
                        <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Unemp</span></th>
                        <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Macro Score</span></th>
                        {isSuperAdmin && <th scope="col"><span style={{ display: 'block', padding: '11px 12px' }}>Governance</span></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.economies.map((econ) => (
                        <tr key={econ.currency}>
                          <th scope="row">
                            <div style={{ fontWeight: 700, color: '#ffffff' }}>{econ.currency} — {econ.country}</div>
                            <div style={{ fontSize: '0.7rem', color: '#9f91c2', fontWeight: 400 }}>{econ.centralBank}</div>
                          </th>
                          <td className="ef-num" style={{ fontWeight: 700, color: '#DFC46B' }}>{econ.rate.toFixed(2)}%</td>
                          <td>
                            <span
                              className={
                                econ.stance === 'Hawkish'
                                  ? 'ef-bias-badge ef-bias-buy'
                                  : econ.stance === 'Dovish'
                                    ? 'ef-bias-badge ef-bias-sell'
                                    : 'ef-bias-badge ef-bias-neutral'
                              }
                            >
                              {econ.stance} · {econ.rateExpectation}
                            </span>
                            <div style={{ fontSize: '0.7rem', color: '#9f91c2', marginTop: 2 }}>{econ.nextMeeting}</div>
                          </td>
                          <td>
                            {econ.rateProbabilities ? (
                              <div className="ef-num" style={{ fontSize: '0.73rem', lineHeight: 1.35 }}>
                                <span style={{ color: '#69F0AE' }}>Hike {econ.rateProbabilities.hikePct}%</span> ·{' '}
                                <span style={{ color: '#ffe082' }}>Hold {econ.rateProbabilities.holdPct}%</span> ·{' '}
                                <span style={{ color: '#FF8A80' }}>Cut {econ.rateProbabilities.cutPct}%</span>
                              </div>
                            ) : (
                              <span style={{ color: '#9f91c2' }}>—</span>
                            )}
                          </td>
                          <td className="ef-num">{econ.gdpQoQ.toFixed(1)}%</td>
                          <td className="ef-num">{econ.cpiYoY.toFixed(1)}% / {econ.coreCpiYoY.toFixed(1)}%</td>
                          <td className="ef-num">{econ.pmiManufacturing.toFixed(1)} / {econ.pmiServices.toFixed(1)}</td>
                          <td className="ef-num">{econ.unemploymentRate.toFixed(1)}%</td>
                          <td>
                            <span className="ef-heatmap-cell" style={scoreCellStyle(econ.economicScore)}>
                              {formatSigned(econ.economicScore, 1)}
                            </span>
                          </td>
                          {isSuperAdmin && (
                            <td>
                              <button
                                type="button"
                                className="ef-btn ef-btn-gold"
                                style={{ padding: '5px 10px', fontSize: '0.74rem' }}
                                onClick={() => setEditingEcon({ ...econ })}
                              >
                                Edit
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* G8 Country Multi-Year Historical Macro Explorer */}
                {(() => {
                  const activeEcon =
                    snapshot.economies.find((e) => e.currency === selectedHistoryCurrency) || snapshot.economies[0];
                  if (!activeEcon) return null;
                  return (
                    <section className="ef-card ef-perf-section">
                      <div className="ef-card-header">
                        <h2 className="ef-card-title">
                          {activeEcon.country} ({activeEcon.currency}) Multi-Year Sovereign Macro Trends
                        </h2>
                        <span className="ef-card-meta">12M BIS Policy Rate + 6Y World Bank WDI History</span>
                      </div>
                      <div className="ef-filter-pills" style={{ marginBottom: 12 }}>
                        {snapshot.economies.map((e) => (
                          <button
                            key={e.currency}
                            type="button"
                            className={`ef-filter-btn ${activeEcon.currency === e.currency ? 'is-active' : ''}`}
                            onClick={() => setSelectedHistoryCurrency(e.currency)}
                          >
                            {e.currency} ({e.country})
                          </button>
                        ))}
                      </div>
                      <div className="ef-pill-grid">
                        <div className="ef-pillar-card">
                          <div className="ef-pillar-top">
                            <span style={{ fontWeight: 700, color: '#DFC46B', fontSize: '0.82rem' }}>12M Central Bank Policy Rate</span>
                            <span className="ef-num">{activeEcon.rate.toFixed(2)}%</span>
                          </div>
                          <CountryHistoryTrendSvg
                            points={(activeEcon.history?.rates || []).map((r) => ({ label: r.date, value: r.value }))}
                            color="#DFC46B"
                            ariaLabel={`${activeEcon.country} 12-month policy rate trajectory`}
                          />
                        </div>
                        <div className="ef-pillar-card">
                          <div className="ef-pillar-top">
                            <span style={{ fontWeight: 700, color: '#69F0AE', fontSize: '0.82rem' }}>Multi-Year Real GDP Growth</span>
                            <span className="ef-num">{activeEcon.gdpQoQ.toFixed(1)}%</span>
                          </div>
                          <CountryHistoryTrendSvg
                            points={(activeEcon.history?.gdp || []).map((g) => ({ label: g.year, value: g.value }))}
                            color="#00E676"
                            ariaLabel={`${activeEcon.country} multi-year GDP growth`}
                          />
                        </div>
                        <div className="ef-pillar-card">
                          <div className="ef-pillar-top">
                            <span style={{ fontWeight: 700, color: '#38bdf8', fontSize: '0.82rem' }}>Multi-Year Headline CPI YoY</span>
                            <span className="ef-num">{activeEcon.cpiYoY.toFixed(1)}%</span>
                          </div>
                          <CountryHistoryTrendSvg
                            points={(activeEcon.history?.cpi || []).map((c) => ({ label: c.year, value: c.value }))}
                            color="#38bdf8"
                            ariaLabel={`${activeEcon.country} multi-year CPI inflation`}
                          />
                        </div>
                        <div className="ef-pillar-card">
                          <div className="ef-pillar-top">
                            <span style={{ fontWeight: 700, color: '#ffb74d', fontSize: '0.82rem' }}>Multi-Year Unemployment Rate</span>
                            <span className="ef-num">{activeEcon.unemploymentRate.toFixed(1)}%</span>
                          </div>
                          <CountryHistoryTrendSvg
                            points={(activeEcon.history?.unemployment || []).map((u) => ({ label: u.year, value: u.value }))}
                            color="#ffb74d"
                            ariaLabel={`${activeEcon.country} multi-year unemployment rate`}
                          />
                        </div>
                      </div>
                    </section>
                  );
                })()}

                {/* Live High-Impact Economic Calendar */}
                <section className="ef-card ef-perf-section">
                  <div className="ef-card-header">
                    <h2 className="ef-card-title">Live High-Impact Macro Calendar (NewsEngine Sync)</h2>
                    <span className="ef-card-meta">
                      {snapshot.calendar.upcomingHighImpact.length} upcoming high-impact releases ({snapshot.calendar.allEventsCount} total tracked)
                    </span>
                  </div>
                  {snapshot.calendar.upcomingHighImpact.length === 0 ? (
                    <p style={{ color: '#a99bc9', fontSize: '0.84rem', margin: 0 }}>
                      No imminent high-impact releases in the active lookahead window.
                    </p>
                  ) : (
                    <div className="ef-pill-grid">
                      {snapshot.calendar.upcomingHighImpact.map((evt) => (
                        <div key={evt.id} className="ef-pillar-card">
                          <div className="ef-pillar-top">
                            <span className="ef-kz-pill ef-kz-conflict">{evt.currency} · HIGH IMPACT</span>
                            <span className="ef-card-meta">{new Date(evt.eventTime).toLocaleString()}</span>
                          </div>
                          <div style={{ fontWeight: 700, color: '#ffffff', fontSize: '0.88rem' }}>{evt.title}</div>
                          <div style={{ display: 'flex', gap: 12, fontSize: '0.75rem', color: '#cfc5e8' }} className="ef-num">
                            <span>Prev: {evt.previous || '—'}</span>
                            <span>Fcst: {evt.forecast || '—'}</span>
                            <span>Act: {evt.actual || 'Pending'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}
          </>
        )}
      </div>

      {/* Super Admin Macro Editor Modal */}
      {editingEcon && isSuperAdmin && (
        <div className="ef-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="ef-macro-edit-title">
          <form className="ef-modal" onSubmit={handleSaveMacro}>
            <div className="ef-card-header">
              <h2 id="ef-macro-edit-title" className="ef-card-title">
                Edit {editingEcon.currency} ({editingEcon.country}) Macro Matrix
              </h2>
              <button type="button" className="ef-btn" onClick={() => setEditingEcon(null)}>✕</button>
            </div>
            <div className="ef-form-grid">
              <label className="ef-input-group">
                <span>Policy Rate (%)</span>
                <input
                  type="number"
                  step="0.05"
                  className="ef-input"
                  value={editingEcon.rate}
                  onChange={(e) => setEditingEcon({ ...editingEcon, rate: Number(e.target.value) })}
                />
              </label>
              <label className="ef-input-group">
                <span>Central Bank Stance</span>
                <select
                  className="ef-input"
                  value={editingEcon.stance}
                  onChange={(e) => setEditingEcon({ ...editingEcon, stance: e.target.value as MacroEconomyData['stance'] })}
                >
                  <option value="Hawkish">Hawkish</option>
                  <option value="Neutral">Neutral</option>
                  <option value="Dovish">Dovish</option>
                </select>
              </label>
              <label className="ef-input-group">
                <span>Rate Expectation</span>
                <select
                  className="ef-input"
                  value={editingEcon.rateExpectation}
                  onChange={(e) => setEditingEcon({ ...editingEcon, rateExpectation: e.target.value as MacroEconomyData['rateExpectation'] })}
                >
                  <option value="Hike">Hike</option>
                  <option value="Hold">Hold</option>
                  <option value="Cut">Cut</option>
                </select>
              </label>
              <label className="ef-input-group">
                <span>Next Meeting</span>
                <input
                  type="text"
                  className="ef-input"
                  value={editingEcon.nextMeeting}
                  onChange={(e) => setEditingEcon({ ...editingEcon, nextMeeting: e.target.value })}
                />
              </label>
              <label className="ef-input-group">
                <span>GDP QoQ (%)</span>
                <input
                  type="number"
                  step="0.1"
                  className="ef-input"
                  value={editingEcon.gdpQoQ}
                  onChange={(e) => setEditingEcon({ ...editingEcon, gdpQoQ: Number(e.target.value) })}
                />
              </label>
              <label className="ef-input-group">
                <span>Core CPI YoY (%)</span>
                <input
                  type="number"
                  step="0.1"
                  className="ef-input"
                  value={editingEcon.coreCpiYoY}
                  onChange={(e) => setEditingEcon({ ...editingEcon, coreCpiYoY: Number(e.target.value) })}
                />
              </label>
              <label className="ef-input-group">
                <span>Unemployment (%)</span>
                <input
                  type="number"
                  step="0.1"
                  className="ef-input"
                  value={editingEcon.unemploymentRate}
                  onChange={(e) => setEditingEcon({ ...editingEcon, unemploymentRate: Number(e.target.value) })}
                />
              </label>
              <label className="ef-input-group">
                <span>PMI Services</span>
                <input
                  type="number"
                  step="0.1"
                  className="ef-input"
                  value={editingEcon.pmiServices}
                  onChange={(e) => setEditingEcon({ ...editingEcon, pmiServices: Number(e.target.value) })}
                />
              </label>
            </div>
            <label className="ef-input-group" style={{ marginTop: 12 }}>
              <span>Desk Policy Notes</span>
              <input
                type="text"
                className="ef-input"
                value={editingEcon.notes}
                onChange={(e) => setEditingEcon({ ...editingEcon, notes: e.target.value })}
              />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button type="button" className="ef-btn" onClick={() => setEditingEcon(null)}>Cancel</button>
              <button type="submit" className="ef-btn ef-btn-gold">Save &amp; Recalculate Scores</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default EdgeFinderPage;
