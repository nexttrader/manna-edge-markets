import React, { useState } from 'react';
import { useExclusiveSignals, type StateMachineTelemetry, type InstrumentAnalytics } from '../../hooks/useExclusiveSignals';
import { type EdgeSetup } from '../../types';
import { formatETTime } from '../../utils/time';
import { SetupChartModal } from '../SetupChartModal';
import { ExpandableCalendar } from '../ExpandableCalendar';

// Phase color map
const PHASE_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  SCANNING:    { bg: 'rgba(100,116,139,0.15)', border: 'rgba(100,116,139,0.4)', text: '#94a3b8', dot: '#64748b' },
  CANDIDATE:   { bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.4)',  text: '#fbbf24', dot: '#f59e0b' },
  VALIDATED:   { bg: 'rgba(139,92,246,0.15)',  border: 'rgba(139,92,246,0.4)',  text: '#a78bfa', dot: '#8b5cf6' },
  ENTRY_READY: { bg: 'rgba(16,185,129,0.15)',  border: 'rgba(16,185,129,0.4)',  text: '#34d399', dot: '#10b981' },
  REJECTED:    { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)',   text: '#f87171', dot: '#ef4444' }
};

const STATE_LABELS: Record<string, string> = {
  IDLE: 'Idle — Monitoring',
  H1_POI_DETECTED: 'H1 POI Detected',
  M15_OC_FORMED: 'M15 OC Formed',
  M15_RETRACEMENT_ACTIVE: 'M15 Retracement',
  M15_POI_TAPPED: 'M15 POI Tapped',
  M15_REVERSAL_CONFIRMED: 'M15 Reversal ✓',
  M5_SCANNING: 'M5 Scanning',
  M5_SWING_CONFIRMED: 'M5 Swing ✓',
  M1_SCANNING: 'M1 Scanning',
  M1_OC_CONFIRMED: 'M1 OC Confirmed',
  ENTRY_READY: 'ENTRY READY ⚡',
  INVALIDATED: 'Invalidated ✗'
};

const PHASE_PIPELINE = [
  { phase: 'SCANNING',    label: 'H1 Context Scanning', icon: '🔭', step: 1 },
  { phase: 'CANDIDATE',   label: 'M15 Setup Building',  icon: '🏗️', step: 2 },
  { phase: 'VALIDATED',   label: 'M5 Confirmation',     icon: '✅', step: 3 },
  { phase: 'ENTRY_READY', label: 'M1 Entry Trigger',    icon: '⚡', step: 4 },
];

function fmtPrice(v: number | undefined, market?: string): string {
  if (v == null) return '—';
  return market === 'forex' ? v.toFixed(5) : v.toFixed(2);
}

function formatTradeId(id: string | undefined): string {
  if (!id) return '#EF-—';
  const parts = id.split('_');
  if (parts.length >= 4) {
    const symbol = parts.slice(1, parts.length - 2).join('').toUpperCase();
    const hash = parts[parts.length - 1].toUpperCase();
    return `#EF-${symbol}-${hash}`;
  }
  return `#${id.slice(0, 14).toUpperCase()}`;
}

const PhaseCard: React.FC<{ phase: string; label: string; icon: string; count: number; active: boolean }> = ({ phase, label, icon, count, active }) => {
  const colors = PHASE_COLORS[phase] || PHASE_COLORS.SCANNING;
  return (
    <div style={{
      background: active ? colors.bg : 'rgba(15,20,40,0.6)',
      border: `1px solid ${active ? colors.border : 'rgba(255,255,255,0.06)'}`,
      borderRadius: '10px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px', transition: 'all 0.3s ease', minWidth: '140px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '1.1rem' }}>{icon}</span>
        <span style={{ fontSize: '1.6rem', fontWeight: 900, color: active ? colors.text : '#4a5568', fontFamily: 'monospace' }}>{count}</span>
      </div>
      <div style={{ fontSize: '0.72rem', color: active ? colors.text : '#4a5568', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  );
};

const InstrumentTelemetryCard: React.FC<{
  t: StateMachineTelemetry;
  onViewChart: (t: StateMachineTelemetry) => void;
}> = ({ t, onViewChart }) => {
  const colors = PHASE_COLORS[t.phase] || PHASE_COLORS.SCANNING;
  const isHot = t.phase === 'ENTRY_READY' || t.phase === 'VALIDATED';
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={() => onViewChart(t)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: isHot
          ? (hovered ? 'rgba(25,18,55,0.95)' : colors.bg)
          : (hovered ? 'rgba(30,25,50,0.85)' : 'rgba(15,20,35,0.7)'),
        border: `1px solid ${hovered ? '#a78bfa' : (isHot ? colors.border : 'rgba(255,255,255,0.07)')}`,
        borderRadius: '10px',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: hovered ? '0 4px 14px rgba(139,92,246,0.25)' : 'none'
      }}
    >
      {isHot && (
        <div style={{ position: 'absolute', top: 0, right: 0, width: '4px', height: '100%', background: colors.dot, borderRadius: '0 10px 10px 0' }} />
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#e2e8f0', fontFamily: 'monospace' }}>{t.instrument}</span>
        <span style={{ fontSize: '0.62rem', background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text, borderRadius: '20px', padding: '2px 8px', fontWeight: 700 }}>
          {t.phase}
        </span>
      </div>
      <div style={{ fontSize: '0.74rem', color: colors.text, fontWeight: 700 }}>
        {STATE_LABELS[t.state] || t.state}
      </div>
      {t.h1PoiType && (
        <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>
          H1: <strong style={{ color: '#cbd5e1' }}>{t.h1PoiType}</strong> {t.h1PoiLevel ? `@ ${t.h1PoiLevel.toFixed(4)}` : ''}
        </div>
      )}
      {(t.m1OcCount != null && t.m1OcCount > 0) && (
        <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>
          M1 OCs: <strong style={{ color: '#34d399' }}>{t.m1OcCount}/2 Formed</strong>
        </div>
      )}
      {t.convictionScore && (
        <div style={{ fontSize: '0.66rem', color: colors.text, fontWeight: 800 }}>
          {t.convictionScore.toFixed(1)}% conviction
        </div>
      )}
      {(t.entryZoneLow != null || t.stop != null || t.tp1 != null) && (
        <div style={{
          background: 'rgba(0,0,0,0.35)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '6px',
          padding: '4px 6px',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '4px',
          textAlign: 'center',
          marginTop: '2px'
        }}>
          <div>
            <div style={{ fontSize: '0.55rem', color: '#94a3b8', textTransform: 'uppercase' }}>Entry</div>
            <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#e2e8f0', fontFamily: 'monospace' }}>
              {fmtPrice(t.entryZoneLow || t.h1PoiLevel, t.instrument.includes('/') ? 'forex' : 'futures')}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.55rem', color: '#f87171', textTransform: 'uppercase' }}>Stop</div>
            <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#f87171', fontFamily: 'monospace' }}>
              {fmtPrice(t.stop || t.m15SwingHigh, t.instrument.includes('/') ? 'forex' : 'futures')}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.55rem', color: '#34d399', textTransform: 'uppercase' }}>Target (2R)</div>
            <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#34d399', fontFamily: 'monospace' }}>
              {fmtPrice(t.tp1, t.instrument.includes('/') ? 'forex' : 'futures')}
            </div>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ fontSize: '0.6rem', color: '#64748b' }}>
          {t.lastScannedAt ? `Scan: ${new Date(t.lastScannedAt).toLocaleTimeString()}` : '—'}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onViewChart(t);
          }}
          style={{
            background: isHot ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${isHot ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.12)'}`,
            color: isHot ? '#c084fc' : '#cbd5e1',
            borderRadius: '6px',
            padding: '3px 8px',
            fontSize: '0.65rem',
            cursor: 'pointer',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          📊 Live Chart
        </button>
      </div>
    </div>
  );
};

// Session display helper (mirrors backend killzone-mapper logic)
function getSessionFromTime(isoStr?: string | null): string {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    const etHour = parseInt(
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false }).format(d),
      10
    );
    if (etHour >= 20 || etHour < 2) return 'Asia';
    if (etHour >= 2 && etHour < 8)  return 'London';
    if (etHour >= 8 && etHour < 14) return 'NY AM';
    if (etHour >= 14 && etHour < 20) return 'NY PM';
    return '—';
  } catch { return '—'; }
}

const SESSION_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  'Asia':    { bg: 'rgba(251,191,36,0.15)',  border: 'rgba(251,191,36,0.5)',  text: '#fbbf24' },
  'London':  { bg: 'rgba(56,189,248,0.15)',  border: 'rgba(56,189,248,0.5)',  text: '#38bdf8' },
  'NY AM':   { bg: 'rgba(34,197,94,0.15)',   border: 'rgba(34,197,94,0.5)',   text: '#4ade80' },
  'NY PM':   { bg: 'rgba(168,85,247,0.15)',  border: 'rgba(168,85,247,0.5)',  text: '#c084fc' },
};

