import React, { useState } from 'react';
import { useSetups } from '../hooks/useSetups';
import { useWatchlist } from '../hooks/useWatchlist';
import { SetupCard } from '../components/SetupCard';
import { DashboardHeader } from '../components/DashboardHeader';
import { NewsWarningBanner } from '../components/NewsWarningBanner';
import { HawkeyePanel } from '../components/HawkeyePanel';
import { PositionCalculatorModal } from '../components/PositionCalculatorModal';
import type { EdgeSetup } from '../types';
import './ClientDashboard.css';

type MarketFilter = 'all' | 'futures' | 'forex' | 'watchlist';
type StateFilter = 'all' | 'active' | 'awaiting_entry' | 'in_zone' | 'resolved' | 'invalidated';
type BiasFilter = 'all' | 'long' | 'short';
type OrderTypeFilter = 'all' | 'market' | 'limit';
type SortOption = 'conviction' | 'newest' | 'live_rr' | 'closest_entry';

export const ClientDashboard: React.FC = () => {
  const { setups, loading } = useSetups();
  const { watchlistIds } = useWatchlist();

  const [marketFilter, setMarketFilter] = useState<MarketFilter>('all');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [biasFilter, setBiasFilter] = useState<BiasFilter>('all');
  const [orderTypeFilter, setOrderTypeFilter] = useState<OrderTypeFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('conviction');

  const [calcSetup, setCalcSetup] = useState<EdgeSetup | null>(null);

  // Full Rich Filter Logic
  const filteredSetups = setups.filter(setup => {
    const market = (setup.market || 'futures').toLowerCase();
    const stateStr = (setup.signal_state || setup.state || 'awaiting_entry').toLowerCase();
    const biasStr = (setup.bias || 'long').toLowerCase();
    const currentPrice = setup.current_price;
    const entryLow = setup.entry_zone_low ?? setup.levels?.entryMin ?? 0;
    const entryHigh = setup.entry_zone_high ?? setup.levels?.entryMax ?? 0;
    const isInZone = Boolean(currentPrice && currentPrice >= entryLow && currentPrice <= entryHigh);

    if (marketFilter === 'watchlist') {
      if (!watchlistIds.includes(setup.id)) return false;
    } else if (marketFilter !== 'all' && market !== marketFilter) {
      return false;
    }

    if (stateFilter === 'in_zone') {
      if (!isInZone || (stateStr !== 'active' && stateStr !== 'awaiting_entry')) return false;
    } else if (stateFilter !== 'all' && stateStr !== stateFilter) {
      return false;
    }

    if (biasFilter !== 'all' && biasStr !== biasFilter) return false;

    const isLimit = setup.order_type === 'limit' || Boolean(setup.entry_zone_low && setup.entry_zone_high);
    const orderTypeStr = isLimit ? 'limit' : 'market';
    if (orderTypeFilter !== 'all' && orderTypeStr !== orderTypeFilter) return false;

    return true;
  });

  // Sorting Logic
  filteredSetups.sort((a, b) => {
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

  const futuresCount = setups.filter(s => (s.market || '').toLowerCase() === 'futures').length;
  const forexCount = setups.filter(s => (s.market || '').toLowerCase() === 'forex').length;
  const watchlistCount = setups.filter(s => watchlistIds.includes(s.id)).length;
  const activeSetupsCount = setups.filter(s => (s.signal_state || s.state) === 'active' || (s.signal_state || s.state) === 'awaiting_entry').length;

  const resetFilters = () => {
    setMarketFilter('all');
    setStateFilter('all');
    setBiasFilter('all');
    setOrderTypeFilter('all');
    setSortBy('conviction');
  };

  const hasActiveFilter = marketFilter !== 'all' || stateFilter !== 'all' || biasFilter !== 'all' || orderTypeFilter !== 'all' || sortBy !== 'conviction';

  return (
    <div className="client-dashboard-page">
      <NewsWarningBanner />
      <DashboardHeader />

      <main className="container client-main">
        {/* Client Performance Hero Banner */}
        <section className="client-hero-bar glass-card animate-fade-in">
          <div className="client-stat-item">
            <span className="client-stat-label">ACTIVE SIGNALS</span>
            <span className="client-stat-val text-gold">{activeSetupsCount}</span>
          </div>

          <div className="client-stat-divider" />

          <div className="client-stat-item">
            <span className="client-stat-label">HISTORICAL WIN RATE</span>
            <span className="client-stat-val text-green">74.5%</span>
          </div>

          <div className="client-stat-divider" />

          <div className="client-stat-item">
            <span className="client-stat-label">AVG RISK-TO-REWARD</span>
            <span className="client-stat-val text-gold">+2.45R</span>
          </div>

          <div className="client-stat-divider" />

          <div className="client-stat-item">
            <span className="client-stat-label">SIGNAL PROTECTION</span>
            <span className="client-stat-val text-blue">AUTOMATED 24/7</span>
          </div>
        </section>

        {/* Full Rich Filter Bar */}
        <div className="filter-bar glass-card font-mono" style={{ marginBottom: '24px' }}>
          <div className="filter-top-row">
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
              Live Client Feed (5s poll)
            </div>
          </div>

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

        {/* Setups Display Grid */}
        {loading && setups.length === 0 ? (
          <div className="client-feed-loading font-headline">Scanning live market signals...</div>
        ) : filteredSetups.length === 0 ? (
          <div className="client-feed-empty glass-card">
            <h3>NO ACTIVE SIGNALS MATCH FILTER</h3>
            <p>Try resetting your state or market filters above.</p>
            {hasActiveFilter && (
              <button className="btn-hero-secondary" style={{ marginTop: '12px' }} onClick={resetFilters}>
                Clear All Filters
              </button>
            )}
          </div>
        ) : (
          <div className="setups-grid">
            {filteredSetups.map(setup => (
              <div key={setup.id} className="client-card-wrapper">
                <SetupCard setup={setup} />
                <button
                  className="client-calc-trigger-btn"
                  onClick={() => setCalcSetup(setup)}
                >
                  🧮 CALCULATE LOT SIZE & RISK FOR {setup.instrument}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Manna Live Trade Log Floating Panel */}
        <HawkeyePanel />
      </main>

      {/* Position Risk Calculator Modal */}
      {calcSetup && (
        <PositionCalculatorModal
          setup={calcSetup}
          onClose={() => setCalcSetup(null)}
        />
      )}
    </div>
  );
};
