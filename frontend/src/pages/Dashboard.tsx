import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import './Dashboard.css';
import { DashboardHeader } from '../components/DashboardHeader';
import { SetupCard } from '../components/SetupCard';
import { useSetups } from '../hooks/useSetups';
import { useWatchlist } from '../hooks/useWatchlist';
import { NewsWarningBanner } from '../components/NewsWarningBanner';
import { EarlyScanNewsBanner } from '../components/EarlyScanNewsBanner';
import { MarketClosedBanner } from '../components/MarketClosedBanner';
import { TrialWelcomeBanner } from '../components/TrialWelcomeBanner';
import { FaqModal } from '../components/FaqModal';
import { AssetDecisionMatrix } from '../components/AssetDecisionMatrix';
import { PositionCalculatorModal } from '../components/PositionCalculatorModal';
import { RunnersPanel } from '../components/RunnersPanel';
import type { EdgeSetup } from '../types';

type MarketFilter = 'all' | 'futures' | 'forex' | 'watchlist';
type StateFilter = 'all' | 'active' | 'awaiting_entry' | 'in_zone' | 'runner' | 'resolved' | 'invalidated';
type BiasFilter = 'all' | 'long' | 'short';
type OrderTypeFilter = 'all' | 'market' | 'limit';
type StrategyFilter = 'all' | 'sentinel_v2' | 'manna_snd';
type SortOption = 'conviction' | 'newest' | 'live_rr' | 'closest_entry';

import { useAuth } from '../context/AuthContext';
import { useMaintenance } from '../context/MaintenanceContext';
import { ClientMaintenanceBanner } from '../components/ClientMaintenanceBanner';
import { MockMaintenanceSignalCard } from '../components/MockMaintenanceSignalCard';
import { SessionScanCountdown } from '../components/SessionScanCountdown';
import { ResearchBanner } from '../components/ResearchBanner';
import { useTaggedSignals } from '../hooks/useTaggedSignals';
import { useEdgeFinderAccess } from '../hooks/useEdgeFinder';
import {
  type DashboardStyleTab,
  type SwingPairMode,
  useMtfStyleSetups
} from '../hooks/useMtfSignals';
// ── localStorage helpers ──────────────────────────────────────────────────────
const LS_KEY = 'manna_dashboard_filters';

function loadFilters() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveFilters(filters: object) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(filters)); } catch { /* ignore */ }
}

