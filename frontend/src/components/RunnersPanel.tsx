import React, { useState, useEffect } from 'react';
import type { EdgeSetup } from '../types';
import { formatETTime, formatETDate } from '../utils/time';
import { formatTelegramTradeId } from '../utils/tradeId';
import { SetupChartModal } from './SetupChartModal';
import './RunnersPanel.css';

interface RunnersPanelProps {
  runnerSetups: EdgeSetup[];
  loading?: boolean;
  autoExpand?: boolean;
}

type RunnerStyleFilter = 'all' | 'scalp' | 'intraday' | 'swing';

function getRunnerStyle(setup: EdgeSetup): 'scalp' | 'intraday' | 'swing' {
  const style = (setup.trading_style || '').toUpperCase();
  const strat = (setup.strategy_id || '').toLowerCase();
  if (style === 'SCALP' || strat === 'manna_scalper') return 'scalp';
  if (style === 'SWING' || strat === 'manna_swing') return 'swing';
  return 'intraday';
}

export const RunnersPanel: React.FC<RunnersPanelProps> = ({ runnerSetups, loading, autoExpand }) => {
  // Default to minimized/collapsed state unless autoExpand is requested
  const [isExpanded, setIsExpanded] = useState(false);
  const [styleFilter, setStyleFilter] = useState<RunnerStyleFilter>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedChartSetup, setSelectedChartSetup] = useState<EdgeSetup | null>(null);

  // Auto expand when autoExpand prop changes to true
  useEffect(() => {
    if (autoExpand && runnerSetups.length > 0) {
      setIsExpanded(true);
    }
  }, [autoExpand, runnerSetups.length]);

  // Filter out any runner older than 5 days (auto-closed policy)
  const activeRunners = runnerSetups.filter(setup => {
    let runnerStart = setup.entry_triggered_at || setup.entryAt || setup.created_at || setup.createdAt;
    try {
      const meta = typeof setup.metadata === 'string' ? JSON.parse(setup.metadata) : setup.metadata;
      if (meta?.runner_started_at) runnerStart = meta.runner_started_at;
    } catch {}
    if (!runnerStart) return true;
    const ageMs = Date.now() - new Date(runnerStart).getTime();
    return ageMs < 5 * 24 * 60 * 60 * 1000;
  });

  const scalpRunnersCount = activeRunners.filter(s => getRunnerStyle(s) === 'scalp').length;
  const intradayRunnersCount = activeRunners.filter(s => getRunnerStyle(s) === 'intraday').length;
  const swingRunnersCount = activeRunners.filter(s => getRunnerStyle(s) === 'swing').length;

  const displayedRunners = activeRunners.filter(s =>
    styleFilter === 'all' ? true : getRunnerStyle(s) === styleFilter
  );

  // Keep selectedChartSetup reactive to latest live price ticks in activeRunners
  const activeChartSetup = selectedChartSetup
    ? activeRunners.find((s) => s.id === selectedChartSetup.id) || selectedChartSetup
    : null;

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
            <span className="runners-badge font-mono">{activeRunners.length} RUNNING</span>
            <span className="runners-mini-splits font-mono">
              <span>⚡{scalpRunnersCount}</span>
              <span>📊{intradayRunnersCount}</span>
              <span>🌊{swingRunnersCount}</span>
            </span>
          </div>
          {isExpanded && (
            <p className="runners-subtitle font-mono">
              Live TP1-banked runners across Scalping, Intraday &amp; Swing (80% banked @ 2R = +1.60R, 20% trailing at BE for 3R TP2 = +2.20R Net).
            </p>
          )}
        </div>
        
        <div className="runners-toggle-btn font-mono">
          <span className="toggle-text">{isExpanded ? 'MINIMIZE DESK ▲' : 'EXPAND DESK ▼'}</span>
        </div>
      </div>

      {isExpanded && (
        <div className="runners-panel-body animate-fade-in">
          <div className="runners-style-tabs font-mono" role="tablist" aria-label="Filter Runners by Trading Style">
            <button
              type="button"
              className={`runners-style-tab ${styleFilter === 'all' ? 'active all' : ''}`}
              onClick={() => setStyleFilter('all')}
            >
              🌐 All Desks ({activeRunners.length})
            </button>
            <button
              type="button"
              className={`runners-style-tab ${styleFilter === 'scalp' ? 'active scalp' : ''}`}
              onClick={() => setStyleFilter('scalp')}
            >
              ⚡ Scalping ({scalpRunnersCount})
            </button>
            <button
              type="button"
              className={`runners-style-tab ${styleFilter === 'intraday' ? 'active intraday' : ''}`}
              onClick={() => setStyleFilter('intraday')}
            >
              📊 Intraday ({intradayRunnersCount})
            </button>
            <button
              type="button"
              className={`runners-style-tab ${styleFilter === 'swing' ? 'active swing' : ''}`}
              onClick={() => setStyleFilter('swing')}
            >
              🌊 Swing ({swingRunnersCount})
            </button>
          </div>

          {displayedRunners.length === 0 ? (
            <div className="runners-empty font-mono">
              <div className="runners-empty-icon">🛡️</div>
              <div style={{ color: '#00e5ff', fontWeight: 700, fontSize: '0.95rem', marginBottom: '4px' }}>
                {activeRunners.length === 0
                  ? 'NO ACTIVE RUNNERS AT THIS MOMENT'
                  : `NO ACTIVE ${styleFilter.toUpperCase()} RUNNERS AT THIS MOMENT`}
              </div>
              <div style={{ color: '#aaa', fontSize: '0.8rem' }}>
                When a Scalping, Intraday, or Swing trade hits Take Profit 1 (+2.00R), 80% banks (+1.60R), Stop Loss locks at Break Even, and the 20% runner tracks here toward TP2 (+2.20R Net).
              </div>
            </div>
          ) : (
            <div className="runners-grid">
               {displayedRunners.map((setup) => {
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
                const createdTimestamp = setup.created_at || setup.createdAt || setup.validatedAt;
                const entryTimestamp = setup.entry_triggered_at || setup.entryAt || setup.created_at || setup.createdAt;
                const telegramId = formatTelegramTradeId(setup);

                const runnerStyle = getRunnerStyle(setup);
                const tfTag = runnerStyle === 'scalp'
                  ? '⚡ SCALP · 15M/5M'
                  : runnerStyle === 'swing'
                  ? `🌊 SWING · ${setup.context_tf || '1D'}/${setup.entry_tf || '4H'}`
                  : '📊 INTRADAY · 1H/15M';
                const r1 = setup.r_multiple_1 || 2.0;
                const r2 = setup.r_multiple_2 || 3.0;
                const bankedR = Number((0.8 * r1).toFixed(2));
                const fullR = Number((0.8 * r1 + 0.2 * r2).toFixed(2));

                return (
                  <div key={setup.id} className={`runner-card glass-card ${isLong ? 'is-long' : 'is-short'}`}>
                    <div className="runner-card-header">
                      <div className="runner-symbol-group" style={{ flexWrap: 'wrap' }}>
                        <span className="runner-symbol font-mono">{setup.instrument}</span>
                        <span className={`runner-style-pill font-mono ${runnerStyle}`}>
                          {tfTag}
                        </span>
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
                      <div className="runner-header-right">
                        <button
                          type="button"
                          className="runner-btn-chart font-mono"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedChartSetup(setup);
                          }}
                          title={`View interactive ${setup.instrument} chart`}
                        >
                          📈 Chart
                        </button>
                        <span className="runner-logged-badge font-mono">+{bankedR.toFixed(2)}R BANKED</span>
                      </div>
                    </div>

                    <div className="runner-card-body">
                      <div className="runner-timing-group font-mono">
                        <div className="runner-sent-bar">
                          <div className="runner-timing-bar-left">
                            <span className="runner-timing-icon">📡</span>
                            <span className="runner-timing-label">SIGNAL SENT:</span>
                            <span className="runner-sent-datetime">
                              {createdTimestamp ? (
                                <>
                                  <span className="entry-date">{formatETDate(createdTimestamp)}</span>
                                  <span className="entry-dot"> · </span>
                                  <span className="entry-time">{formatETTime(createdTimestamp)}</span>
                                </>
                              ) : (
                                '--'
                              )}
                            </span>
                          </div>
                          <span className="runner-sent-pill font-mono">SENT</span>
                        </div>

                        <div className="runner-entry-bar">
                          <div className="runner-timing-bar-left">
                            <span className="runner-timing-icon">📥</span>
                            <span className="runner-timing-label">ENTERED:</span>
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
                      </div>

                      <div className="runner-metric-grid">
                        <div className="runner-metric">
                          <span className="runner-metric-label font-mono">ENTRY</span>
                          <span className="runner-metric-val font-mono">{entryPrice.toFixed(decimals)}</span>
                        </div>

                        <div 
                          className="runner-metric highlight-metric"
                          onClick={() => setSelectedChartSetup(setup)}
                          title="Click to open live interactive chart"
                        >
                          <span className="runner-metric-label font-mono">CURRENT 📈</span>
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
                          <span className="progress-pct">{progressPercent.toFixed(0)}% to TP2</span>
                          <span className="progress-r">Blended: +{bankedR.toFixed(2)}R → +{fullR.toFixed(2)}R</span>
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

                      <div className="runner-actions-row font-mono">
                        <button
                          type="button"
                          className="runner-action-btn runner-action-chart font-mono"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedChartSetup(setup);
                          }}
                        >
                          📈 View Interactive Chart
                        </button>
                      </div>

                      <div className="runner-tracking-note font-mono">
                        80% banked @ {r1.toFixed(1)}R (+{bankedR.toFixed(2)}R) • Trailing final 20% to TP2 (+{fullR.toFixed(2)}R Net)
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeChartSetup && (
        <SetupChartModal
          setup={activeChartSetup}
          onClose={() => setSelectedChartSetup(null)}
        />
      )}
    </div>
  );
};
