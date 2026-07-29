import React, { useState } from 'react';
import './Dashboard.css';
import { DashboardHeader } from '../components/DashboardHeader';
import { SetupCard } from '../components/SetupCard';
import { HawkeyePanel } from '../components/HawkeyePanel';
import { useSetups } from '../hooks/useSetups';
import { useWatchlist } from '../hooks/useWatchlist';

type MarketFilter = 'all' | 'futures' | 'forex' | 'watchlist';
type StateFilter = 'all' | 'active' | 'awaiting_entry' | 'in_zone' | 'resolved' | 'invalidated';
type BiasFilter = 'all' | 'long' | 'short';
type OrderTypeFilter = 'all' | 'market' | 'limit';
type SortOption = 'conviction' | 'newest' | 'live_rr' | 'closest_entry';

export const Dashboard: React.FC = () => {
  const { setups, loading } = useSetups();
  const { watchlistIds, toggleWatchlist, isWatchlisted } = useWatchlist();

  const [marketFilter, setMarketFilter] = useState<MarketFilter>('all');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [biasFilter, setBiasFilter] = useState<BiasFilter>('all');
  const [orderTypeFilter, setOrderTypeFilter] = useState<OrderTypeFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('conviction');

  // Filter Logic
  const filteredSetups = setups.filter(setup => {
    const market = (setup.market || 'futures').toLowerCase();
    const stateStr = (setup.signal_state || setup.state || 'awaiting_entry').toLowerCase();
    const biasStr = (setup.bias || 'long').toLowerCase();
    const currentPrice = setup.current_price;
    const entryLow = setup.entry_zone_low ?? setup.levels?.entryMin ?? 0;
    const entryHigh = setup.entry_zone_high ?? setup.levels?.entryMax ?? 0;
    const isInZone = Boolean(currentPrice && currentPrice >= entryLow && currentPrice <= entryHigh);

    // 1. Market / Watchlist Filter
    if (marketFilter === 'watchlist') {
      if (!watchlistIds.includes(setup.id)) return false;
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
    if (biasFilter !== 'all' && biasStr !== biasFilter) {
      return false;
    }

    // 4. Order Type Filter
    const isMarketOrder = setup.created_at && setup.entry_triggered_at
      ? (new Date(setup.entry_triggered_at).getTime() - new Date(setup.created_at).getTime()) <= 60000
      : false;

    if (orderTypeFilter === 'market' && !isMarketOrder) return false;
    if (orderTypeFilter === 'limit' && isMarketOrder) return false;

    return true;
  });

  // Sort Logic
  const sortedSetups = [...filteredSetups].sort((a, b) => {
    if (sortBy === 'newest') {
      const tA = new Date(a.created_at || 0).getTime();
      const tB = new Date(b.created_at || 0).getTime();
      return tB - tA;
    }
    if (sortBy === 'live_rr') {
      const rrA = a.unrealizedR ?? -999;
      const rrB = b.unrealizedR ?? -999;
      return rrB - rrA;
    }
    if (sortBy === 'closest_entry') {
      const distA = a.distance_to_entry_r ?? 999;
      const distB = b.distance_to_entry_r ?? 999;
      return distA - distB;
    }
    // Default: highest conviction score
    const scoreA = a.conviction_score ?? a.conviction ?? 0;
    const scoreB = b.conviction_score ?? b.conviction ?? 0;
    return scoreB - scoreA;
  });

  const watchlistCount = setups.filter(s => watchlistIds.includes(s.id)).length;
  const futuresCount = setups.filter(s => (s.market || '').toLowerCase() === 'futures').length;
  const forexCount = setups.filter(s => (s.market || '').toLowerCase() === 'forex').length;

  const resetFilters = () => {
    setMarketFilter('all');
    setStateFilter('all');
    setBiasFilter('all');
    setOrderTypeFilter('all');
    setSortBy('conviction');
  };

  const hasActiveFilter = marketFilter !== 'all' || stateFilter !== 'all' || biasFilter !== 'all' || orderTypeFilter !== 'all' || sortBy !== 'conviction';

  return (
    <div className="dashboard">
      <DashboardHeader />
      
      <main className="container dashboard-main">
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
            </div>

            <div className="auto-refresh">
              <span className="refresh-dot"></span>
              Live (5s poll)
            </div>
          </div>

          {/* Secondary Controls: Dropdown Filters & Sort Options */}
          <div className="filter-controls-row">
            <div className="filter-group">
              <label>State:</label>
              <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value as StateFilter)}>
                <option value="all">All States</option>
                <option value="active">🟢 Active Positions</option>
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

      <HawkeyePanel />
    </div>
  );
};
