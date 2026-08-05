import React, { useState } from 'react';
import './Dashboard.css';
import { DashboardHeader } from '../components/DashboardHeader';
import { SetupCard } from '../components/SetupCard';
import { HawkeyePanel } from '../components/HawkeyePanel';
import { useSetups } from '../hooks/useSetups';
import { useWatchlist } from '../hooks/useWatchlist';
import { NewsWarningBanner } from '../components/NewsWarningBanner';
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

export const Dashboard: React.FC = () => {
  const { user, isImpersonating } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin' && !isImpersonating;

  const { setups, runnerSetups, loading } = useSetups();
  const { watchlistIds, toggleWatchlist, isWatchlisted } = useWatchlist();

  const [marketFilter, setMarketFilter] = useState<MarketFilter>('all');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [biasFilter, setBiasFilter] = useState<BiasFilter>('all');
  const [orderTypeFilter, setOrderTypeFilter] = useState<OrderTypeFilter>('all');
  const [strategyFilter, setStrategyFilter] = useState<StrategyFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('conviction');
  const [showFaq, setShowFaq] = useState(false);
  const [calcSetup, setCalcSetup] = useState<EdgeSetup | null>(null);

  const safeSetups = Array.isArray(setups) ? setups : [];
  const safeWatchlist = Array.isArray(watchlistIds) ? watchlistIds : [];

  // Filter Logic
  const filteredSetups = safeSetups.filter(setup => {
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
    } else if (stateFilter !== 'all' && stateStr !== stateFilter) {
      return false;
    }

    // 3. Bias Filter
    if (biasFilter !== 'all' && biasStr !== biasFilter) return false;

    // 4. Order Type Filter
    const isLimit = setup.order_type === 'limit' || Boolean(setup.entry_zone_low && setup.entry_zone_high);
    const orderTypeStr = isLimit ? 'limit' : 'market';
    if (orderTypeFilter !== 'all' && orderTypeStr !== orderTypeFilter) return false;

    // 5. Strategy Tier Filter
    if (strategyFilter !== 'all' && stratId !== strategyFilter) return false;

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

  const watchlistCount = setups.filter(s => watchlistIds.includes(s.id)).length;
  const futuresCount = setups.filter(s => (s.market || '').toLowerCase() === 'futures').length;
  const forexCount = setups.filter(s => (s.market || '').toLowerCase() === 'forex').length;

  const resetFilters = () => {
    setMarketFilter('all');
    setStateFilter('all');
    setBiasFilter('all');
    setOrderTypeFilter('all');
    setStrategyFilter('all');
    setSortBy('conviction');
  };

  const hasActiveFilter = marketFilter !== 'all' || stateFilter !== 'all' || biasFilter !== 'all' || orderTypeFilter !== 'all' || strategyFilter !== 'all' || sortBy !== 'conviction';

  return (
    <div className="dashboard">
      <NewsWarningBanner />
      <DashboardHeader />
      
      <main className="container dashboard-main">
        <TrialWelcomeBanner />
        <MarketClosedBanner />

        {/* Real-Time Asset Decision Matrix */}
        <AssetDecisionMatrix 
          rawSetups={safeSetups}
          onOpenCalculator={(s) => setCalcSetup(s)}
        />

        {/* Active Runners Desk */}
        <RunnersPanel runnerSetups={runnerSetups} loading={loading} />

        {/* Main Filter & Control Panel */}
        <div className="filter-bar glass-card font-mono">
          <div className="filter-top-row">
            {/* Primary Market & Watchlist Tabs */}
            <div className="tabs">
              <button 
                className={`tab ${marketFilter === 'all' ? 'active' : ''}`}
                onClick={() => setMarketFilter('all')}
              >
                🌐 All Markets ({setups.length})
              </button>
              <button 
                className={`tab ${marketFilter === 'futures' ? 'active' : ''}`}
                onClick={() => setMarketFilter('futures')}
              >
                📊 Futures ({futuresCount})
              </button>
              <button 
                className={`tab ${marketFilter === 'forex' ? 'active' : ''}`}
                onClick={() => setMarketFilter('forex')}
              >
                💱 Forex ({forexCount})
              </button>
              <button 
                className={`tab tab-watchlist ${marketFilter === 'watchlist' ? 'active' : ''}`}
                onClick={() => setMarketFilter('watchlist')}
              >
                ⭐ Watchlist ({watchlistCount})
              </button>
              <button 
                className="tab tab-faq font-mono"
                onClick={() => setShowFaq(true)}
                style={{
                  background: 'rgba(224, 86, 253, 0.15)',
                  color: '#e056fd',
                  border: '1px solid rgba(224, 86, 253, 0.45)',
                  fontWeight: 800
                }}
                title="Open Platform FAQ & Knowledge Base Guide"
              >
                ❓ FAQ
              </button>
            </div>
          </div>

          {/* Secondary Controls: Dropdown Filters & Sort Options */}
          <div className="filter-controls-row">
            <div className="filter-group">
              <label>Strategy Tier:</label>
              <select value={strategyFilter} onChange={(e) => setStrategyFilter(e.target.value as StrategyFilter)}>
                <option value="all">⚡ All Strategies</option>
                <option value="sentinel_v2">🟣 {isSuperAdmin ? 'Chadwin Sentinel V2 Elite Framework (Manna Elite V1)' : 'Manna Elite V1'}</option>
                <option value="manna_snd">🟡 Manna SnD</option>
              </select>
            </div>

            <div className="filter-group">
              <label>State:</label>
              <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value as StateFilter)}>
                <option value="all">All States</option>
                <option value="active">🟢 Active Positions</option>
                <option value="runner">🏃 Active Runners (TP1 Logged)</option>
                <option value="in_zone">🎯 Still In Entry Zone</option>
                <option value="awaiting_entry">⏳ Awaiting Entry</option>
                <option value="resolved">🏁 Resolved (History)</option>
                <option value="invalidated">❌ Invalidated</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Direction:</label>
              <select value={biasFilter} onChange={(e) => setBiasFilter(e.target.value as BiasFilter)}>
                <option value="all">All Directions</option>
                <option value="long">⬆ Long Only</option>
                <option value="short">⬇ Short Only</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Order Type:</label>
              <select value={orderTypeFilter} onChange={(e) => setOrderTypeFilter(e.target.value as OrderTypeFilter)}>
                <option value="all">All Orders</option>
                <option value="market">📌 Market Orders</option>
                <option value="limit">📌 Limit Orders</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Sort By:</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortOption)}>
                <option value="conviction">🔥 Highest Conviction</option>
                <option value="newest">⏱️ Newest Discovered</option>
                <option value="live_rr">📈 Highest Live RR</option>
                <option value="closest_entry">📍 Closest to Entry Zone</option>
              </select>
            </div>

            <div className="auto-refresh" style={{ margin: 0, alignSelf: 'center' }}>
              <span className="refresh-dot"></span>
              Live (5s poll)
            </div>

            {hasActiveFilter && (
              <button className="reset-filters-btn" onClick={resetFilters} title="Reset all filters">
                ↺ Reset Filters
              </button>
            )}
          </div>
        </div>

        {/* Setups Display */}
        {loading && setups.length === 0 ? (
          <div className="dashboard-loading glass-card font-mono">
            <span className="radar-icon animate-pulse">📡</span> Scanning killzone models & active setups...
          </div>
        ) : sortedSetups.length === 0 ? (
          <div className="empty-state glass-card font-mono">
            <div className="radar-icon animate-pulse">
              {marketFilter === 'watchlist' ? '⭐' : '📡'}
            </div>
            <h3>
              {marketFilter === 'watchlist' 
                ? 'Your Watchlist is Empty' 
                : 'No setups match your selected filters'}
            </h3>
            <p>
              {marketFilter === 'watchlist'
                ? 'Click the ☆ Watch button on any setup card to pin it to your personal watchlist.'
                : 'Try adjusting your state, market, or direction filters above.'}
            </p>
            {hasActiveFilter && (
              <button className="btn-hero-secondary btn-reset-empty" onClick={resetFilters}>
                Clear All Filters
              </button>
            )}
          </div>
        ) : (
          <div className="setups-grid">
            {sortedSetups.map(setup => (
              <SetupCard 
                key={setup.id} 
                setup={setup} 
                isWatchlisted={isWatchlisted(setup.id)}
                onToggleWatchlist={toggleWatchlist}
              />
            ))}
          </div>
        )}
      </main>

      {showFaq && <FaqModal onClose={() => setShowFaq(false)} />}
      {calcSetup && (
        <PositionCalculatorModal
          setup={calcSetup}
          onClose={() => setCalcSetup(null)}
        />
      )}
      <HawkeyePanel />
    </div>
  );
};
