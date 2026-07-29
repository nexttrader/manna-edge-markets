import React from 'react';
import './MetricsPanel.css';
import { useSystemStatus, usePublishRuns } from '../hooks/useAdmin';
import { useAnalytics } from '../hooks/useAnalytics';
import { formatETTime } from '../utils/time';

export const MetricsPanel: React.FC = () => {
  const { status } = useSystemStatus();
  const { runs } = usePublishRuns(1);
  const { analytics } = useAnalytics();
  const lastRun = runs[0];

  const summary = analytics?.summary;
  const markets = analytics?.markets;
  const invalidations = analytics?.invalidations;

  const winRateText = summary ? `${(summary.winRate * 100).toFixed(1)}%` : '--%';
  const activeFutures = markets?.futures.active ?? 0;
  const activeForex = markets?.forex.active ?? 0;
  const totalActive = summary?.activeSetupsCount ?? (activeFutures + activeForex);

  const topReason = invalidations?.byReason 
    ? Object.entries(invalidations.byReason).sort((a, b) => b[1] - a[1])[0]?.[0] || 'NONE'
    : 'NONE';

  return (
    <div className="metrics-panel">
      <div className="metric-card glass-card">
        <div className="metric-title">Win Rate</div>
        <div className="metric-val text-gold">{winRateText}</div>
        <div className="metric-sub">{summary ? `${summary.wins} Wins / ${summary.losses} Losses` : '0 trades'}</div>
      </div>
      
      <div className="metric-card glass-card">
        <div className="metric-title">Active Setups</div>
        <div className="metric-val">{totalActive}</div>
        <div className="metric-sub">{activeFutures} Futures / {activeForex} Forex</div>
      </div>
      
      <div className="metric-card glass-card">
        <div className="metric-title">Total Invalidations</div>
        <div className="metric-val">{invalidations?.total ?? 0}</div>
        <div className="metric-sub text-amber">Top Reason: {topReason}</div>
      </div>
      
      <div className="metric-card glass-card">
        <div className="metric-title">System Status</div>
        <div className={`metric-val ${status.status === 'ok' ? 'text-green' : 'text-red'}`}>
          {status.status === 'ok' ? 'OK' : 'TRIPPED'}
        </div>
        <div className="metric-sub">
          {status.status !== 'ok' && (status.circuitBreaker?.resetsAt || status.resetsAt)
            ? `Restores at ${formatETTime(status.circuitBreaker?.resetsAt || status.resetsAt)}`
            : (lastRun ? `Last Run: ${formatETTime(lastRun.timestamp)}` : 'No recent runs')
          }
        </div>
      </div>
    </div>
  );
};
