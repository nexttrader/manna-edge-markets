import React, { useState } from 'react';
import type { EdgeSetup } from '../types';
import './RunnersPanel.css';

interface RunnersPanelProps {
  runnerSetups: EdgeSetup[];
  loading?: boolean;
}

export const RunnersPanel: React.FC<RunnersPanelProps> = ({ runnerSetups, loading }) => {
  // Default to minimized/collapsed state
  const [isExpanded, setIsExpanded] = useState(false);

  if (loading) {
    return (
      <div className="runners-panel glass-card animate-fade-in minimized">
        <div className="runners-header-clickable">
          <div className="runners-title font-mono">
            <span className="runners-icon">🏃</span>
            <span className="text-gold">ACTIVE RUNNERS DESK</span>
          </div>
          <span className="font-mono text-muted" style={{ fontSize: '0.8rem' }}>Loading active runners...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`runners-panel glass-card animate-fade-in ${!isExpanded ? 'minimized' : ''}`}>
      <div className="runners-header-clickable" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="runners-title-area">
          <div className="runners-title font-mono">
            <span className="runners-icon">🏃</span>
            <span>ACTIVE RUNNERS DESK</span>
            <span className="runners-badge font-mono">{runnerSetups.length} RUNNING</span>
          </div>
          {isExpanded && (
            <p className="runners-subtitle font-mono">
              Setups that reached TP1 (2R Logged). Tracking strictly for TP2 (3R) without blocking new discovery scans on these assets.
            </p>
          )}
        </div>
        
        <div className="runners-toggle-btn font-mono">
          <span className="toggle-text">{isExpanded ? 'MINIMIZE DESK ▲' : 'EXPAND DESK ▼'}</span>
        </div>
      </div>

      {isExpanded && (
        <div className="runners-panel-body animate-fade-in">
          {runnerSetups.length === 0 ? (
            <div className="runners-empty font-mono">
              <div className="runners-empty-icon">🛡️</div>
              <div style={{ color: '#00e5ff', fontWeight: 700, fontSize: '0.95rem', marginBottom: '4px' }}>
                NO ACTIVE RUNNERS AT THIS MOMENT
              </div>
              <div style={{ color: '#aaa', fontSize: '0.8rem' }}>
                When an active trade reaches Take Profit 1 (+2.00R), it logs 2R into Analytics, moves Stop Loss to Break Even, and appears here to track for TP2 (+3.00R).
              </div>
            </div>
          ) : (
            <div className="runners-grid">
              {runnerSetups.map((setup) => {
                const currentPrice = setup.current_price || 0;
                const entryPrice = setup.entry_price_recorded || setup.entry_zone_mid || 0;
                const isLong = (setup.bias || 'long').toLowerCase() === 'long';
                const tp2 = setup.tp2 || 0;
                const distToTp2 = currentPrice > 0 && tp2 > 0
                  ? Math.abs(tp2 - currentPrice).toFixed(2)
                  : 'N/A';

                return (
                  <div key={setup.id} className="runner-card glass-card">
                    <div className="runner-card-header">
                      <div className="runner-symbol-group">
                        <span className="runner-symbol font-mono">{setup.instrument}</span>
                        <span className={`runner-bias-badge font-mono ${isLong ? 'bias-long' : 'bias-short'}`}>
                          {isLong ? '▲ LONG RUNNER' : '▼ SHORT RUNNER'}
                        </span>
                      </div>
                      <span className="runner-logged-badge font-mono">+2.00R LOGGED</span>
                    </div>

                    <div className="runner-card-body">
                      <div className="runner-metric">
                        <span className="metric-label font-mono">ENTRY PRICE</span>
                        <span className="metric-val font-mono">{entryPrice}</span>
                      </div>

                      <div className="runner-metric">
                        <span className="metric-label font-mono">CURRENT PRICE</span>
                        <span className="metric-val font-mono text-gold">{currentPrice || '---'}</span>
                      </div>

                      <div className="runner-metric">
                        <span className="metric-label font-mono">STOP LOSS (BE)</span>
                        <span className="metric-val font-mono text-green">{setup.stop || entryPrice} (RISK FREE)</span>
                      </div>

                      <div className="runner-metric">
                        <span className="metric-label font-mono">TARGET 2 (3R)</span>
                        <span className="metric-val font-mono text-gold">{setup.tp2 || 'N/A'} (+3.00R)</span>
                      </div>
                    </div>

                    <div className="runner-card-footer">
                      <div className="runner-status-line font-mono">
                        <span>DISTANCE TO TP2:</span>
                        <span className="text-gold font-bold">{distToTp2} pts</span>
                      </div>
                      <div className="runner-tracking-note font-mono">
                        Tracking for TP2 upgrade from 2R to 3R • New scans on {setup.instrument} UNBLOCKED
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
