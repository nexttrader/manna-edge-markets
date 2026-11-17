import React, { useEffect, useState, useMemo } from 'react';
import { API_BASE } from '../../config';
import { estimateTradeFeeR, getEffectiveRealizedR, useFeesToggle } from '../../utils/rAccounting';

export interface StyleComparisonRow {
  style: 'SCALP' | 'INTRADAY' | 'SWING';
  label: string;
  timeframes: string;
  totalSetups: number;
  awaitingEntry: number;
  activeSetups: number;
  resolvedSetups: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number;
  totalRealizedR: number;
  expectancyR: number;
  avgConviction: number;
  futuresCount: number;
  forexCount: number;
}

export interface StyleComparisonReport {
  generatedAt: string;
  styles: StyleComparisonRow[];
  recentMtfSetups: Array<{
    id: string;
    trading_style: 'SCALP' | 'SWING';
    context_tf: string;
    entry_tf: string;
    instrument: string;
    market: string;
    bias: string;
    signal_state: string;
    realized_r: number;
    conviction_score: number;
    last_price: number;
    created_at: string;
  }>;
}

export const TradingStyleComparisonCard: React.FC = () => {
  const [styleReport, setStyleReport] = useState<StyleComparisonReport | null>(null);
  const [syncingStyles, setSyncingStyles] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [includeFees, toggleFees] = useFeesToggle();

  const displayedStyles = useMemo(() => {
    if (!styleReport) return [];
    if (!includeFees) return styleReport.styles;
    return styleReport.styles.map((row) => {
      const mtfSamples = (styleReport.recentMtfSetups || []).filter(
        s => s.trading_style === row.style && (s.signal_state === 'resolved' || s.signal_state === 'runner')
      );
      const defaultAvgFee = row.style === 'SCALP' ? 0.075 : row.style === 'SWING' ? 0.013 : 0.043;
      const avgFee = mtfSamples.length > 0
        ? mtfSamples.reduce((sum, s) => sum + estimateTradeFeeR(s), 0) / mtfSamples.length
        : defaultAvgFee;
      const resolvedCount = row.resolvedSetups || 0;
      const totalFee = resolvedCount * avgFee;
      const netTotalR = Number((row.totalRealizedR - totalFee).toFixed(2));
      const netExpectancy = resolvedCount > 0 ? Number((netTotalR / resolvedCount).toFixed(2)) : 0;
      return {
        ...row,
        totalRealizedR: netTotalR,
        expectancyR: netExpectancy,
      };
    });
  }, [styleReport, includeFees]);

  const fetchStyleComparison = async (refresh = false) => {
    if (refresh) setSyncingStyles(true);
    setErrorMsg(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/super-admin/strategy-analytics/style-comparison${refresh ? '?refresh=1' : ''}`
      );
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setStyleReport(json);
      } else {
        setErrorMsg(json?.details || json?.error || `HTTP ${res.status}`);
      }
    } catch (err: any) {
      console.error('Failed to fetch trading style comparison', err);
      setErrorMsg(err?.message || 'Network error loading trading style comparison');
    } finally {
      setLoading(false);
      if (refresh) setSyncingStyles(false);
    }
  };

  useEffect(() => {
    fetchStyleComparison(false);
  }, []);

  return (
    <section
      className="super-card font-mono"
      style={{
        marginBottom: '20px',
        borderColor: 'rgba(212, 175, 55, 0.4)',
        background: 'rgba(17, 10, 30, 0.92)'
      }}
      aria-label="Trading Style Comparison"
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          marginBottom: collapsed ? 0 : '14px'
        }}
      >
        <div>
          <h3 style={{ margin: 0, color: '#ffab00', fontSize: '1rem' }}>
            ⚡ Trading Style Comparison: Scalping vs Intraday vs Swing
          </h3>
          <p style={{ margin: '3px 0 0 0', fontSize: '0.76rem', color: '#94a3b8' }}>
            Backend-tracked setup &amp; outcome comparison across isolated Scalping (15M/5M), Core Intraday (1H/15M), and Swing (D1/4H · 4H/1H) desks.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={toggleFees}
            style={{
              background: includeFees ? 'rgba(245, 158, 11, 0.22)' : 'rgba(0, 0, 0, 0.3)',
              border: `1px solid ${includeFees ? 'rgba(245, 158, 11, 0.7)' : 'rgba(255, 255, 255, 0.16)'}`,
              color: includeFees ? '#fbbf24' : '#cbd5e1',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.75rem'
            }}
            title="Toggle estimated broker round-turn fees & commissions on/off"
          >
            💸 Fees: {includeFees ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            className="scd-filter-btn active"
            style={{
              background: 'rgba(212, 175, 55, 0.16)',
              border: '1px solid rgba(212, 175, 55, 0.5)',
              color: '#fde68a',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.76rem'
            }}
            onClick={() => fetchStyleComparison(true)}
            disabled={syncingStyles}
          >
            {syncingStyles ? '⟳ Syncing Scalp & Swing...' : '⟳ Sync Scalp & Swing Now'}
          </button>
          <button
            type="button"
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              color: '#cbd5e1',
              padding: '6px 10px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.74rem'
            }}
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? 'Expand ▾' : 'Collapse ▲'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {loading && !styleReport && (
            <div style={{ padding: '14px', color: '#94a3b8', fontSize: '0.82rem' }}>
              ⏳ Loading Scalping, Intraday &amp; Swing comparison metrics...
            </div>
          )}

          {errorMsg && !styleReport && (
            <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.35)', color: '#fca5a5', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
              <span>⚠️ {errorMsg}</span>
              <button
                type="button"
                onClick={() => fetchStyleComparison(true)}
                style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#ffffff', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '0.74rem' }}
              >
                Retry Sync
              </button>
            </div>
          )}

          {styleReport && (
            <>
              <div className="table-responsive">
                <table className="runs-table" style={{ width: '100%', fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      <th>Trading Style</th>
                      <th>Timeframes</th>
                      <th>Total Tracked</th>
                      <th>Awaiting</th>
                      <th>Active</th>
                      <th>Resolved</th>
                      <th>W / L / BE</th>
                      <th>Win Rate</th>
                      <th>Total R</th>
                      <th>Expectancy</th>
                      <th>Avg Conv.</th>
                      <th>Futures / FX</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedStyles.map((row) => (
                      <tr key={row.style}>
                        <td
                          style={{
                            fontWeight: 800,
                            color:
                              row.style === 'SCALP'
                                ? '#34d399'
                                : row.style === 'SWING'
                                ? '#60a5fa'
                                : '#fbbf24'
                          }}
                        >
                          {row.label}
                        </td>
                        <td>{row.timeframes}</td>
                        <td style={{ fontWeight: 700 }}>{row.totalSetups}</td>
                        <td>{row.awaitingEntry}</td>
                        <td style={{ color: '#38bdf8', fontWeight: 700 }}>{row.activeSetups}</td>
                        <td>{row.resolvedSetups}</td>
                        <td>
                          {row.wins}W / {row.losses}L / {row.breakevens}BE
                        </td>
                        <td
                          style={{
                            fontWeight: 800,
                            color: row.winRate >= 50 ? '#34d399' : '#f87171'
                          }}
                        >
                          {row.winRate}%
                        </td>
                        <td
                          style={{
                            fontWeight: 800,
                            color: row.totalRealizedR >= 0 ? '#34d399' : '#f87171'
                          }}
                        >
                          {row.totalRealizedR >= 0 ? '+' : ''}
                          {row.totalRealizedR}R
                        </td>
                        <td>
                          {row.expectancyR >= 0 ? '+' : ''}
                          {row.expectancyR}R
                        </td>
                        <td>{row.avgConviction}%</td>
                        <td>
                          {row.futuresCount} / {row.forexCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {styleReport.recentMtfSetups.length > 0 && (
                <details style={{ marginTop: '12px' }}>
                  <summary
                    style={{
                      cursor: 'pointer',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: '#cbd5e1'
                    }}
                  >
                    View Recent Tracked Scalping &amp; Swing Setups ({styleReport.recentMtfSetups.length})
                  </summary>
                  <div
                    className="table-responsive"
                    style={{ marginTop: '10px', maxHeight: '260px', overflowY: 'auto' }}
                  >
                    <table className="runs-table" style={{ width: '100%', fontSize: '0.75rem' }}>
                      <thead>
                        <tr>
                          <th>Style</th>
                          <th>Asset</th>
                          <th>TFs</th>
                          <th>Bias</th>
                          <th>State</th>
                          <th>Last Price</th>
                          <th>Realized R</th>
                          <th>Conv.</th>
                          <th>Tracked At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {styleReport.recentMtfSetups.map((s) => {
                          const displayR = (s.signal_state === 'resolved' || s.signal_state === 'runner')
                            ? getEffectiveRealizedR(s, includeFees)
                            : s.realized_r;
                          return (
                          <tr key={s.id}>
                            <td
                              style={{
                                fontWeight: 800,
                                color: s.trading_style === 'SCALP' ? '#34d399' : '#60a5fa'
                              }}
                            >
                              {s.trading_style}
                            </td>
                            <td style={{ fontWeight: 700 }}>{s.instrument}</td>
                            <td>
                              {s.context_tf} · {s.entry_tf}
                            </td>
                            <td
                              style={{
                                color: s.bias === 'long' ? '#34d399' : '#f87171',
                                textTransform: 'uppercase'
                              }}
                            >
                              {s.bias}
                            </td>
                            <td>{s.signal_state}</td>
                            <td>{s.last_price}</td>
                            <td
                              style={{
                                fontWeight: 700,
                                color:
                                  displayR > 0
                                    ? '#34d399'
                                    : displayR < 0
                                    ? '#f87171'
                                    : '#94a3b8'
                              }}
                            >
                              {displayR > 0 ? `+${displayR}R` : `${displayR}R`}
                            </td>
                            <td>{Math.round(s.conviction_score)}%</td>
                            <td style={{ color: '#94a3b8' }}>
                              {new Date(s.created_at).toLocaleString()}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
};
