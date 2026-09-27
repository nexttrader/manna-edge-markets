import React, { useState } from 'react';
import { useExclusiveSignals, type StateMachineTelemetry } from '../../hooks/useExclusiveSignals';
import { type EdgeSetup } from '../../types';
import { formatETTime } from '../../utils/time';

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

const InstrumentTelemetryCard: React.FC<{ t: StateMachineTelemetry }> = ({ t }) => {
  const colors = PHASE_COLORS[t.phase] || PHASE_COLORS.SCANNING;
  const isHot = t.phase === 'ENTRY_READY' || t.phase === 'VALIDATED';
  return (
    <div style={{
      background: isHot ? colors.bg : 'rgba(15,20,35,0.7)',
      border: `1px solid ${isHot ? colors.border : 'rgba(255,255,255,0.07)'}`,
      borderRadius: '10px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '5px', position: 'relative', overflow: 'hidden'
    }}>
      {isHot && <div style={{ position: 'absolute', top: 0, right: 0, width: '3px', height: '100%', background: colors.dot, borderRadius: '0 10px 10px 0' }} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#e2e8f0', fontFamily: 'monospace' }}>{t.instrument}</span>
        <span style={{ fontSize: '0.62rem', background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text, borderRadius: '20px', padding: '2px 8px', fontWeight: 700 }}>{t.phase}</span>
      </div>
      <div style={{ fontSize: '0.72rem', color: colors.text, fontWeight: 600 }}>{STATE_LABELS[t.state] || t.state}</div>
      {t.h1PoiType && <div style={{ fontSize: '0.65rem', color: '#718096' }}>H1: {t.h1PoiType} @ {t.h1PoiLevel?.toFixed(5) || '—'}</div>}
      {(t.m1OcCount != null && t.m1OcCount > 0) && <div style={{ fontSize: '0.65rem', color: '#718096' }}>M1 OCs: {t.m1OcCount}/2</div>}
      {t.convictionScore && <div style={{ fontSize: '0.65rem', color: colors.text, fontWeight: 700 }}>{t.convictionScore.toFixed(1)}% conviction</div>}
      <div style={{ fontSize: '0.6rem', color: '#4a5568' }}>Scan: {t.lastScannedAt ? new Date(t.lastScannedAt).toLocaleTimeString() : '—'}</div>
    </div>
  );
};

const ExclusiveSignalCard: React.FC<{ signal: EdgeSetup; onDismiss: (id: string) => void }> = ({ signal, onDismiss }) => {
  const [dismissing, setDismissing] = useState(false);
  const isShort = signal.bias === 'short';
  const meta = (() => { try { return JSON.parse(signal.metadata || '{}'); } catch { return {}; } })();

  const handleDismiss = async () => {
    if (!confirm('Dismiss this exclusive signal?')) return;
    setDismissing(true);
    await onDismiss(signal.id);
    setDismissing(false);
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(20,15,45,0.95) 0%, rgba(30,20,60,0.95) 100%)',
      border: '1px solid rgba(139,92,246,0.4)', borderLeft: '4px solid #8b5cf6', borderRadius: '12px', padding: '18px 20px', position: 'relative'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontWeight: 900, fontSize: '1.1rem', color: '#e2e8f0', fontFamily: 'monospace' }}>{signal.instrument}</span>
            <span style={{ background: isShort ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)', border: `1px solid ${isShort ? 'rgba(239,68,68,0.5)' : 'rgba(16,185,129,0.5)'}`, color: isShort ? '#f87171' : '#34d399', borderRadius: '20px', padding: '2px 10px', fontSize: '0.72rem', fontWeight: 800 }}>{isShort ? '▼ SELL' : '▲ BUY'}</span>
            <span style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', borderRadius: '20px', padding: '2px 10px', fontSize: '0.68rem', fontWeight: 700 }}>ELITE FRACTAL</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#718096', marginTop: '4px' }}>
            {signal.market?.toUpperCase()} · {(signal.killzone_origin || '').toUpperCase().replace('_', ' ')} · {signal.created_at ? formatETTime(signal.created_at) : '—'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {signal.conviction_score && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#a78bfa', fontFamily: 'monospace' }}>{signal.conviction_score.toFixed(1)}%</div>
              <div style={{ fontSize: '0.62rem', color: '#718096', textTransform: 'uppercase' }}>Conviction</div>
            </div>
          )}
          <button onClick={handleDismiss} disabled={dismissing} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 }}>✕ Dismiss</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '14px' }}>
        {[
          { label: 'Entry Low',  value: fmtPrice(signal.entry_zone_low,  signal.market), color: '#e2e8f0' },
          { label: 'Entry High', value: fmtPrice(signal.entry_zone_high, signal.market), color: '#e2e8f0' },
          { label: 'Stop Loss',  value: fmtPrice(signal.stop,            signal.market), color: '#f87171' },
          { label: 'TP1 (2R)',   value: fmtPrice(signal.tp1,             signal.market), color: '#34d399' },
          { label: 'TP2 (3.5R)', value: fmtPrice(signal.tp2,             signal.market), color: '#10b981' }
        ].map(item => (
          <div key={item.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '10px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: '#718096', textTransform: 'uppercase', marginBottom: '4px' }}>{item.label}</div>
            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: item.color, fontFamily: 'monospace' }}>{item.value}</div>
          </div>
        ))}
      </div>
      {meta.phases && (
        <div style={{ fontSize: '0.72rem', color: '#718096', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px' }}>
          <span style={{ color: '#a78bfa', fontWeight: 700 }}>4TF Alignment: </span>
          H1 {meta.phases.h1POIType || '—'} → M15 swing {meta.phases.m15SwingHigh?.toFixed(5) || '—'} → M5 ✓ → M1 OCs: {meta.phases.m1OCCount || 0}/2
        </div>
      )}
      {meta.selection_rationale && (
        <div style={{ fontSize: '0.7rem', color: '#4a5568', marginTop: '6px', lineHeight: 1.5 }}>{meta.selection_rationale}</div>
      )}
    </div>
  );
};

