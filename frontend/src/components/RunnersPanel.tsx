import React, { useState } from 'react';
import type { EdgeSetup } from '../types';
import { formatETTime, formatETDate } from '../utils/time';
import { formatTelegramTradeId } from '../utils/tradeId';
import './RunnersPanel.css';

interface RunnersPanelProps {
  runnerSetups: EdgeSetup[];
  loading?: boolean;
}

export const RunnersPanel: React.FC<RunnersPanelProps> = ({ runnerSetups, loading }) => {
  // Default to minimized/collapsed state
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
                const stop = setup.initial_stop || setup.stop || 0;
                const risk = Math.abs(entryPrice - stop);
                const decimals = setup.market === 'forex' ? 5 : 2;
                const calculatedTp2 = isLong ? (entryPrice + risk * 3.0) : (entryPrice - risk * 3.0);
                const tp2 = setup.tp2 || calculatedTp2 || 0;
                const distToTp2 = currentPrice > 0 && tp2 > 0
                  ? Math.abs(tp2 - currentPrice).toFixed(decimals)
                  : 'N/A';

                const totalDistance = Math.abs(tp2 - entryPrice);
                const currentDistance = currentPrice > 0
                  ? (isLong ? (currentPrice - entryPrice) : (entryPrice - currentPrice))
                  : 0;
                const progressPercent = totalDistance > 0
                  ? Math.min(100, Math.max(0, (currentDistance / totalDistance) * 100))
                  : 0;

                const tp1Percent = 66.6;
                const entryTimestamp = setup.entry_triggered_at || setup.entryAt || setup.created_at || setup.createdAt;
                const telegramId = formatTelegramTradeId(setup);

                return (
                  <div key={setup.id} className={`runner-card glass-card ${isLong ? 'is-long' : 'is-short'}`}>
                    <div className="runner-card-header">
                      <div className="runner-symbol-group">
                        <span className="runner-symbol font-mono">{setup.instrument}</span>
                        <span className={`runner-bias-badge font-mono ${isLong ? 'bias-long' : 'bias-short'}`}>
                          {isLong ? '▲ LONG' : '▼ SHORT'}
                        </span>
                        <span 
                          className="runner-id-badge font-mono"
                          title={`Telegram Trade ID: ${telegramId}\nClick to copy`}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(telegramId);
                            setCopiedId(setup.id);
                            setTimeout(() => setCopiedId(null), 2000);
                          }}
                        >
                          {copiedId === setup.id ? '✓ COPIED' : telegramId}
                        </span>
                      </div>
                      <span className="runner-logged-badge font-mono">+2.00R SECURED</span>
                    </div>

                    <div className="runner-card-body">
                      <div className="runner-entry-bar font-mono">
                        <div className="runner-entry-bar-left">
                          <span className="runner-entry-icon">📥</span>
                          <span className="runner-entry-label">ENTRY:</span>
                          <span className="runner-entry-datetime">
                            {entryTimestamp ? (
                              <>
                                <span className="entry-date">{formatETDate(entryTimestamp)}</span>
                                <span className="entry-dot"> · </span>
                                <span className="entry-time">{formatETTime(entryTimestamp)}</span>
                              </>
                            ) : (
                              '--'
                            )}
                          </span>
                        </div>
                        <span className="runner-entry-pill font-mono">FILLED</span>
                      </div>

                      <div className="runner-metric-grid">
                        <div className="runner-metric">
                          <span className="runner-metric-label font-mono">ENTRY</span>
                          <span className="runner-metric-val font-mono">{entryPrice.toFixed(decimals)}</span>
                        </div>

                        <div className="runner-metric highlight-metric">
                          <span className="runner-metric-label font-mono">CURRENT</span>
                          <span className="runner-metric-val font-mono price-val">{currentPrice ? currentPrice.toFixed(decimals) : '---'}</span>
                        </div>

                        <div className="runner-metric">
                          <span className="runner-metric-label font-mono">STOP LOSS (BE)</span>
                          <span className="runner-metric-val font-mono stop-val">{(setup.stop || entryPrice).toFixed(decimals)}</span>
                        </div>

                        <div className="runner-metric">
                          <span className="runner-metric-label font-mono">TARGET 2 (3R)</span>
                          <span className="runner-metric-val font-mono target-val">{tp2.toFixed(decimals)}</span>
                        </div>
                      </div>

                      {/* Premium Progress Bar representing move to 3R */}
                      <div className="runner-progress-wrapper">
                        <div className="runner-progress-labels font-mono">
                          <span>BE</span>
                          <span className="tp1-label" style={{ left: `${tp1Percent}%` }}>TP1 (2R)</span>
                          <span>TP2 (3R)</span>
                        </div>
                        <div className="runner-progress-bar-container">
                          <div 
                            className="runner-progress-bar-fill" 
                            style={{ width: `${progressPercent}%` }}
                          />
                          <div className="runner-progress-marker tp1-marker" style={{ left: `${tp1Percent}%` }} />
                        </div>
                        <div className="runner-progress-stats font-mono">
                          <span className="progress-pct">{progressPercent.toFixed(0)}% reached</span>
                          <span className="progress-r">+{((progressPercent / 100) * 3.0).toFixed(2)}R</span>
                        </div>
                      </div>
                    </div>

                    <div className="runner-card-footer">
                      <div className="runner-status-line font-mono">
                        <span className="status-label">DISTANCE TO TP2:</span>
                        <span className="text-gold font-bold">{distToTp2} pts</span>
                      </div>
                      <div className="runner-id-footer font-mono">
                        <span className="id-label">TRADE ID:</span>
                        <span 
                          className="id-val font-mono"
                          title={`Telegram Trade ID: ${telegramId}\nClick to copy`}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(telegramId);
                            setCopiedId(setup.id);
                            setTimeout(() => setCopiedId(null), 2000);
                          }}
                        >
                          {telegramId} {copiedId === setup.id ? '✓ Copied' : '📋'}
                        </span>
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