export const Dashboard: React.FC = () => {
  const { user, originalAdmin, isImpersonating } = useAuth();
  const { maintenance } = useMaintenance();
  const isClientView = user?.role !== 'admin' && user?.role !== 'super_admin';
  const showMaintenanceLock = maintenance.enabled && isClientView;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const isSuperAdmin = (user?.role === 'super_admin' || originalAdmin?.role === 'super_admin') && !isImpersonating;

  const { setups, runnerSetups, loading, refetch } = useSetups();
  const { watchlistIds, toggleWatchlist, isWatchlisted } = useWatchlist();
  const { isTagged, toggleTag } = useTaggedSignals();
  const { canAccessEdgeFinder } = useEdgeFinderAccess();

  const [styleTab, setStyleTab] = useState<DashboardStyleTab>('intraday');
  const [swingMode, setSwingMode] = useState<SwingPairMode>('d1_h4');
  const mtfDesk = useMtfStyleSetups(styleTab, swingMode);


  // ── Load persisted filter preferences from localStorage ──────────────────
  const saved = loadFilters();
  const [marketFilter, setMarketFilter] = useState<MarketFilter>(saved?.marketFilter ?? 'all');
  const [stateFilter, setStateFilter] = useState<StateFilter>(saved?.stateFilter ?? 'all');
  const [biasFilter, setBiasFilter] = useState<BiasFilter>(saved?.biasFilter ?? 'all');
  const [orderTypeFilter, setOrderTypeFilter] = useState<OrderTypeFilter>(saved?.orderTypeFilter ?? 'all');
  const [strategyFilter, setStrategyFilter] = useState<StrategyFilter>(saved?.strategyFilter ?? 'all');
  const [sortBy, setSortBy] = useState<SortOption>(saved?.sortBy ?? 'conviction');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [showFaq, setShowFaq] = useState(false);
  const [calcSetup, setCalcSetup] = useState<EdgeSetup | null>(null);

  // ── Persist filter changes to localStorage ───────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateFilter = (setter: React.Dispatch<React.SetStateAction<any>>, key: string, value: unknown) => {
    setter(value as any);
    const current = loadFilters() || {};
    saveFilters({ ...current, [key]: value });
  };

  const safeSetups = Array.isArray(setups) ? setups : [];
  const safeRunners = Array.isArray(runnerSetups) ? runnerSetups : [];
  const safeMtfSetups = Array.isArray(mtfDesk.setups) ? mtfDesk.setups : [];
  const safeMtfRunners = Array.isArray(mtfDesk.runnerSetups) ? mtfDesk.runnerSetups : [];
  const safeMtfPast = Array.isArray(mtfDesk.pastSetups) ? mtfDesk.pastSetups : [];

  const activeRunnerSetups = styleTab === 'intraday' ? safeRunners : safeMtfRunners;
  const baseDeskSetups =
    styleTab === 'intraday'
      ? (stateFilter === 'runner'
          ? [...safeSetups, ...safeRunners.filter(r => !safeSetups.some(s => s.id === r.id))]
          : safeSetups)
      : (stateFilter === 'runner'
          ? [...safeMtfSetups, ...safeMtfRunners.filter(r => !safeMtfSetups.some(s => s.id === r.id))]
          : (stateFilter === 'resolved' || stateFilter === 'invalidated')
            ? safeMtfPast
            : safeMtfSetups);
  const activeLoading = styleTab === 'intraday' ? loading : mtfDesk.loading;
  const allAvailableSetups = baseDeskSetups;
  const safeWatchlist = Array.isArray(watchlistIds) ? watchlistIds : [];

  // Filter Logic
  const filteredSetups = allAvailableSetups.filter(setup => {
    if (!setup) return false;
    const market = (setup.market || 'futures').toLowerCase();
    const stateStr = (setup.signal_state || setup.state || 'awaiting_entry').toLowerCase();
    const biasStr = (setup.bias || 'long').toLowerCase();
    const stratId = (setup.strategy_id || 'sentinel_v2').toLowerCase();
    const currentPrice = setup.current_price;
    const entryLow = setup.entry_zone_low ?? setup.levels?.entryMin ?? 0;
    const entryHigh = setup.entry_zone_high ?? setup.levels?.entryMax ?? 0;
    const isInZone = Boolean(currentPrice && currentPrice >= entryLow && currentPrice <= entryHigh);

    // 1. Market / Watchlist Filter
    if (marketFilter === 'watchlist') {
      if (!safeWatchlist.includes(setup.id)) return false;
    } else if (marketFilter !== 'all' && market !== marketFilter) {
      return false;
    }

    // 2. State Filter
    if (stateFilter === 'in_zone') {
      if (!isInZone || (stateStr !== 'active' && stateStr !== 'awaiting_entry')) return false;
    } else if (stateFilter === 'invalidated') {
      if (stateStr !== 'invalidated' && stateStr !== 'superseded') return false;
    } else if (stateFilter !== 'all' && stateStr !== stateFilter) {
      return false;
    }

    // 3. Bias Filter
    if (biasFilter !== 'all' && biasStr !== biasFilter) return false;

    // 4. Order Type Filter
    const isLimit = setup.order_type === 'limit' || Boolean(setup.entry_zone_low && setup.entry_zone_high);
    const orderTypeStr = isLimit ? 'limit' : 'market';
    if (orderTypeFilter !== 'all' && orderTypeStr !== orderTypeFilter) return false;

    // 5. Strategy Tier Filter (applies to Intraday production models)
    if (styleTab === 'intraday' && strategyFilter !== 'all') {
      if (strategyFilter === 'sentinel_v2') {
        const isEliteSetup = stratId === 'sentinel_v2' || stratId === 'manna_elite' || stratId === 'manna_elite_v1_2' || stratId === 'manna_basic';
        if (!isEliteSetup) return false;
      } else if (strategyFilter === 'manna_snd') {
        if (stratId !== 'manna_snd') return false;
      }
    }

    return true;
  });

  // Sorting Logic
  const sortedSetups = [...filteredSetups].sort((a, b) => {
    if (sortBy === 'conviction') {
      return (b.conviction_score || b.conviction || 0) - (a.conviction_score || a.conviction || 0);
    }
    if (sortBy === 'newest') {
      return new Date(b.created_at || b.createdAt || 0).getTime() - new Date(a.created_at || a.createdAt || 0).getTime();
    }
    if (sortBy === 'live_rr') {
      return (b.unrealizedR || 0) - (a.unrealizedR || 0);
    }
    if (sortBy === 'closest_entry') {
      const aCurrent = a.current_price || 0;
      const aMid = a.entry_zone_mid || ((a.entry_zone_low || 0) + (a.entry_zone_high || 0)) / 2;
      const aDist = aCurrent > 0 ? Math.abs(aCurrent - aMid) : 999999;

      const bCurrent = b.current_price || 0;
      const bMid = b.entry_zone_mid || ((b.entry_zone_low || 0) + (b.entry_zone_high || 0)) / 2;
      const bDist = bCurrent > 0 ? Math.abs(bCurrent - bMid) : 999999;

      return aDist - bDist;
    }
    return 0;
  });

  const watchlistCount = allAvailableSetups.filter(s => watchlistIds.includes(s.id)).length;
  const futuresCount = allAvailableSetups.filter(s => (s.market || '').toLowerCase() === 'futures').length;
  const forexCount = allAvailableSetups.filter(s => (s.market || '').toLowerCase() === 'forex').length;

  const resetFilters = () => {
    setMarketFilter('all');
    setStateFilter('all');
    setBiasFilter('all');
    setOrderTypeFilter('all');
    setStrategyFilter('all');
    setSortBy('conviction');
    saveFilters({});
  };

  const hasActiveFilter = marketFilter !== 'all' || stateFilter !== 'all' || biasFilter !== 'all' || orderTypeFilter !== 'all' || strategyFilter !== 'all' || sortBy !== 'conviction';

  return (
    <div className={`dashboard style-theme-${styleTab}`}>
      <EarlyScanNewsBanner />
      <NewsWarningBanner />
      <DashboardHeader setups={setups} />
      
      <main className="container dashboard-main">
        <TrialWelcomeBanner />
        <MarketClosedBanner />


        {showMaintenanceLock && <ClientMaintenanceBanner />}

        {/* Combined 2-Column Compact Widgets Strip (Side-by-Side when Collapsed, Full Width on Expand) */}
        {!showMaintenanceLock && (
          <div className="dashboard-top-widgets">
            <AssetDecisionMatrix
              rawSetups={safeSetups}
              onOpenCalculator={(s) => setCalcSetup(s)}
            />
            <RunnersPanel
              runnerSetups={activeRunnerSetups}
              loading={activeLoading}
              autoExpand={stateFilter === 'runner'}
            />
            {canAccessEdgeFinder && (
              <Link
                to="/edge-finder"
                className="dashboard-edgefinder-cta"
              >
                <span className="dashboard-ef-cta-left">
                  <span className="dashboard-ef-cta-icon" aria-hidden="true">🧭</span>
                  <span className="dashboard-ef-cta-copy">
                    <span className="dashboard-ef-cta-title-row">
                      <span className="dashboard-ef-cta-title font-mono">MANNA EDGEFINDER PRO</span>
                      <span className="dashboard-ef-cta-pill font-mono">INSTITUTIONAL MATRIX</span>
                    </span>
                    <span className="dashboard-ef-cta-sub">
                      Macro Fundamentals, COT Smart Money, Retail Contrarian &amp; Multi-Timeframe Confluence Scorecards
                    </span>
                  </span>
                </span>
                <span className="dashboard-ef-cta-action font-mono">
                  LAUNCH EDGEFINDER <span className="dashboard-ef-cta-arrow" aria-hidden="true">→</span>
                </span>
              </Link>
            )}
          </div>
        )}

        {/* Separate Multi-Timeframe Trading Style Tabs (Scalping / Intraday / Swing) */}
        <section className="style-desk-bar glass-card font-mono" aria-label="Trading Style Desks">
          <div className="style-desk-tabs" role="tablist" aria-label="Trading Style Timeframe Desks">
            <button
              type="button"
              role="tab"
              aria-selected={styleTab === 'scalp'}
              className={`style-desk-tab style-tab-scalp ${styleTab === 'scalp' ? 'is-active' : ''}`}
              onClick={() => setStyleTab('scalp')}
            >
              <span className="style-desk-logo" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2L4.5 13.5H11.5L10.5 22L19.5 10.5H12.5L13 2Z" />
                </svg>
              </span>
              <span className="style-desk-text">
                <span className="style-desk-heading">
                  <span className="style-desk-name">Scalping</span>
                  <span className="style-tf-chip">15M · 5M</span>
                </span>
                <span className="style-desk-sub">Fast Momentum</span>
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={styleTab === 'intraday'}
              className={`style-desk-tab style-tab-intraday ${styleTab === 'intraday' ? 'is-active' : ''}`}
              onClick={() => setStyleTab('intraday')}
            >
              <span className="style-desk-logo" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="M12 7.5V12L15.2 13.8" />
                  <path d="M12 2V3.8M12 20.2V22M2 12H3.8M20.2 12H22" />
                </svg>
              </span>
              <span className="style-desk-text">
                <span className="style-desk-heading">
                  <span className="style-desk-name">Intraday</span>
                  <span className="style-tf-chip">1H · 15M</span>
                </span>
                <span className="style-desk-sub">Session Structure</span>
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={styleTab === 'swing'}
              className={`style-desk-tab style-tab-swing ${styleTab === 'swing' ? 'is-active' : ''}`}
              onClick={() => setStyleTab('swing')}
            >
              <span className="style-desk-logo" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 17L8.5 11.5L12.5 15L21 6.5" />
                  <path d="M16 6.5H21V11.5" />
                  <path d="M3 20.5H21" />
                </svg>
              </span>
              <span className="style-desk-text">
                <span className="style-desk-heading">
                  <span className="style-desk-name">Swing</span>
                  <span className="style-tf-chip">{swingMode === 'd1_h4' ? 'D1 · 4H' : '4H · 1H'}</span>
                </span>
                <span className="style-desk-sub">Multi-Day Macro</span>
              </span>
            </button>
          </div>

          <div className="style-desk-meta">
            {styleTab === 'swing' && (
              <div className="swing-pair-toggle" role="group" aria-label="Swing Timeframe Pair">
                <button
                  type="button"
                  className={`swing-pair-btn ${swingMode === 'd1_h4' ? 'is-active' : ''}`}
                  onClick={() => setSwingMode('d1_h4')}
                >
                  Daily + 4H
                </button>
                <button
                  type="button"
                  className={`swing-pair-btn ${swingMode === 'h4_h1' ? 'is-active' : ''}`}
                  onClick={() => setSwingMode('h4_h1')}
                >
                  4H + 1H
                </button>
              </div>
            )}

            {styleTab !== 'intraday' ? (
              <button
                type="button"
                className="advanced-filters-toggle font-mono"
                onClick={mtfDesk.refreshDesk}
                disabled={mtfDesk.loading}
              >
                {mtfDesk.loading ? 'Syncing...' : '⟳ Refresh'}
              </button>
            ) : (
              <span className="style-isolated-pill is-live">
                H1 Structure + 15M Entry
              </span>
            )}
          </div>
        </section>

        {/* Collapsible Obsidian Command Filter Bar (Collapsed by Default) */}
        <section className={`filter-bar glass-card font-mono ${filtersExpanded ? 'is-expanded' : 'is-collapsed'}`} aria-label="Signal Filters">
          <div className="filter-collapse-header">
            <button
              type="button"
              className="filter-collapse-trigger font-mono"
              aria-expanded={filtersExpanded}
              onClick={() => setFiltersExpanded((prev) => !prev)}
            >
              <span className="filter-collapse-title">SIGNAL FILTERS</span>
              <span className="filter-summary-pill">
                {marketFilter === 'all' ? `All (${allAvailableSetups.length})` : marketFilter.toUpperCase()}
                {stateFilter !== 'all' ? ` · ${stateFilter.replace('_', ' ')}` : ''}
                {biasFilter !== 'all' ? ` · ${biasFilter.toUpperCase()}` : ''}
                {strategyFilter !== 'all' ? ` · ${strategyFilter === 'manna_snd' ? 'Manna SnD' : 'Manna Elite'}` : ''}
                {` · ${sortedSetups.length} shown`}
              </span>
            </button>

            <div className="filter-top-meta">
              <div className="auto-refresh" title="Auto-refreshing live signals every 5 seconds">
                <span className="refresh-dot" />
                <span>LIVE · 5s Poll</span>
              </div>
              {hasActiveFilter && (
                <button type="button" className="reset-filters-btn" onClick={resetFilters} title="Reset all filters">
                  Reset
                </button>
              )}
              <button
                type="button"
                className="advanced-filters-toggle font-mono"
                aria-expanded={filtersExpanded}
                onClick={() => setFiltersExpanded((prev) => !prev)}
              >
                {filtersExpanded ? 'Hide Filters ▲' : 'Filters ▾'}
              </button>
            </div>
          </div>

          {filtersExpanded && (
            <>
              <div className="filter-top-row filter-expanded-divider">
                {/* Primary Market & Watchlist Segmented Tabs */}
                <div className="tabs" role="tablist" aria-label="Market Categories">
                  <button
                    type="button"
                    className={`tab ${marketFilter === 'all' ? 'active' : ''}`}
                    onClick={() => updateFilter(setMarketFilter, 'marketFilter', 'all')}
                  >
                    <span>All Markets</span>
                    <span className="tab-count">{allAvailableSetups.length}</span>
                  </button>
                  <button
                    type="button"
                    className={`tab ${marketFilter === 'futures' ? 'active' : ''}`}
                    onClick={() => updateFilter(setMarketFilter, 'marketFilter', 'futures')}
                  >
                    <span>Futures</span>
                    <span className="tab-count">{futuresCount}</span>
                  </button>
                  <button
                    type="button"
                    className={`tab ${marketFilter === 'forex' ? 'active' : ''}`}
                    onClick={() => updateFilter(setMarketFilter, 'marketFilter', 'forex')}
                  >
                    <span>Forex</span>
                    <span className="tab-count">{forexCount}</span>
                  </button>
                  <button
                    type="button"
                    className={`tab tab-watchlist ${marketFilter === 'watchlist' ? 'active' : ''}`}
                    onClick={() => updateFilter(setMarketFilter, 'marketFilter', 'watchlist')}
                  >
                    <span>★ Watchlist</span>
                    <span className="tab-count">{watchlistCount}</span>
                  </button>
                </div>
              </div>

          {filtersExpanded && (
            <>
              {/* Inline Core Filter Selects */}
              <div className="filter-controls-row">
                <div className="filter-group">
                  <label htmlFor="dash-state-filter">State</label>
                  <select
                    id="dash-state-filter"
                    value={stateFilter}
                    onChange={(e) => updateFilter(setStateFilter, 'stateFilter', e.target.value as StateFilter)}
                  >
                    <option value="all">All States</option>
                    <option value="active">Active Positions</option>
                    <option value="runner">Active Runners (TP1 Hit)</option>
                    <option value="in_zone">In Entry Zone</option>
                    <option value="awaiting_entry">Awaiting Entry</option>
                    <option value="resolved">Resolved (History)</option>
                    <option value="invalidated">Invalidated</option>
                  </select>
                </div>

                <div className="filter-group">
                  <label htmlFor="dash-bias-filter">Direction</label>
                  <select
                    id="dash-bias-filter"
                    value={biasFilter}
                    onChange={(e) => updateFilter(setBiasFilter, 'biasFilter', e.target.value as BiasFilter)}
                  >
                    <option value="all">All Directions</option>
                    <option value="long">Long Only</option>
                    <option value="short">Short Only</option>
                  </select>
                </div>

                <div className="filter-group">
                  <label htmlFor="dash-strategy-filter">Strategy</label>
                  <select
                    id="dash-strategy-filter"
                    value={strategyFilter}
                    onChange={(e) => updateFilter(setStrategyFilter, 'strategyFilter', e.target.value as StrategyFilter)}
                  >
                    <option value="all">All Strategies</option>
                    <option value="sentinel_v2">{isSuperAdmin ? 'Manna Elite v1.2 (Trade Sentinel Elite Framework)' : 'Manna Elite v1.2'}</option>
                    <option value="manna_snd">Manna SnD</option>
                  </select>
                </div>

                <div className="filter-group">
                  <label htmlFor="dash-sort-filter">Sort</label>
                  <select
                    id="dash-sort-filter"
                    value={sortBy}
                    onChange={(e) => updateFilter(setSortBy, 'sortBy', e.target.value as SortOption)}
                  >
                    <option value="conviction">Highest Conviction</option>
                    <option value="newest">Newest Discovered</option>
                    <option value="live_rr">Highest Live RR</option>
                    <option value="closest_entry">Closest to Entry Zone</option>
                  </select>
                </div>

                <button
                  type="button"
                  className="advanced-filters-toggle font-mono"
                  aria-expanded={showAdvancedFilters}
                  onClick={() => setShowAdvancedFilters(prev => !prev)}
                  title="Toggle advanced filter options"
                >
                  Order Type {showAdvancedFilters ? '▲' : '▾'}
                </button>
              </div>

              {showAdvancedFilters && (
                <div className="filter-controls-row filter-advanced-row">
                  <div className="filter-group">
                    <label htmlFor="dash-order-filter">Order Type</label>
                    <select
                      id="dash-order-filter"
                      value={orderTypeFilter}
                      onChange={(e) => updateFilter(setOrderTypeFilter, 'orderTypeFilter', e.target.value as OrderTypeFilter)}
                    >
                      <option value="all">All Orders</option>
                      <option value="market">Market Orders</option>
                      <option value="limit">Limit Orders</option>
                    </select>
                  </div>
                </div>
              )}
            </>
          )}
            </>
          )}
        </section>

        {/* Setups Display */}
        {showMaintenanceLock ? (
          <MockMaintenanceSignalCard />
        ) : activeLoading && allAvailableSetups.length === 0 ? (
          <div className="dashboard-loading glass-card font-mono">
            <span className="radar-icon animate-pulse">📡</span>{' '}
            {styleTab === 'intraday'
              ? 'Scanning killzone models & active setups...'
              : `Building ${styleTab === 'scalp' ? '15M + 5M Scalping' : `${mtfDesk.contextTf} + ${mtfDesk.entryTf} Swing`} setups...`}
          </div>
        ) : sortedSetups.length === 0 ? (
          <div className="empty-state glass-card font-mono">
            <div className="radar-icon animate-pulse">
              {marketFilter === 'watchlist' ? '⭐' : '📡'}
            </div>
            <h3>
              {marketFilter === 'watchlist' 
                ? 'Your Watchlist is Empty' 
                : allAvailableSetups.length === 0
                ? 'NO ACTIVE SIGNALS FOR THIS SESSION'
                : 'No setups match your selected filters'}
            </h3>
            <p>
              {marketFilter === 'watchlist'
                ? 'Click the ☆ Watch button on any setup card to pin it to your personal watchlist.'
                : allAvailableSetups.length === 0
                ? 'Institutional models are currently in Stand By. High-conviction entry criteria have not been met for the current session. Please wait until the next session scan.'
                : 'Try adjusting your state, market, or direction filters above.'}
            </p>

            {allAvailableSetups.length === 0 && marketFilter !== 'watchlist' && (
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
                <SessionScanCountdown />
              </div>
            )}

            {hasActiveFilter && (marketFilter === 'watchlist' || allAvailableSetups.length > 0) && (
              <button className="btn-hero-secondary btn-reset-empty" onClick={resetFilters}>
                Clear All Filters
              </button>
            )}
          </div>
        ) : (
          <>
            <ResearchBanner />
            <div className="setups-grid">
              {sortedSetups.map(setup => (
                <SetupCard
                  key={setup.id}
                  setup={setup}
                  isWatchlisted={isWatchlisted(setup.id)}
                  onToggleWatchlist={toggleWatchlist}
                  isTagged={isTagged(setup.id)}
                  onToggleTag={toggleTag}
                  onInvalidate={styleTab === 'intraday' ? refetch : mtfDesk.refreshDesk}
                />
              ))}
            </div>
          </>
        )}
      </main>

      {showFaq && <FaqModal onClose={() => setShowFaq(false)} />}
      {calcSetup && (
        <PositionCalculatorModal
          setup={calcSetup}
          onClose={() => setCalcSetup(null)}
        />
      )}
    </div>
  );
};
