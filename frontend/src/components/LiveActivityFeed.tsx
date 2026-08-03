import React from 'react';
import { useSignalNotifications } from '../context/SignalNotificationContext';
import './LiveActivityFeed.css';

export const LiveActivityFeed: React.FC = () => {
  const { activityLogs, clearActivityLogs, showActivityFeed, setShowActivityFeed } = useSignalNotifications();

  if (!showActivityFeed) return null;

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
            {activityLogs.length > 0 && (
              <button className="af-clear-btn" onClick={clearActivityLogs} title="Clear history">
                🗑️ Clear
              </button>
            )}
            <button className="af-close-btn" onClick={() => setShowActivityFeed(false)} title="Close feed">
              ✕
            </button>
          </div>
        </div>

        <div className="af-body">
          {activityLogs.length === 0 ? (
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
          )}
        </div>

        <div className="af-footer font-mono">
          <span>Total events recorded: {activityLogs.length}</span>
          <span className="af-footer-hint">Auto-refreshes every 5 seconds</span>
        </div>
      </div>
    </div>
  );
};
