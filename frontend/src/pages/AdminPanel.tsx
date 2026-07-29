import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './AdminPanel.css';
import { MetricsPanel } from '../components/MetricsPanel';
import { useAdmin, usePublishRuns, useSystemStatus } from '../hooks/useAdmin';
import { useAnalytics } from '../hooks/useAnalytics';
import { formatETTime } from '../utils/time';
import { API_BASE } from '../config';

export const AdminPanel: React.FC = () => {
  const { triggerRun } = useAdmin();
  const { runs } = usePublishRuns(15);
  const { resetCircuitBreaker, status } = useSystemStatus();
  const [strategyFilter, setStrategyFilter] = useState<'all' | 'manna_basic' | 'manna_snd'>('all');
  const { analytics, refetch } = useAnalytics(strategyFilter);
  
  const [mode, setMode] = useState<'live' | 'dry_run'>('dry_run');
  const [market, setMarket] = useState<'FUTURES' | 'FOREX' | 'ALL'>('ALL');
  const [isTriggering, setIsTriggering] = useState(false);

  // Reset & Archive state
  const [showResetModal, setShowResetModal] = useState(false);
  const [archiveName, setArchiveName] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [archives, setArchives] = useState<any[]>([]);

  const fetchArchives = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/analytics/archives`);
      if (res.ok) {
        const data = await res.json();
        setArchives(data.archives || []);
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    fetchArchives();
  }, []);

  const handleTrigger = async () => {
    setIsTriggering(true);
    await triggerRun(mode, market);
    setTimeout(() => setIsTriggering(false), 1000);
  };

  const handleExportLiveCSV = () => {
    const url = strategyFilter && strategyFilter !== 'all'
      ? `${API_BASE}/api/admin/analytics/export-csv?strategy_id=${strategyFilter}`
      : `${API_BASE}/api/admin/analytics/export-csv`;
    window.open(url, '_blank');
  };

  const handleResetAnalytics = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsResetting(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/analytics/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archiveName: archiveName || `Archive Epoch (${new Date().toLocaleDateString()})` })
      });
      if (res.ok) {
        const data = await res.json();
        window.open(`${API_BASE}/api/admin/analytics/archives/${data.archiveId}/download`, '_blank');
        setShowResetModal(false);
        setArchiveName('');
        await refetch();
        await fetchArchives();
      }
    } catch (err) {
      alert('Failed to reset analytics: ' + err);
    } finally {
      setIsResetting(false);
    }
  };

  const summary = analytics?.summary;
  const strategies = analytics?.strategies || [];
  const invalidations = analytics?.invalidations;
  const killzones = analytics?.killzones;
  const recentOutcomes = analytics?.recentOutcomes || [];
  const lastScheduled = analytics?.lastScheduledScan;
  const triggers = analytics?.triggers;

  return (
    <div className="admin-panel">
      <header className="admin-header glass-card">
        <div className="container header-container">
          <Link to="/" className="back-btn">← Back to Dashboard</Link>
          <h1 className="admin-title">Manna Edge Markets — Strategy & Performance Analytics</h1>
        </div>
      </header>

      <main className="container admin-main">
        {/* Strategy Filter Tabs */}
        <div className="strategy-filter-tabs glass-card font-mono">
          <span className="filter-title">STRATEGY FILTER:</span>
          <button 
            className={`strat-tab ${strategyFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStrategyFilter('all')}
          >
            ⚡ All Strategies
          </button>
          <button 
            className={`strat-tab strat-basic ${strategyFilter === 'manna_basic' ? 'active' : ''}`}
            onClick={() => setStrategyFilter('manna_basic')}
          >
            🔵 Manna Basic
          </button>
          <button 
            className={`strat-tab strat-snd ${strategyFilter === 'manna_snd' ? 'active' : ''}`}
            onClick={() => setStrategyFilter('manna_snd')}
          >
            🟡 Manna SnD
          </button>
        </div>

        <MetricsPanel />

        {/* Strategy Performance Matrix Comparison Cards */}
        <div className="strategy-matrix-container">
          <h2 className="section-title font-mono">⚡ STRATEGY PERFORMANCE MATRIX</h2>
          <div className="strategy-cards-grid font-mono">
            {strategies.map((strat) => (
              <div key={strat.id} className={`strategy-card glass-card strat-border-${strat.id}`}>
                <div className="strat-card-header">
                  <span className={`strat-badge badge-${strat.id}`}>{strat.name}</span>
                  <span className="strat-tier-tag">{strat.tier.toUpperCase()} TIER</span>
                </div>

                <div className="strat-metric-row">
                  <span>Total Signals Generated:</span>
                  <span className="stat-val">{strat.totalSignals}</span>
                </div>

                <div className="strat-metric-row">
                  <span>Active Positions:</span>
                  <span className="stat-val text-gold">{strat.activeSignals}</span>
                </div>

                <div className="strat-metric-row">
                  <span>Resolved Trades:</span>
                  <span className="stat-val">{strat.resolvedSignals}</span>
                </div>

                <div className="strat-metric-row">
                  <span>Win Rate (%):</span>
                  <span className="stat-val text-green">{strat.winRate}% ({strat.wins}W / {strat.losses}L)</span>
                </div>

                <div className="strat-metric-row">
                  <span>Net Realized Return:</span>
                  <span className={`stat-val ${strat.totalRealizedR >= 0 ? 'text-green' : 'text-red'}`}>
                    {strat.totalRealizedR > 0 ? '+' : ''}{strat.totalRealizedR}R
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Header for CSV Export & Reset */}
        <div className="analytics-action-bar glass-card font-mono">
          <div className="action-bar-left">
            <span className="bar-title">📊 ANALYTICS TRACKING ENGINE</span>
            <span className="bar-desc">
              Currently viewing: <strong>{strategyFilter === 'all' ? 'All Strategies (Unified)' : strategyFilter === 'manna_basic' ? 'Manna Basic Strategy' : 'Manna SnD Strategy'}</strong>. Export raw CSV or reset epoch tracking.
            </span>
          </div>
          <div className="action-bar-btns">
            <button className="btn-export-csv font-mono" onClick={handleExportLiveCSV}>
              📥 Export CSV ({strategyFilter.toUpperCase()})
            </button>
            <button className="btn-reset-analytics font-mono" onClick={() => setShowResetModal(true)}>
              🔄 Save & Reset Analytics
            </button>
          </div>
        </div>

        {/* Reset Confirmation Modal */}
        {showResetModal && (
          <div className="reset-modal-backdrop">
            <div className="reset-modal-card glass-card animate-scale-up">
              <div className="modal-header">
                <h2>🔄 Archive Dataset & Reset Analytics</h2>
                <button className="close-btn" onClick={() => setShowResetModal(false)}>✕</button>
              </div>

              <div className="modal-body">
                <p>You are about to reset live analytics tracking. All current resolved trades, win rates, and durations will be **exported and saved to a permanent CSV archive** before resetting tracking anew.</p>
                
                <div className="archive-summary-box font-mono">
                  <div><strong>Total Trades to Archive:</strong> {summary?.totalTradesResolved || 0}</div>
                  <div><strong>Win Rate:</strong> {((summary?.winRate || 0) * 100).toFixed(1)}%</div>
                  <div><strong>Total Realized Return:</strong> {(summary?.totalRealizedR || 0) > 0 ? '+' : ''}{(summary?.totalRealizedR || 0).toFixed(2)}R</div>
                </div>

                <form onSubmit={handleResetAnalytics}>
                  <div className="form-group">
                    <label className="font-mono">Archive Epoch Name / Label</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Phase 1 — Baseline Strategy Test" 
                      value={archiveName}
                      onChange={e => setArchiveName(e.target.value)}
                      className="font-mono"
                      required
                    />
                  </div>

                  <div className="modal-actions">
                    <button type="button" className="btn-cancel font-mono" onClick={() => setShowResetModal(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn-confirm-reset font-mono" disabled={isResetting}>
                      {isResetting ? 'Archiving...' : '📥 SAVE TO CSV & RESET ANEW'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Last Session Scan & Trigger Separation Grid */}
        <div className="admin-grid analytics-grid">
          {/* Last Scheduled Session Scan */}
          <div className="admin-card glass-card">
            <h2>Last Scheduled Session Scan</h2>
            {lastScheduled ? (
              <>
                <div className="analytics-stat-row">
                  <span className="stat-label">Session:</span>
                  <span className="stat-val font-mono text-gold">{lastScheduled.killzone?.toUpperCase()}</span>
                </div>
                <div className="analytics-stat-row">
                  <span className="stat-label">Execution Time (ET):</span>
                  <span className="stat-val font-mono">{formatETTime(lastScheduled.run_timestamp || lastScheduled.created_at)}</span>
                </div>
                <div className="analytics-stat-row">
                  <span className="stat-label">Setups Created:</span>
                  <span className="stat-val font-mono text-green">+{lastScheduled.setups_created || 0}</span>
                </div>
                <div className="analytics-stat-row">
                  <span className="stat-label">Setups Invalidated:</span>
                  <span className="stat-val font-mono text-red">{lastScheduled.setups_invalidated || 0}</span>
                </div>
                <div className="analytics-stat-row">
                  <span className="stat-label">Active Preserved:</span>
                  <span className="stat-val font-mono">{lastScheduled.setups_preserved || 0}</span>
                </div>
              </>
            ) : (
              <div className="card-desc">No scheduled session scans logged yet.</div>
            )}
          </div>

          {/* Trigger Separation Analytics */}
          <div className="admin-card glass-card">
            <h2>Trigger Analytics Breakdown</h2>
            <div className="analytics-stat-row">
              <span className="stat-label">📅 Scheduled Session Runs:</span>
              <span className="stat-val font-mono">{triggers?.scheduled.totalRuns || 0} scans</span>
            </div>
            <div className="analytics-stat-row">
              <span className="stat-label">Scheduled Setups Created:</span>
              <span className="stat-val font-mono text-green">+{triggers?.scheduled.created || 0}</span>
            </div>
            <div className="analytics-stat-row">
              <span className="stat-label">⚙️ Manual Admin Triggers:</span>
              <span className="stat-val font-mono">{triggers?.manual.totalRuns || 0} runs</span>
            </div>
            <div className="analytics-stat-row">
              <span className="stat-label">Manual Setups Created:</span>
              <span className="stat-val font-mono text-green">+{triggers?.manual.created || 0}</span>
            </div>
          </div>
        </div>

        {/* Analytics Breakdown Grid */}
        <div className="admin-grid analytics-grid">
          {/* Advanced Quantitative Performance Metrics */}
          <div className="admin-card glass-card">
            <h2>Quantitative Edge Metrics</h2>
            <div className="analytics-stat-row">
              <span className="stat-label">🔥 Profit Factor:</span>
              <span className="stat-val text-gold font-mono">
                {summary?.profitFactor !== undefined ? summary.profitFactor.toFixed(2) : 'N/A'}
              </span>
            </div>
            <div className="analytics-stat-row">
              <span className="stat-label">🎯 Trade Expectancy:</span>
              <span className={`stat-val ${(summary?.expectancyR || 0) >= 0 ? 'text-green' : 'text-red'} font-mono`}>
                {(summary?.expectancyR || 0) > 0 ? '+' : ''}{summary?.expectancyR || 0.0}R / trade
              </span>
            </div>
            <div className="analytics-stat-row">
              <span className="stat-label">📉 Max Peak-to-Trough Drawdown:</span>
              <span className="stat-val text-red font-mono">
                -{summary?.maxDrawdownR || 0.0}R
              </span>
            </div>
            <div className="analytics-stat-row">
              <span className="stat-label">🏆 Max Win Streak:</span>
              <span className="stat-val text-green font-mono">
                {summary?.maxWinsStreak || 0} in a row
              </span>
            </div>
            <div className="analytics-stat-row">
              <span className="stat-label">🛑 Max Loss Streak:</span>
              <span className="stat-val text-red font-mono">
                {summary?.maxLossesStreak || 0} in a row
              </span>
            </div>
            <div className="analytics-stat-row">
              <span className="stat-label">Total Realized Return:</span>
              <span className={`stat-val ${(summary?.totalRealizedR || 0) >= 0 ? 'text-green' : 'text-red'} font-mono`}>
                {(summary?.totalRealizedR || 0) > 0 ? '+' : ''}{(summary?.totalRealizedR || 0).toFixed(2)}R
              </span>
            </div>
            <div className="analytics-stat-row">
              <span className="stat-label">⚡ Avg Time to Fill:</span>
              <span className="stat-val font-mono text-gold">
                {summary?.avgTimeToFillMinutes ? `${summary.avgTimeToFillMinutes} mins` : '--'}
              </span>
            </div>
            <div className="analytics-stat-row">
              <span className="stat-label">⏳ Avg Trade Duration:</span>
              <span className="stat-val font-mono text-gold">
                {summary?.avgHoldingDurationMinutes ? `${summary.avgHoldingDurationMinutes} mins` : '--'}
              </span>
            </div>
          </div>

          {/* Invalidations Breakdown */}
          <div className="admin-card glass-card">
            <h2>Invalidation Reasons Audit</h2>
            <div className="invalidation-reasons-list">
              {invalidations?.byReason && Object.keys(invalidations.byReason).length > 0 ? (
                Object.entries(invalidations.byReason).map(([reason, count]) => (
                  <div key={reason} className="reason-item">
                    <span className="reason-code">{reason}</span>
                    <span className="reason-count badge">{count}</span>
                  </div>
                ))
              ) : (
                <div className="card-desc">No invalidation reasons logged yet.</div>
              )}
            </div>
          </div>
        </div>

        {/* Asset Performance Breakdown Table */}
        {analytics?.assetPerformance && Object.keys(analytics.assetPerformance).length > 0 && (
          <div className="runs-card glass-card">
            <h2>Asset Performance Matrix</h2>
            <div className="table-responsive">
              <table className="runs-table">
                <thead>
                  <tr>
                    <th>Instrument</th>
                    <th>Market</th>
                    <th>Total Trades</th>
                    <th>Wins / Losses</th>
                    <th>Win Rate</th>
                    <th>Net Return (R)</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(analytics.assetPerformance).map(([inst, perf]: [string, any]) => {
                    const wr = perf.total > 0 ? ((perf.wins / perf.total) * 100).toFixed(1) : '0.0';
                    return (
                      <tr key={inst}>
                        <td className="font-mono" style={{ fontWeight: 800 }}>{inst}</td>
                        <td className="mode-badge">{perf.market.toUpperCase()}</td>
                        <td className="font-mono">{perf.total}</td>
                        <td className="font-mono">{perf.wins}W / {perf.losses}L</td>
                        <td className="font-mono text-green">{wr}%</td>
                        <td className={`font-mono ${perf.plR >= 0 ? 'text-green' : 'text-red'}`} style={{ fontWeight: 800 }}>
                          {perf.plR > 0 ? '+' : ''}{perf.plR.toFixed(2)}R
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Historical Saved Archives Section */}
        {archives.length > 0 && (
          <div className="runs-card glass-card">
            <h2>Historical Saved Analytics Archives</h2>
            <div className="table-responsive">
              <table className="runs-table">
                <thead>
                  <tr>
                    <th>Epoch Name</th>
                    <th>Date Range Captured</th>
                    <th>Total Trades</th>
                    <th>Win Rate</th>
                    <th>Net Realized Return</th>
                    <th>Avg Fill Time</th>
                    <th>Avg Hold Duration</th>
                    <th>CSV Export</th>
                  </tr>
                </thead>
                <tbody>
                  {archives.map(arch => {
                    const wr = arch.win_rate !== undefined ? `${(arch.win_rate * 100).toFixed(1)}%` : '--%';
                    const plR = arch.total_realized_r || 0;
                    return (
                      <tr key={arch.id}>
                        <td><strong>{arch.archive_name}</strong></td>
                        <td className="font-mono" style={{ fontSize: '0.78rem' }}>
                          {new Date(arch.captured_from).toLocaleDateString()} → {new Date(arch.captured_until).toLocaleDateString()}
                        </td>
                        <td>{arch.total_resolved}</td>
                        <td>{wr}</td>
                        <td className={plR >= 0 ? 'text-green font-mono' : 'text-red font-mono'}>
                          {plR > 0 ? '+' : ''}{plR.toFixed(2)}R
                        </td>
                        <td className="font-mono">{arch.avg_fill_time_min ? `${arch.avg_fill_time_min}m` : '--'}</td>
                        <td className="font-mono">{arch.avg_hold_duration_min ? `${arch.avg_hold_duration_min}m` : '--'}</td>
                        <td>
                          <a 
                            href={`${API_BASE}/api/admin/analytics/archives/${arch.id}/download`} 
                            target="_blank" 
                            rel="noreferrer"
                            className="btn-download-archive font-mono"
                          >
                            📥 Download CSV
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Killzones Performance Table in R */}
        <div className="runs-card glass-card">
          <h2>Killzone Session Performance (R)</h2>
          <div className="table-responsive">
            <table className="runs-table">
              <thead>
                <tr>
                  <th>Killzone Session</th>
                  <th>Total Setups</th>
                  <th>Wins</th>
                  <th>Losses</th>
                  <th>Win Rate</th>
                  <th>Realized Return (R)</th>
                </tr>
              </thead>
              <tbody>
                {killzones && Object.entries(killzones).map(([kz, data]) => {
                  const wr = data.total > 0 ? `${((data.wins / data.total) * 100).toFixed(1)}%` : '--%';
                  const plR = data.plR || 0;
                  return (
                    <tr key={kz}>
                      <td><strong>{kz.toUpperCase().replace('_', ' ')}</strong></td>
                      <td>{data.total}</td>
                      <td className="text-green">{data.wins}</td>
                      <td className="text-red">{data.losses}</td>
                      <td>{wr}</td>
                      <td className={plR >= 0 ? 'text-green font-mono' : 'text-red font-mono'}>
                        {plR > 0 ? '+' : ''}{plR.toFixed(2)}R
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Controls Grid */}
        <div className="admin-grid">
          <div className="admin-card glass-card trigger-card">
            <h2>Trigger Manual Admin Run</h2>
            <p className="card-desc">Manually trigger the Discovery Engine. Tracked separately from scheduled boundary runs.</p>
            
            <div className="form-group">
              <label>Run Mode</label>
              <select value={mode} onChange={e => setMode(e.target.value as any)}>
                <option value="dry_run">Dry Run (No execution)</option>
                <option value="live">Live (Execute actions)</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Market Scope</label>
              <select value={market} onChange={e => setMarket(e.target.value as any)}>
                <option value="ALL">All Markets</option>
                <option value="FUTURES">Futures Only</option>
                <option value="FOREX">Forex Only</option>
              </select>
            </div>
            
            <button 
              className={`btn-trigger ${isTriggering ? 'loading' : ''}`}
              onClick={handleTrigger}
              disabled={isTriggering}
            >
              {isTriggering ? 'Triggering...' : '▶ TRIGGER MANUAL RUN'}
            </button>
          </div>

          <div className="admin-card glass-card cb-card">
            <h2>Circuit Breaker Safety</h2>
            <p className="card-desc">Safety mechanism for repeated strategy failures.</p>
            
            <div className={`cb-status-large ${status.status === 'ok' ? 'ok' : 'tripped'}`}>
              <div className="cb-icon">{status.status === 'ok' ? '✅' : '🚨'}</div>
              <div className="cb-info">
                <h3>{status.status === 'ok' ? 'System OK' : 'TRIPPED'}</h3>
                <span>Failures: {status.failureCount} / 5 threshold</span>
                {status.status !== 'ok' && (status.circuitBreaker?.resetsAt || status.resetsAt) && (
                  <div className="cb-restores">
                    Restores: {formatETTime(status.circuitBreaker?.resetsAt || status.resetsAt)}
                  </div>
                )}
              </div>
            </div>
            
            <button 
              className="btn-reset-cb" 
              onClick={resetCircuitBreaker}
              disabled={status.status === 'ok'}
            >
              RESET CIRCUIT BREAKER
            </button>
          </div>
        </div>

        {/* Recent Outcomes Table in R */}
        {recentOutcomes.length > 0 && (
          <div className="runs-card glass-card">
            <h2>Recent Resolved Trade Outcomes</h2>
            <div className="table-responsive">
              <table className="runs-table">
                <thead>
                  <tr>
                    <th>Symbol & Market</th>
                    <th>📡 Discovered (ET)</th>
                    <th>⚡ Entered (ET)</th>
                    <th>🏁 Exited (ET)</th>
                    <th>⏱️ Time to Fill</th>
                    <th>⏳ Duration</th>
                    <th>Outcome</th>
                    <th>Result (R)</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOutcomes.map(o => {
                    const isWin = o.outcome_type.includes('tp');
                    const rVal = o.realized_r ?? 0;
                    return (
                      <tr key={o.id}>
                        <td>
                          <strong>{o.instrument || 'SETUP'}</strong>{' '}
                          <span className="market-tag font-mono">{(o.market || o.setup_market || 'futures').toUpperCase()}</span>
                        </td>
                        <td className="font-mono">{formatETTime(o.time_signaled || o.created_at)}</td>
                        <td className="font-mono text-gold">{o.time_entered ? formatETTime(o.time_entered) : '--'}</td>
                        <td className="font-mono text-green">{o.time_exited ? formatETTime(o.time_exited) : '--'}</td>
                        <td className="font-mono">{o.time_to_fill_min !== undefined ? `${o.time_to_fill_min}m` : '--'}</td>
                        <td className="font-mono">{o.holding_duration_min !== undefined ? `${o.holding_duration_min}m` : '--'}</td>
                        <td>
                          <span className={`state-badge ${isWin ? 'committed' : 'rolled_back'}`}>
                            {o.outcome_type.toUpperCase()}
                          </span>
                        </td>
                        <td className={rVal >= 0 ? 'text-green font-mono' : 'text-red font-mono'}>
                          {rVal > 0 ? '+' : ''}{rVal.toFixed(2)}R
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Recent Publish Runs */}
        <div className="runs-card glass-card">
          <h2>Publish Run History (Scheduled vs Manual)</h2>
          <div className="table-responsive">
            <table className="runs-table">
              <thead>
                <tr>
                  <th>Time (ET)</th>
                  <th>Killzone</th>
                  <th>Trigger Source</th>
                  <th>Mode</th>
                  <th>State</th>
                  <th>Created</th>
                  <th>Invalidated</th>
                  <th>Preserved</th>
                </tr>
              </thead>
              <tbody>
                {runs.map(run => {
                  const runTimestamp = run.timestamp || (run as any).run_timestamp || (run as any).created_at;
                  const runMode = run.mode || (run as any).run_mode || 'live';
                  const runState = run.state || (run as any).run_state || 'committed';
                  const triggerType = (run as any).trigger_type || 'scheduled';
                  return (
                    <tr key={run.id}>
                      <td>{formatETTime(runTimestamp)}</td>
                      <td>{run.killzone}</td>
                      <td>
                        <span className={`badge ${triggerType === 'manual' ? 'badge-manual' : 'badge-scheduled'}`}>
                          {triggerType === 'manual' ? '⚙️ Manual' : '📅 Scheduled'}
                        </span>
                      </td>
                      <td>
                        <span className={`mode-badge ${runMode}`}>{String(runMode).replace('_', ' ')}</span>
                      </td>
                      <td>
                        <span className={`state-badge ${runState}`}>{runState}</span>
                      </td>
                      <td>{run.created ?? (run as any).setups_created ?? 0}</td>
                      <td>{run.invalidated ?? (run as any).setups_invalidated ?? 0}</td>
                      <td>{run.preserved ?? (run as any).setups_preserved ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};