const SessionBadge: React.FC<{ label: string; session: string; dim?: boolean }> = ({ label, session, dim }) => {
  const colors = SESSION_COLORS[session] || { bg: 'rgba(100,116,139,0.15)', border: 'rgba(100,116,139,0.4)', text: '#94a3b8' };
  return (
    <span style={{
      background: dim ? 'rgba(255,255,255,0.05)' : colors.bg,
      border: `1px solid ${dim ? 'rgba(255,255,255,0.1)' : colors.border}`,
      color: dim ? '#718096' : colors.text,
      borderRadius: '6px',
      padding: '2px 8px',
      fontSize: '0.62rem',
      fontWeight: 700,
      whiteSpace: 'nowrap'
    }}>
      {label}: {session}
    </span>
  );
};

const ExclusiveSignalCard: React.FC<{ signal: EdgeSetup; onDismiss: (id: string) => void; isRunner?: boolean }> = ({ signal, onDismiss, isRunner }) => {
  const [dismissing, setDismissing] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const isForex = signal.market === 'forex';
  const meta = (() => { try { return JSON.parse(signal.metadata || '{}'); } catch { return {}; } })();

  // Market-based theming — FOREX = violet/purple, FUTURES = cyan/blue
  const marketTheme = isForex
    ? {
        bg:      'linear-gradient(135deg, rgba(20,12,50,0.97) 0%, rgba(32,16,72,0.97) 100%)',
        border:  'rgba(139,92,246,0.5)',
        accent:  '#8b5cf6',
        accentLight: '#a78bfa',
        accentBg: 'rgba(139,92,246,0.15)',
        accentText: '#a78bfa',
        marketLabel: '💱 FOREX',
        labelBg: 'rgba(139,92,246,0.15)',
        labelBorder: 'rgba(139,92,246,0.5)',
        labelColor: '#a78bfa'
      }
    : {
        bg:      'linear-gradient(135deg, rgba(10,20,50,0.97) 0%, rgba(10,30,65,0.97) 100%)',
        border:  'rgba(56,189,248,0.5)',
        accent:  '#0ea5e9',
        accentLight: '#38bdf8',
        accentBg: 'rgba(56,189,248,0.15)',
        accentText: '#38bdf8',
        marketLabel: '📊 FUTURES',
        labelBg: 'rgba(56,189,248,0.15)',
        labelBorder: 'rgba(56,189,248,0.5)',
        labelColor: '#38bdf8'
      };

  const runnerTheme = {
    bg:     'linear-gradient(135deg, rgba(80,30,15,0.98) 0%, rgba(55,20,8,0.98) 100%)',
    border: 'rgba(251,146,60,0.6)',
    accent: '#f97316',
  };

  const theme = isRunner ? runnerTheme : marketTheme;

  const handleDismiss = async () => {
    if (!confirm('Dismiss this exclusive signal?')) return;
    setDismissing(true);
    await onDismiss(signal.id);
    setDismissing(false);
  };

  // Derive session labels
  const sessionFound = meta.session_found
    ? (meta.session_found === 'ny_am' ? 'NY AM' : meta.session_found === 'ny_pm' ? 'NY PM' : meta.session_found.charAt(0).toUpperCase() + meta.session_found.slice(1))
    : getSessionFromTime(signal.created_at);

  const sessionExited = meta.session_exited
    ? (meta.session_exited === 'ny_am' ? 'NY AM' : meta.session_exited === 'ny_pm' ? 'NY PM' : meta.session_exited.charAt(0).toUpperCase() + meta.session_exited.slice(1))
    : (signal.resolved_at ? getSessionFromTime(signal.resolved_at) : null);

  const entryTime = signal.entry_triggered_at || signal.created_at;
  const exitTime  = signal.resolved_at;

  return (
    <>
      <div style={{
        background: theme.bg,
        border: `1px solid ${theme.border}`,
        borderLeft: isRunner ? `5px solid ${runnerTheme.accent}` : `5px solid ${isForex ? '#8b5cf6' : '#0ea5e9'}`,
        borderRadius: '12px',
        padding: '14px 16px',
        position: 'relative',
        overflow: 'hidden'
      }}>

        {/* ── ROW 1: Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
          {/* Left: instrument + badges */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 900, fontSize: '1.1rem', color: '#e2e8f0', fontFamily: 'monospace', letterSpacing: '0.04em' }}>
                {signal.instrument}
              </span>
              <span style={{
                background: signal.bias === 'long' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                border: `1px solid ${signal.bias === 'long' ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)'}`,
                color: signal.bias === 'long' ? '#34d399' : '#f87171',
                borderRadius: '20px',
                padding: '2px 10px',
                fontSize: '0.7rem',
                fontWeight: 800
              }}>
                {signal.bias === 'long' ? '▲ BUY' : '▼ SELL'}
              </span>
              {/* Market badge */}
              <span style={{ background: marketTheme.labelBg, border: `1px solid ${marketTheme.labelBorder}`, color: marketTheme.labelColor, borderRadius: '20px', padding: '2px 10px', fontSize: '0.66rem', fontWeight: 800 }}>
                {marketTheme.marketLabel}
              </span>
              {/* Strategy badge */}
              <span style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', borderRadius: '20px', padding: '2px 10px', fontSize: '0.62rem', fontWeight: 700 }}>ELITE FRACTAL</span>

              {/* Unique Trade ID */}
              <span style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.35)', color: '#38bdf8', borderRadius: '20px', padding: '2px 9px', fontSize: '0.64rem', fontFamily: 'monospace', fontWeight: 800 }}>
                {formatTradeId(signal.id)}
              </span>

              {/* State badge */}
              {isRunner ? (
                <span style={{ background: 'rgba(249,115,22,0.18)', border: '1px solid rgba(249,115,22,0.6)', color: '#fb923c', borderRadius: '20px', padding: '2px 10px', fontSize: '0.68rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f97316', boxShadow: '0 0 6px #f97316', display: 'inline-block' }} />
                  🏃 RUNNER · TP1 (+2R) BOOKED · STOP @ BE
                </span>
              ) : signal.signal_state === 'active' ? (
                <span style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.5)', color: '#34d399', borderRadius: '20px', padding: '2px 10px', fontSize: '0.68rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399', display: 'inline-block' }} />
                  ACTIVE
                </span>
              ) : (
                <span style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.5)', color: '#fbbf24', borderRadius: '20px', padding: '2px 10px', fontSize: '0.68rem', fontWeight: 800 }}>
                  ⏳ PENDING FILL
                </span>
              )}

              {/* Live Price chip */}
              {signal.current_price && (
                <span style={{ background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.4)', color: '#38bdf8', borderRadius: '20px', padding: '2px 10px', fontSize: '0.68rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#38bdf8', display: 'inline-block', boxShadow: '0 0 6px #38bdf8' }} />
                  ● {fmtPrice(signal.current_price, signal.market)}
                </span>
              )}
            </div>

            {/* ── Timing & Session Row ── */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.68rem', color: '#4a5568' }}>
                ⚡ <strong style={{ color: '#94a3b8' }}>Entry:</strong> {entryTime ? formatETTime(entryTime) : '—'}
              </span>
              {exitTime && (
                <span style={{ fontSize: '0.68rem', color: '#4a5568' }}>
                  🏁 <strong style={{ color: '#f87171' }}>Exit:</strong> {formatETTime(exitTime)}
                </span>
              )}
              <SessionBadge label="Found" session={sessionFound} />
              {sessionExited && <SessionBadge label="Exited" session={sessionExited} />}
            </div>
          </div>

          {/* Right: conviction + buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {signal.conviction_score && (
              <div style={{ textAlign: 'center', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '6px 10px' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: isForex ? '#a78bfa' : '#38bdf8', fontFamily: 'monospace' }}>
                  {signal.conviction_score.toFixed(0)}%
                </div>
                <div style={{ fontSize: '0.55rem', color: '#718096', textTransform: 'uppercase' }}>Conviction</div>
              </div>
            )}
            <button
              onClick={() => setShowChart(true)}
              style={{
                background: isForex ? 'linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)' : 'linear-gradient(135deg, #0369a1 0%, #075985 100%)',
                border: `1px solid ${isForex ? 'rgba(167,139,250,0.6)' : 'rgba(56,189,248,0.5)'}`,
                color: '#f0f9ff',
                borderRadius: '8px',
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: '0.72rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              📊 Chart
            </button>
            <button
              onClick={handleDismiss}
              disabled={dismissing}
              style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                color: '#f87171',
                borderRadius: '8px',
                padding: '6px 10px',
                cursor: 'pointer',
                fontSize: '0.72rem',
                fontWeight: 700
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── LIVE RR BANNER (active/runner trades only) ── */}
        {(signal.signal_state === 'active' || isRunner) && (signal.unrealizedR !== undefined || signal.current_price) && (
          <div style={{
            background: isRunner
              ? 'linear-gradient(90deg, rgba(249,115,22,0.18) 0%, rgba(20,15,40,0.6) 100%)'
              : (signal.unrealizedR ?? 0) >= 0
                ? 'linear-gradient(90deg, rgba(16,185,129,0.18) 0%, transparent 100%)'
                : 'linear-gradient(90deg, rgba(239,68,68,0.18) 0%, transparent 100%)',
            border: `1px solid ${isRunner ? 'rgba(249,115,22,0.45)' : (signal.unrealizedR ?? 0) >= 0 ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`,
            borderRadius: '10px',
            padding: '10px 14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '10px',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.3rem' }}>{isRunner ? '🏃' : (signal.is_breakeven ? '🛡️' : ((signal.unrealizedR ?? 0) >= 0 ? '🔥' : '🔻'))}</span>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: isRunner ? '#fb923c' : (signal.unrealizedR ?? 0) >= 0 ? '#34d399' : '#f87171', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  {isRunner ? 'RUNNER IN PLAY' : 'LIVE RR'}
                  {isRunner && (
                    <span style={{ background: 'rgba(34,197,94,0.18)', border: '1px solid rgba(34,197,94,0.4)', color: '#4ade80', borderRadius: '4px', padding: '1px 6px', fontSize: '0.62rem', fontWeight: 900 }}>
                      ✓ TP1 (+2.00R) SECURED
                    </span>
                  )}
                  {signal.is_breakeven && !isRunner && (
                    <span style={{ background: 'rgba(56,189,248,0.18)', border: '1px solid rgba(56,189,248,0.4)', color: '#38bdf8', borderRadius: '4px', padding: '1px 6px', fontSize: '0.62rem' }}>
                      RISK-FREE
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '2px' }}>
                  {isRunner
                    ? `Stop locked @ Break-Even (${fmtPrice(signal.stop, signal.market)}) · Current Runner Float: ${(signal.unrealizedR ?? 0) > 0 ? '+' : ''}${(signal.unrealizedR ?? 0).toFixed(2)}R · Aiming for TP2 (+3.50R)`
                    : `Current Price: ${fmtPrice(signal.current_price, signal.market)} · Target 1: ${fmtPrice(signal.tp1, signal.market)} (+2.0R)`
                  }
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontFamily: 'monospace' }}>
              {isRunner ? (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', justifyContent: 'flex-end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                      <span style={{ fontSize: '0.62rem', color: '#4ade80', textTransform: 'uppercase', fontWeight: 800 }}>Banked Profit</span>
                      <span style={{ fontSize: '1.05rem', fontWeight: 900, color: '#4ade80' }}>+2.00R</span>
                    </div>
                    <span style={{ color: '#64748b', fontSize: '1.2rem' }}>+</span>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                      <span style={{ fontSize: '0.62rem', color: '#fb923c', textTransform: 'uppercase', fontWeight: 800 }}>Runner Float</span>
                      <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#fb923c' }}>
                        {(signal.unrealizedR ?? 0) > 0 ? '+' : ''}{(signal.unrealizedR ?? 0).toFixed(2)}R
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: '2px' }}>
                    Total Locked + Float: <strong style={{ color: '#38bdf8' }}>+{(2.0 + Math.max(0, signal.unrealizedR ?? 0)).toFixed(2)}R</strong>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '1.3rem', fontWeight: 900, color: (signal.unrealizedR ?? 0) >= 0 ? '#34d399' : '#f87171' }}>
                    {(signal.unrealizedR ?? 0) > 0 ? '+' : ''}{(signal.unrealizedR ?? 0).toFixed(2)}R
                  </span>
                  {signal.current_price && (
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', background: 'rgba(0,0,0,0.3)', padding: '3px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      {fmtPrice(signal.current_price, signal.market)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── PRICE LEVELS — Column grid (like Manna SnD) ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '8px',
          marginBottom: '10px'
        }}>
          {[
            { label: 'Entry Fill',   value: fmtPrice(signal.entry_price_recorded || signal.entry_zone_mid, signal.market), color: '#e2e8f0',  sub: 'Market Exec' },
            { label: 'Stop Loss',    value: fmtPrice(signal.stop, signal.market),                                           color: '#f87171',  sub: isRunner || signal.is_breakeven ? 'Locked @ BE' : 'Invalidation' },
            { label: 'TP1 (+2.0R)', value: fmtPrice(signal.tp1, signal.market),                                            color: '#34d399',  sub: isRunner ? '✓ Booked' : 'Target 1' },
            { label: 'TP2 (+3.5R)', value: fmtPrice(signal.tp2, signal.market),                                            color: '#10b981',  sub: isRunner ? '← Active' : 'Target 2' },
            { label: 'Live Price',   value: signal.current_price ? fmtPrice(signal.current_price, signal.market) : '—',    color: '#38bdf8',  sub: 'Real-time' },
          ].map(item => (
            <div key={item.label} style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '8px',
              padding: '8px 10px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.58rem', color: '#718096', textTransform: 'uppercase', marginBottom: '3px', fontWeight: 700 }}>{item.label}</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 900, color: item.color, fontFamily: 'monospace' }}>{item.value}</div>
              <div style={{ fontSize: '0.52rem', color: '#4a5568', marginTop: '2px' }}>{item.sub}</div>
            </div>
          ))}
        </div>

        {/* ── 4TF State Verification (compact) ── */}
        <div style={{
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: '8px',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
          marginBottom: '8px'
        }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#a78bfa', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>⚡ 4TF Verified:</span>
          {[
            { label: 'H1', detail: meta.phases?.h1POIType || 'POI' },
            { label: 'M15', detail: 'Reversal' },
            { label: 'M5', detail: 'Swing ✓' },
            { label: `M1 (${meta.phases?.m1OCCount || 2}/2 OCs)`, detail: meta.phases?.finalOCPOIType || 'OC' },
          ].map(phase => (
            <span key={phase.label} style={{
              background: 'rgba(16,185,129,0.1)',
              border: '1px solid rgba(16,185,129,0.3)',
              color: '#34d399',
              borderRadius: '6px',
              padding: '2px 8px',
              fontSize: '0.65rem',
              fontWeight: 700,
              whiteSpace: 'nowrap'
            }}>
              ✓ {phase.label} — {phase.detail}
            </span>
          ))}
        </div>

        {/* ── Rationale ── */}
        {meta.selection_rationale && (
          <div style={{ fontSize: '0.67rem', color: '#4a5568', lineHeight: 1.5 }}>{meta.selection_rationale}</div>
        )}
      </div>

      {showChart && <SetupChartModal setup={signal} onClose={() => setShowChart(false)} />}
    </>
  );
};

