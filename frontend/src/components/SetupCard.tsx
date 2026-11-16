import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './SetupCard.css';
import { type EdgeSetup } from '../types';
import { StatusBadge } from './StatusBadge';
import { formatETTime, formatETDate, formatETDateTime, formatDuration } from '../utils/time';
import { formatTelegramTradeId } from '../utils/tradeId';
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
import { TelegramResendModal } from './TelegramResendModal';
import { API_BASE } from '../config';
import { useAuth } from '../context/AuthContext';
import { useEdgeFinderSignalConfluence } from '../hooks/useEdgeFinder';

interface SetupCardProps {
  setup: EdgeSetup;
  isWatchlisted?: boolean;
  onToggleWatchlist?: (id: string) => void;
  isTagged?: boolean;
  onToggleTag?: (setupId: string, setup: EdgeSetup) => void;
  onInvalidate?: (id: string) => void;
}

export const SetupCard: React.FC<SetupCardProps> = ({ setup, isWatchlisted = false, onToggleWatchlist, isTagged = false, onToggleTag, onInvalidate }) => {
  const { user, originalAdmin, isImpersonating } = useAuth();
  const isSuperAdmin = (user?.role === 'super_admin' || originalAdmin?.role === 'super_admin') && !isImpersonating;
  const isAdmin = isImpersonating
    ? (user?.role === 'admin' || user?.role === 'super_admin')
    : (user?.role === 'admin' || user?.role === 'super_admin' || originalAdmin?.role === 'admin' || originalAdmin?.role === 'super_admin');
  const {
    canAccessEdgeFinder,
    loading: edgeFinderLoading,
    resolvedSymbol,
    scorecard: edgeFinderScorecard,
    confluence: edgeFinderConfluence
  } = useEdgeFinderSignalConfluence(setup?.instrument || '', setup?.bias || 'long');

  const [expanded, setExpanded] = useState(false);
  const [edgeFinderExpanded, setEdgeFinderExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [showTelegramResend, setShowTelegramResend] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [invalidating, setInvalidating] = useState(false);
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
  const isForex = setup.market === 'forex' || setup.instrument.includes('/');

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

  const handleInvalidateSignal = async () => {
    const confirmed = window.confirm(
      `🚨 SUPERADMIN CONFIRMATION:\n\nAre you sure you want to remove and invalidate the signal for ${setup.instrument}?\n\nThis will:\n1. Invalidate this setup in the database\n2. Dispatch an official Telegram CANCEL notice\n3. Remove it immediately from all client cards.`
    );
    if (!confirmed) return;

    try {
      setInvalidating(true);
      const targetMarket = setup.market || (setup.instrument.includes('/') ? 'forex' : 'futures');
      const res = await fetch(`${API_BASE}/api/admin/signals/${setup.id}/invalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          market: targetMarket,
          reason: 'superadmin_client_dash_removed',
          detail: 'Removed directly from client dashboard by superadmin'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove signal');

      if (onInvalidate) {
        onInvalidate(setup.id);
      }
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (err: any) {
      alert(`⚠️ Failed to remove signal: ${err?.message || String(err)}`);
      setInvalidating(false);
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

  const telegramId = formatTelegramTradeId(setup);

  const handleCopy = () => {
    const text = `Trade ID: ${telegramId}\n${setup.instrument} ${biasRaw.toUpperCase()}\nEntry: ${entryLow} - ${entryHigh}\nStop: ${stopVal}\nTP1: ${tp1Val} (${r1}R)${tp2Val ? `\nTP2: ${tp2Val} (${r2}R)` : ''}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const signalSentTime = setup.created_at || setup.createdAt || setup.validatedAt;
  const createdTime = signalSentTime || new Date().toISOString();

  const isTp1Won = setup.invalidation_reason === 'tp1_hit' || stateStr === 'runner';
  const isBreakeven = Boolean(
    !isTp1Won && (
      setup.is_breakeven ||
      ((stateStr === 'active' || stateStr === 'resolved') && (
        (!setup.halved_floor_tp1_be && setup.unrealizedR !== undefined && setup.unrealizedR >= 1.5)
      ))
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

  // Only show "Exact Fill" if the signal has genuinely been filled:
  // signal_state must be 'active' AND entry_triggered_at must exist.
  // Awaiting-entry signals must never show a fill price even if entry_price_recorded
  // somehow has a value (e.g. from a stale snapshot restore).
  const exactFill =
    setup.signal_state === 'active' && setup.entry_triggered_at
      ? setup.entry_price_recorded || setup.entry_price_executed
      : null;

  const entryTimestamp = setup.entry_triggered_at || setup.entryAt || (stateStr === 'active' || stateStr === 'resolved' || stateStr === 'runner' ? (setup.created_at || setup.createdAt) : null);

  const currentPrice = setup.current_price;
  const isStillInZone = Boolean(
    currentPrice &&
    currentPrice >= entryLow &&
    currentPrice <= entryHigh &&
    (stateStr === 'active' || stateStr === 'awaiting_entry')
  );

  const strategyId = setup.strategy_id || 'sentinel_v2';
  const isMtfIsolated = Boolean(setup.id?.startsWith('mtf-'));
  const meta = (() => {
    try { return typeof setup.metadata === 'string' ? JSON.parse(setup.metadata) : setup.metadata; } catch { return null; }
  })();
  const cardHtfLabel = meta?.htf || meta?.context_tf || '1H';
  const cardLtfLabel = meta?.ltf || meta?.entry_tf || '15M';
  const displayStrategyName =
    strategyId === 'manna_snd'
      ? 'MANNA SND'
      : strategyId === 'manna_scalper'
        ? 'SCALPING (15M · 5M)'
        : strategyId === 'manna_swing'
          ? `SWING (${cardHtfLabel} · ${cardLtfLabel})`
          : 'MANNA ELITE V1.2';

  // Visual Trade Progress Ladder Calculation (0% Stop -> 33% Entry -> 70% TP1 -> 98% TP2)
  const entryMid = setup.entry_zone_mid ?? ((entryLow + entryHigh) / 2);
  const hasTp2 = tp2Val !== undefined && tp2Val !== tp1Val;
  const tp1Pct = hasTp2 ? 70 : 96;
  const tp2Pct = 98;
  const entryPct = 33;
  const stopPct = 2;

  const liveLadderPct = (() => {
    if (currentPrice === undefined || currentPrice <= 0) return null;
    const dir = isLong ? 1 : -1;
    const dCurr = currentPrice * dir;
    const dStop = stopVal * dir;
    const dEntry = entryMid * dir;
    const dTp1 = tp1Val * dir;
    const dTp2 = (hasTp2 ? tp2Val! : tp1Val) * dir;

    const lerp = (p: number, p0: number, p1: number, x0: number, x1: number) => {
      if (p1 === p0) return x0;
      const t = Math.max(0, Math.min(1, (p - p0) / (p1 - p0)));
      return x0 + t * (x1 - x0);
    };

    if (dCurr <= dStop) return stopPct;
    if (dCurr <= dEntry) return lerp(currentPrice, stopVal, entryMid, stopPct, entryPct);
    if (dCurr <= dTp1) return lerp(currentPrice, entryMid, tp1Val, entryPct, tp1Pct);
    if (hasTp2 && dCurr <= dTp2) return lerp(currentPrice, tp1Val, tp2Val!, tp1Pct, tp2Pct);
    return tp2Pct;
  })();

  const isInProfitZone = liveLadderPct !== null && liveLadderPct >= entryPct;

  return (
    <article className={`setup-card glass-card state-${stateStr.toLowerCase()} strat-border-${(strategyId).toLowerCase()}`}>
      {/* Tier 1: Symbol Header + Badges + Conviction */}
      <header className="sc-header">
        <div className="sc-title-group">
          <div className="sc-symbol-row">
            <span className="sc-instrument">{setup.instrument}</span>
            <span className="sc-market font-mono">{(setup.market || 'futures').toUpperCase()}</span>
            <span className={`strategy-badge strat-${(strategyId).toLowerCase()} ${strategyId === 'sentinel_v2' ? 'strategy-tag-sentinel_v2' : ''}`}>
              {displayStrategyName}
            </span>
            {setup.id && (
              <button
                type="button"
                className="sc-trade-id-badge font-mono"
                title={`Telegram Trade ID: ${telegramId}\nClick to copy`}
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(telegramId);
                  setCopiedId(true);
                  setTimeout(() => setCopiedId(false), 2000);
                }}
              >
                {copiedId ? '✓ COPIED' : telegramId}
              </button>
            )}
          </div>

          <div className="sc-badges-row">
            <span className={`sc-bias ${isLong ? 'bias-long' : 'bias-short'}`}>
              {isLong ? '▲ LONG' : '▼ SHORT'}
            </span>
            <span className="order-type-badge font-mono" title={`Order Type: ${orderTypeStr}`}>
              {orderTypeStr}
            </span>
            {strategyId === 'sentinel_v2' && isSuperAdmin ? (
              <>
                {meta?.context_tf && (
                  <span className="sc-meta-tag font-mono">{meta.context_tf}</span>
                )}
                {meta?.entry_tf && (
                  <span className="sc-meta-tag font-mono">{meta.entry_tf}</span>
                )}
                {meta?.poi_type && (
                  <span className="poi-badge font-mono">{meta.poi_type}</span>
                )}
                {meta?.cycle_priority && (
                  <span className="cycle-priority-badge font-mono">CYCLE PRIORITY</span>
                )}
              </>
            ) : (
              <>
                <span className="tf-badge htf">{cardHtfLabel} Context</span>
                <span className="tf-badge ltf">{cardLtfLabel} Entry</span>
              </>
            )}
            {isStillInZone && (
              <span className="sc-pill-in-zone font-mono">IN ENTRY ZONE</span>
            )}
            {isTp1Won ? (
              <span className="badge-tp1 font-mono">
                TP1 HIT +{r1}R
              </span>
            ) : isBreakeven ? (
              <span className="be-badge font-mono" title="Stop Loss moved to Entry to lock in risk-free position">
                BREAK EVEN
              </span>
            ) : null}
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
          <div className="sc-right-stack">
            <div className="sc-top-ctrl-row">
              {onToggleWatchlist && (
                <button
                  type="button"
                  className={`sc-eye-btn ${isWatchlisted ? 'is-starred' : ''}`}
                  onClick={(e) => { e.stopPropagation(); onToggleWatchlist(setup.id); }}
                  title={isWatchlisted ? 'Remove from Watchlist' : 'Add to Watchlist'}
                  aria-label={isWatchlisted ? 'Remove from Watchlist' : 'Add to Watchlist'}
                >
                  <span className="eye-icon">{isWatchlisted ? '★' : '☆'}</span>
                  <span>{isWatchlisted ? 'Watching' : 'Watch'}</span>
                </button>
              )}
              <StatusBadge status={stateStr} />
            </div>
            <span className="conviction-text-badge">{convictionVal}% Conviction</span>
          </div>
        </div>
      </header>

      {/* Tier 2: Horizontal Visual Trade Progress Ladder */}
      <div className="sc-ladder-box font-mono" aria-label="Trade price progress ladder">
        <div className="sc-ladder-track">
          <div className="sc-ladder-risk-seg" style={{ width: `${entryPct}%` }} />
          <div
            className="sc-ladder-profit-seg"
            style={{
              left: `${entryPct}%`,
              width: `${tp2Pct - entryPct}%`
            }}
          />
          {liveLadderPct !== null && (
            <div
              className={`sc-ladder-fill ${isInProfitZone ? 'is-profit' : 'is-risk'}`}
              style={{
                left: `${Math.min(entryPct, liveLadderPct)}%`,
                width: `${Math.abs(liveLadderPct - entryPct)}%`
              }}
            />
          )}
          <span className="sc-ladder-node is-stop" style={{ left: `${stopPct}%` }} />
          <span className={`sc-ladder-entry-band ${isStillInZone ? 'is-in-zone' : ''}`} style={{ left: `${entryPct}%` }} />
          <span className={`sc-ladder-node is-tp1 ${isTp1Won ? 'is-hit' : ''}`} style={{ left: `${tp1Pct}%` }} />
          {hasTp2 && <span className="sc-ladder-node is-tp2" style={{ left: `${tp2Pct}%` }} />}

          {liveLadderPct !== null && (
            <div
              className={`sc-ladder-live-dot ${isInProfitZone ? 'is-profit' : 'is-risk'} tick-${priceTick}`}
              style={{ left: `${liveLadderPct}%` }}
              title={`Current Price: ${currentPrice}`}
            />
          )}
        </div>

        <div className={`sc-ladder-labels ${hasTp2 ? 'cols-4' : 'cols-3'}`}>
          <div className="sc-ll-col align-left">
            <span className="sc-ll-k">STOP LOSS {isBreakeven ? '(BE)' : ''}</span>
            <span className="sc-ll-v text-red">{stopVal}</span>
          </div>
          <div className="sc-ll-col align-center">
            <span className="sc-ll-k">ENTRY ZONE</span>
            <span className="sc-ll-v text-gold">{entryLow} – {entryHigh}</span>
          </div>
          <div className={`sc-ll-col ${hasTp2 ? 'align-center' : 'align-right'}`}>
            <span className="sc-ll-k">TP1 (+{r1}R)</span>
            <span className="sc-ll-v text-green">{tp1Val}</span>
          </div>
          {hasTp2 && (
            <div className="sc-ll-col align-right">
              <span className="sc-ll-k">TP2 (+{r2}R)</span>
              <span className="sc-ll-v text-green">{tp2Val}</span>
            </div>
          )}
        </div>
      </div>

      {/* Tier 3: Compact 2-Column Telemetry Grid */}
      <div className="sc-telemetry-grid font-mono">
        <div className="sc-tel-cell">
          <span className="sc-tel-k">Signal Sent</span>
          <span className="sc-tel-v">
            {formatETDate(signalSentTime || createdTime)} · {formatETTime(signalSentTime || createdTime)}
          </span>
        </div>

        <div className="sc-tel-cell">
          <span className="sc-tel-k">Time Entered</span>
          {entryTimestamp ? (
            <span className="sc-tel-v text-green">
              {formatETDate(entryTimestamp)} · {formatETTime(entryTimestamp)}
              {getEntrySessionName() ? ` (${getEntrySessionName()})` : ''}
            </span>
          ) : (
            <span className="sc-tel-v" style={{ color: stateStr === 'awaiting_entry' ? 'var(--kdt-gold)' : 'var(--text-muted)' }}>
              {stateStr === 'awaiting_entry' ? 'Awaiting Entry' : 'Not Entered'}
            </span>
          )}
        </div>

        {currentPrice !== undefined && currentPrice > 0 && (
          <div
            className={`sc-tel-cell is-live tick-${priceTick}`}
            style={{ cursor: isForex ? 'default' : 'pointer' }}
            onClick={() => { if (!isForex) setShowPriceDropdown(!showPriceDropdown); }}
            title={isForex ? undefined : 'Click to inspect live price feed status'}
          >
            <span className="sc-tel-k">
              {isForex ? 'Live Feed' : setup.is_ibkr_fresh ? 'Live (I-Feed)' : 'Delayed (Y-Feed) ▾'}
            </span>
            <span className="sc-tel-v">
              <strong>{currentPrice}</strong>{' '}
              <span className={priceTick === 'up' ? 'text-green' : priceTick === 'down' ? 'text-red' : ''}>
                {priceTick === 'up' ? '▲' : priceTick === 'down' ? '▼' : '•'}
              </span>
            </span>
          </div>
        )}

        <div className="sc-tel-cell">
          {stateStr === 'active' && setup.unrealizedR !== undefined ? (
            <>
              <span className="sc-tel-k">
                {exactFill ? `Fill ${exactFill} · Live RR` : 'Live RR'}
              </span>
              <span className={`sc-tel-v ${(setup.unrealizedR ?? 0) >= 0 ? 'text-green' : 'text-red'}`}>
                {(setup.unrealizedR ?? 0) > 0 ? '+' : ''}{(setup.unrealizedR ?? 0).toFixed(2)}R
                {isBreakeven ? ' (BE)' : ''}
              </span>
            </>
          ) : stateStr === 'awaiting_entry' && setup.distance_to_entry_r !== undefined ? (
            <>
              <span className="sc-tel-k">Entry Proximity</span>
              <span className={`sc-tel-v ${setup.distance_to_entry_r === 0 ? 'text-green' : 'text-gold'}`}>
                {setup.distance_to_entry_r === 0 ? 'In Zone (Ready)' : `${setup.distance_to_entry_r.toFixed(2)}R away`}
              </span>
            </>
          ) : (
            <>
              <span className="sc-tel-k">Trade State</span>
              <span className="sc-tel-v">{stateStr.replace('_', ' ').toUpperCase()}</span>
            </>
          )}
        </div>
      </div>

      {!isForex && showPriceDropdown && (
        <div className="sc-feed-note font-mono">
          {setup.is_ibkr_fresh ? (
            <span className="text-green">Feed active — receiving real-time I-Feed price ticks.</span>
          ) : (
            <div>
              <div style={{ color: '#F59E0B', fontWeight: 700, marginBottom: 4 }}>
                Showing 15-minute delayed Y-Feed market data while I-Feed syncs.
              </div>
              <div style={{ color: '#B8AFCE' }}>
                Discovery, entry detection, and invalidation remain real-time and unaffected.
                {setup.ibkr_price ? ` Last I-Feed print: ${setup.ibkr_price}` : ''}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tier 4: Collapsed EdgeFinder Confluence Bar (Role-Gated: SuperAdmin Always / Admin & Client via Toggle) */}
      {canAccessEdgeFinder && (
        <div
          className={`sc-edgefinder-panel font-mono state-${(edgeFinderConfluence?.state || 'LOADING').toLowerCase()} ${edgeFinderExpanded ? 'is-expanded' : 'is-collapsed'}`}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="sc-ef-toggle-btn font-mono"
            aria-expanded={edgeFinderExpanded}
            onClick={(e) => {
              e.stopPropagation();
              setEdgeFinderExpanded((prev) => !prev);
            }}
          >
            <span className="sc-ef-status-group">
              <span className="sc-ef-kicker">EDGEFINDER CONFLUENCE</span>
              {edgeFinderConfluence ? (
                <span className={`sc-ef-badge is-${edgeFinderConfluence.state.toLowerCase()}`}>
                  {edgeFinderConfluence.state === 'STRONG_AGREEMENT'
                    ? '✓ '
                    : edgeFinderConfluence.state === 'AGREES'
                      ? '✓ '
                      : edgeFinderConfluence.state === 'COUNTER'
                        ? '! '
                        : '≈ '}
                  {edgeFinderConfluence.badgeText}
                </span>
              ) : edgeFinderLoading ? (
                <span className="sc-ef-loading">Syncing bias...</span>
              ) : (
                <span className="sc-ef-badge is-neutral">SCORECARD READY</span>
              )}
            </span>

            <span className="sc-ef-chevron">
              {edgeFinderExpanded ? 'Hide ▲' : 'Expand ▾'}
            </span>
          </button>

          {edgeFinderExpanded && (
            <div className="sc-ef-expanded-body">
              {edgeFinderConfluence && edgeFinderScorecard && (
                <>
                  <div className="sc-ef-horizons-row">
                    {edgeFinderConfluence.horizons.map((h) => (
                      <span
                        key={h.key}
                        className={`sc-ef-h-chip status-${h.status.toLowerCase()}`}
                        title={`${h.label} EdgeFinder view: ${h.biasLabel} (${h.score >= 0 ? `+${h.score.toFixed(1)}` : h.score.toFixed(1)})`}
                      >
                        <span className="sc-ef-h-name">{h.label}:</span>{' '}
                        <strong>{h.biasLabel}</strong>
                        <span className="sc-ef-h-score">
                          {' '}
                          ({h.score >= 0 ? `+${h.score.toFixed(1)}` : h.score.toFixed(1)})
                        </span>
                      </span>
                    ))}
                  </div>
                  <div className="sc-ef-summary">{edgeFinderConfluence.summaryText}</div>
                </>
              )}

              <div className="sc-ef-note-row">
                <Link
                  to={`/edge-finder?asset=${encodeURIComponent(resolvedSymbol)}&tab=scorecard`}
                  className="sc-ef-link-btn"
                  title={`Open ${resolvedSymbol} EdgeFinder Pro Scorecard`}
                >
                  Open {resolvedSymbol} EdgeFinder →
                </Link>
                <span className="sc-ef-readonly-tag">Read-only context · Signal unchanged</span>
              </div>
            </div>
          )}
        </div>
      )}

      {setup.opposing_strategy_warning && (
        <div className="sc-inline-alert is-gold font-mono animate-fade-in">
          {setup.opposing_strategy_warning}
        </div>
      )}

      {rescanMessage && (
        <div className="sc-inline-alert is-cyan font-mono animate-fade-in">
          {rescanMessage}
        </div>
      )}

      {setup.correlation_note && (
        <div className="sc-inline-alert is-gold font-mono animate-fade-in">
          <strong>Correlated Outlier Notice (-15% Conviction): </strong>
          {setup.correlation_note}
        </div>
      )}

      <footer className="sc-actions font-mono">
        <button type="button" className="btn-action btn-chart" onClick={() => setShowChart(true)}>
          Chart
        </button>
        <button type="button" className="btn-action btn-copy" onClick={handleCopy}>
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
        {onToggleTag && (
          <button
            type="button"
            className={`btn-action btn-tag${isTagged ? ' btn-tag--active' : ''}`}
            onClick={() => onToggleTag(setup.id, setup)}
            title={isTagged ? 'Remove demo tag from this signal' : 'Tag this signal — you plan to demo trade it'}
          >
            {isTagged ? 'Tagged ★' : 'Tag'}
          </button>
        )}
        <button type="button" className="btn-action btn-expand" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Hide Details' : 'Details'}
        </button>
        {!isMtfIsolated && isAdmin && stateStr === 'awaiting_entry' && (
          <button
            type="button"
            className="btn-action btn-rescan"
            onClick={handleSingleRescan}
            disabled={rescanning}
            title="Admin Only: Run single-asset rescan for this pending setup"
          >
            {rescanning ? 'Scanning...' : 'Rescan'}
          </button>
        )}
        {!isMtfIsolated && isSuperAdmin && (
          <button
            type="button"
            className="btn-action btn-resend-tg"
            onClick={() => setShowTelegramResend(true)}
            title="Super Admin Only: Resend this signal to Telegram (with optional new Trade ID)"
          >
            Resend TG
          </button>
        )}
        {!isMtfIsolated && isSuperAdmin && stateStr !== 'resolved' && stateStr !== 'invalidated' && (
          <button
            type="button"
            className="btn-action btn-invalidate"
            onClick={handleInvalidateSignal}
            disabled={invalidating}
            title="Super Admin Only: Invalidate and remove this signal from client dashboard"
          >
            {invalidating ? 'Removing...' : 'Remove'}
          </button>
        )}
      </footer>

      {showChart && (
        <SetupChartModal setup={setup} onClose={() => setShowChart(false)} />
      )}

      {showTelegramResend && (
        <TelegramResendModal
          setup={setup}
          isOpen={showTelegramResend}
          onClose={() => setShowTelegramResend(false)}
          onSuccess={(newSetupId) => {
            if (newSetupId && newSetupId !== setup.id) {
              setup.id = newSetupId;
            }
            setTimeout(() => window.location.reload(), 600);
          }}
        />
      )}

      {replacementCandidate && (
        <SignalReplaceModal
          currentSetup={setup}
          candidate={replacementCandidate}
          onClose={() => setReplacementCandidate(null)}
          onSuccess={() => {
            setReplacementCandidate(null);
            // Delay reload slightly so the DB write fully commits before the
            // page re-fetches — otherwise the old signal can still appear.
            setTimeout(() => window.location.reload(), 800);
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
                <span className="t-label">📡 Signal Sent:</span>
                <span className="t-val">{formatETDateTime(createdTime)}</span>
              </div>
              <div className="timeline-item">
                <span className="t-label">📥 Time Entered:</span>
                <span className="t-val text-gold">
                  {setup.entry_triggered_at ? formatETDateTime(setup.entry_triggered_at) : 'Awaiting Entry'}
                </span>
              </div>
              {setup.resolved_at && (
                <div className="timeline-item">
                  <span className="t-label">🏁 Exited / Resolved:</span>
                  <span className="t-val text-green">{formatETDateTime(setup.resolved_at)}</span>
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
            <span>Trade ID:</span>
            <span 
              className="font-mono text-gold copyable-id"
              style={{ cursor: 'pointer', fontSize: '0.82rem', wordBreak: 'break-all' }}
              onClick={() => {
                navigator.clipboard.writeText(telegramId);
                setCopiedId(true);
                setTimeout(() => setCopiedId(false), 2000);
              }}
              title={`Telegram Trade ID: ${telegramId}\nClick to copy`}
            >
              {telegramId} {copiedId ? '✓ Copied' : '📋'}
            </span>
          </div>

          <div className="detail-row">
            <span>Timeframes Used:</span>
            <span className="font-mono text-gold">{cardHtfLabel} (Structure) + {cardLtfLabel} (Entry)</span>
          </div>

          <div className="sc-rationale-box">
            <span className="rationale-label">Selection Rationale</span>
            <p className="rationale-text">{getSelectionRationale(setup)}</p>
          </div>
        </div>
      )}
    </article>
  );
};
