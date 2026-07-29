import React, { useState } from 'react';
import { useSetups } from '../hooks/useSetups';
import { SetupCard } from '../components/SetupCard';
import { DashboardHeader } from '../components/DashboardHeader';
import { NewsWarningBanner } from '../components/NewsWarningBanner';
import { PositionCalculatorModal } from '../components/PositionCalculatorModal';
import type { EdgeSetup } from '../types';
import './ClientDashboard.css';

export const ClientDashboard: React.FC = () => {
  const { setups, loading, error, refetch } = useSetups();
  const [selectedMarket, setSelectedMarket] = useState<'all' | 'futures' | 'forex'>('all');
  const [calcSetup, setCalcSetup] = useState<EdgeSetup | null>(null);

  const filteredSetups = setups.filter(setup => {
    if (selectedMarket === 'futures') return setup.market === 'futures' || !setup.instrument.includes('/');
    if (selectedMarket === 'forex') return setup.market === 'forex' || setup.instrument.includes('/');
    return true;
  });

  const activeSetupsCount = setups.filter(s => (s.signal_state || s.state) === 'active' || (s.signal_state || s.state) === 'awaiting_entry').length;

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

        {/* Client Filter & Quick Controls Bar */}
        <div className="client-controls-bar">
          <div className="client-market-tabs">
            <button
              className={selectedMarket === 'all' ? 'active' : ''}
              onClick={() => setSelectedMarket('all')}
            >
              🌐 ALL MARKETS ({setups.length})
            </button>
            <button
              className={selectedMarket === 'futures' ? 'active' : ''}
              onClick={() => setSelectedMarket('futures')}
            >
              📈 FUTURES
            </button>
            <button
              className={selectedMarket === 'forex' ? 'active' : ''}
              onClick={() => setSelectedMarket('forex')}
            >
              💱 FOREX
            </button>
          </div>

          <button className="client-refresh-btn" onClick={() => refetch()}>
            🔄 REFRESH SIGNALS
          </button>
        </div>

        {/* Signals Feed Grid */}
        {loading ? (
          <div className="client-feed-loading font-headline">Scanning live market signals...</div>
        ) : error && filteredSetups.length === 0 ? (
          <div className="client-feed-error font-headline">Unable to load live backend feed. Offline mode.</div>
        ) : filteredSetups.length === 0 ? (
          <div className="client-feed-empty glass-card">
            <h3>NO ACTIVE SIGNALS FOR THIS FILTER</h3>
            <p>Our automated engine is scanning session boundaries. Check back during Asian, London, or NY session opens.</p>
          </div>
        ) : (
          <div className="client-grid">
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
