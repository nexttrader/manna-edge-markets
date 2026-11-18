import React, { useMemo, useState } from 'react';
import {
  type ConfluenceCategoryStats,
  type ConfluenceHeadToHeadProof,
  useConfluenceAnalyticsAccess,
  useConfluencePerformanceReport
} from '../../hooks/useEdgeFinder';
import './ConfluencePerformanceTracker.css';

interface ConfluencePerformanceTrackerProps {
  compact?: boolean;
}

function formatPValue(p: number | null): string {
  if (p === null || !Number.isFinite(p)) return '—';
  if (p < 0.0001) return '< 0.0001';
  return p.toFixed(4);
}

function verdictClass(verdict: ConfluenceCategoryStats['verdict'] | ConfluenceHeadToHeadProof['verdict']): string {
  if (verdict === 'PROVEN_POSITIVE_EDGE' || verdict === 'MATHEMATICALLY_PROVEN') return 'is-proven';
  if (verdict === 'DIRECTIONAL_POSITIVE' || verdict === 'DIRECTIONAL_OUTPERFORMANCE') return 'is-directional';
  if (verdict === 'NEGATIVE_OR_UNPROVEN' || verdict === 'NO_SIGNIFICANT_DIFFERENCE') return 'is-unproven';
  return 'is-insufficient';
}

function verdictLabel(verdict: ConfluenceCategoryStats['verdict'] | ConfluenceHeadToHeadProof['verdict']): string {
  switch (verdict) {
    case 'PROVEN_POSITIVE_EDGE':
      return 'PROVEN POSITIVE EDGE (p < 0.05)';
    case 'MATHEMATICALLY_PROVEN':
      return 'MATHEMATICALLY PROVEN (p < 0.05)';
    case 'DIRECTIONAL_POSITIVE':
      return 'DIRECTIONAL POSITIVE EDGE';
    case 'DIRECTIONAL_OUTPERFORMANCE':
      return 'DIRECTIONAL OUTPERFORMANCE';
    case 'NEGATIVE_OR_UNPROVEN':
      return 'NO POSITIVE EDGE IN WINDOW';
    case 'NO_SIGNIFICANT_DIFFERENCE':
      return 'NO SIGNIFICANT ADVANTAGE';
    default:
      return 'BUILDING SAMPLE (n < 5)';
  }
}

function badgeIcon(categoryKey: string): string {
  if (categoryKey === 'STRONG_CONFLUENCE' || categoryKey === 'EDGEFINDER_AGREES' || categoryKey === 'AGREES_FULL_OR_PART') {
    return '✓';
  }
  if (categoryKey === 'PARTIAL_CONFLUENCE') return '◐';
  if (categoryKey === 'COUNTER_MACRO_BIAS') return '!';
  return '≈';
}