export const ExclusiveSignalsDashboard: React.FC = () => {
  const { signals, historySignals, telemetry, analytics, phaseCount, loading, scanning, lastUpdated, triggerScan, dismissSignal } = useExclusiveSignals();
  const [activeSection, setActiveSection] = useState<'live' | 'telemetry' | 'history'>('live');
  const [scanningMarket, setScanningMarket] = useState<'both' | 'forex' | 'futures'>('both');

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
              <div style={{ fontSize: '0.75rem', color: '#6b46c1', fontWeight: 600 }}>4-Timeframe Fractal Alignment · Bearish SELL Setups · SuperAdmin Exclusive</div>
            </div>
          </div>
          <div style={{ fontSize: '0.7rem', color: '#4a5568' }}>⚠️ This section is not visible to admins or traders. Signal cards are isolated from all public dashboards.</div>
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '20px', padding: '3px 10px', fontSize: '0.68rem', color: '#34d399', fontWeight: 700 }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981', display: 'inline-block' }}></span>
              Continuous Auto-Scan (5m)
            </div>
            {lastUpdated && <div style={{ fontSize: '0.65rem', color: '#718096' }}>UI Synced: {new Date(lastUpdated).toLocaleTimeString()}</div>}
          </div>
        </div>
      </div>

      {/* ANALYTICS BAR */}
      {analytics && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          {[
            { label: 'Active Signals',  value: analytics.activeSignals,                                color: '#34d399', icon: '⚡' },
            { label: 'Total Generated', value: analytics.totalSignals,                                 color: '#a78bfa', icon: '📊' },
            { label: 'Win Rate',        value: analytics.winRate        ? `${analytics.winRate}%`        : '—', color: '#fbbf24', icon: '🎯' },
            { label: 'Avg Conviction',  value: analytics.avgConviction  ? `${analytics.avgConviction}%`  : '—', color: '#60a5fa', icon: '🧠' },
            { label: 'Tracking',        value: telemetry.length,                                       color: '#f472b6', icon: '🔭' },
            { label: 'Entry Ready',     value: phaseCount.entryReady,                                  color: '#10b981', icon: '⚡' }
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
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: '12px' }}>
        {[
          { id: 'live',      label: `⚡ Live Signals (${signals.length})` },
          { id: 'telemetry', label: `🔭 Instrument Telemetry (${telemetry.length})` },
          { id: 'history',   label: `📋 History (${historySignals.length})` }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveSection(tab.id as any)} style={{ background: activeSection === tab.id ? 'rgba(139,92,246,0.2)' : 'transparent', border: `1px solid ${activeSection === tab.id ? 'rgba(139,92,246,0.5)' : 'transparent'}`, color: activeSection === tab.id ? '#a78bfa' : '#718096', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, transition: 'all 0.2s' }}>{tab.label}</button>
        ))}
      </div>

      {/* LIVE SIGNALS */}
      {activeSection === 'live' && (
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#4a5568' }}>Loading exclusive signals...</div>
          ) : signals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', background: 'rgba(15,20,40,0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '14px' }}>
              <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🛡️</div>
              <div style={{ color: '#718096', fontWeight: 700 }}>No active exclusive signals</div>
              <div style={{ color: '#4a5568', fontSize: '0.78rem', marginTop: '8px' }}>Run an Elite Fractal scan to generate signals, or wait for the next scheduled scan.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {signals.map(signal => <ExclusiveSignalCard key={signal.id} signal={signal} onDismiss={dismissSignal} />)}
            </div>
          )}
        </div>
      )}

      {/* TELEMETRY */}
      {activeSection === 'telemetry' && (
        <div>
          {hotInstruments.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '0.72rem', color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px', fontWeight: 700 }}>🔥 Hot — Entry Ready / Validated ({hotInstruments.length})</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
                {hotInstruments.map(t => <InstrumentTelemetryCard key={t.instrument} t={t} />)}
              </div>
            </div>
          )}
          <div>
            <div style={{ fontSize: '0.72rem', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px', fontWeight: 700 }}>All Instruments ({coldInstruments.length})</div>
            {coldInstruments.length === 0 && telemetry.length === 0 ? (
              <div style={{ color: '#4a5568', fontSize: '0.8rem', padding: '20px 0' }}>No telemetry data yet. Run a scan to populate.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
                {coldInstruments.map(t => <InstrumentTelemetryCard key={t.instrument} t={t} />)}
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
              {historySignals.map(signal => (
                <div key={signal.id} style={{ background: 'rgba(15,20,35,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <span style={{ fontWeight: 800, fontSize: '0.9rem', fontFamily: 'monospace' }}>{signal.instrument}</span>
                    <span style={{ fontSize: '0.72rem', color: '#718096', marginLeft: '10px' }}>{signal.market?.toUpperCase()}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '16px', fontSize: '0.75rem' }}>
                    <span style={{ color: '#718096' }}>Entry: {fmtPrice(signal.entry_zone_mid, signal.market)}</span>
                    <span style={{ color: '#f87171' }}>SL: {fmtPrice(signal.stop, signal.market)}</span>
                    <span style={{ color: '#34d399' }}>TP1: {fmtPrice(signal.tp1, signal.market)}</span>
                  </div>
                  <div style={{ fontSize: '0.68rem', background: signal.signal_state === 'resolved' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${signal.signal_state === 'resolved' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, color: signal.signal_state === 'resolved' ? '#34d399' : '#f87171', borderRadius: '20px', padding: '3px 10px', fontWeight: 700 }}>{(signal.signal_state || '').toUpperCase()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
