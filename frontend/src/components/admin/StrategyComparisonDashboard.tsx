import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../config';
import './StrategyComparisonDashboard.css';

interface StrategyStat {
  strategyId: string;
  strategyName: string;
  totalSignals: number;
  activeSignals: number;
  resolvedSignals: number;
  invalidatedSignals: number;
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  tp1Hits: number;
  tp2Hits: number;
  winRate: number;
  totalRealizedR: number;
  expectancyR: number;
  profitFactor: number;
  avgFillDurationMin: number;
  avgHoldDurationMin: number;
  marketBreakdown: {
    futures: { totalTrades: number; wins: number; winRate: number; totalR: number };
    forex: { totalTrades: number; wins: number; winRate: number; totalR: number };
  };
  sessionBreakdown: {
    london: { totalTrades: number; wins: number; winRate: number; totalR: number };
    ny_am: { totalTrades: number; wins: number; winRate: number; totalR: number };
    ny_pm: { totalTrades: number; wins: number; winRate: number; totalR: number };
    asia: { totalTrades: number; wins: number; winRate: number; totalR: number };
  };
  convictionDistribution: {
    avgConviction: number;
    highTier: { count: number; wins: number; winRate: number };
    medTier: { count: number; wins: number; winRate: number };
  };
  poiTypeDistribution: Record<string, number>;
}

interface ComparisonData {
  timestamp: string;
  filters: { timeframe: string; market: string; session: string; strategyId?: string };
  summary: {
    totalStrategiesTracked: number;
    totalCombinedTrades: number;
    totalCombinedR: number;
    bestWinRateStrategy: { id: string; name: string; winRate: number } | null;
    bestExpectancyStrategy: { id: string; name: string; expectancyR: number } | null;
  };
  strategies: StrategyStat[];
  tradeLogs: any[];
}