export const ConfluencePerformanceTracker: React.FC<ConfluencePerformanceTrackerProps> = ({ compact = false }) => {
  const {
    canAccessConfluenceAnalytics,
    isSuperAdmin,
    rollout,
    updatingRollout,
    updateRollout
  } = useConfluenceAnalyticsAccess();

  const [period, setPeriod] = useState<string>('november_2026');
  const [style, setStyle] = useState<string>('all');
  const [market, setMarket] = useState<string>('all');
  const [strategyId, setStrategyId] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showFormulas, setShowFormulas] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const {
    report,
    loading,
    backfilling,
    error,
    refresh,
    runBackfill,
    csvExportUrl
  } = useConfluencePerformanceReport(canAccessConfluenceAnalytics, {
    period,
    style,
    market,
    strategyId
  });

  const handleRolloutToggle = async (target: 'visibleToAdmins' | 'visibleToTraders') => {
    try {
      const next = await updateRollout({ [target]: !rollout[target] });
      const who = target === 'visibleToAdmins' ? 'Admins' : 'All Clients';
      setStatusBanner(`Confluence Performance Lab switched ${next[target] ? 'ON' : 'OFF'} for ${who}.`);
      window.setTimeout(() => setStatusBanner(null), 4000);
    } catch (err: any) {
      setStatusBanner(err?.message || 'Failed to update visibility');
    }
  };

  const handleBackfill = async (forceRecompute = false) => {
    const res = await runBackfill(forceRecompute);
    if (res) {
      setStatusBanner(
        `Historical point-in-time reconstruction complete: ${res.reconstructed} reconstructed, ${res.skippedExisting} preserved (${res.processed} total signals in window).`
      );
      window.setTimeout(() => setStatusBanner(null), 5000);
    }
  };

  const filteredSignals = useMemo(() => {
    if (!report?.signals) return [];
    const q = searchQuery.trim().toUpperCase();
    return report.signals.filter((row) => {
      if (selectedCategory === 'AGREES_FULL_OR_PART') {
        if (!row.agreesWithEdgeFinder) return false;
      } else if (selectedCategory !== 'ALL' && row.categoryKey !== selectedCategory) {
        return false;
      }
      if (outcomeFilter === 'WIN' && !row.isWin) return false;
      if (outcomeFilter === 'LOSS' && !row.isLoss) return false;
      if (outcomeFilter === 'BE' && !row.isBreakeven) return false;
      if (outcomeFilter === 'PENDING' && row.isResolved) return false;
      if (q && !row.instrument.toUpperCase().includes(q) && !row.resolvedInstrument.toUpperCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [report?.signals, selectedCategory, outcomeFilter, searchQuery]);

  // SVG Equity Curve scaling across 4 key series
  const equitySeries = useMemo(() => {
    if (!report) return [];
    const agrees = report.pooledGroups.agreesFullOrPart;
    const strong = report.categories.find((c) => c.categoryKey === 'STRONG_CONFLUENCE');
    const counter = report.categories.find((c) => c.categoryKey === 'COUNTER_MACRO_BIAS');
    const neutral = report.categories.find((c) => c.categoryKey === 'EDGEFINDER_NEUTRAL');
    return [
      { key: 'AGREES', label: 'Agrees (Full or Part)', color: '#69f0ae', curve: agrees.equityCurve },
      { key: 'STRONG', label: 'Strong (3/3 TF)', color: '#00e5ff', curve: strong?.equityCurve || [] },
      { key: 'NEUTRAL', label: 'Neutral', color: '#b39ddb', curve: neutral?.equityCurve || [] },
      { key: 'COUNTER', label: 'Counter Macro Bias', color: '#ffab40', curve: counter?.equityCurve || [] }
    ];
  }, [report]);

  if (!canAccessConfluenceAnalytics) {
    return null;
  }

  const agreesStats = report?.pooledGroups.agreesFullOrPart;
  const allStats = report?.pooledGroups.allSignals;
  const strongStats = report?.categories.find((c) => c.categoryKey === 'STRONG_CONFLUENCE');
  const counterStats = report?.categories.find((c) => c.categoryKey === 'COUNTER_MACRO_BIAS');

  return (
    <div className="cpt-root">
      {/* Super Admin Rollout Governance Bar */}
      {isSuperAdmin && (
        <section className="cpt-gov-bar" aria-label="Confluence Tracker Visibility Governance">
          <div>
            <div className="cpt-gov-title">
              <span>👑 Signal Confluence Lab — Super Admin Access Control</span>
              <span className="cpt-pill-always">SUPER ADMIN: ALWAYS ON</span>
            </div>
            <div className="cpt-gov-sub">
              Turn Signal Card Confluence Performance &amp; Historical Proof tracking ON or OFF independently for Admins and Clients.
            </div>
          </div>
          <div className="cpt-gov-actions">
            <button
              type="button"
              disabled={updatingRollout}
              onClick={() => handleRolloutToggle('visibleToAdmins')}
              className={`cpt-toggle-btn ${rollout.visibleToAdmins ? 'is-on-green' : 'is-off'}`}
            >
              {rollout.visibleToAdmins ? '👁️ Admins: ON' : '🔒 Turn ON for Admins'}
            </button>
            <button
              type="button"
              disabled={updatingRollout}
              onClick={() => handleRolloutToggle('visibleToTraders')}
              className={`cpt-toggle-btn ${rollout.visibleToTraders ? 'is-on-cyan' : 'is-off'}`}
            >
              {rollout.visibleToTraders ? '🌐 Clients: ON' : '🔒 Turn ON for Clients'}
            </button>
          </div>
        </section>
      )}

      {statusBanner && (
        <div
          role="status"
          style={{
            padding: '10px 14px',
            borderRadius: '9px',
            background: 'rgba(0, 230, 118, 0.14)',
            border: '1px solid rgba(0, 230, 118, 0.45)',
            color: '#69f0ae',
            fontSize: '0.78rem',
            fontWeight: 700
          }}
        >
          ✓ {statusBanner}
        </div>
      )}

      {/* Header + Filters */}
      <section className="cpt-card">
        <div className="cpt-header-row">
          <div>
            <h2 className="cpt-title">
              🧭 EdgeFinder Signal Card Confluence Performance &amp; Mathematical Proof Lab
            </h2>
            <p className="cpt-subtitle">
              Tracks every signal card showing <strong>STRONG CONFLUENCE (3/3 TF)</strong>, <strong>EDGEFINDER AGREES</strong>,{' '}
              <strong>PARTIAL CONFLUENCE</strong>, <strong>EDGEFINDER NEUTRAL</strong>, or <strong>COUNTER MACRO BIAS</strong> — comparing
              when technicals agree fully or in part with EdgeFinder vs opposing signals using canonical 80/20 R accounting.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="cpt-action-btn"
              onClick={() => void refresh()}
              disabled={loading}
            >
              {loading ? '⟳ Syncing...' : '⟳ Refresh'}
            </button>
            <button
              type="button"
              className="cpt-action-btn"
              onClick={() => void handleBackfill(false)}
              disabled={backfilling}
              title="Reconstruct point-in-time EdgeFinder confluence for any unclassified signals in the selected period using strictly causal candles & CFTC COT"
            >
              {backfilling ? '⏳ Reconstructing...' : '🧬 Reconstruct Historical Signals'}
            </button>
            <a href={csvExportUrl} target="_blank" rel="noreferrer" className="cpt-action-btn">
              ⬇ Export CSV
            </a>
          </div>
        </div>

        <div className="cpt-filters-bar">
          <div className="cpt-filter-group">
            <span className="cpt-filter-label">Window:</span>
            <select
              aria-label="Analysis Window"
              className="cpt-select"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              <option value="november_2026">November 2026 (Historical Audit)</option>
              <option value="all">All Time</option>
              <option value="30d">Last 30 Days</option>
              <option value="7d">Last 7 Days</option>
              <option value="2026-10">October 2026</option>
            </select>
          </div>

          <div className="cpt-filter-group">
            <span className="cpt-filter-label">Style:</span>
            <select
              aria-label="Trading Style Filter"
              className="cpt-select"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
            >
              <option value="all">All Styles (Intraday + Scalp + Swing)</option>
              <option value="INTRADAY">Intraday (1H / 15M)</option>
              <option value="SCALP">Scalping (15M / 5M)</option>
              <option value="SWING">Swing (D1 / 4H)</option>
            </select>
          </div>

          <div className="cpt-filter-group">
            <span className="cpt-filter-label">Market:</span>
            <select
              aria-label="Market Filter"
              className="cpt-select"
              value={market}
              onChange={(e) => setMarket(e.target.value)}
            >
              <option value="all">Futures + Forex</option>
              <option value="futures">Futures Only</option>
              <option value="forex">Forex Only</option>
            </select>
          </div>

          <div className="cpt-filter-group">
            <span className="cpt-filter-label">Strategy:</span>
            <select
              aria-label="Strategy Filter"
              className="cpt-select"
              value={strategyId}
              onChange={(e) => setStrategyId(e.target.value)}
            >
              <option value="all">All Strategies</option>
              <option value="sentinel_v2">Sentinel V2</option>
              <option value="manna_snd">Manna SND</option>
            </select>
          </div>
        </div>

        {report && (
          <div className="cpt-provenance-strip">
            <span className="cpt-chip">
              📋 Tracked Signals: <strong>{report.provenanceSummary.totalTrackedSignals}</strong>
            </span>
            <span className="cpt-chip is-live">
              ● Live-Captured Snapshots: <strong>{report.provenanceSummary.liveCapturedCount}</strong>
            </span>
            <span className="cpt-chip is-hist">
              🕰️ Point-in-Time Reconstructed: <strong>{report.provenanceSummary.historicalReconstructedCount}</strong>
            </span>
            {report.provenanceSummary.unclassifiedCount > 0 && (
              <span className="cpt-chip">
                Unclassified (non-EdgeFinder symbol): <strong>{report.provenanceSummary.unclassifiedCount}</strong>
              </span>
            )}
          </div>
        )}
      </section>

      {error && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            borderRadius: '10px',
            background: 'rgba(255, 82, 82, 0.14)',
            border: '1px solid rgba(255, 82, 82, 0.45)',
            color: '#ff8a80',
            fontSize: '0.8rem'
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {loading && !report ? (
        <div className="cpt-card" style={{ textAlign: 'center', padding: '36px' }}>
          <div style={{ color: '#dfc46b', fontWeight: 800, fontSize: '0.96rem' }}>
            Running Point-in-Time Historical Confluence Audit &amp; Statistical Proofs...
          </div>
          <div style={{ color: '#a99bc9', fontSize: '0.76rem', marginTop: '6px' }}>
            Evaluating signal card classifications against realized 80/20 R outcomes.
          </div>
        </div>
      ) : report && agreesStats && allStats && strongStats && counterStats && (
        <>
          {/* Executive Agreement vs Counter Hero */}
          <section className="cpt-hero-grid" aria-label="Technical and EdgeFinder Agreement Summary">
            <div className="cpt-hero-box is-highlight">
              <div className="cpt-hero-label">Technical Agrees (Full or Part)</div>
              <div className="cpt-hero-main">
                <span className="cpt-hero-val pos">{agreesStats.winRatePct}% WR</span>
                <span className={`cpt-hero-val ${agreesStats.totalRealizedR >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: '1.15rem' }}>
                  {agreesStats.totalRealizedR >= 0 ? '+' : ''}{agreesStats.totalRealizedR}R
                </span>
              </div>
              <div className="cpt-hero-meta">
                <span>95% Wilson CI: [{agreesStats.wilson95CiLowPct}%, {agreesStats.wilson95CiHighPct}%]</span>
                <span>Expectancy: <strong>{agreesStats.expectancyR >= 0 ? '+' : ''}{agreesStats.expectancyR}R</strong>/trade · PF {agreesStats.profitFactor}</span>
                <span>Trades: {agreesStats.resolvedTrades} resolved / {agreesStats.totalSignals} signals ({agreesStats.wins}W-{agreesStats.losses}L-{agreesStats.breakevens}BE)</span>
                <span>Edge vs Break-Even ({agreesStats.breakEvenWinRatePct}%): <strong style={{ color: agreesStats.edgeOverBreakEvenPct >= 0 ? '#69f0ae' : '#ff8a80' }}>{agreesStats.edgeOverBreakEvenPct >= 0 ? '+' : ''}{agreesStats.edgeOverBreakEvenPct}%</strong></span>
              </div>
            </div>

            <div className="cpt-hero-box is-strong">
              <div className="cpt-hero-label">Strong Confluence (3/3 TF)</div>
              <div className="cpt-hero-main">
                <span className="cpt-hero-val pos">{strongStats.winRatePct}% WR</span>
                <span className={`cpt-hero-val ${strongStats.totalRealizedR >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: '1.15rem' }}>
                  {strongStats.totalRealizedR >= 0 ? '+' : ''}{strongStats.totalRealizedR}R
                </span>
              </div>
              <div className="cpt-hero-meta">
                <span>95% Wilson CI: [{strongStats.wilson95CiLowPct}%, {strongStats.wilson95CiHighPct}%]</span>
                <span>Expectancy: <strong>{strongStats.expectancyR >= 0 ? '+' : ''}{strongStats.expectancyR}R</strong>/trade · PF {strongStats.profitFactor}</span>
                <span>Trades: {strongStats.resolvedTrades} resolved / {strongStats.totalSignals} signals ({strongStats.wins}W-{strongStats.losses}L-{strongStats.breakevens}BE)</span>
                <span>One-sample p (E[R]&gt;0): <strong>{formatPValue(strongStats.oneSamplePValueOneSided)}</strong></span>
              </div>
            </div>

            <div className="cpt-hero-box is-counter">
              <div className="cpt-hero-label">Counter Macro Bias</div>
              <div className="cpt-hero-main">
                <span className="cpt-hero-val warn">{counterStats.winRatePct}% WR</span>
                <span className={`cpt-hero-val ${counterStats.totalRealizedR >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: '1.15rem' }}>
                  {counterStats.totalRealizedR >= 0 ? '+' : ''}{counterStats.totalRealizedR}R
                </span>
              </div>
              <div className="cpt-hero-meta">
                <span>95% Wilson CI: [{counterStats.wilson95CiLowPct}%, {counterStats.wilson95CiHighPct}%]</span>
                <span>Expectancy: <strong>{counterStats.expectancyR >= 0 ? '+' : ''}{counterStats.expectancyR}R</strong>/trade · PF {counterStats.profitFactor}</span>
                <span>Trades: {counterStats.resolvedTrades} resolved / {counterStats.totalSignals} signals ({counterStats.wins}W-{counterStats.losses}L-{counterStats.breakevens}BE)</span>
                <span>Max Drawdown: <strong>-{counterStats.maxDrawdownR}R</strong></span>
              </div>
            </div>

            <div className="cpt-hero-box">
              <div className="cpt-hero-label">All Tracked Signal Cards</div>
              <div className="cpt-hero-main">
                <span className="cpt-hero-val">{allStats.winRatePct}% WR</span>
                <span className={`cpt-hero-val ${allStats.totalRealizedR >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: '1.15rem' }}>
                  {allStats.totalRealizedR >= 0 ? '+' : ''}{allStats.totalRealizedR}R
                </span>
              </div>
              <div className="cpt-hero-meta">
                <span>95% Wilson CI: [{allStats.wilson95CiLowPct}%, {allStats.wilson95CiHighPct}%]</span>
                <span>Expectancy: <strong>{allStats.expectancyR >= 0 ? '+' : ''}{allStats.expectancyR}R</strong>/trade · PF {allStats.profitFactor}</span>
                <span>Trades: {allStats.resolvedTrades} resolved / {allStats.totalSignals} signals (Fill {allStats.fillRatePct}%)</span>
                <span>Agrees Lift vs Baseline: <strong style={{ color: '#69f0ae' }}>{agreesStats.winRatePct - allStats.winRatePct >= 0 ? '+' : ''}{(agreesStats.winRatePct - allStats.winRatePct).toFixed(1)}% WR</strong></span>
              </div>
            </div>
          </section>

          {/* Per-Category Breakdown Cards (All 5 Signal Card Badge Categories) */}
          <section className="cpt-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
              <h3 style={{ margin: 0, color: '#dfc46b', fontSize: '0.96rem' }}>
                📊 Performance by Signal Card Confluence Category (Click a card to filter ledger)
              </h3>
              {selectedCategory !== 'ALL' && (
                <button
                  type="button"
                  className="cpt-action-btn"
                  onClick={() => setSelectedCategory('ALL')}
                >
                  Clear Category Filter ({selectedCategory})
                </button>
              )}
            </div>

            <div className="cpt-cat-grid">
              {report.categories.map((cat) => {
                const isSelected = selectedCategory === cat.categoryKey;
                return (
                  <button
                    key={cat.categoryKey}
                    type="button"
                    onClick={() => setSelectedCategory(isSelected ? 'ALL' : cat.categoryKey)}
                    className={`cpt-cat-card ${isSelected ? 'is-selected' : ''}`}
                  >
                    <div className="cpt-cat-top">
                      <span className={`cpt-ef-badge is-${cat.categoryKey.toLowerCase()}`}>
                        {badgeIcon(cat.categoryKey)} {cat.badgeText}
                      </span>
                      <span style={{ fontSize: '0.71rem', color: '#b7aad6' }}>
                        {cat.resolvedTrades}/{cat.totalSignals} resolved
                      </span>
                    </div>
                    <p className="cpt-cat-desc">{cat.description}</p>
                    <div className="cpt-kv-grid">
                      <div className="cpt-kv">
                        <span className="cpt-kv-k">Win Rate</span>
                        <span className={`cpt-kv-v ${cat.winRatePct >= cat.breakEvenWinRatePct ? 'pos' : 'neg'}`}>
                          {cat.winRatePct}%
                        </span>
                      </div>
                      <div className="cpt-kv">
                        <span className="cpt-kv-k">95% Wilson CI</span>
                        <span className="cpt-kv-v">[{cat.wilson95CiLowPct}–{cat.wilson95CiHighPct}%]</span>
                      </div>
                      <div className="cpt-kv">
                        <span className="cpt-kv-k">Total R</span>
                        <span className={`cpt-kv-v ${cat.totalRealizedR >= 0 ? 'pos' : 'neg'}`}>
                          {cat.totalRealizedR >= 0 ? '+' : ''}{cat.totalRealizedR}R
                        </span>
                      </div>
                      <div className="cpt-kv">
                        <span className="cpt-kv-k">Expectancy</span>
                        <span className={`cpt-kv-v ${cat.expectancyR >= 0 ? 'pos' : 'neg'}`}>
                          {cat.expectancyR >= 0 ? '+' : ''}{cat.expectancyR}R
                        </span>
                      </div>
                      <div className="cpt-kv">
                        <span className="cpt-kv-k">Profit Factor</span>
                        <span className="cpt-kv-v gold">{cat.profitFactor}</span>
                      </div>
                      <div className="cpt-kv">
                        <span className="cpt-kv-k">W / L / BE</span>
                        <span className="cpt-kv-v">{cat.wins} / {cat.losses} / {cat.breakevens}</span>
                      </div>
                      <div className="cpt-kv">
                        <span className="cpt-kv-k">Break-Even WR</span>
                        <span className="cpt-kv-v">{cat.breakEvenWinRatePct}%</span>
                      </div>
                      <div className="cpt-kv">
                        <span className="cpt-kv-k">Max DD / Fill%</span>
                        <span className="cpt-kv-v">-{cat.maxDrawdownR}R / {cat.fillRatePct}%</span>
                      </div>
                    </div>
                    <span className={`cpt-verdict-pill ${verdictClass(cat.verdict)}`}>
                      {verdictLabel(cat.verdict)} {cat.oneSamplePValueOneSided !== null ? `· p=${formatPValue(cat.oneSamplePValueOneSided)}` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Mathematical Provability & Hypothesis Test Matrix */}
          <section className="cpt-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h3 style={{ margin: 0, color: '#dfc46b', fontSize: '0.96rem' }}>
                  📐 Mathematically Provable Category Comparisons (Hypothesis Tests)
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.74rem', color: '#a99bc9' }}>
                  Formal statistical proofs comparing Win Rates (Two-Proportion Z &amp; Fisher&apos;s Exact Test) and Realized R Expectancy (Welch&apos;s t-Test &amp; Cohen&apos;s d).
                </p>
              </div>
              <button
                type="button"
                className="cpt-action-btn"
                onClick={() => setShowFormulas((v) => !v)}
              >
                {showFormulas ? 'Hide Formulas ▲' : 'Show Mathematical Formulas ▼'}
              </button>
            </div>

            {showFormulas && (
              <div className="cpt-formula-box">
                <div><strong>1. 80/20 Blended Realized R:</strong> TP1 = 0.80 × R₁ (+1.60R default), TP2 = 0.80 × R₁ + 0.20 × R₂ (+2.20R default), BE = 0.00R, SL = -1.00R.</div>
                <div><strong>2. Wilson Score 95% CI:</strong> (p̂ + z²/2n ± z√(p̂(1−p̂)/n + z²/4n²)) / (1 + z²/n), z = 1.96 — exact binomial bounds even for small n.</div>
                <div><strong>3. Break-Even Win Rate:</strong> p_BE = AvgLossR / (AvgWinR + AvgLossR); mathematical edge exists iff p̂ &gt; p_BE and E[R] &gt; 0.</div>
                <div><strong>4. Welch&apos;s Unequal-Variance t-Test:</strong> t = (x̄_A − x̄_B) / √(s²_A/n_A + s²_B/n_B) with Welch-Satterthwaite df and exact regularized incomplete beta p-value.</div>
                <div><strong>5. Fisher&apos;s Exact Test:</strong> Exact hypergeometric p-value on the 2×2 Win/Loss table (no large-sample normal approximation bias).</div>
              </div>
            )}

            <div className="cpt-table-wrap">
              <table className="cpt-table">
                <thead>
                  <tr>
                    <th>Comparison Pair (A vs B)</th>
                    <th>Samples (nA / nB)</th>
                    <th>Win Rate (A vs B)</th>
                    <th>Δ Win Rate</th>
                    <th>Expectancy (A vs B)</th>
                    <th>Δ E[R]</th>
                    <th>Fisher p / Welch p</th>
                    <th>Cohen&apos;s d</th>
                    <th>Mathematical Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {report.comparisons.map((cmp) => (
                    <tr key={cmp.id}>
                      <td>
                        <div style={{ fontWeight: 800, color: '#f3e8ff' }}>{cmp.title}</div>
                        <div style={{ fontSize: '0.68rem', color: '#a99bc9', marginTop: '2px' }}>{cmp.proofStatement}</div>
                      </td>
                      <td>{cmp.nA} / {cmp.nB}</td>
                      <td>{cmp.winRateAPct}% vs {cmp.winRateBPct}%</td>
                      <td style={{ fontWeight: 800, color: cmp.winRateDeltaPct >= 0 ? '#69f0ae' : '#ff8a80' }}>
                        {cmp.winRateDeltaPct >= 0 ? '+' : ''}{cmp.winRateDeltaPct}%
                      </td>
                      <td>{cmp.expectancyAR >= 0 ? '+' : ''}{cmp.expectancyAR}R vs {cmp.expectancyBR >= 0 ? '+' : ''}{cmp.expectancyBR}R</td>
                      <td style={{ fontWeight: 800, color: cmp.expectancyDeltaR >= 0 ? '#69f0ae' : '#ff8a80' }}>
                        {cmp.expectancyDeltaR >= 0 ? '+' : ''}{cmp.expectancyDeltaR}R
                      </td>
                      <td>
                        <div>Fisher: {formatPValue(cmp.fisherExactPValue)}</div>
                        <div>Welch: {formatPValue(cmp.welchPValue)}</div>
                      </td>
                      <td>{cmp.cohensD !== null ? cmp.cohensD.toFixed(2) : '—'}</td>
                      <td>
                        <span className={`cpt-verdict-pill ${verdictClass(cmp.verdict)}`} style={{ marginTop: 0 }}>
                          {verdictLabel(cmp.verdict)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Visual Equity Curve + Style Breakdown */}
          {!compact && (
            <section className="cpt-card">
              <h3 style={{ margin: '0 0 8px', color: '#dfc46b', fontSize: '0.96rem' }}>
                📈 Cumulative R Equity Curves by Confluence Category &amp; Style Breakdown
              </h3>
              <ConfluenceEquityChart series={equitySeries} />

              <div className="cpt-table-wrap" style={{ marginTop: '16px' }}>
                <table className="cpt-table">
                  <thead>
                    <tr>
                      <th>Trading Style</th>
                      <th>Agrees (Full/Part) Resolved</th>
                      <th>Agrees Win Rate</th>
                      <th>Agrees Total R (E[R])</th>
                      <th>Counter Macro Resolved</th>
                      <th>Counter Win Rate</th>
                      <th>Counter Total R (E[R])</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.styleBreakdown.map((sb) => (
                      <tr key={sb.style}>
                        <td style={{ fontWeight: 800, color: '#dfc46b' }}>{sb.style}</td>
                        <td>{sb.agreesResolved}</td>
                        <td style={{ color: '#69f0ae', fontWeight: 800 }}>{sb.agreesWinRatePct}%</td>
                        <td style={{ color: sb.agreesTotalR >= 0 ? '#69f0ae' : '#ff8a80', fontWeight: 800 }}>
                          {sb.agreesTotalR >= 0 ? '+' : ''}{sb.agreesTotalR}R ({sb.agreesExpectancyR >= 0 ? '+' : ''}{sb.agreesExpectancyR}R)
                        </td>
                        <td>{sb.counterResolved}</td>
                        <td style={{ color: '#ffd54f', fontWeight: 800 }}>{sb.counterWinRatePct}%</td>
                        <td style={{ color: sb.counterTotalR >= 0 ? '#69f0ae' : '#ff8a80', fontWeight: 800 }}>
                          {sb.counterTotalR >= 0 ? '+' : ''}{sb.counterTotalR}R ({sb.counterExpectancyR >= 0 ? '+' : ''}{sb.counterExpectancyR}R)
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Individual Signal Card Audit Ledger */}
          <section className="cpt-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
              <div>
                <h3 style={{ margin: 0, color: '#dfc46b', fontSize: '0.96rem' }}>
                  🧾 Signal Card Confluence Ledger ({filteredSignals.length} of {report.signals.length} cards)
                </h3>
                <div style={{ fontSize: '0.73rem', color: '#a99bc9', marginTop: '2px' }}>
                  Every signal card in the selected period with its EdgeFinder badge classification, 3-horizon scores, and realized R.
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter symbol (e.g. ES, EUR/USD)..."
                  className="cpt-select"
                  style={{ minWidth: '190px' }}
                />
                <select
                  aria-label="Filter by Badge Category"
                  className="cpt-select"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  <option value="ALL">All Badge Categories</option>
                  <option value="AGREES_FULL_OR_PART">✓ Technical Agrees (Full or Part)</option>
                  <option value="STRONG_CONFLUENCE">✓ STRONG CONFLUENCE (3/3 TF)</option>
                  <option value="EDGEFINDER_AGREES">✓ EDGEFINDER AGREES</option>
                  <option value="PARTIAL_CONFLUENCE">◐ PARTIAL CONFLUENCE</option>
                  <option value="EDGEFINDER_NEUTRAL">≈ EDGEFINDER NEUTRAL</option>
                  <option value="COUNTER_MACRO_BIAS">! COUNTER MACRO BIAS</option>
                </select>
                <select
                  aria-label="Filter by Outcome"
                  className="cpt-select"
                  value={outcomeFilter}
                  onChange={(e) => setOutcomeFilter(e.target.value)}
                >
                  <option value="ALL">All Outcomes</option>
                  <option value="WIN">Wins Only</option>
                  <option value="LOSS">Losses Only</option>
                  <option value="BE">Breakeven Only</option>
                  <option value="PENDING">Pending / Invalidated</option>
                </select>
              </div>
            </div>

            {filteredSignals.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#a99bc9', fontSize: '0.8rem' }}>
                No tracked signal cards match the selected filters in this window.
              </div>
            ) : (
              <div className="cpt-table-wrap">
                <table className="cpt-table">
                  <thead>
                    <tr>
                      <th>Created (UTC)</th>
                      <th>Instrument</th>
                      <th>Style / Strat</th>
                      <th>Bias</th>
                      <th>Signal Card Badge</th>
                      <th>Horizons (S / I / Sw)</th>
                      <th>Outcome / State</th>
                      <th>Realized R</th>
                      <th>Provenance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSignals.slice(0, compact ? 40 : 250).map((row) => (
                      <tr key={row.setupId}>
                        <td style={{ whiteSpace: 'nowrap', color: '#b7aad6' }}>
                          {row.createdAt.slice(0, 16).replace('T', ' ')}
                        </td>
                        <td style={{ fontWeight: 800, color: '#ffffff' }}>
                          {row.instrument}
                          <span style={{ display: 'block', fontSize: '0.66rem', color: '#9e91bf', fontWeight: 400 }}>
                            {row.market.toUpperCase()} · {row.killzoneOrigin}
                          </span>
                        </td>
                        <td>
                          <span>{row.tradingStyle}</span>
                          <span style={{ display: 'block', fontSize: '0.66rem', color: '#9e91bf' }}>{row.strategyId}</span>
                        </td>
                        <td style={{ fontWeight: 800, color: row.bias === 'long' ? '#69f0ae' : '#ff8a80' }}>
                          {row.bias.toUpperCase()}
                        </td>
                        <td>
                          <span className={`cpt-ef-badge is-${row.categoryKey.toLowerCase()}`}>
                            {badgeIcon(row.categoryKey)} {row.badgeText}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.71rem', color: '#d1c4e9' }}>
                          {row.scalpScore.toFixed(1)} / {row.intradayScore.toFixed(1)} / {row.swingScore.toFixed(1)}
                        </td>
                        <td>
                          <span style={{
                            fontWeight: 800,
                            color: row.isWin ? '#69f0ae' : row.isLoss ? '#ff8a80' : '#d1c4e9'
                          }}>
                            {(row.outcomeType || row.signalState).toUpperCase()}
                          </span>
                        </td>
                        <td style={{
                          fontWeight: 800,
                          color: row.realizedR === null ? '#9e91bf' : row.realizedR > 0 ? '#69f0ae' : row.realizedR < 0 ? '#ff8a80' : '#ffd54f'
                        }}>
                          {row.realizedR === null ? '—' : `${row.realizedR >= 0 ? '+' : ''}${row.realizedR.toFixed(2)}R`}
                        </td>
                        <td>
                          <span className={`cpt-chip ${row.provenance === 'LIVE_CAPTURED' ? 'is-live' : 'is-hist'}`}>
                            {row.provenance === 'LIVE_CAPTURED' ? '● LIVE' : '🕰️ HIST'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

interface EquitySeriesItem {
  key: string;
  label: string;
  color: string;
  curve: Array<{ index: number; date: string; instrument: string; rVal: number; cumulativeR: number }>;
}

const ConfluenceEquityChart: React.FC<{ series: EquitySeriesItem[] }> = ({ series }) => {
  const nonEmpty = series.filter((s) => s.curve.length > 0);
  if (nonEmpty.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#a99bc9', fontSize: '0.78rem' }}>
        Cumulative R curve will render once resolved trades exist in the selected window.
      </div>
    );
  }

  const width = 760;
  const height = 210;
  const padL = 44;
  const padR = 16;
  const padT = 14;
  const padB = 24;
  const maxLen = Math.max(...nonEmpty.map((s) => s.curve.length), 1);
  const allVals = [0, ...nonEmpty.flatMap((s) => s.curve.map((pt) => pt.cumulativeR))];
  const minY = Math.min(...allVals);
  const maxY = Math.max(...allVals);
  const rangeY = Math.max(maxY - minY, 1);

  const toX = (idx: number) => padL + (idx / Math.max(maxLen, 1)) * (width - padL - padR);
  const toY = (val: number) => padT + ((maxY - val) / rangeY) * (height - padT - padB);
  const zeroY = toY(0);

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="cpt-chart-svg" role="img" aria-label="Cumulative R Equity Curves by Confluence Category">
        <line x1={padL} y1={zeroY} x2={width - padR} y2={zeroY} stroke="rgba(255,255,255,0.22)" strokeDasharray="4 4" />
        <text x={4} y={padT + 10} fill="#a99bc9" fontSize="10">{maxY.toFixed(1)}R</text>
        <text x={4} y={zeroY + 3} fill="#dfc46b" fontSize="10">0.0R</text>
        <text x={4} y={height - padB} fill="#a99bc9" fontSize="10">{minY.toFixed(1)}R</text>

        {nonEmpty.map((s) => {
          const pts = [{ index: 0, cumulativeR: 0 }, ...s.curve];
          const pathD = pts
            .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${toX(pt.index).toFixed(1)} ${toY(pt.cumulativeR).toFixed(1)}`)
            .join(' ');
          return (
            <path
              key={s.key}
              d={pathD}
              fill="none"
              stroke={s.color}
              strokeWidth={s.key === 'AGREES' ? 2.8 : 2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
      </svg>
      <div className="cpt-legend">
        {nonEmpty.map((s) => {
          const lastR = s.curve[s.curve.length - 1]?.cumulativeR ?? 0;
          return (
            <span key={s.key} className="cpt-legend-item">
              <span className="cpt-legend-dot" style={{ background: s.color }} />
              <span>{s.label}:</span>
              <strong style={{ color: s.color }}>{lastR >= 0 ? '+' : ''}{lastR}R ({s.curve.length} trades)</strong>
            </span>
          );
        })}
      </div>
    </div>
  );
};
