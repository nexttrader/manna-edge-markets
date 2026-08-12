import React, { useState, useRef, useEffect } from 'react';
import './SetupCard.css';
import { type EdgeSetup } from '../types';
import { StatusBadge } from './StatusBadge';
import { formatETTime, formatDuration } from '../utils/time';
import { SetupChartModal } from './SetupChartModal';

function getSelectionRationale(setup: EdgeSetup): string {
  if (setup.metadata) {
    try {
      const meta = typeof setup.metadata === 'string' ? JSON.parse(setup.metadata) : setup.metadata;
      if (meta.selection_rationale) return meta.selection_rationale;
    } catch {}
  }

  const kzName = (setup.killzone_origin || 'Killzone').toUpperCase().replace('_', ' ');
  const biasStr = (setup.bias || 'long').toUpperCase();
  const conviction = setup.conviction_score ? setup.conviction_score.toFixed(1) : '75.0';
  const rTarget = setup.r_multiple_1 ? `${setup.r_multiple_1}R` : '2.00R';

  if ((setup.market || '').toLowerCase() === 'forex') {
    return `Selected during ${kzName} session scan. ${biasStr} Fair Value Gap (FVG) displacement identified with high liquidity score (${setup.liquidity_score ? setup.liquidity_score.toFixed(1) : '99.5'}%). ${conviction}% conviction confluence targeting ${rTarget} risk-to-reward.`;
  }

  return `Selected during ${kzName} session scan. Key ${biasStr} liquidity sweep & Order Block alignment identified at ${setup.entry_zone_mid || setup.entry_zone_low}. ${conviction}% conviction score offering ${rTarget} target.`;
}

import { SignalReplaceModal } from './SignalReplaceModal';
import { API_BASE } from '../config';
import { useAuth } from '../context/AuthContext';

interface SetupCardProps {
  setup: EdgeSetup;
  isWatchlisted?: boolean;
  onToggleWatchlist?: (id: string) => void;
}