export const StrategyComparisonDashboard: React.FC = () => {
  const [timeframe, setTimeframe] = useState<'all' | '30d' | '7d' | '24h'>('all');
  const [market, setMarket] = useState<'both' | 'futures' | 'forex'>('both');
  const [session, setSession] = useState<'all' | 'london' | 'ny_am' | 'ny_pm' | 'asia'>('all');
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('all');
  
  const [data, setData] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [showPromptModal, setShowPromptModal] = useState<boolean>(false);
  const [selectedPromptGoal, setSelectedPromptGoal] = useState<'edge' | 'session' | 'rmult' | 'drawdown'>('edge');
  const [copiedToast, setCopiedToast] = useState<boolean>(false);

  const fetchComparisonData = async () => {
    setLoading(true);
    try {
      const url = `${API_BASE}/api/super-admin/strategy-analytics/comparison?timeframe=${timeframe}&market=${market}&session=${session}&strategy_id=${selectedStrategyId}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (json.success) setData(json);
      }
    } catch (err) {
      console.error('Failed to fetch strategy comparison analytics', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComparisonData();
  }, [timeframe, market, session, selectedStrategyId]);

  const handleDownloadExport = (format: 'markdown' | 'json' | 'csv') => {
    const url = `${API_BASE}/api/super-admin/strategy-analytics/export?format=${format}&timeframe=${timeframe}&market=${market}&session=${session}&strategy_id=${selectedStrategyId}`;
    window.open(url, '_blank');
  };

  const getPromptText = () => {
    if (!data) return '';
    
    let goalPrompt = '';
    if (selectedPromptGoal === 'edge') {
      goalPrompt = `You are a quantitative trading strategy auditor. Analyze the attached strategy dataset from Manna Edge Markets 2.0.
1. Compare the mathematical edge between the strategies. Which strategy demonstrates superior risk-adjusted expectancy and why?
2. Identify specific market regimes or POI types where the win rate drops below expected baselines.
3. Provide 3 actionable recommendations to optimize overall system profitability based strictly on empirical trade log evidence.`;
    } else if (selectedPromptGoal === 'session') {
      goalPrompt = `Analyze the killzone session performance (London vs NY AM vs NY PM vs Asian) and market type (Futures vs Forex) across all strategies in this dataset.
1. Which session provides the highest win rate and expectancy R for each strategy?
2. Are there sessions where trades consistently hit Stop Losses or take too long to fill?
3. Should certain killzone sessions be filtered out or restricted for specific asset classes?`;
    } else if (selectedPromptGoal === 'rmult') {
      goalPrompt = `Review the trade outcomes and R-multiple distributions (TP1 vs TP2 vs Stop Losses) in this strategy dataset.
1. Evaluate whether the TP1 and TP2 targets are mathematically optimal or if trailing stops/scale-out points would yield higher expectancy.
2. Analyze the impact of conviction scores on win rate. Does filtering setups to conviction score >= 85 increase net expectancy without sacrificing trade volume?`;
    } else {
      goalPrompt = `Focus on all losing trades (SL_HIT) in the trade log table.
1. What patterns, instruments, or POI types account for the highest cluster of losses?
2. Is there evidence of false breakouts during low-liquidity market transitions?
3. Propose a rule-based invalidation filter to eliminate high-risk losing trades before entry.`;
    }

    return `${goalPrompt}

---

## 📊 DATASET OVERVIEW & SUMMARY METRICS
- **Timestamp:** ${data.timestamp}
- **Filters Applied:** Timeframe=${data.filters.timeframe}, Market=${data.filters.market}, Session=${data.filters.session}
- **Total Combined Trades:** ${data.summary.totalCombinedTrades}
- **Total Combined Realized R:** ${data.summary.totalCombinedR}R

### STRATEGIES BREAKDOWN:
${JSON.stringify(data.strategies, null, 2)}

### TRADE LOG DATASET (${data.tradeLogs.length} Records):
${JSON.stringify(data.tradeLogs.slice(0, 100), null, 2)}`;
  };

  const handleCopyPromptToClipboard = () => {
    const text = getPromptText();
    navigator.clipboard.writeText(text);
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 3000);
  };

  return (
    <div className="scd-container font-mono">
      {/* Dynamic Filter Controls Card */}
      <div className="scd-filter-card">
        <div className="scd-filter-header">
          <div className="scd-title-group">
            <span className="scd-title-icon">⚔️</span>
            <div>
              <div className="scd-title-text">SUPER ADMIN STRATEGY SUCCESS &amp; COMPARISON MATRIX</div>
              <div className="scd-subtitle">Real-time performance analytics, win-rate benchmarking &amp; LLM prompt data exporter</div>
            </div>
          </div>

          <button type="button" className="scd-refresh-btn" onClick={fetchComparisonData}>
            🔄 {loading ? 'Computing...' : 'Refresh Analytics'}
          </button>
        </div>

        <div className="scd-filter-row">
          {/* Timeframe Filter */}
          <div className="scd-filter-group">
            <span className="scd-filter-label">Timeframe</span>
            <div className="scd-btn-group">
              <button type="button" className={`scd-filter-btn ${timeframe === 'all' ? 'active' : ''}`} onClick={() => setTimeframe('all')}>All Time</button>
              <button type="button" className={`scd-filter-btn ${timeframe === '30d' ? 'active' : ''}`} onClick={() => setTimeframe('30d')}>30 Days</button>
              <button type="button" className={`scd-filter-btn ${timeframe === '7d' ? 'active' : ''}`} onClick={() => setTimeframe('7d')}>7 Days</button>
              <button type="button" className={`scd-filter-btn ${timeframe === '24h' ? 'active' : ''}`} onClick={() => setTimeframe('24h')}>24 Hours</button>
            </div>
          </div>

          {/* Market Filter */}
          <div className="scd-filter-group">
            <span className="scd-filter-label">Market Scope</span>
            <select className="scd-select" value={market} onChange={(e) => setMarket(e.target.value as any)}>
              <option value="both">🌐 All Markets (Futures + Forex)</option>
              <option value="futures">📈 Futures Only</option>
              <option value="forex">💱 Forex Only</option>
            </select>
          </div>

          {/* Session Filter */}
          <div className="scd-filter-group">
            <span className="scd-filter-label">Killzone Session</span>
            <select className="scd-select" value={session} onChange={(e) => setSession(e.target.value as any)}>
              <option value="all">⚡ All Killzone Sessions</option>
              <option value="london">🇬🇧 London Session</option>
              <option value="ny_am">🇺🇸 NY AM Session</option>
              <option value="ny_pm">🌇 NY PM Session</option>
              <option value="asia">🌏 Asian Session</option>
            </select>
          </div>

          {/* Target Strategy Filter */}
          <div className="scd-filter-group">
            <span className="scd-filter-label">Strategy Scope</span>
            <select className="scd-select" value={selectedStrategyId} onChange={(e) => setSelectedStrategyId(e.target.value)}>
              <option value="all">📊 All Registered Strategies</option>
              {(data?.strategies || []).map(s => (
                <option key={s.strategyId} value={s.strategyId}>🎯 {s.strategyName} ({s.strategyId})</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Executive Summary Highlights Banner */}
      {data && (
        <div className="scd-highlights-grid">
          <div className="scd-highlight-box gold">
            <span className="scd-highlight-label">📊 Combined System R-Gain</span>
            <span className="scd-highlight-value" style={{ color: '#ffab00' }}>
              {data.summary.totalCombinedR > 0 ? `+${data.summary.totalCombinedR}R` : `${data.summary.totalCombinedR}R`}
            </span>
            <span className="scd-highlight-sub">{data.summary.totalCombinedTrades} Total Resolved Trades</span>
          </div>

          <div className="scd-highlight-box green">
            <span className="scd-highlight-label">🏆 Top Win-Rate Strategy</span>
            <span className="scd-highlight-value" style={{ color: '#00e676' }}>
              {data.summary.bestWinRateStrategy ? `${data.summary.bestWinRateStrategy.winRate}%` : 'N/A'}
            </span>
            <span className="scd-highlight-sub">{data.summary.bestWinRateStrategy?.name || 'No data'}</span>
          </div>

          <div className="scd-highlight-box cyan">
            <span className="scd-highlight-label">🚀 Top Expectancy Strategy</span>
            <span className="scd-highlight-value" style={{ color: '#00e5ff' }}>
              {data.summary.bestExpectancyStrategy ? `+${data.summary.bestExpectancyStrategy.expectancyR}R` : 'N/A'}
            </span>
            <span className="scd-highlight-sub">{data.summary.bestExpectancyStrategy?.name || 'No data'}</span>
          </div>

          <div className="scd-highlight-box purple">
            <span className="scd-highlight-label">🛡️ Active Tracked Engines</span>
            <span className="scd-highlight-value" style={{ color: '#ce93d8' }}>
              {data.summary.totalStrategiesTracked}
            </span>
            <span className="scd-highlight-sub">Sentinel V2 &amp; Custom Engines</span>
          </div>
        </div>
      )}

      {/* LLM Data Exporter & AI Prompt Action Card */}
      <div className="scd-llm-card">
        <div className="scd-llm-header">
          <div className="scd-llm-title">
            <span>🤖</span> LARGE LANGUAGE MODEL (LLM) DATASET EXPORTER &amp; AI PROMPT GENERATOR
          </div>

          <div className="scd-llm-actions">
            <button type="button" className="scd-export-btn gold" onClick={() => handleDownloadExport('markdown')}>
              📥 Download Prompt Dataset (.md)
            </button>
            <button type="button" className="scd-export-btn cyan" onClick={() => handleDownloadExport('json')}>
              📥 Download JSON Dataset (.json)
            </button>
            <button type="button" className="scd-export-btn" onClick={() => handleDownloadExport('csv')}>
              📥 Download Trade Logs (.csv)
            </button>
            <button type="button" className="scd-export-btn gold" style={{ background: 'rgba(255, 171, 0, 0.25)' }} onClick={() => setShowPromptModal(true)}>
              ⚡ Copy AI Prompt &amp; Data
            </button>
          </div>
        </div>

        <div className="scd-llm-desc">
          Export prompt-ready strategy datasets optimized specifically for consumption by Large Language Models (**ChatGPT**, **Claude 3.5 Sonnet**, **Gemini 1.5 Pro**, **DeepSeek R1**). Includes pre-formatted executive summary tables, detailed setup parameters, conviction tiers, killzone performance split, and granular trade logs.
        </div>
      </div>

      {/* Side-by-Side Strategy Stat Cards Grid */}
      <div className="scd-cards-grid">
        {(data?.strategies || []).map((s) => (
          <div key={s.strategyId} className="scd-strat-card">
            <div className="scd-strat-header">
              <div>
                <div className="scd-strat-name">{s.strategyName}</div>
                <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '2px' }}>
                  {s.totalSignals} Signals Generated ({s.activeSignals} Active)
                </div>
              </div>
              <span className="scd-strat-id-badge">{s.strategyId}</span>
            </div>

            {/* Metrics Trio */}
            <div className="scd-metrics-trio">
              <div className="scd-metric-item">
                <span className={`scd-metric-val ${s.winRate >= 60 ? 'green' : s.winRate >= 45 ? 'gold' : 'red'}`}>
                  {s.winRate}%
                </span>
                <span className="scd-metric-lbl">Win Rate</span>
              </div>

              <div className="scd-metric-item">
                <span className={`scd-metric-val ${s.totalRealizedR >= 0 ? 'green' : 'red'}`}>
                  {s.totalRealizedR > 0 ? `+${s.totalRealizedR}R` : `${s.totalRealizedR}R`}
                </span>
                <span className="scd-metric-lbl">Realized R</span>
              </div>

              <div className="scd-metric-item">
                <span className={`scd-metric-val ${s.expectancyR >= 0 ? 'cyan' : 'red'}`}>
                  {s.expectancyR > 0 ? `+${s.expectancyR}R` : `${s.expectancyR}R`}
                </span>
                <span className="scd-metric-lbl">Expectancy</span>
              </div>
            </div>

            {/* Outcome Pills */}
            <div className="scd-outcomes-bar">
              <span className="scd-outcome-pill win">🏆 {s.wins} Wins ({s.tp1Hits} TP1 / {s.tp2Hits} TP2)</span>
              <span className="scd-outcome-pill loss">❌ {s.losses} Losses</span>
              <span className="scd-outcome-pill be">⚖️ {s.breakevens} BE</span>
              <span className="scd-outcome-pill">📊 Profit Factor: <b>{s.profitFactor}</b></span>
            </div>

            {/* Market Split Bar */}
            <div className="scd-market-split">
              <div className="scd-split-row">
                <span style={{ color: '#00e5ff' }}>📈 Futures: {s.marketBreakdown.futures.winRate}% ({s.marketBreakdown.futures.totalR}R)</span>
                <span style={{ color: '#ce93d8' }}>💱 Forex: {s.marketBreakdown.forex.winRate}% ({s.marketBreakdown.forex.totalR}R)</span>
              </div>
              <div className="scd-split-bar-bg">
                <div className="scd-split-bar-fill futures" style={{ width: `${s.marketBreakdown.futures.totalTrades + s.marketBreakdown.forex.totalTrades > 0 ? (s.marketBreakdown.futures.totalTrades / (s.marketBreakdown.futures.totalTrades + s.marketBreakdown.forex.totalTrades)) * 100 : 50}%` }} />
                <div className="scd-split-bar-fill forex" style={{ width: `${s.marketBreakdown.futures.totalTrades + s.marketBreakdown.forex.totalTrades > 0 ? (s.marketBreakdown.forex.totalTrades / (s.marketBreakdown.futures.totalTrades + s.marketBreakdown.forex.totalTrades)) * 100 : 50}%` }} />
              </div>
            </div>

            {/* Killzone Sessions Grid */}
            <div>
              <div style={{ fontSize: '0.72rem', color: '#aaa', fontWeight: 700, marginBottom: '8px' }}>
                SESSION PERFORMANCE BREAKDOWN
              </div>
              <div className="scd-sessions-grid">
                <div className="scd-session-box">
                  <span>🇬🇧 London</span>
                  <span style={{ color: '#00e676', fontWeight: 800 }}>{s.sessionBreakdown.london.winRate}% ({s.sessionBreakdown.london.totalR}R)</span>
                </div>
                <div className="scd-session-box">
                  <span>🇺🇸 NY AM</span>
                  <span style={{ color: '#00e676', fontWeight: 800 }}>{s.sessionBreakdown.ny_am.winRate}% ({s.sessionBreakdown.ny_am.totalR}R)</span>
                </div>
                <div className="scd-session-box">
                  <span>🌇 NY PM</span>
                  <span style={{ color: '#00e676', fontWeight: 800 }}>{s.sessionBreakdown.ny_pm.winRate}% ({s.sessionBreakdown.ny_pm.totalR}R)</span>
                </div>
                <div className="scd-session-box">
                  <span>🌏 Asia</span>
                  <span style={{ color: '#00e676', fontWeight: 800 }}>{s.sessionBreakdown.asia.winRate}% ({s.sessionBreakdown.asia.totalR}R)</span>
                </div>
              </div>
            </div>

            {/* Execution Speeds & Conviction */}
            <div style={{ fontSize: '0.75rem', color: '#888', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
              <span>⏱️ Avg Fill: <b>{s.avgFillDurationMin}m</b> | Hold: <b>{s.avgHoldDurationMin}m</b></span>
              <span>🎯 High Conviction Win: <b>{s.convictionDistribution.highTier.winRate}%</b></span>
            </div>
          </div>
        ))}
      </div>

      {/* Comparative Strategy Matrix Table */}
      {data && data.strategies.length > 0 && (
        <div style={{ background: 'rgba(18, 18, 28, 0.85)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', padding: '20px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1.05rem', color: '#ffab00', fontWeight: 800 }}>
            📋 COMPARATIVE PERFORMANCE MATRIX
          </h3>

          <div className="scd-table-wrapper">
            <table className="scd-table">
              <thead>
                <tr>
                  <th>Strategy Name</th>
                  <th>ID</th>
                  <th>Win Rate</th>
                  <th>Total Trades</th>
                  <th>Realized R</th>
                  <th>Expectancy</th>
                  <th>Profit Factor</th>
                  <th>Futures Win Rate</th>
                  <th>Forex Win Rate</th>
                  <th>Avg Fill</th>
                  <th>Avg Hold</th>
                </tr>
              </thead>
              <tbody>
                {data.strategies.map((s) => (
                  <tr key={s.strategyId}>
                    <td style={{ fontWeight: 800, color: '#fff' }}>{s.strategyName}</td>
                    <td><span className="scd-strat-id-badge">{s.strategyId}</span></td>
                    <td style={{ fontWeight: 900, color: s.winRate >= 60 ? '#00e676' : s.winRate >= 45 ? '#ffab00' : '#ff1744' }}>{s.winRate}%</td>
                    <td>{s.totalTrades}</td>
                    <td style={{ fontWeight: 900, color: s.totalRealizedR >= 0 ? '#00e676' : '#ff1744' }}>{s.totalRealizedR > 0 ? `+${s.totalRealizedR}R` : `${s.totalRealizedR}R`}</td>
                    <td style={{ fontWeight: 800, color: '#00e5ff' }}>+{s.expectancyR}R</td>
                    <td>{s.profitFactor}</td>
                    <td>{s.marketBreakdown.futures.winRate}%</td>
                    <td>{s.marketBreakdown.forex.winRate}%</td>
                    <td>{s.avgFillDurationMin}m</td>
                    <td>{s.avgHoldDurationMin}m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Copy AI Prompt Modal */}
      {showPromptModal && (
        <div className="scd-modal-overlay">
          <div className="scd-modal-card">
            <div className="scd-modal-header">
              <div className="scd-modal-title">🤖 COPY AI PROMPT &amp; STRATEGY DATASET</div>
              <button type="button" className="scd-modal-close" onClick={() => setShowPromptModal(false)}>✕</button>
            </div>

            <div className="scd-modal-body">
              <div style={{ fontSize: '0.8rem', color: '#ccc' }}>
                Select your analysis goal to customize the AI prompt, then click **Copy to Clipboard**. You can paste this entire prompt directly into ChatGPT, Claude 3.5 Sonnet, or Gemini!
              </div>

              <div className="scd-prompt-selector">
                <button type="button" className={`scd-prompt-chip ${selectedPromptGoal === 'edge' ? 'active' : ''}`} onClick={() => setSelectedPromptGoal('edge')}>
                  ⚔️ Strategy Edge Audit
                </button>
                <button type="button" className={`scd-prompt-chip ${selectedPromptGoal === 'session' ? 'active' : ''}`} onClick={() => setSelectedPromptGoal('session')}>
                  ⏳ Session &amp; Market Regime
                </button>
                <button type="button" className={`scd-prompt-chip ${selectedPromptGoal === 'rmult' ? 'active' : ''}`} onClick={() => setSelectedPromptGoal('rmult')}>
                  🎯 R-Multiple Target Tuning
                </button>
                <button type="button" className={`scd-prompt-chip ${selectedPromptGoal === 'drawdown' ? 'active' : ''}`} onClick={() => setSelectedPromptGoal('drawdown')}>
                  🔍 Drawdown &amp; Loss Diagnostic
                </button>
              </div>

              <div className="scd-prompt-preview">
                {getPromptText()}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                <button type="button" className="scd-filter-btn" onClick={() => setShowPromptModal(false)}>Cancel</button>
                <button type="button" className="scd-export-btn gold" onClick={handleCopyPromptToClipboard}>
                  📋 Copy Complete Prompt to Clipboard
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Copied Toast Notification */}
      {copiedToast && (
        <div className="scd-toast">
          ✅ AI Prompt &amp; Dataset copied to clipboard! Paste into ChatGPT / Claude / Gemini.
        </div>
      )}
    </div>
  );
};