export const ExclusiveSignalsDashboard: React.FC = () => {
  const {
    signals,
    historySignals,
    outcomes,
    telemetry,
    analytics,
    phaseCount,
    analyticsScope,
    setAnalyticsScope,
    marketFilter,
    setMarketFilter,
    loading,
    scanning,
    lastUpdated,
    triggerScan,
    dismissSignal,
    resetAnalytics,
    getExportUrl
  } = useExclusiveSignals();

  const [activeSection, setActiveSection] = useState<'live' | 'runners' | 'calendar' | 'telemetry' | 'analytics' | 'history' | 'export'>('live');
  const [scanningMarket, setScanningMarket] = useState<'both' | 'forex' | 'futures'>('both');
  const [activeChartSetup, setActiveChartSetup] = useState<EdgeSetup | null>(null);
  const [resettingBaseline, setResettingBaseline] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  // CSV Export Filter State
  const [exportStartDate, setExportStartDate] = useState<string>('');
  const [exportEndDate, setExportEndDate] = useState<string>('');
  const [exportSinceReset, setExportSinceReset] = useState<boolean>(false);

  const handleResetBaseline = async (action: 'set_baseline' | 'clear_baseline' | 'wipe_test_data' | 'reset_all') => {
    let msg = 'Are you sure you want to reset the analytics baseline to NOW? All performance metrics will calculate from this point forward.';
    if (action === 'clear_baseline') msg = 'Revert to All-Time history analytics baseline?';
    if (action === 'wipe_test_data' || action === 'reset_all') msg = '⚠️ PERMANENT RESET: This will permanently delete ALL trade setups, logs, and analytics for the Elite Fractal strategy. Are you sure you want to proceed?';
    if (!confirm(msg)) return;
    setResettingBaseline(true);
    try {
      const res = await resetAnalytics(action);
      alert(`✅ ${res?.message || 'Analytics updated successfully'}`);
      setShowResetModal(false);
    } catch (err: any) {
      alert(`⚠️ ${err.message}`);
    } finally {
      setResettingBaseline(false);
    }
  };

  const handleSetPreset = (preset: 'today' | '7d' | '30d' | 'all') => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    if (preset === 'today') {
      setExportStartDate(todayStr);
      setExportEndDate(todayStr);
    } else if (preset === '7d') {
      const past = new Date(now.getTime() - 7 * 86400000);
      setExportStartDate(past.toISOString().slice(0, 10));
      setExportEndDate(todayStr);
    } else if (preset === '30d') {
      const past = new Date(now.getTime() - 30 * 86400000);
      setExportStartDate(past.toISOString().slice(0, 10));
      setExportEndDate(todayStr);
    } else if (preset === 'all') {
      setExportStartDate('');
      setExportEndDate('');
    }
  };

  const handleOpenTelemetryChart = (t: StateMachineTelemetry) => {
    const existingSignal = signals.find(s => s.instrument === t.instrument) || historySignals.find(s => s.instrument === t.instrument);
    if (existingSignal) {
      setActiveChartSetup(existingSignal);
      return;
    }

    const isFx = t.instrument.includes('/') || ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'EUR/GBP', 'EUR/JPY', 'GBP/JPY'].includes(t.instrument);
    const mockSetup: EdgeSetup = {
      id: `telemetry_${t.instrument.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`,
      instrument: t.instrument,
      market: isFx ? 'forex' : 'futures',
      bias: t.bias || 'short',
      killzone_origin: 'live',
      created_at: t.stateChangedAt || new Date().toISOString(),
      signal_state: t.phase === 'ENTRY_READY' ? 'awaiting_entry' : 'active',
      entry_zone_low: t.entryZoneLow || 0,
      entry_zone_high: t.entryZoneHigh || 0,
      entry_zone_mid: ((t.entryZoneLow || 0) + (t.entryZoneHigh || 0)) / 2 || 0,
      stop: t.stop || t.m15SwingHigh || 0,
      tp1: t.tp1 || 0,
      r_multiple_1: 2.0,
      conviction_score: t.convictionScore,
      strategy_id: 'elite_fractal',
      strategy_tier: 'elite',
      metadata: JSON.stringify({
        strategy: 'elite_fractal',
        phases: {
          bias: t.bias,
          h1POIType: t.h1PoiType,
          h1POILevel: t.h1PoiLevel,
          m15SwingHigh: t.m15SwingHigh,
          m15SwingLow: t.m15SwingLow,
          m1OCCount: t.m1OcCount
        },
        telemetryState: t.state,
        telemetryPhase: t.phase
      })
    };
    setActiveChartSetup(mockSetup);
  };

  const handleScan = async () => {
    try {
      const result = await triggerScan(scanningMarket);
      alert(`✅ ${result?.message || 'Scan complete'}`);
    } catch (err: any) {
      alert(`⚠️ ${err.message}`);
    }
  };

  const hotInstruments  = telemetry.filter(t => t.phase === 'ENTRY_READY' || t.phase === 'VALIDATED');
  const coldInstruments = telemetry.filter(t => t.phase !== 'ENTRY_READY' && t.phase !== 'VALIDATED');

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', color: '#e2e8f0' }}>
      {/* CLASSIFIED HEADER */}
      <div style={{ background: 'linear-gradient(135deg, rgba(20,10,50,0.98) 0%, rgba(30,15,70,0.98) 100%)', border: '1px solid rgba(139,92,246,0.5)', borderRadius: '14px', padding: '20px 24px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <span style={{ fontSize: '1.6rem' }}>🛡️</span>
            <div>
              <div style={{ fontWeight: 900, fontSize: '1.15rem', color: '#a78bfa', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Elite Fractal — Classified Intel</div>
              <div style={{ fontSize: '0.75rem', color: '#6b46c1', fontWeight: 600 }}>4-Timeframe Fractal Alignment · Long & Short Setups · SuperAdmin Exclusive</div>
            </div>
          </div>
          <div style={{ fontSize: '0.7rem', color: '#718096' }}>⚠️ This section is not visible to admins or traders. Signal cards, calendar, and analytics are 100% isolated from public dashboards.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <select value={scanningMarket} onChange={e => setScanningMarket(e.target.value as any)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa', borderRadius: '8px', padding: '8px 12px', fontSize: '0.78rem', cursor: 'pointer' }}>
            <option value="both">All Markets</option>
            <option value="forex">Forex Only</option>
            <option value="futures">Futures Only</option>
          </select>
          <button onClick={handleScan} disabled={scanning} style={{ background: scanning ? 'rgba(139,92,246,0.2)' : 'linear-gradient(135deg, #7c3aed, #5b21b6)', border: '1px solid rgba(139,92,246,0.6)', color: '#e9d5ff', borderRadius: '10px', padding: '10px 20px', cursor: scanning ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {scanning ? '⟳ Scanning...' : '⚡ Run Elite Fractal Scan'}
          </button>
          <button
            onClick={() => setShowResetModal(true)}
            style={{
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.4)',
              color: '#f87171',
              borderRadius: '10px',
              padding: '10px 16px',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            ⚙️ Reset Analytics
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '20px', padding: '3px 10px', fontSize: '0.68rem', color: '#34d399', fontWeight: 700 }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981', display: 'inline-block' }}></span>
              Continuous Auto-Scan (5m)
            </div>
            {lastUpdated && <div style={{ fontSize: '0.65rem', color: '#718096' }}>UI Synced: {new Date(lastUpdated).toLocaleTimeString()}</div>}
          </div>
        </div>
      </div>

      {/* EXECUTIVE ANALYTICS BANNER */}
      {analytics && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          {[
            { label: 'Active Signals',  value: analytics.activeSignals,                                color: '#34d399', icon: '⚡' },
            { label: 'Total Generated', value: analytics.totalSignals,                                 color: '#a78bfa', icon: '📊' },
            { label: 'Win Rate',        value: analytics.winRate        ? `${analytics.winRate}%`        : '—', color: '#fbbf24', icon: '🎯' },
            { label: 'Net Banked R',    value: analytics.totalRMultiple ? `${analytics.totalRMultiple}R` : '0.00R', color: '#34d399', icon: '💰' },
            { label: 'Avg MAE',         value: analytics.avgMAE         ? `${analytics.avgMAE}R`         : '—', color: '#f87171', icon: '🔻' },
            { label: 'Avg MFE',         value: analytics.avgMFE         ? `${analytics.avgMFE}R`         : '—', color: '#10b981', icon: '🚀' },
            { label: 'Profit Factor',   value: analytics.profitFactor   ? analytics.profitFactor         : '—', color: '#60a5fa', icon: '📈' },
            { label: 'Avg Conviction',  value: analytics.avgConviction  ? `${analytics.avgConviction}%`  : '—', color: '#f472b6', icon: '🧠' },
          ].map(item => (
            <div key={item.label} style={{ background: 'rgba(15,20,40,0.8)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '14px 16px' }}>
              <div style={{ fontSize: '0.65rem', color: '#718096', textTransform: 'uppercase', marginBottom: '6px' }}>{item.icon} {item.label}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: item.color, fontFamily: 'monospace' }}>{item.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* PHASE PIPELINE */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '0.72rem', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px', fontWeight: 700 }}>📡 Live State Machine Pipeline</div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          {PHASE_PIPELINE.map((p, idx, arr) => {
            const count = p.phase === 'SCANNING' ? phaseCount.scanning : p.phase === 'CANDIDATE' ? phaseCount.candidate : p.phase === 'VALIDATED' ? phaseCount.validated : phaseCount.entryReady;
            return (
              <React.Fragment key={p.phase}>
                <PhaseCard phase={p.phase} label={p.label} icon={p.icon} count={count} active={count > 0} />
                {idx < arr.length - 1 && <div style={{ color: '#2d3748', fontSize: '1.2rem' }}>→</div>}
              </React.Fragment>
            );
          })}
          {phaseCount.rejected > 0 && (
            <>
              <div style={{ color: '#2d3748', fontSize: '1rem' }}>···</div>
              <PhaseCard phase="REJECTED" label="Rejected" icon="✗" count={phaseCount.rejected} active={false} />
            </>
          )}
        </div>
      </div>

      {/* SECTION TABS */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: '12px', overflowX: 'auto' }}>
        {[
          { id: 'live',      label: `⚡ Live Signals (${signals.filter(s => s.signal_state !== 'runner').length})` },
          { id: 'runners',   label: `🏃 Runners (${signals.filter(s => s.signal_state === 'runner').length})` },
          { id: 'calendar',  label: `📅 Calendar (${outcomes.length})` },
          { id: 'telemetry', label: `🔭 Telemetry (${telemetry.length})` },
          { id: 'analytics', label: `📈 Analytics` },
          { id: 'history',   label: `📋 History (${historySignals.length})` },
          { id: 'export',    label: `📥 Export (CSV)` }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id as any)}
            style={{
              background: activeSection === tab.id
                ? (tab.id === 'runners' ? 'rgba(249,115,22,0.2)' : 'rgba(139,92,246,0.2)')
                : 'transparent',
              border: `1px solid ${activeSection === tab.id ? (tab.id === 'runners' ? 'rgba(249,115,22,0.5)' : 'rgba(139,92,246,0.5)') : 'transparent'}`,
              color: activeSection === tab.id ? (tab.id === 'runners' ? '#fb923c' : '#a78bfa') : '#718096',
              borderRadius: '8px',
              padding: '8px 16px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 700,
              transition: 'all 0.2s',
              whiteSpace: 'nowrap'
            }}
          >{tab.label}</button>
        ))}
      </div>

      {/* LIVE SIGNALS (active / awaiting_entry only — NOT runners) */}
      {activeSection === 'live' && (() => {
        const activeSignals = signals.filter(s => s.signal_state !== 'runner');
        const fxSignals  = activeSignals.filter(s => s.market === 'forex');
        const futSignals = activeSignals.filter(s => s.market === 'futures');
        return (
          <div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px', color: '#4a5568' }}>Loading exclusive signals...</div>
            ) : activeSignals.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', background: 'rgba(15,20,40,0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '14px' }}>
                <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🛡️</div>
                <div style={{ color: '#718096', fontWeight: 700 }}>No active exclusive signals</div>
                <div style={{ color: '#4a5568', fontSize: '0.78rem', marginTop: '8px' }}>Run an Elite Fractal scan to generate signals, or wait for the next scheduled continuous scan.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* FUTURES column group */}
                {futSignals.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>📊 Futures Signals</span>
                      <span style={{ background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.3)', borderRadius: '20px', padding: '1px 10px', fontSize: '0.7rem' }}>{futSignals.length}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: '14px' }}>
                      {futSignals.map(signal => <ExclusiveSignalCard key={signal.id} signal={signal} onDismiss={dismissSignal} />)}
                    </div>
                  </div>
                )}
                {/* FOREX column group */}
                {fxSignals.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>💱 Forex Signals</span>
                      <span style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '20px', padding: '1px 10px', fontSize: '0.7rem' }}>{fxSignals.length}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: '14px' }}>
                      {fxSignals.map(signal => <ExclusiveSignalCard key={signal.id} signal={signal} onDismiss={dismissSignal} />)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* RUNNERS TAB — Signals that hit TP1 and are riding towards TP2 */}
      {activeSection === 'runners' && (() => {
        const runnerSignals = signals.filter(s => s.signal_state === 'runner');
        const fxRunners  = runnerSignals.filter(s => s.market === 'forex');
        const futRunners = runnerSignals.filter(s => s.market === 'futures');
        return (
          <div>
            {/* Runner explanation banner */}
            <div style={{
              background: 'linear-gradient(90deg, rgba(249,115,22,0.15) 0%, rgba(251,146,60,0.08) 100%)',
              border: '1px solid rgba(249,115,22,0.4)',
              borderRadius: '10px',
              padding: '12px 18px',
              marginBottom: '18px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <span style={{ fontSize: '1.3rem' }}>🏃</span>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fb923c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Runner Portfolio — TP1 Banked · Riding TP2</div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>These setups have hit TP1 (+2R). Stop is locked at Break-Even. Scanner is FREE to find fresh setups for these instruments.</div>
              </div>
            </div>

            {runnerSignals.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', background: 'rgba(15,20,40,0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '14px' }}>
                <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🏃</div>
                <div style={{ color: '#718096', fontWeight: 700 }}>No runner signals</div>
                <div style={{ color: '#4a5568', fontSize: '0.78rem', marginTop: '8px' }}>Runners appear here when active signals hit TP1 (+2R). Stop is then moved to breakeven while targeting TP2 (+3.5R).</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {futRunners.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>📊 Futures Runners</span>
                      <span style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: '20px', padding: '1px 10px', fontSize: '0.7rem', color: '#fb923c' }}>{futRunners.length}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: '14px' }}>
                      {futRunners.map(signal => <ExclusiveSignalCard key={signal.id} signal={signal} onDismiss={dismissSignal} isRunner />)}
                    </div>
                  </div>
                )}
                {fxRunners.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>💱 Forex Runners</span>
                      <span style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: '20px', padding: '1px 10px', fontSize: '0.7rem', color: '#fb923c' }}>{fxRunners.length}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: '14px' }}>
                      {fxRunners.map(signal => <ExclusiveSignalCard key={signal.id} signal={signal} onDismiss={dismissSignal} isRunner />)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* CALENDAR SECTION */}
      {activeSection === 'calendar' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(20,15,45,0.95) 0%, rgba(30,20,60,0.95) 100%)',
            border: '1px solid rgba(139,92,246,0.4)',
            borderRadius: '12px',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.2rem' }}>📅</span>
                <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Manna Elite (Elite Fractal) Performance Calendar
                </span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '4px' }}>
                Daily trading session breakdown, Forex vs. Futures trade journaling, R-multiples, and win/loss audit strictly for SuperAdmin.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 800, background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.3)', padding: '4px 12px', borderRadius: '20px' }}>
                💱 Forex: {outcomes.filter(o => o.market === 'forex' || o.instrument?.includes('/')).length}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#fbbf24', fontWeight: 800, background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)', padding: '4px 12px', borderRadius: '20px' }}>
                📈 Futures: {outcomes.filter(o => !(o.market === 'forex' || o.instrument?.includes('/'))).length}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: 800, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', padding: '4px 12px', borderRadius: '20px' }}>
                Total: {outcomes.length}
              </span>
            </div>
          </div>

          <ExpandableCalendar 
            outcomes={outcomes} 
            strategyFilter="elite_fractal" 
            marketFilter={marketFilter}
            onMarketFilterChange={setMarketFilter}
          />
        </div>
      )}

      {/* TELEMETRY */}
      {activeSection === 'telemetry' && (
        <div>
          {/* Informational Live Chart Inspection Banner */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(30,15,60,0.85) 0%, rgba(15,10,35,0.85) 100%)',
            border: '1px solid rgba(139,92,246,0.3)',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.3rem' }}>📈</span>
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#e2e8f0' }}>
                  Interactive Live Multi-Timeframe Chart Inspection
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                  Click on any instrument card or click <strong>📊 Live Chart</strong> to inspect real-time candles across H1, M15, M5, and M1 to verify state progression.
                </div>
              </div>
            </div>
            <div style={{ fontSize: '0.68rem', color: '#34d399', fontWeight: 700, background: 'rgba(16,185,129,0.1)', padding: '4px 10px', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.3)' }}>
              ● Live Feeds Connected
            </div>
          </div>

          {hotInstruments.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '0.72rem', color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px', fontWeight: 700 }}>🔥 Hot — Entry Ready / Validated ({hotInstruments.length})</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
                {hotInstruments.map(t => (
                  <InstrumentTelemetryCard
                    key={t.instrument}
                    t={t}
                    onViewChart={handleOpenTelemetryChart}
                  />
                ))}
              </div>
            </div>
          )}
          <div>
            <div style={{ fontSize: '0.72rem', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px', fontWeight: 700 }}>All Instruments ({coldInstruments.length})</div>
            {coldInstruments.length === 0 && telemetry.length === 0 ? (
              <div style={{ color: '#4a5568', fontSize: '0.8rem', padding: '20px 0' }}>No telemetry data yet. Continuous scanner runs every 5 minutes.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
                {coldInstruments.map(t => (
                  <InstrumentTelemetryCard
                    key={t.instrument}
                    t={t}
                    onViewChart={handleOpenTelemetryChart}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* DEDICATED ANALYTICS SECTION */}
      {activeSection === 'analytics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Quarantine Notice & Baseline Control Bar */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(20,15,45,0.95) 0%, rgba(25,15,55,0.95) 100%)',
            border: '1px solid rgba(139,92,246,0.4)',
            borderRadius: '12px',
            padding: '18px 22px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <span style={{ fontSize: '1.25rem' }}>🔒</span>
                <span style={{ fontWeight: 900, fontSize: '1rem', color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Strictly Segregated Strategy Analytics & Baseline Controls
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: '#94a3b8', lineHeight: 1.4 }}>
                These performance metrics are computed exclusively from the <code>superadmin_edge_setups</code> registry. They are completely quarantined from public client dashboards and standard admin reports.
              </div>
              <div style={{ marginTop: '8px', fontSize: '0.72rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ background: 'rgba(255,255,255,0.06)', padding: '3px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  Current Baseline: <strong style={{ color: analytics?.resetAt ? '#38bdf8' : '#fbbf24' }}>{analytics?.resetAt ? formatETTime(analytics.resetAt) : 'All-Time History'}</strong>
                </span>
                <span style={{ color: '#64748b' }}>•</span>
                <span style={{ color: '#94a3b8' }}>Scope: <strong style={{ color: '#a78bfa', textTransform: 'uppercase' }}>{analyticsScope === 'baseline' ? 'Since Baseline Reset' : 'All-Time'}</strong></span>
              </div>
            </div>

            {/* Scope & Market Filter Toggles + Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Market View Switcher */}
                <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '8px', padding: '3px' }}>
                  <button
                    onClick={() => setMarketFilter('all')}
                    style={{
                      background: marketFilter === 'all' ? 'linear-gradient(135deg, rgba(139,92,246,0.5) 0%, rgba(99,102,241,0.5) 100%)' : 'transparent',
                      border: 'none',
                      color: marketFilter === 'all' ? '#ffffff' : '#718096',
                      borderRadius: '6px',
                      padding: '5px 12px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    🌐 All Markets
                  </button>
                  <button
                    onClick={() => setMarketFilter('forex')}
                    style={{
                      background: marketFilter === 'forex' ? 'linear-gradient(135deg, rgba(56,189,248,0.4) 0%, rgba(14,165,233,0.4) 100%)' : 'transparent',
                      border: 'none',
                      color: marketFilter === 'forex' ? '#38bdf8' : '#718096',
                      borderRadius: '6px',
                      padding: '5px 12px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    💱 Forex
                  </button>
                  <button
                    onClick={() => setMarketFilter('futures')}
                    style={{
                      background: marketFilter === 'futures' ? 'linear-gradient(135deg, rgba(234,179,8,0.35) 0%, rgba(202,138,4,0.35) 100%)' : 'transparent',
                      border: 'none',
                      color: marketFilter === 'futures' ? '#fbbf24' : '#718096',
                      borderRadius: '6px',
                      padding: '5px 12px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    📈 Futures
                  </button>
                </div>

                {/* Scope Switcher */}
                <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '8px', padding: '3px' }}>
                  <button
                    onClick={() => setAnalyticsScope('baseline')}
                    style={{
                      background: analyticsScope === 'baseline' ? 'rgba(139,92,246,0.4)' : 'transparent',
                      border: 'none',
                      color: analyticsScope === 'baseline' ? '#e2e8f0' : '#718096',
                      borderRadius: '6px',
                      padding: '5px 12px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    📍 Since Reset
                  </button>
                  <button
                    onClick={() => setAnalyticsScope('all_time')}
                    style={{
                      background: analyticsScope === 'all_time' ? 'rgba(139,92,246,0.4)' : 'transparent',
                      border: 'none',
                      color: analyticsScope === 'all_time' ? '#e2e8f0' : '#718096',
                      borderRadius: '6px',
                      padding: '5px 12px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    🌐 All-Time
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleResetBaseline('set_baseline')}
                  disabled={resettingBaseline}
                  style={{
                    background: 'rgba(56,189,248,0.15)',
                    border: '1px solid rgba(56,189,248,0.4)',
                    color: '#38bdf8',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    cursor: resettingBaseline ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  🔄 Reset Baseline (Now)
                </button>
                <button
                  onClick={() => handleResetBaseline('clear_baseline')}
                  disabled={resettingBaseline || !analytics?.resetAt}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: analytics?.resetAt ? '#e2e8f0' : '#64748b',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: resettingBaseline || !analytics?.resetAt ? 'not-allowed' : 'pointer'
                  }}
                >
                  ↩️ Clear Baseline
                </button>
                <button
                  onClick={() => {
                    if (confirm('⚠️ RESET ALL ELITE FRACTAL ANALYTICS\n\nThis will permanently delete ALL signal history, trade records, and analytics for the Elite Fractal strategy. This cannot be undone.\n\nProceed?')) {
                      handleResetBaseline('wipe_test_data');
                    }
                  }}
                  disabled={resettingBaseline}
                  style={{
                    background: 'linear-gradient(135deg, rgba(239,68,68,0.2) 0%, rgba(185,28,28,0.15) 100%)',
                    border: '2px solid rgba(239,68,68,0.6)',
                    color: '#f87171',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontSize: '0.78rem',
                    fontWeight: 900,
                    cursor: resettingBaseline ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    letterSpacing: '0.03em'
                  }}
                >
                  🔴 Reset All Analytics
                </button>
              </div>
            </div>
          </div>

          {/* FOREX VS FUTURES INSTITUTIONAL HEAD-TO-HEAD COMPARISON CARD */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(18,14,38,0.95) 0%, rgba(26,18,52,0.95) 100%)',
            border: '1px solid rgba(139,92,246,0.35)',
            borderRadius: '14px',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.4rem' }}>⚔️</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 900, color: '#e2e8f0', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    Forex vs. Futures Institutional Analytics Comparison
                  </h3>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>
                    Manna Elite (Trade Sentinel Elite Framework) performance segmented by market asset class.
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.7rem', color: '#38bdf8', background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', padding: '3px 10px', borderRadius: '12px', fontWeight: 800 }}>
                  💱 Forex: 8 Pairs
                </span>
                <span style={{ fontSize: '0.7rem', color: '#fbbf24', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', padding: '3px 10px', borderRadius: '12px', fontWeight: 800 }}>
                  📈 Futures: 7 Contracts
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
              {/* FOREX PANEL */}
              <div style={{
                background: 'rgba(10, 25, 45, 0.75)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                borderRadius: '12px',
                padding: '18px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.2rem' }}>💱</span>
                    <span style={{ fontWeight: 900, fontSize: '0.9rem', color: '#38bdf8', letterSpacing: '0.05em' }}>
                      FOREX CURRENCIES
                    </span>
                  </div>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '6px' }}>
                    EUR/USD, GBP/USD, USD/JPY...
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(56,189,248,0.15)' }}>
                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Win Rate</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#38bdf8', fontFamily: 'monospace' }}>
                      {analytics?.byMarket?.forex?.winRate ? `${analytics.byMarket.forex.winRate}%` : '—'}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                      Wins: {analytics?.byMarket?.forex?.winsCount || 0} · Losses: {analytics?.byMarket?.forex?.lossesCount || 0}
                    </div>
                  </div>

                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(56,189,248,0.15)' }}>
                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Realized R</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 900, color: (Number(analytics?.byMarket?.forex?.totalRMultiple || 0) >= 0 ? '#34d399' : '#f87171'), fontFamily: 'monospace' }}>
                      {analytics?.byMarket?.forex?.totalRMultiple ? `${analytics.byMarket.forex.totalRMultiple}R` : '0.00R'}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                      Profit Factor: {analytics?.byMarket?.forex?.profitFactor || '—'}
                    </div>
                  </div>

                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Total Setups</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#e2e8f0', fontFamily: 'monospace' }}>
                      {analytics?.byMarket?.forex?.totalSignals || 0}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                      Active: {analytics?.byMarket?.forex?.activeSignals || 0} · Closed: {analytics?.byMarket?.forex?.closedSignals || 0}
                    </div>
                  </div>

                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>MAE / MFE</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#e2e8f0', fontFamily: 'monospace' }}>
                      {analytics?.byMarket?.forex?.avgMAE || '—'}R / {analytics?.byMarket?.forex?.avgMFE || '—'}R
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                      Avg Conviction: {analytics?.byMarket?.forex?.avgConviction || '—'}%
                    </div>
                  </div>
                </div>
              </div>

              {/* FUTURES PANEL */}
              <div style={{
                background: 'rgba(35, 25, 10, 0.75)',
                border: '1px solid rgba(251, 191, 36, 0.35)',
                borderRadius: '12px',
                padding: '18px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.2rem' }}>📈</span>
                    <span style={{ fontWeight: 900, fontSize: '0.9rem', color: '#fbbf24', letterSpacing: '0.05em' }}>
                      FUTURES CONTRACTS
                    </span>
                  </div>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '6px' }}>
                    ES, NQ, YM, RTY, GC, CL, ZN
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(251,191,36,0.15)' }}>
                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Win Rate</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fbbf24', fontFamily: 'monospace' }}>
                      {analytics?.byMarket?.futures?.winRate ? `${analytics.byMarket.futures.winRate}%` : '—'}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                      Wins: {analytics?.byMarket?.futures?.winsCount || 0} · Losses: {analytics?.byMarket?.futures?.lossesCount || 0}
                    </div>
                  </div>

                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(251,191,36,0.15)' }}>
                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Realized R</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 900, color: (Number(analytics?.byMarket?.futures?.totalRMultiple || 0) >= 0 ? '#34d399' : '#f87171'), fontFamily: 'monospace' }}>
                      {analytics?.byMarket?.futures?.totalRMultiple ? `${analytics.byMarket.futures.totalRMultiple}R` : '0.00R'}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                      Profit Factor: {analytics?.byMarket?.futures?.profitFactor || '—'}
                    </div>
                  </div>

                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Total Setups</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#e2e8f0', fontFamily: 'monospace' }}>
                      {analytics?.byMarket?.futures?.totalSignals || 0}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                      Active: {analytics?.byMarket?.futures?.activeSignals || 0} · Closed: {analytics?.byMarket?.futures?.closedSignals || 0}
                    </div>
                  </div>

                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>MAE / MFE</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#e2e8f0', fontFamily: 'monospace' }}>
                      {analytics?.byMarket?.futures?.avgMAE || '—'}R / {analytics?.byMarket?.futures?.avgMFE || '—'}R
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                      Avg Conviction: {analytics?.byMarket?.futures?.avgConviction || '—'}%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Excursion & Strategy KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            <div style={{ background: 'rgba(15,20,40,0.8)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '12px', padding: '16px 18px' }}>
              <div style={{ fontSize: '0.68rem', color: '#f87171', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>
                🔻 Avg MAE (Adverse Excursion)
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#f87171', fontFamily: 'monospace' }}>
                {analytics?.avgMAE ? `${analytics.avgMAE}R` : '—'}
              </div>
              <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: '4px' }}>
                Average worst adverse price deviation against entry before trade resolution.
              </div>
            </div>

            <div style={{ background: 'rgba(15,20,40,0.8)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '12px', padding: '16px 18px' }}>
              <div style={{ fontSize: '0.68rem', color: '#34d399', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>
                🚀 Avg MFE (Favorable Excursion)
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#34d399', fontFamily: 'monospace' }}>
                {analytics?.avgMFE ? `${analytics.avgMFE}R` : '—'}
              </div>
              <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: '4px' }}>
                Average peak favorable profit expansion reached during setup lifespan.
              </div>
            </div>

            <div style={{ background: 'rgba(15,20,40,0.8)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '12px', padding: '16px 18px' }}>
              <div style={{ fontSize: '0.68rem', color: '#fbbf24', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>
                🎯 Closed Win Rate
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#fbbf24', fontFamily: 'monospace' }}>
                {analytics?.winRate ? `${analytics.winRate}%` : '—'}
              </div>
              <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: '4px' }}>
                Wins: {analytics?.winsCount || 0} · Losses: {analytics?.lossesCount || 0}
              </div>
            </div>

            <div style={{ background: 'rgba(15,20,40,0.8)', border: '1px solid rgba(56,189,248,0.3)', borderRadius: '12px', padding: '16px 18px' }}>
              <div style={{ fontSize: '0.68rem', color: '#38bdf8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>
                💰 Realized R-Multiple
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#38bdf8', fontFamily: 'monospace' }}>
                {analytics?.totalRMultiple ? `${analytics.totalRMultiple}R` : '0.00R'}
              </div>
              <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: '4px' }}>
                Profit Factor: {analytics?.profitFactor || '—'}
              </div>
            </div>
          </div>

          {/* Performance by Instrument Table */}
          <div style={{ background: 'rgba(15,20,35,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '18px 20px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#e2e8f0', marginBottom: '12px', textTransform: 'uppercase' }}>
              📊 Performance Breakdown by Instrument {marketFilter !== 'all' ? `(${marketFilter.toUpperCase()} ONLY)` : ''}
            </div>
            {!analytics?.byInstrument || Object.keys(analytics.byInstrument).length === 0 ? (
              <div style={{ color: '#64748b', fontSize: '0.78rem' }}>No instrument records available yet.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', textAlign: 'left' }}>
                      <th style={{ padding: '8px 12px' }}>Instrument</th>
                      <th style={{ padding: '8px 12px' }}>Market</th>
                      <th style={{ padding: '8px 12px' }}>Total Setups</th>
                      <th style={{ padding: '8px 12px' }}>Active</th>
                      <th style={{ padding: '8px 12px' }}>Wins (TP1/TP2)</th>
                      <th style={{ padding: '8px 12px' }}>Losses (SL)</th>
                      <th style={{ padding: '8px 12px' }}>Win Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(analytics.byInstrument)
                      .filter(([inst, data]: [string, InstrumentAnalytics]) => {
                        if (marketFilter === 'all') return true;
                        const isFx = data.market === 'forex' || inst.includes('/');
                        return marketFilter === 'forex' ? isFx : !isFx;
                      })
                      .map(([inst, data]: [string, InstrumentAnalytics]) => {
                        const isFx = data.market === 'forex' || inst.includes('/');
                        return (
                          <tr key={inst} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 800, fontFamily: 'monospace', color: '#e2e8f0' }}>{inst}</td>
                            <td style={{ padding: '8px 12px' }}>
                              <span style={{
                                fontSize: '0.66rem',
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: '4px',
                                background: isFx ? 'rgba(56,189,248,0.15)' : 'rgba(251,191,36,0.15)',
                                color: isFx ? '#38bdf8' : '#fbbf24',
                                border: `1px solid ${isFx ? 'rgba(56,189,248,0.35)' : 'rgba(251,191,36,0.35)'}`,
                                whiteSpace: 'nowrap'
                              }}>
                                {isFx ? '💱 FOREX' : '📈 FUTURES'}
                              </span>
                            </td>
                            <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{data.total}</td>
                            <td style={{ padding: '8px 12px', color: '#34d399' }}>{data.active}</td>
                            <td style={{ padding: '8px 12px', color: '#10b981', fontWeight: 700 }}>{data.wins}</td>
                            <td style={{ padding: '8px 12px', color: '#f87171' }}>{data.losses}</td>
                            <td style={{ padding: '8px 12px', color: data.winRate ? '#fbbf24' : '#64748b', fontWeight: 800 }}>
                              {data.winRate ? `${data.winRate}%` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Performance by Killzone Session Table */}
          <div style={{ background: 'rgba(15,20,35,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '18px 20px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#e2e8f0', marginBottom: '12px', textTransform: 'uppercase' }}>
              ⏱️ Performance Breakdown by Session / Killzone
            </div>
            {!analytics?.byKillzone || Object.keys(analytics.byKillzone).length === 0 ? (
              <div style={{ color: '#64748b', fontSize: '0.78rem' }}>No session records available yet.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', textAlign: 'left' }}>
                      <th style={{ padding: '8px 12px' }}>Killzone</th>
                      <th style={{ padding: '8px 12px' }}>Total Setups</th>
                      <th style={{ padding: '8px 12px' }}>Active</th>
                      <th style={{ padding: '8px 12px' }}>Wins</th>
                      <th style={{ padding: '8px 12px' }}>Losses</th>
                      <th style={{ padding: '8px 12px' }}>Win Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(analytics.byKillzone).map(([kz, data]: [string, InstrumentAnalytics]) => (
                      <tr key={kz} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 800, textTransform: 'uppercase', color: '#a78bfa' }}>{kz.replace('_', ' ')}</td>
                        <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{data.total}</td>
                        <td style={{ padding: '8px 12px', color: '#34d399' }}>{data.active}</td>
                        <td style={{ padding: '8px 12px', color: '#10b981', fontWeight: 700 }}>{data.wins}</td>
                        <td style={{ padding: '8px 12px', color: '#f87171' }}>{data.losses}</td>
                        <td style={{ padding: '8px 12px', color: data.winRate ? '#fbbf24' : '#64748b', fontWeight: 800 }}>
                          {data.winRate ? `${data.winRate}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* HISTORY */}
      {activeSection === 'history' && (
        <div>
          {historySignals.length === 0 ? (
            <div style={{ color: '#4a5568', fontSize: '0.8rem', padding: '20px 0' }}>No historical signals yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {historySignals.map(signal => {
                const meta = (() => { try { return JSON.parse(signal.metadata || '{}'); } catch { return {}; } })();
                const outcome = meta.outcome_type || signal.invalidation_reason || signal.signal_state;
                const isTp2 = outcome === 'tp2_hit';
                const isTp1 = outcome === 'tp1_hit';
                const isBe = outcome === 'be_hit';
                const isSl = outcome === 'sl_hit' || String(outcome).includes('sl') || String(outcome).includes('stop');
                
                return (
                  <div key={signal.id} style={{ background: 'rgba(15,20,35,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.68rem', color: '#38bdf8', background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', borderRadius: '4px', padding: '1px 6px', fontFamily: 'monospace', fontWeight: 800 }}>
                          {formatTradeId(signal.id)}
                        </span>
                        <span style={{ fontWeight: 800, fontSize: '0.9rem', fontFamily: 'monospace' }}>{signal.instrument}</span>
                        <span style={{ fontSize: '0.72rem', color: '#718096' }}>{signal.market?.toUpperCase()}</span>
                        {isTp2 ? (
                          <span style={{ fontSize: '0.66rem', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#34d399', borderRadius: '12px', padding: '2px 8px', fontWeight: 800 }}>
                            🎯 TP2 HIT (+3.5R)
                          </span>
                        ) : isTp1 ? (
                          <span style={{ fontSize: '0.66rem', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#34d399', borderRadius: '12px', padding: '2px 8px', fontWeight: 800 }}>
                            🎯 TP1 HIT (+2.0R)
                          </span>
                        ) : isBe ? (
                          <span style={{ fontSize: '0.66rem', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.4)', color: '#60a5fa', borderRadius: '12px', padding: '2px 8px', fontWeight: 800 }}>
                            ⚖️ BREAK EVEN (0.0R)
                          </span>
                        ) : isSl ? (
                          <span style={{ fontSize: '0.66rem', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', borderRadius: '12px', padding: '2px 8px', fontWeight: 800 }}>
                            🛑 STOP LOSS (-1.0R)
                          </span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>
                        Resolved: {signal.resolved_at ? formatETTime(signal.resolved_at) : '—'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '0.75rem', flexWrap: 'wrap' }}>
                      <span style={{ color: '#718096' }}>Entry: {fmtPrice(signal.entry_price_recorded || signal.entry_zone_mid, signal.market)}</span>
                      <span style={{ color: '#f87171' }}>SL: {fmtPrice(signal.stop, signal.market)}</span>
                      <span style={{ color: '#34d399' }}>TP1: {fmtPrice(signal.tp1, signal.market)}</span>
                      <span style={{ color: '#10b981' }}>TP2: {fmtPrice(signal.tp2, signal.market)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button
                        onClick={() => setActiveChartSetup(signal)}
                        style={{
                          background: 'rgba(139,92,246,0.15)',
                          border: '1px solid rgba(139,92,246,0.4)',
                          color: '#c084fc',
                          borderRadius: '6px',
                          padding: '4px 10px',
                          fontSize: '0.7rem',
                          cursor: 'pointer',
                          fontWeight: 700
                        }}
                      >
                        📊 View Chart
                      </button>
                      <div style={{ fontSize: '0.68rem', background: signal.signal_state === 'resolved' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${signal.signal_state === 'resolved' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, color: signal.signal_state === 'resolved' ? '#34d399' : '#f87171', borderRadius: '20px', padding: '3px 10px', fontWeight: 700 }}>{(signal.signal_state || '').toUpperCase()}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* EXPORT LOGS (CSV) SECTION */}
      {activeSection === 'export' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(20,15,45,0.95) 0%, rgba(30,20,60,0.95) 100%)',
            border: '1px solid rgba(139,92,246,0.4)',
            borderRadius: '12px',
            padding: '20px 24px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span style={{ fontSize: '1.4rem' }}>📥</span>
              <span style={{ fontWeight: 900, fontSize: '1.1rem', color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Elite Fractal Institutional Trade Log Export (CSV)
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#cbd5e1', lineHeight: 1.5, maxWidth: '850px' }}>
              Export complete institutional audit logs for Elite Fractal setups. Includes exact execution timestamps, fill prices, initial and trailing stops, TP1, TP2, realized R, <strong>MAE (Maximum Adverse Excursion in R)</strong>, <strong>MFE (Maximum Favorable Excursion in R)</strong>, holding duration, and 4TF state progression data.
            </div>
          </div>

          {/* Export Filter Form */}
          <div style={{
            background: 'rgba(15,20,35,0.7)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '12px',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px'
          }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              ⚙️ Export Filter & Date Range Selection
            </div>

            {/* Quick Presets */}
            <div>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 700 }}>
                Quick Range Presets:
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {[
                  { id: 'today', label: 'Today' },
                  { id: '7d',    label: 'Last 7 Days' },
                  { id: '30d',   label: 'Last 30 Days' },
                  { id: 'all',   label: 'All Time' }
                ].map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleSetPreset(p.id as any)}
                    style={{
                      background: 'rgba(139,92,246,0.15)',
                      border: '1px solid rgba(139,92,246,0.3)',
                      color: '#c084fc',
                      borderRadius: '6px',
                      padding: '6px 14px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date Pickers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', fontWeight: 700 }}>
                  Start Date (UTC)
                </label>
                <input
                  type="date"
                  value={exportStartDate}
                  onChange={e => setExportStartDate(e.target.value)}
                  style={{
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid rgba(139,92,246,0.4)',
                    color: '#e2e8f0',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    fontSize: '0.85rem',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px', fontWeight: 700 }}>
                  End Date (UTC)
                </label>
                <input
                  type="date"
                  value={exportEndDate}
                  onChange={e => setExportEndDate(e.target.value)}
                  style={{
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid rgba(139,92,246,0.4)',
                    color: '#e2e8f0',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    fontSize: '0.85rem',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            {/* Baseline Checkbox */}
            {analytics?.resetAt && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.78rem', color: '#cbd5e1' }}>
                <input
                  type="checkbox"
                  checked={exportSinceReset}
                  onChange={e => setExportSinceReset(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: '#8b5cf6' }}
                />
                <span>Only export setups logged since baseline reset ({formatETTime(analytics.resetAt)})</span>
              </label>
            )}

            {/* Download CTA */}
            <div style={{ paddingTop: '8px' }}>
              <a
                href={getExportUrl(exportStartDate, exportEndDate, exportSinceReset)}
                download
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  border: '1px solid rgba(52,211,153,0.5)',
                  color: '#ffffff',
                  borderRadius: '10px',
                  padding: '12px 24px',
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  textDecoration: 'none',
                  boxShadow: '0 4px 14px rgba(16,185,129,0.3)',
                  cursor: 'pointer'
                }}
              >
                <span>📥 Download Trade Logs (CSV)</span>
              </a>
            </div>
          </div>

          {/* Export Schema Information */}
          <div style={{
            background: 'rgba(15,20,35,0.5)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: '10px',
            padding: '16px 20px',
            fontSize: '0.72rem',
            color: '#94a3b8'
          }}>
            <div style={{ fontWeight: 800, color: '#cbd5e1', marginBottom: '6px', textTransform: 'uppercase' }}>
              📋 24 Exported Schema Fields Included in CSV:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '6px', fontFamily: 'monospace' }}>
              <div>• Trade ID</div>
              <div>• Instrument</div>
              <div>• Market (Forex/Futures)</div>
              <div>• Direction (SHORT)</div>
              <div>• Killzone Origin</div>
              <div>• Signal Time (UTC)</div>
              <div>• Entry Time (UTC)</div>
              <div>• Exit Time (UTC)</div>
              <div>• Entry Fill Price</div>
              <div>• Initial Stop</div>
              <div>• Final Trailing Stop</div>
              <div>• TP1 (+2.0R)</div>
              <div>• TP2 (+3.5R)</div>
              <div>• Exit Fill Price</div>
              <div>• Outcome Type</div>
              <div>• Realized R-Multiple</div>
              <div>• MAE (Maximum Adverse Excursion in R)</div>
              <div>• MFE (Maximum Favorable Excursion in R)</div>
              <div>• Duration (Minutes)</div>
              <div>• Conviction Score (%)</div>
              <div>• H1 POI Context</div>
              <div>• M15 Swing Level</div>
              <div>• M1 OC Count</div>
              <div>• Execution Status</div>
            </div>
          </div>
        </div>
      )}

      {/* Universal Live Multi-Timeframe Chart Modal (Telemetry, Signals, History) */}
      {activeChartSetup && (
        <SetupChartModal setup={activeChartSetup} onClose={() => setActiveChartSetup(null)} />
      )}

      {/* Reset Analytics Settings Modal */}
      {showResetModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(5, 5, 15, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(20, 15, 45, 0.98) 0%, rgba(30, 20, 60, 0.98) 100%)',
            border: '1px solid rgba(139, 92, 246, 0.5)',
            borderRadius: '16px',
            padding: '24px 28px',
            maxWidth: '560px',
            width: '100%',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(139, 92, 246, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#f3e8ff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>⚙️</span> Elite Fractal Analytics Settings
                </div>
                <div style={{ fontSize: '0.74rem', color: '#a78bfa', marginTop: '4px' }}>
                  SuperAdmin exclusive strategy data management & baseline controls
                </div>
              </div>
              <button
                onClick={() => setShowResetModal(false)}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#94a3b8',
                  borderRadius: '8px',
                  width: '32px',
                  height: '32px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ✕
              </button>
            </div>

            {/* Current Status Box */}
            <div style={{
              background: 'rgba(0, 0, 0, 0.35)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '10px',
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
                Current Strategy Analytics Status
              </div>
              <div style={{ fontSize: '0.8rem', color: '#e2e8f0', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <span>Active Watermark: <strong style={{ color: analytics?.resetAt ? '#38bdf8' : '#fbbf24' }}>{analytics?.resetAt ? formatETTime(analytics.resetAt) : 'All-Time (No Reset Watermark)'}</strong></span>
                <span>Total Trades: <strong style={{ color: '#a78bfa' }}>{analytics?.totalSignals ?? 0}</strong></span>
              </div>
            </div>

            {/* Option 1: Set Baseline to Now */}
            <div style={{
              background: 'rgba(56, 189, 248, 0.06)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: '10px',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#38bdf8' }}>
                  📍 Option 1: Set Reset Baseline to NOW
                </span>
                <button
                  onClick={() => handleResetBaseline('set_baseline')}
                  disabled={resettingBaseline}
                  style={{
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    border: '1px solid rgba(56, 189, 248, 0.5)',
                    color: '#ffffff',
                    borderRadius: '8px',
                    padding: '6px 14px',
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    cursor: resettingBaseline ? 'not-allowed' : 'pointer'
                  }}
                >
                  {resettingBaseline ? 'Updating...' : 'Set Baseline to Now'}
                </button>
              </div>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', lineHeight: 1.4 }}>
                Calculates win rate, net R-multiples, Profit Factor, and calendar outcomes starting strictly from this exact timestamp forward. Previous trade rows remain in database for export.
              </div>
            </div>

            {/* Option 2: Clear Baseline */}
            {analytics?.resetAt && (
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#e2e8f0' }}>Clear Baseline Watermark</div>
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '2px' }}>Revert back to calculating all-time history from inception.</div>
                </div>
                <button
                  onClick={() => handleResetBaseline('clear_baseline')}
                  disabled={resettingBaseline}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: '#e2e8f0',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: resettingBaseline ? 'not-allowed' : 'pointer'
                  }}
                >
                  Clear Baseline
                </button>
              </div>
            )}

            {/* Option 3: Hard Reset / Wipe All Data */}
            <div style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              borderRadius: '10px',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#f87171' }}>
                  🔴 Option 2: Reset All Analytics (Purge History)
                </span>
                <button
                  onClick={() => handleResetBaseline('reset_all')}
                  disabled={resettingBaseline}
                  style={{
                    background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
                    border: '1px solid rgba(239, 68, 68, 0.6)',
                    color: '#ffffff',
                    borderRadius: '8px',
                    padding: '6px 14px',
                    fontSize: '0.74rem',
                    fontWeight: 900,
                    cursor: resettingBaseline ? 'not-allowed' : 'pointer'
                  }}
                >
                  {resettingBaseline ? 'Purging...' : 'Wipe & Reset Everything'}
                </button>
              </div>
              <div style={{ fontSize: '0.7rem', color: '#fca5a5', lineHeight: 1.4 }}>
                ⚠️ Permanently wipes all Elite Fractal setups, active trades, runners, and history from the <code>superadmin_edge_setups</code> table. All analytics reset to clean 0 state.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
