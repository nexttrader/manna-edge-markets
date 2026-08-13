import React, { useState } from 'react';
import { useSignalNotifications } from '../context/SignalNotificationContext';
import { useHawkeye } from '../hooks/useHawkeye';
import { formatETTime } from '../utils/time';
import './LiveActivityFeed.css';

function formatPlainEnglishAudit(reasonCode: string, detail?: string) {
  const code = (reasonCode || '').toLowerCase();
  const det = detail || '';

  let title = 'Signal Updated';
  let icon = 'ℹ️';
  let explanation = det;

  if (code === 'sl_breached') {
    title = 'Stop Loss Breached';
    icon = '🛑';
    const match = det.match(/Price ([\d.]+) breached SL ([\d.]+)/i);
    if (match) {
      explanation = `Market price (${match[1]}) crossed Stop Loss level (${match[2]}). Position closed in Loss.`;
    } else {
      explanation = 'Market price touched Stop Loss level. Position closed in Loss.';
    }
  } else if (code === 'price_displaced') {
    title = 'Price Displaced';
    icon = '🏃';
    const match = det.match(/Price ([\d.]+) displaced > 1\.5x ATR \(([\d.]+)\) from entry mid ([\d.]+)/i);
    if (match) {
      explanation = `Market price (${match[1]}) moved too far away from entry mid (${match[3]}), exceeding 1.5x ATR volatility limit (${match[2]}). Signal cancelled to avoid chasing overextended moves.`;
    } else {
      explanation = 'Price moved too far away from entry zone. Signal cancelled to prevent overextended entry.';
    }
  } else if (code === 'structure_displaced') {
    title = 'Structure Breakout';
    icon = '🚀';
    explanation = 'Market price broke out aggressively beyond entry zone in bias direction without filling order. Signal cancelled.';
  } else if (code === 'entry_expired') {
    title = 'Entry Expired';
    icon = '⏰';
    explanation = 'Setup remained unfilled for longer than 12 hours (2 full session cycles). Order cancelled as stale.';
  } else if (code === 'superseded') {
    title = 'Superseded by Higher Conviction';
    icon = '⚡';
    explanation = 'Existing setup was replaced by a newly scanned setup with significantly higher conviction score.';
  } else if (code === 'opposing_signal') {
    title = 'Opposing Bias Reversal';
    icon = '🔄';
    explanation = 'Replaced by an opposing signal with higher market structure conviction.';
  } else if (code === 'discarded_duplicate') {
    title = 'Duplicate Filtered';
    icon = '📋';
    explanation = 'Lower-ranked duplicate candidate setup was filtered out during deduplication.';
  } else if (code === 'tp1_hit') {
    title = 'Take Profit 1 Reached';
    icon = '🟢';
    explanation = 'Market price reached Target 1. Scalped partial profit (+2.0R).';
  } else if (code === 'tp2_hit') {
    title = 'Take Profit 2 Reached';
    icon = '🎯';
    explanation = 'Market price reached Target 2. Full profit target achieved (+3.0R).';
  }

  return { title, icon, explanation };
}