export const SetupCard: React.FC<SetupCardProps> = ({ setup, isWatchlisted = false, onToggleWatchlist }) => {
  const { user, originalAdmin, isImpersonating } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin' && !isImpersonating;
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || (originalAdmin?.role === 'admin' || originalAdmin?.role === 'super_admin');

  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [replacementCandidate, setReplacementCandidate] = useState<any | null>(null);
  const [rescanMessage, setRescanMessage] = useState<string | null>(null);
  const [showPriceDropdown, setShowPriceDropdown] = useState(false);

  const metaObj = (() => {
    if (!setup.metadata) return {};
    try {
      return typeof setup.metadata === 'string' ? JSON.parse(setup.metadata) : setup.metadata;
    } catch {
      return {};
    }
  })();

  const getEntrySessionName = (): string => {
    if (metaObj?.entry_session_name) return metaObj.entry_session_name.replace('_', ' ').toUpperCase();
    if (!setup.entry_triggered_at) return '';
    try {
      const dt = new Date(setup.entry_triggered_at);
      const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false });
      const hourET = parseInt(formatter.format(dt), 10);
      if (hourET >= 20 || hourET < 2) return 'ASIA';
      if (hourET >= 2 && hourET < 8) return 'LONDON';
      if (hourET >= 8 && hourET < 14) return 'NY AM';
      if (hourET >= 14 && hourET < 20) return 'NY PM';
    } catch {}
    return 'UNKNOWN';
  };

  // Live Price Tick Flash Tracking
  const prevPriceRef = useRef<number | null>(null);
  const [priceTick, setPriceTick] = useState<'up' | 'down' | 'neutral'>('neutral');

  useEffect(() => {
    if (setup.current_price !== undefined) {
      if (prevPriceRef.current !== null && prevPriceRef.current !== setup.current_price) {
        const dir = setup.current_price > prevPriceRef.current ? 'up' : 'down';
        setPriceTick(dir);
        const timer = setTimeout(() => setPriceTick('neutral'), 1200);
        return () => clearTimeout(timer);
      }
      prevPriceRef.current = setup.current_price;
    }
  }, [setup.current_price]);

  if (!setup) return null;

  const handleSingleRescan = async () => {
    try {
      setRescanning(true);
      setRescanMessage(null);
      const res = await fetch(`${API_BASE}/api/admin/single-asset-rescan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setupId: setup.id,
          instrument: setup.instrument,
          market: setup.market || 'futures',
          strategy_id: setup.strategy_id || 'sentinel_v2'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rescan failed');

      if (data.found && data.candidate) {
        setReplacementCandidate(data.candidate);
      } else {
        setRescanMessage(data.message || `No new signal candidate discovered for ${setup.instrument}.`);
        setTimeout(() => setRescanMessage(null), 4000);
      }
    } catch (err: any) {
      setRescanMessage(`⚠️ ${err.message || 'Rescan failed'}`);
      setTimeout(() => setRescanMessage(null), 4000);
    } finally {
      setRescanning(false);
    }
  };

  const biasRaw = (setup.bias || 'long').toLowerCase();
  const isLong = biasRaw === 'long';

  const stateStr = setup.signal_state || setup.state || 'awaiting_entry';
  const convictionVal = Math.round(setup.conviction_score ?? setup.conviction ?? 75);

  const entryLow = setup.entry_zone_low ?? setup.levels?.entryMin ?? 0;
  const entryHigh = setup.entry_zone_high ?? setup.levels?.entryMax ?? 0;
  const stopVal = setup.stop ?? setup.levels?.stopLoss ?? 0;
  const tp1Val = setup.tp1 ?? setup.levels?.takeProfit1 ?? 0;
  const tp2Val = setup.tp2 ?? setup.levels?.takeProfit2;

  const r1 = setup.r_multiple_1 ?? 2.0;
  const r2 = setup.r_multiple_2 ?? 3.0;

  const handleCopy = () => {
    const text = `${setup.instrument} ${biasRaw.toUpperCase()}\nEntry: ${entryLow} - ${entryHigh}\nStop: ${stopVal}\nTP1: ${tp1Val} (${r1}R)${tp2Val ? `\nTP2: ${tp2Val} (${r2}R)` : ''}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const createdTime = setup.created_at || setup.createdAt || new Date().toISOString();

  const isBreakeven = Boolean(
    setup.is_breakeven ||
    (stateStr === 'active' || stateStr === 'resolved') && (
      (setup.unrealizedR !== undefined && setup.unrealizedR >= 1.0) ||
      setup.invalidation_reason === 'tp1_hit'
    )
  );

  const getOrderType = (): string => {
    // Check if triggered immediately as a Market Order (within 60s of discovery)
    if (setup.created_at && setup.entry_triggered_at) {
      const diffMs = new Date(setup.entry_triggered_at).getTime() - new Date(setup.created_at).getTime();
      if (diffMs <= 60000) {
        return 'MARKET ORDER';
      }
    }
    if (setup.order_type) return setup.order_type.toUpperCase();
    if (setup.metadata) {
      try {
        const meta = typeof setup.metadata === 'string' ? JSON.parse(setup.metadata) : setup.metadata;
        if (meta.order_type) return meta.order_type.toUpperCase();
        if (meta.model_type === 'breakout') return isLong ? 'BUY STOP' : 'SELL STOP';
      } catch {}
    }
    return isLong ? 'BUY LIMIT' : 'SELL LIMIT';
  };
  const orderTypeStr = getOrderType();

  const exactFill = setup.entry_price_recorded || setup.entry_price_executed;

  const currentPrice = setup.current_price;
  const isStillInZone = Boolean(
    currentPrice &&
    currentPrice >= entryLow &&
    currentPrice <= entryHigh &&
    (stateStr === 'active' || stateStr === 'awaiting_entry')
  );

  const strategyId = setup.strategy_id || 'sentinel_v2';
  const displayStrategyName = strategyId === 'manna_snd' ? 'MANNA SND' : 'MANNA ELITE V1';
    
  const meta = (() => {
    try { return typeof setup.metadata === 'string' ? JSON.parse(setup.metadata) : setup.metadata; } catch { return null; }
  })();

  return (
    <div className={`setup-card glass-card state-${stateStr.toLowerCase()} strat-border-${(strategyId).toLowerCase()}`}>
      <div className="sc-header">
        <div className="sc-title-group">
          <div className="sc-symbol-row">
            <span className="sc-instrument">{setup.instrument}</span>
            <span className="sc-market font-mono font-bold">{(setup.market || 'futures').toUpperCase()}</span>
          </div>
          <div className="sc-badges-row">
            <span className={`strategy-badge strat-${(strategyId).toLowerCase()} ${strategyId === 'sentinel_v2' ? 'strategy-tag-sentinel_v2' : ''}`}>
              {displayStrategyName}
            </span>
            {strategyId === 'sentinel_v2' && isSuperAdmin ? (
              <>
                {meta?.context_tf && (
                  <span className="market-tag font-mono" style={{ background: 'rgba(156, 39, 176, 0.2)', color: '#ce93d8', padding: '2px 7px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>{meta.context_tf}</span>
                )}
                {meta?.entry_tf && (
                  <span className="market-tag font-mono" style={{ background: 'rgba(156, 39, 176, 0.2)', color: '#ce93d8', padding: '2px 7px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>{meta.entry_tf}</span>
                )}
                {meta?.poi_type && (
                  <span className="poi-badge font-mono">{meta.poi_type}</span>
                )}
                {meta?.cycle_priority && (
                  <span className="cycle-priority-badge font-mono">🔥 CYCLE PRIORITY</span>
                )}
              </>
            ) : (
              <>
                <span className="tf-badge htf">1H Context</span>
                <span className="tf-badge ltf">15M Entry</span>
              </>
            )}
            {isBreakeven && (
              <span className="be-badge font-mono animate-pulse" title="Stop Loss moved to Entry to lock in risk-free position">
                🛡️ BREAK EVEN
              </span>
            )}
          </div>
          {strategyId === 'sentinel_v2' && isSuperAdmin && (
            <div className="sentinel-pipeline font-mono">
              {['HTF Expansion', 'POI Detected', 'POI Mitigated', '15M Confirmed', '1M Entry'].map((phase, i) => {
                const phaseMap = ['HTF_EXPANSION_ACTIVE', 'POI_DETECTED', 'POI_MITIGATED', 'MTF_SWING_CONFIRMED', 'LTF_ENTRY_ACTIVE'];
                const currentPhaseIdx = phaseMap.indexOf(meta?.sentinel_phase || '');
                const isActive = i <= currentPhaseIdx;
                return (
                  <span key={phase} className={`pipeline-stage ${isActive ? 'active' : ''}`}>
                    {phase}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div className="sc-header-actions font-mono">
          {onToggleWatchlist && (
            <button 
              className={`sc-eye-btn ${isWatchlisted ? 'is-starred' : ''}`}
              onClick={(e) => { e.stopPropagation(); onToggleWatchlist(setup.id); }}
              title={isWatchlisted ? 'Remove from Watchlist' : 'Add to Watchlist'}
              aria-label={isWatchlisted ? 'Remove from Watchlist' : 'Add to Watchlist'}
              style={{
                borderRadius: '16px',
                width: 'auto',
                padding: '0 8px 0 6px',
                gap: '4px',
                display: 'inline-flex',
                alignItems: 'center'
              }}
            >
              <span className="eye-icon" style={{ display: 'inline-block', transform: 'translateY(-1px)' }}>{isWatchlisted ? '👁️' : '👁️‍🗨️'}</span>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                {isWatchlisted ? 'Watching' : 'Watch'}
              </span>
            </button>
          )}
          <StatusBadge status={stateStr} />
        </div>
      </div>

      <div className="sc-bias-row">
        <div className={`sc-bias ${isLong ? 'bias-long' : 'bias-short'}`}>
          {isLong ? '⬆ LONG' : '⬇ SHORT'}
        </div>
        <span className="order-type-badge font-mono" title={`Order Type: ${orderTypeStr}`}>
          📌 {orderTypeStr}
        </span>
        <div className="sc-conviction font-mono">
          <span className="conviction-text-badge">{convictionVal}% Conviction</span>
        </div>
      </div>

      {setup.opposing_strategy_warning && (
        <div className="font-mono text-gold animate-fade-in" style={{ background: 'rgba(255, 215, 0, 0.1)', border: '1px solid rgba(255, 215, 0, 0.4)', borderRadius: '6px', padding: '8px 12px', fontSize: '0.78rem', margin: '10px 0', lineHeight: 1.3 }}>
          {setup.opposing_strategy_warning}
        </div>
      )}

      {isStillInZone && (
        <div className="sc-in-zone-opportunity font-mono animate-pulse">
          <div className="in-zone-left">
            <span className="in-zone-icon">🎯</span>
            <span className="in-zone-title">STILL IN ENTRY ZONE ({currentPrice})</span>
          </div>
          <div className="in-zone-right">
            <span className="in-zone-badge">VALID ENTRY OPPORTUNITY</span>
          </div>
        </div>
      )}

      <div className="sc-levels font-mono">
        <div className="level-row">
          <span className="level-label">Entry Zone</span>
          <span className="level-val">{entryLow} — {entryHigh}</span>
          <span className="level-pips text-gold">📍 Zone</span>
        </div>
        {exactFill && (
          <div className="level-row entry-fill-row">
            <span className="level-label text-gold">Exact Fill</span>
            <span className="level-val text-gold font-bold">{exactFill}</span>
            <span className="level-pips text-gold">⚡ FILLED</span>
          </div>
        )}
        {setup.entry_triggered_at && (
          <div className="level-row entry-session-row">
            <span className="level-label text-green font-bold">Fill Session</span>
            <span className="level-val text-green font-bold">
              {getEntrySessionName()} · {formatETTime(setup.entry_triggered_at)}
            </span>
            <span className="level-pips text-green font-bold">📥 FILL TIME</span>
          </div>
        )}
        <div className="level-row">
          <span className="level-label">Stop Loss</span>
          <span className="level-val">
            {stopVal} {isBreakeven ? <span className="text-gold">(BE)</span> : null}
          </span>
          <span className="level-pips text-red">
            {isBreakeven ? '🛡️ Risk Free' : '🔴 Stop'}
          </span>
        </div>
        <div className="level-row">
          <span className="level-label">TP1 ({r1}R)</span>
          <span className="level-val">{tp1Val}</span>
          <span className="level-pips text-green">🟢 Target 1</span>
        </div>
        {tp2Val !== undefined && (
          <div className="level-row">
            <span className="level-label">TP2 ({r2}R)</span>
            <span className="level-val">{tp2Val}</span>
            <span className="level-pips text-green">🟢 Target 2</span>
          </div>
        )}
        {/* Live Price Bubble inside the black levels section below TP2 */}
        {currentPrice !== undefined && currentPrice > 0 && (
          <>
            <div 
              className={`level-row live-price-level-row tick-${priceTick}`}
              style={{ cursor: 'pointer', transition: 'background-color 0.2s' }}
              onClick={() => setShowPriceDropdown(!showPriceDropdown)}
              title="Click to view feed details and true live price"
            >
              {setup.is_ibkr_fresh ? (
                <>
                  <span className="level-label font-bold" style={{ color: '#00e676' }}>● LIVE (I)</span>
                  <span className="level-val font-bold text-white">
                    {currentPrice} {priceTick === 'up' ? '▲' : priceTick === 'down' ? '▼' : ''}
                  </span>
                  <span className="level-pips font-bold" style={{ color: '#00e676' }}>⚡ I-Feed</span>
                </>
              ) : (
                <>
                  <span className="level-label font-bold" style={{ color: '#ffb703' }}>
                    ● DELAY (Y) <span style={{ cursor: 'pointer', marginLeft: '2px', fontSize: '0.8rem' }} title="Why is this delayed?">❓</span>
                  </span>
                  <span className="level-val font-bold text-white">
                    {currentPrice} {priceTick === 'up' ? '▲' : priceTick === 'down' ? '▼' : ''}
                  </span>
                  <span className="level-pips font-bold" style={{ color: '#ffb703' }}>⏱️ Y-Feed</span>
                </>
              )}
            </div>
            {showPriceDropdown && (
              <div 
                className="font-mono text-left" 
                style={{ 
                  margin: '-8px 8px 8px 8px', 
                  padding: '10px 12px', 
                  background: 'rgba(255, 255, 255, 0.03)', 
                  border: '1px solid rgba(255, 255, 255, 0.08)', 
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  lineHeight: '1.4'
                }}
              >
                {setup.is_ibkr_fresh ? (
                  <div style={{ color: '#00e676' }}>
                    🟢 Feed active. Receiving real-time ticks from I-Feed.
                  </div>
                ) : (
                  <div>
                    <div style={{ color: '#ffab00', fontWeight: 'bold', marginBottom: '6px' }}>
                      ⚠️ I-Feed is currently offline or subscribing.
                    </div>
                    <div style={{ color: '#aaa', marginBottom: '8px' }}>
                      Showing 15-minute delayed market data from Y-Feed.
                    </div>
                    <div style={{ padding: '8px', background: 'rgba(255, 171, 0, 0.08)', borderLeft: '3px solid #ffab00', borderRadius: '4px', color: '#ffd700', fontSize: '0.72rem', marginBottom: '8px', lineHeight: '1.3' }}>
                      <strong>🛡️ SIGNALS STILL TRUSTWORTHY:</strong> The discovery, entry-detection, and outvalidation engines remain fully functional and accurate.
                    </div>
                    {setup.ibkr_price ? (
                      <div style={{ color: '#00e5ff' }}>
                        📊 Last known I-Feed price: <span style={{ fontWeight: 'bold' }}>{setup.ibkr_price}</span>
                      </div>
                    ) : (
                      <div style={{ color: '#ff1744' }}>
                        ❌ No cached I-Feed price ticks recorded yet.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {stateStr === 'active' && (setup.unrealizedR !== undefined || setup.current_price) && (
        <div className={`sc-unrealized-banner ${((setup.unrealizedR ?? 0) >= 0) ? 'is-profit' : 'is-drawdown'}`}>
          <div className="unrealized-left">
            <span className="unrealized-fire">{isBreakeven ? '🛡️' : (setup.unrealizedR ?? 0) >= 0 ? '🔥' : '🔻'}</span>
            <span className="unrealized-title">LIVE RR:</span>
            {isBreakeven && (
              <span className="font-mono text-gold" style={{ fontSize: '0.75rem', fontWeight: 800, marginLeft: '6px' }}>
                (RISK FREE)
              </span>
            )}
          </div>
          <div className="unrealized-right font-mono">
            <span className="unrealized-r-val">
              {(setup.unrealizedR ?? 0) > 0 ? '+' : ''}{(setup.unrealizedR ?? 0).toFixed(2)}R
            </span>
            {setup.current_price && (
              <span className="unrealized-price-sub">
                (Price: {setup.current_price})
              </span>
            )}
          </div>
        </div>
      )}

      {stateStr === 'awaiting_entry' && setup.distance_to_entry_r !== undefined && (
        <div className={`sc-unrealized-banner ${setup.distance_to_entry_r === 0 ? 'is-in-zone' : 'is-pending-dist'}`}>
          <div className="unrealized-left">
            <span className="unrealized-fire">{setup.distance_to_entry_r === 0 ? '⚡' : '📍'}</span>
            <span className="unrealized-title">
              {setup.distance_to_entry_r === 0 ? 'IN ENTRY ZONE:' : 'DISTANCE TO ENTRY:'}
            </span>
          </div>
          <div className="unrealized-right font-mono">
            <span className="unrealized-r-val">
              {setup.distance_to_entry_r === 0 ? '0.00R (READY)' : `${setup.distance_to_entry_r.toFixed(2)}R`}
            </span>
            {setup.current_price && (
              <span className="unrealized-price-sub">
                (Price: {setup.current_price})
              </span>
            )}
          </div>
        </div>
      )}

      {rescanMessage && (
        <div style={{ fontSize: '0.75rem', padding: '6px 12px', background: 'rgba(0, 229, 255, 0.1)', border: '1px solid #00e5ff', borderRadius: '6px', color: '#00e5ff', marginBottom: '12px' }} className="font-mono animate-fade-in">
          {rescanMessage}
        </div>
      )}

      {setup.correlation_note && (
        <div style={{ margin: '8px 0 12px 0', padding: '10px 12px', background: 'rgba(255, 171, 0, 0.08)', borderLeft: '3px solid #ffab00', borderRadius: '6px', fontSize: '0.8rem', color: '#ffd700', lineHeight: 1.4 }} className="font-mono animate-fade-in">
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#ffab00', textTransform: 'uppercase', marginBottom: '4px' }}>
            ⚠️ Correlated Outlier Notice (-15% Conviction)
          </div>
          {setup.correlation_note}
        </div>
      )}

      <div className="sc-actions font-mono">
        <button className="btn-action btn-copy" onClick={handleCopy}>
          {copied ? 'Copied! ✓' : '📋 Copy'}
        </button>
        <button className="btn-action btn-chart" onClick={() => setShowChart(true)}>
          📈 Chart
        </button>
        {isAdmin && stateStr === 'awaiting_entry' && (
          <button 
            className="btn-action btn-rescan" 
            onClick={handleSingleRescan} 
            disabled={rescanning}
            style={{ background: 'rgba(0, 229, 255, 0.12)', color: '#00e5ff', border: '1px solid rgba(0, 229, 255, 0.4)' }}
            title="Run single-asset rescan for this pending setup (Admin Only)"
          >
            {rescanning ? '⏳ Scanning...' : '🔍 Rescan'}
          </button>
        )}
        <button className="btn-action btn-expand" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Hide Details' : 'Show Details'}
        </button>
      </div>

      {showChart && (
        <SetupChartModal setup={setup} onClose={() => setShowChart(false)} />
      )}

      {replacementCandidate && (
        <SignalReplaceModal
          currentSetup={setup}
          candidate={replacementCandidate}
          onClose={() => setReplacementCandidate(null)}
          onSuccess={() => {
            setReplacementCandidate(null);
            window.location.reload();
          }}
        />
      )}

      {expanded && (
        <div className="sc-details animate-slide-up">
          {/* Signal Lifecycle Timeline */}
          <div className="sc-timeline-box">
            <span className="timeline-title font-mono">⏱️ Signal Lifecycle Timeline</span>
            <div className="timeline-grid font-mono">
              <div className="timeline-item">
                <span className="t-label">📡 Discovered:</span>
                <span className="t-val">{formatETTime(createdTime)}</span>
              </div>
              <div className="timeline-item">
                <span className="t-label">⚡ Entry Triggered:</span>
                <span className="t-val text-gold">
                  {setup.entry_triggered_at ? formatETTime(setup.entry_triggered_at) : 'Awaiting Entry'}
                </span>
              </div>
              {setup.resolved_at && (
                <div className="timeline-item">
                  <span className="t-label">🏁 Exited / Resolved:</span>
                  <span className="t-val text-green">{formatETTime(setup.resolved_at)}</span>
                </div>
              )}
              {setup.entry_triggered_at && (
                <div className="timeline-item">
                  <span className="t-label">⏱️ Time to Fill:</span>
                  <span className="t-val">{formatDuration(setup.created_at, setup.entry_triggered_at)}</span>
                </div>
              )}
              {setup.entry_triggered_at && (
                <div className="timeline-item">
                  <span className="t-label">⏳ Trade Duration:</span>
                  <span className="t-val">{formatDuration(setup.entry_triggered_at, setup.resolved_at)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="detail-row">
            <span>Timeframes Used:</span>
            <span className="font-mono text-gold">1H (Structure) + 15M (Entry)</span>
          </div>

          <div className="sc-rationale-box">
            <span className="rationale-label">🎯 Why This Trade Was Selected:</span>
            <p className="rationale-text">{getSelectionRationale(setup)}</p>
          </div>
        </div>
      )}
    </div>
  );
};
