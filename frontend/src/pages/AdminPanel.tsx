import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './AdminPanel.css';
import { MetricsPanel } from '../components/MetricsPanel';
import { useAdmin, usePublishRuns, useSystemStatus, useStrategies } from '../hooks/useAdmin';
import { useAnalytics } from '../hooks/useAnalytics';
import { useSetups } from '../hooks/useSetups';
import { useAuth } from '../context/AuthContext';
import { formatETTime } from '../utils/time';
import { API_BASE } from '../config';
import { SignalReplaceModal } from '../components/SignalReplaceModal';

export const AdminPanel: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { triggerRun, disableSignal } = useAdmin();
  const { runs } = usePublishRuns(15);
  const { resetCircuitBreaker, status } = useSystemStatus();
  const { strategies: dbStrategies, toggleStrategy } = useStrategies();
  const { setups: activeSetupsList, refetch: refetchActiveSetups } = useSetups();

  const [rescanCandidate, setRescanCandidate] = useState<any | null>(null);
  const [rescanCurrentSetup, setRescanCurrentSetup] = useState<any | null>(null);
  const [rescanningId, setRescanningId] = useState<string | null>(null);

  const handleAdminSingleRescan = async (setup: any) => {
    try {
      setRescanningId(setup.id);
      const res = await fetch(`${API_BASE}/api/admin/single-asset-rescan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setupId: setup.id, instrument: setup.instrument, market: setup.market })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rescan failed');

      if (data.found && data.candidate) {
        setRescanCurrentSetup(setup);
        setRescanCandidate(data.candidate);
      } else {
        alert(data.message || `No new candidate setup discovered for ${setup.instrument}.`);
      }
    } catch (err: any) {
      alert(`⚠️ ${err.message || 'Rescan failed'}`);
    } finally {
      setRescanningId(null);
    }
  };

  const [strategyFilter, setStrategyFilter] = useState<'all' | 'manna_basic' | 'manna_snd'>('all');
  const { analytics, refetch: refetchAnalytics } = useAnalytics(strategyFilter);
  
  const [mode, setMode] = useState<'live' | 'dry_run'>('dry_run');
  const [market, setMarket] = useState<'FUTURES' | 'FOREX' | 'ALL'>('ALL');
  const [isTriggering, setIsTriggering] = useState(false);
  const [disablingId, setDisablingId] = useState<string | null>(null);

  // Reset & Archive state
  const [showResetModal, setShowResetModal] = useState(false);
  const [archiveName, setArchiveName] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [archives, setArchives] = useState<any[]>([]);

  const [outcomesPage, setOutcomesPage] = useState(1);
  const OUTCOMES_PER_PAGE = 10;

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

  const [triggerStrategy, setTriggerStrategy] = useState<'all' | 'manna_basic' | 'manna_snd'>('all');

  const handleTrigger = async () => {
    setIsTriggering(true);
    await triggerRun(mode, market, triggerStrategy);
    setTimeout(() => {
      setIsTriggering(false);
      refetchActiveSetups();
      refetchAnalytics();
    }, 1000);
  };

  const handleToggleStrategy = async (strategyId: string, currentEnabled: boolean) => {
    const success = await toggleStrategy(strategyId, !currentEnabled);
    if (success) {
      refetchAnalytics();
    }
  };

  const handleDisableSignal = async (signalId: string, signalMarket?: string) => {
    setDisablingId(signalId);
    try {
      const m = signalMarket ? signalMarket.toLowerCase() : 'futures';
      const success = await disableSignal(signalId, m);
      if (success) {
        await refetchActiveSetups();
        await refetchAnalytics();
      }
    } finally {
      setDisablingId(null);
    }
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
        await refetchAnalytics();
        await fetchArchives();
        await refetchActiveSetups();
      }
    } catch (err) {
      alert('Failed to reset analytics: ' + err);
    } finally {
      setIsResetting(false);
    }
  };

  const summary = analytics?.summary;
  const strategies = analytics?.strategies || [];
  const killzones = analytics?.killzones;
  const recentOutcomes = analytics?.recentOutcomes || [];
  const convictionPerformance = analytics?.convictionPerformance;
  const totalOutcomePages = Math.ceil(recentOutcomes.length / OUTCOMES_PER_PAGE) || 1;
  const paginatedOutcomes = recentOutcomes.slice((outcomesPage - 1) * OUTCOMES_PER_PAGE, outcomesPage * OUTCOMES_PER_PAGE);
  const lastScheduled = analytics?.lastScheduledScan;
  const triggers = analytics?.triggers;

  return (
    <div className="admin-panel">
      <header className="admin-header glass-card">
        <div className="container header-container">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Link to="/" className="back-btn">← Back to Dashboard</Link>
            <h1 className="admin-title">Manna Edge Markets — Strategy & Performance Admin Desk</h1>
          </div>
          <div className="admin-user-profile font-mono" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="user-badge" style={{ background: 'rgba(255, 171, 0, 0.2)', border: '1px solid #ffab00', color: '#ffab00', padding: '4px 10px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 800 }}>
              ⚙️ ADMIN: {user?.name || 'System Admin'}
            </span>
            <button 
              className="btn-logout font-mono" 
              style={{ background: 'rgba(255, 23, 68, 0.2)', border: '1px solid #ff1744', color: '#ff1744', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}
              onClick={() => { logout(); navigate('/login'); }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="container admin-main">
        {/* Strategy Control Panel (Enable / Disable Strategies) */}
        <div className="admin-strategy-toggles-container glass-card font-mono" style={{ padding: '20px', marginBottom: '24px', borderRadius: '10px', background: 'var(--kdt-purple-card)', border: '1px solid var(--kdt-purple-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 className="section-title" style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--kdt-gold)', margin: 0 }}>
              ⚙️ STRATEGY ENGINE CONTROLS (ENABLE / DISABLE DISCOVERY)
            </h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--kdt-white-muted)' }}>
              Disabled strategies will be automatically skipped during scheduled & manual discovery runs.
            </span>
          </div>

          <div className="strategy-toggles-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
            {dbStrategies.map(strat => (
              <div 
                key={strat.id} 
                className="strategy-toggle-card glass-card"
                style={{
                  padding: '16px',
                  borderRadius: '8px',
                  border: `1px solid ${strat.enabled ? (strat.id === 'manna_snd' ? '#ffab00' : '#00e5ff') : 'rgba(255,255,255,0.1)'}`,
                  background: strat.enabled ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.3)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: strat.enabled ? '#ffffff' : 'rgba(255,255,255,0.4)', marginBottom: '4px' }}>
                    {strat.name} ({strat.id})
                  </div>
                  <div style={{ fontSize: '0.75rem', color: strat.enabled ? '#00e5ff' : '#ff1744' }}>
                    ● STATUS: {strat.enabled ? 'ONLINE & SCANNING' : 'OFFLINE (DISABLED BY ADMIN)'}
                  </div>
                </div>

                <button
                  className="font-mono"
                  onClick={() => handleToggleStrategy(strat.id, strat.enabled)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    fontWeight: 900,
                    cursor: 'pointer',
                    background: strat.enabled ? '#ff1744' : '#00e5ff',
                    color: strat.enabled ? '#ffffff' : '#090314',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                  }}
                >
                  {strat.enabled ? '⏹ TURN OFF' : '▶ TURN ON'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Active Signals Control Desk (Manual Signal Invalidation) */}
        <div className="admin-signal-control-desk glass-card font-mono" style={{ padding: '20px', marginBottom: '24px', borderRadius: '10px', background: 'var(--kdt-purple-card)', border: '1px solid var(--kdt-purple-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 className="section-title" style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--kdt-gold)', margin: 0 }}>
              📡 ACTIVE SIGNALS CONTROL DESK ({activeSetupsList.length} ACTIVE)
            </h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--kdt-white-muted)' }}>
              Manually disable or invalidate individual active signals across Futures & Forex.
            </span>
          </div>

          {activeSetupsList.length > 0 ? (
            <div className="table-responsive">
              <table className="runs-table">
                <thead>
                  <tr>
                    <th>Symbol & Market</th>
                    <th>Strategy</th>
                    <th>Bias</th>
                    <th>Entry Zone</th>
                    <th>Stop Loss</th>
                    <th>TP1 / TP2</th>
                    <th>State</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {activeSetupsList.map((setup: any) => {
                    const stratName = setup.strategy_id === 'manna_snd' ? 'Manna SnD' : 'Manna Basic';
                    const isDisabling = disablingId === setup.id;
                    const isLong = (setup.bias || 'long').toLowerCase() === 'long';

                    return (
                      <tr key={setup.id}>
                        <td>
                          <strong>{setup.instrument}</strong>{' '}
                          <span className="market-tag">{(setup.market || 'futures').toUpperCase()}</span>
                        </td>
                        <td>
                          <span className={`strat-badge badge-${setup.strategy_id || 'manna_basic'}`}>
                            {stratName}
                          </span>
                        </td>
                        <td>
                          <span className={isLong ? 'text-green' : 'text-red'}>
                            {isLong ? '▲ LONG' : '▼ SHORT'}
                          </span>
                        </td>
                        <td>{setup.entry_zone_mid || setup.entryMin}</td>
                        <td className="text-red">{setup.stop || setup.levels?.stopLoss}</td>
                        <td className="text-green">
                          {setup.tp1 || setup.levels?.takeProfit1} / {setup.tp2 || setup.levels?.takeProfit2 || '--'}
                        </td>
                        <td>
                          <span className="state-badge committed">
                            {(setup.signal_state || setup.state || 'active').toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {(setup.signal_state || setup.state || '').toLowerCase() === 'awaiting_entry' && (
                              <button
                                className="font-mono"
                                style={{
                                  background: 'rgba(0, 229, 255, 0.15)',
                                  border: '1px solid #00e5ff',
                                  color: '#00e5ff',
                                  padding: '4px 10px',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontWeight: 800,
                                  fontSize: '0.75rem'
                                }}
                                onClick={() => handleAdminSingleRescan(setup)}
                                disabled={rescanningId === setup.id}
                                title="Run single-asset rescan for this pending signal"
                              >
                                {rescanningId === setup.id ? '⏳ Scanning...' : '🔍 Rescan & Replace'}
                              </button>
                            )}
                            <button
                              className="btn-disable-signal font-mono"
                              style={{
                                background: 'rgba(255, 23, 68, 0.2)',
                                border: '1px solid #ff1744',
                                color: '#ff1744',
                                padding: '4px 10px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontWeight: 800,
                                fontSize: '0.75rem'
                              }}
                              onClick={() => {
                                const confirmed = window.confirm(`⚠️ CONFIRMATION REQUIRED:\n\nAre you sure you want to disable and invalidate the signal for ${setup.instrument}? This will mark it as non-tradable.`);
                                if (confirmed) {
                                  handleDisableSignal(setup.id, setup.market);
                                }
                              }}
                              disabled={isDisabling}
                            >
                              {isDisabling ? 'Disabling...' : '⛔ DISABLE SIGNAL'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ color: 'var(--kdt-white-muted)', padding: '16px 0' }}>
              No active signals currently open in the database.
            </div>
          )}
        </div>

        {/* Strategy Filter Tabs */}
        <div className="strategy-filter-tabs glass-card font-mono">
          <span className="filter-title">STRATEGY ANALYTICS FILTER:</span>
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
            {analytics?.collective && (
              <div className="strategy-card glass-card strat-border-collective" style={{ borderColor: '#00e5ff', background: 'rgba(0, 229, 255, 0.05)' }}>
                <div className="strat-card-header">
                  <span className="strat-badge" style={{ background: '#00e5ff', color: '#090314', fontWeight: 800 }}>🌐 COLLECTIVE (ALL STRATEGIES)</span>
                  <span className="strat-tier-tag" style={{ borderColor: '#00e5ff', color: '#00e5ff' }}>PORTFOLIO WIDE</span>
                </div>

                <div className="strat-metric-row">
                  <span>Total Signals Generated:</span>
                  <span className="stat-val">{analytics.collective.totalSignals}</span>
                </div>

                <div className="strat-metric-row">
                  <span>Active Positions:</span>
                  <span className="stat-val text-gold">{analytics.collective.activeSignals}</span>
                </div>

                <div className="strat-metric-row">
                  <span>Resolved Trades:</span>
                  <span className="stat-val">{analytics.collective.resolvedSignals}</span>
                </div>

                <div className="strat-metric-row">
                  <span>Win Rate (%):</span>
                  <span className="stat-val text-green">{analytics.collective.winRate}% ({analytics.collective.wins}W / {analytics.collective.losses}L)</span>
                </div>

                <div className="strat-metric-row">
                  <span>Net Realized Return:</span>
                  <span className={`stat-val ${analytics.collective.totalRealizedR >= 0 ? 'text-green' : 'text-red'}`}>
                    {analytics.collective.totalRealizedR > 0 ? '+' : ''}{analytics.collective.totalRealizedR}R
                  </span>
                </div>
              </div>
            )}

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

        {/* Archived Datasets History Table */}
        {archives.length > 0 && (
          <div className="runs-card glass-card font-mono" style={{ marginBottom: '24px' }}>
            <h2>Historical Archived Datasets ({archives.length})</h2>
            <div className="table-responsive">
              <table className="runs-table">
                <thead>
                  <tr>
                    <th>Archive Epoch Name</th>
                    <th>Captured Date Range</th>
                    <th>Resolved Trades</th>
                    <th>Win Rate</th>
                    <th>Net Realized R</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {archives.map((arch: any) => (
                    <tr key={arch.id}>
                      <td><strong>{arch.archive_name}</strong></td>
                      <td>{arch.captured_from?.slice(0, 10)} to {arch.captured_until?.slice(0, 10)}</td>
                      <td>{arch.total_resolved}</td>
                      <td className="text-green">{(arch.win_rate * 100).toFixed(1)}%</td>
                      <td className={arch.total_realized_r >= 0 ? 'text-green' : 'text-red'}>
                        {arch.total_realized_r > 0 ? '+' : ''}{arch.total_realized_r.toFixed(2)}R
                      </td>
                      <td>
                        <a 
                          href={`${API_BASE}/api/admin/analytics/archives/${arch.id}/download`}
                          target="_blank" 
                          rel="noreferrer"
                          style={{ color: '#00e5ff', textDecoration: 'none', fontWeight: 700 }}
                        >
                          📥 Download CSV
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
            <h2>Trigger Source Metrics (Scheduled vs Manual)</h2>
            <div className="analytics-stat-row">
              <span className="stat-label">📅 Scheduled Runs:</span>
              <span className="stat-val font-mono">{triggers?.scheduled?.totalRuns || 0} runs (+{triggers?.scheduled?.created || 0} setups)</span>
            </div>
            <div className="analytics-stat-row">
              <span className="stat-label">⚙️ Manual Triggers:</span>
              <span className="stat-val font-mono">{triggers?.manual?.totalRuns || 0} triggers (+{triggers?.manual?.created || 0} setups)</span>
            </div>
          </div>
        </div>

        {/* Killzones Performance Table in R */}
        {killzones && (
          <div className="runs-card glass-card font-mono" style={{ marginBottom: '24px' }}>
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
                  {Object.entries(killzones as Record<string, any>).map(([kz, data]) => {
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
        )}

        {/* Conviction Score Performance Influence Tracker */}
        {convictionPerformance && (
          <div className="runs-card glass-card font-mono" style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h2 style={{ margin: 0, color: 'var(--kdt-gold)' }}>🎯 Conviction Score Performance Influence Tracker</h2>
              <span className="badge badge-manual font-mono">WIN RATE CORRELATION</span>
            </div>
            <p style={{ color: 'var(--kdt-text-muted)', fontSize: '0.85rem', marginBottom: '16px' }}>
              Tracks how AI conviction scores (0–100%) influence winning trade outcomes, profit factor, and return expectancy (R).
            </p>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '14px' }}>
              {Object.entries(convictionPerformance as Record<string, any>).map(([key, data]) => {
                const isHigh = key === 'high';
                const isMed = key === 'medium';
                return (
                  <div 
                    key={key} 
                    style={{ 
                      background: isHigh ? 'rgba(0, 229, 255, 0.08)' : isMed ? 'rgba(255, 215, 0, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                      border: `1px solid ${isHigh ? '#00e5ff' : isMed ? '#ffd700' : 'rgba(255, 255, 255, 0.1)'}`,
                      borderRadius: '8px',
                      padding: '14px'
                    }}
                  >
                    <div style={{ fontSize: '0.85rem', color: isHigh ? '#00e5ff' : isMed ? '#ffd700' : '#aaa', fontWeight: 800, marginBottom: '6px' }}>
                      {data.label}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                      <span style={{ fontSize: '1.3rem', fontWeight: 900 }} className={data.winRate >= 50 ? 'text-green' : 'text-red'}>
                        {data.total > 0 ? `${data.winRate}%` : '--'}
                      </span>
                      <span style={{ fontSize: '0.78rem', color: '#888' }}>
                        {data.wins}W / {data.losses}L ({data.total} trades)
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                      <span>Net Return:</span>
                      <span className={data.plR >= 0 ? 'text-green font-mono' : 'text-red font-mono'} style={{ fontWeight: 800 }}>
                        {data.plR > 0 ? '+' : ''}{data.plR.toFixed(2)}R
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Insights Banner */}
            <div style={{ background: 'rgba(0, 229, 255, 0.08)', borderLeft: '4px solid #00e5ff', padding: '10px 14px', borderRadius: '4px', fontSize: '0.82rem', color: '#e2e8f0' }}>
              <strong>💡 Conviction Insight:</strong> Setups with Ultra High Conviction (≥90%) demonstrate strong structure alignment and higher win rates. High conviction setups deliver consistent risk-adjusted returns (R).
            </div>
          </div>
        )}

        {/* Recent Resolved Trade Outcomes (10 per page pagination) */}
        {recentOutcomes.length > 0 && (
          <div className="runs-card glass-card font-mono" style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0 }}>Recent Resolved Trade Outcomes ({recentOutcomes.length})</h2>
              <span className="stat-val font-mono text-gold" style={{ fontSize: '0.85rem' }}>
                Showing 10 per page (Page {outcomesPage} of {totalOutcomePages})
              </span>
            </div>
            <div className="table-responsive">
              <table className="runs-table">
                <thead>
                  <tr>
                    <th>Symbol & Market</th>
                    <th>🎯 Conviction</th>
                    <th>📡 Discovered (ET)</th>
                    <th>⚡ Entered (ET)</th>
                    <th>🏁 Exited (ET)</th>
                    <th>⏱️ Fill Time</th>
                    <th>⏳ Duration</th>
                    <th>Outcome</th>
                    <th>Result (R)</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedOutcomes.map((o: any) => {
                    const isWin = o.outcome_type?.includes('tp');
                    const rVal = o.realized_r ?? 0;
                    return (
                      <tr key={o.id}>
                        <td>
                          <strong>{o.instrument || 'SETUP'}</strong>{' '}
                          <span className="market-tag font-mono">{(o.market || o.setup_market || 'futures').toUpperCase()}</span>
                        </td>
                        <td className="font-mono text-gold">
                          <strong>{o.conviction_score || 85}%</strong>
                        </td>
                        <td className="font-mono">{formatETTime(o.time_signaled || o.created_at)}</td>
                        <td className="font-mono text-gold">{o.time_entered ? formatETTime(o.time_entered) : '--'}</td>
                        <td className="font-mono text-green">{o.time_exited ? formatETTime(o.time_exited) : '--'}</td>
                        <td className="font-mono">{o.time_to_fill_min !== undefined ? `${o.time_to_fill_min}m` : '--'}</td>
                        <td className="font-mono">{o.holding_duration_min !== undefined ? `${o.holding_duration_min}m` : '--'}</td>
                        <td>
                          <span className={`state-badge ${isWin ? 'committed' : 'rolled_back'}`}>
                            {(o.outcome_type || '').toUpperCase()}
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

            {/* Pagination Controls */}
            {totalOutcomePages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--kdt-text-muted)' }}>
                  Showing {(outcomesPage - 1) * OUTCOMES_PER_PAGE + 1}–{Math.min(outcomesPage * OUTCOMES_PER_PAGE, recentOutcomes.length)} of {recentOutcomes.length} outcomes
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    className="btn-cancel font-mono"
                    style={{ padding: '5px 12px', fontSize: '0.8rem', cursor: outcomesPage === 1 ? 'not-allowed' : 'pointer', opacity: outcomesPage === 1 ? 0.5 : 1 }}
                    disabled={outcomesPage === 1}
                    onClick={() => setOutcomesPage(prev => Math.max(1, prev - 1))}
                  >
                    ← Prev
                  </button>

                  {Array.from({ length: totalOutcomePages }, (_, i) => i + 1).map(p => (
                    <button
                      key={p}
                      type="button"
                      className="font-mono"
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.8rem',
                        borderRadius: '4px',
                        border: p === outcomesPage ? '1px solid #00e5ff' : '1px solid rgba(255, 255, 255, 0.1)',
                        background: p === outcomesPage ? 'rgba(0, 229, 255, 0.2)' : 'transparent',
                        color: p === outcomesPage ? '#00e5ff' : '#ccc',
                        cursor: 'pointer',
                        fontWeight: p === outcomesPage ? 800 : 400
                      }}
                      onClick={() => setOutcomesPage(p)}
                    >
                      {p}
                    </button>
                  ))}

                  <button
                    type="button"
                    className="btn-cancel font-mono"
                    style={{ padding: '5px 12px', fontSize: '0.8rem', cursor: outcomesPage >= totalOutcomePages ? 'not-allowed' : 'pointer', opacity: outcomesPage >= totalOutcomePages ? 0.5 : 1 }}
                    disabled={outcomesPage >= totalOutcomePages}
                    onClick={() => setOutcomesPage(prev => Math.min(totalOutcomePages, prev + 1))}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recent Publish Runs */}
        {runs.length > 0 && (
          <div className="runs-card glass-card font-mono" style={{ marginBottom: '24px' }}>
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
                          {(run as any).error_detail && (
                            <span style={{ fontSize: '0.7rem', display: 'block', color: '#ff1744', marginTop: '2px', maxWidth: '160px', wordBreak: 'break-word' }}>
                              {(run as any).error_detail}
                            </span>
                          )}
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
        )}

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

            <div className="form-group">
              <label>Strategy Scope</label>
              <select value={triggerStrategy} onChange={e => setTriggerStrategy(e.target.value as any)}>
                <option value="all">⚡ All Strategies</option>
                <option value="manna_basic">🔵 Manna Basic Strategy</option>
                <option value="manna_snd">🟡 Manna SnD Strategy</option>
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

        {rescanCandidate && rescanCurrentSetup && (
          <SignalReplaceModal
            currentSetup={rescanCurrentSetup}
            candidate={rescanCandidate}
            onClose={() => {
              setRescanCandidate(null);
              setRescanCurrentSetup(null);
            }}
            onSuccess={() => {
              setRescanCandidate(null);
              setRescanCurrentSetup(null);
              refetchActiveSetups();
              refetchAnalytics();
            }}
          />
        )}
      </main>
    </div>
  );
};