export const LiveActivityFeed: React.FC = () => {
  const { activityLogs, clearActivityLogs, showActivityFeed, setShowActivityFeed } = useSignalNotifications();
  const { invalidations, loading } = useHawkeye();
  const [activeTab, setActiveTab] = useState<'feed' | 'trade_log'>('feed');
  const [filter, setFilter] = useState('');

  if (!showActivityFeed) return null;

  const safeInvalidations = Array.isArray(invalidations) ? invalidations : [];

  const filteredInvalidations = safeInvalidations.filter((inv: any) => {
    if (!inv) return false;
    const inst = inv.instrument || inv.setup_id || '';
    const reason = inv.reasonCode || inv.reason_code || '';
    return inst.toLowerCase().includes(filter.toLowerCase()) || 
           reason.toLowerCase().includes(filter.toLowerCase());
  });

  return (
    <div className="activity-feed-overlay font-sans animate-fade-in" onClick={() => setShowActivityFeed(false)}>
      <div className="activity-feed-drawer glass-card" onClick={e => e.stopPropagation()}>
        <div className="af-header">
          <div className="af-title-group">
            <div className="af-title-row font-mono">
              <span className="af-pulse-dot" />
              <h2 className="af-title">📡 LIVE SIGNAL ACTIVITY FEED</h2>
            </div>
            <span className="af-subtitle">
              Real-time feed of all signal discoveries, order fills, target hits, and safety updates in plain English.
            </span>
          </div>
          <div className="af-actions font-mono">
            {activeTab === 'feed' && activityLogs.length > 0 && (
              <button className="af-clear-btn" onClick={clearActivityLogs} title="Clear history">
                🗑️ Clear
              </button>
            )}
            <button className="af-close-btn" onClick={() => setShowActivityFeed(false)} title="Close feed">
              ✕
            </button>
          </div>
        </div>

        <div className="af-tabs font-mono">
          <button 
            className={`af-tab-btn ${activeTab === 'feed' ? 'active' : ''}`}
            onClick={() => setActiveTab('feed')}
          >
            📡 Live Feed ({activityLogs.length})
          </button>
          <button 
            className={`af-tab-btn ${activeTab === 'trade_log' ? 'active' : ''}`}
            onClick={() => setActiveTab('trade_log')}
          >
            📜 Trade Log ({safeInvalidations.length})
          </button>
        </div>

        {activeTab === 'trade_log' && (
          <div className="af-search-container">
            <input 
              type="text" 
              placeholder="Search symbol or trade reason..." 
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="af-search-input font-mono"
            />
          </div>
        )}

        <div className="af-body">
          {activeTab === 'feed' ? (
            activityLogs.length === 0 ? (
              <div className="af-empty-state font-mono">
                <span className="af-empty-icon">📭</span>
                <p>No recent signal activity recorded yet.</p>
                <span>Activity logs will appear automatically as scans run, orders fill, or targets hit!</span>
              </div>
            ) : (
              <div className="af-list">
                {activityLogs.map(log => {
                  const isLong = (log.bias || 'LONG').toUpperCase() === 'LONG';
                  const isProfit = log.type === 'tp_hit' || log.type === 'breakeven';
                  const isLoss = log.type === 'sl_hit';

                  return (
                    <div key={log.id} className={`af-item af-${log.type}`}>
                      <div className="af-item-header font-mono">
                        <div className="af-item-left">
                          <span className="af-icon">{log.icon}</span>
                          <span className="af-item-title">{log.title}</span>
                        </div>
                        <span className="af-timestamp">{log.timestamp}</span>
                      </div>

                      <div className="af-item-body font-mono">
                        <div className="af-asset-row">
                          <span className="af-symbol">{log.instrument}</span>
                          <span className={`af-bias-chip ${isLong ? 'long' : 'short'}`}>
                            {isLong ? '▲ LONG' : '▼ SHORT'}
                          </span>
                          <span className="af-market-chip">{(log.market || 'futures').toUpperCase()}</span>
                          {log.rMultiple !== undefined && (
                            <span className={`af-r-badge ${isProfit ? 'profit' : isLoss ? 'loss' : ''}`}>
                              {log.rMultiple > 0 ? `+${log.rMultiple.toFixed(2)}R` : `${log.rMultiple.toFixed(2)}R`}
                            </span>
                          )}
                        </div>

                        <p className="af-plain-english font-sans">
                          👉 {log.plainEnglish}
                        </p>

                        <span className="af-detail-text">
                          {log.detail}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            /* Trade Log Tab */
            loading ? (
              <div className="af-log-loading font-mono">Loading Manna Live Trade Log...</div>
            ) : filteredInvalidations.length === 0 ? (
              <div className="af-log-empty font-mono">No Live Trade Log records found.</div>
            ) : (
              <div className="af-list">
                {filteredInvalidations.map((inv: any) => {
                  let inst = inv.instrument || inv.setup_id || 'Setup';
                  if (inst.includes('-') && inst.length > 20) {
                    inst = (inv.setup_market || inv.market || 'futures').toUpperCase() === 'FOREX' ? 'Forex Setup' : 'Futures Setup';
                  }
                  const market = (inv.market || inv.setup_market || 'futures').toUpperCase();
                  const time = inv.timestamp || inv.created_at || new Date().toISOString();
                  const oldSt = inv.oldState || inv.previous_state || 'awaiting_entry';
                  const newSt = inv.newState || inv.new_state || 'invalidated';
                  const reason = inv.reasonCode || inv.reason_code || 'unknown';
                  const run = inv.runId || inv.run_id;

                  const auditInfo = formatPlainEnglishAudit(reason, inv.detail);

                  return (
                    <div key={inv.id} className="af-log-item">
                      <div className="af-log-header font-mono">
                        <span className="af-log-instrument">
                          {auditInfo.icon} {inst} <span className="af-log-market-chip">({market})</span>
                        </span>
                        <span className="af-log-time">{formatETTime(time)}</span>
                      </div>
                      
                      <div className="af-log-transition font-mono">
                        <span className="af-log-state-old">{oldSt.replace('_', ' ')}</span>
                        <span className="af-log-arrow">→</span>
                        <span className="af-log-state-new">{newSt.replace('_', ' ')}</span>
                      </div>

                      <div className="af-log-plain-reason font-sans">
                        <div className="af-log-reason-title font-mono">{auditInfo.title}</div>
                        <div className="af-log-reason-desc">{auditInfo.explanation}</div>
                      </div>

                      {run && <div className="af-log-run font-mono">Run ID: {run}</div>}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>

        <div className="af-footer font-mono">
          {activeTab === 'feed' ? (
            <>
              <span>Total events recorded: {activityLogs.length}</span>
              <span className="af-footer-hint">Auto-refreshes every 5 seconds</span>
            </>
          ) : (
            <>
              <span>Total records: {filteredInvalidations.length}</span>
              <span className="af-footer-hint">Auto-refreshes every 10 seconds</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
