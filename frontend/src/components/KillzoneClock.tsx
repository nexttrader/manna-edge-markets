import React, { useState, useEffect } from 'react';
import './KillzoneClock.css';
import { type EdgeSetup } from '../types';
import { API_BASE } from '../config';

interface ScanStatusResponse {
  success: boolean;
  serverTime?: string;
  lastRun?: {
    id: string;
    run_timestamp: string;
    created_at: string;
    killzone: string;
    market?: string;
    trigger_type?: string;
    setups_created?: number;
  } | null;
  earlyScan?: {
    hasEarlyScanToday: boolean;
    isEarlyScanNeeded: boolean;
    hasCompletedToday: boolean;
    scanHour?: number;
    scanMinute?: number;
    earlyScanTimeET?: string;
  };
}

interface ScanCheckpoint {
  sessionKey: string;
  sessionName: string;
  name: string;
  hour: number;
  minute: number;
  et: string;
  type: 'futures' | 'forex' | 'both';
  dualEtDisplay: string;
  note: string;
}

export const KillzoneClock: React.FC<{ setups?: EdgeSetup[] }> = ({ setups = [] }) => {
  const [time, setTime] = useState(new Date());
  const [scanData, setScanData] = useState<ScanStatusResponse | null>(null);
  const [showScheduleInfo, setShowScheduleInfo] = useState(false);

  // Live 1-second clock tick
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Poll scan status every 30s to retrieve real DB runs and dynamic news schedules
  useEffect(() => {
    let isMounted = true;
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/scan-status`);
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted && data.success) {
          setScanData(data);
        }
      } catch {
        // Silently fallback to client computation
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Parse ET Time Parts (America/New_York)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const etParts = formatter.formatToParts(time);
  const getPart = (type: string) => parseInt(etParts.find(p => p.type === type)?.value || '0', 10);
  const getPartStr = (type: string) => etParts.find(p => p.type === type)?.value || '';

  const currentHour = getPart('hour');
  const currentMinute = getPart('minute');
  const currentSecond = getPart('second');
  const weekday = getPartStr('weekday');

  const etTimeString = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}:${String(currentSecond).padStart(2, '0')}`;
  const currentSecTotal = currentHour * 3600 + currentMinute * 60 + currentSecond;

  // Resolve Active Session matching backend killzone-mapper.ts
  let activeSessionKey = 'asia';
  let activeSessionName = 'ASIA';
  let sessionRangeET = '20:00 – 02:00 ET';
  let isPeakKillzone = false;

  if (currentHour >= 2 && currentHour < 8) {
    activeSessionKey = 'london';
    activeSessionName = 'LONDON';
    sessionRangeET = '02:00 – 08:00 ET';
    isPeakKillzone = currentHour >= 2 && currentHour < 5;
  } else if (currentHour >= 8 && currentHour < 14) {
    activeSessionKey = 'ny_am';
    activeSessionName = 'NY AM';
    sessionRangeET = '08:00 – 14:00 ET';
    isPeakKillzone = currentHour >= 8 && currentHour < 11;
  } else if (currentHour >= 14 && currentHour < 20) {
    activeSessionKey = 'ny_pm';
    activeSessionName = 'NY PM';
    sessionRangeET = '14:00 – 20:00 ET';
    isPeakKillzone = currentHour >= 14 && currentHour < 16;
  } else {
    activeSessionKey = 'asia';
    activeSessionName = 'ASIA';
    sessionRangeET = '20:00 – 02:00 ET';
    isPeakKillzone = currentHour >= 20 || currentHour === 23 || currentHour === 0;
  }

  // Dynamic High-Impact News Early Scan Check
  const earlyScan = scanData?.earlyScan;
  const hasEarlyScan = Boolean(earlyScan?.hasEarlyScanToday && earlyScan?.isEarlyScanNeeded && !earlyScan?.hasCompletedToday);
  const earlyScanHour = earlyScan?.scanHour ?? 7;
  const earlyScanMinute = earlyScan?.scanMinute ?? 30;
  const earlyScanTimeET = earlyScan?.earlyScanTimeET || '07:30 ET';

  // ── Scheduled Scan Checkpoints (Futures :00 ET Bell • Forex :05 ET Post-Open) ──
  const scanCheckpoints: ScanCheckpoint[] = [
    // London
    { sessionKey: 'london', sessionName: 'London', name: 'London Open (Futures)', hour: 2, minute: 0, et: '02:00 ET', type: 'futures', dualEtDisplay: '02:00 CME • 02:05 FX', note: 'Futures Bell' },
    { sessionKey: 'london', sessionName: 'London', name: 'London Open (Forex)', hour: 2, minute: 5, et: '02:05 ET', type: 'forex', dualEtDisplay: '02:05 FX Post-Open', note: '5M Candle Close' },

    // NY AM (with dynamic early Forex scan if scheduled)
    ...(hasEarlyScan ? [{
      sessionKey: 'ny_am', sessionName: 'NY AM', name: 'NY AM Pre-News (Forex)', hour: earlyScanHour, minute: earlyScanMinute, et: earlyScanTimeET, type: 'forex' as const, dualEtDisplay: `${earlyScanTimeET} FX Pre-News`, note: 'Dynamic 30m Pre-News'
    }] : []),
    { sessionKey: 'ny_am', sessionName: 'NY AM', name: 'NY AM Open (Futures)', hour: 8, minute: 0, et: '08:00 ET', type: 'futures', dualEtDisplay: '08:00 CME • 08:05 FX', note: 'Futures Bell' },
    { sessionKey: 'ny_am', sessionName: 'NY AM', name: 'NY AM Open (Forex)', hour: 8, minute: 5, et: '08:05 ET', type: 'forex', dualEtDisplay: '08:05 FX Post-Open', note: '5M Candle Close' },

    // NY PM
    { sessionKey: 'ny_pm', sessionName: 'NY PM', name: 'NY PM Open (Futures)', hour: 14, minute: 0, et: '14:00 ET', type: 'futures', dualEtDisplay: '14:00 CME • 14:05 FX', note: 'Futures Bell' },
    { sessionKey: 'ny_pm', sessionName: 'NY PM', name: 'NY PM Open (Forex)', hour: 14, minute: 5, et: '14:05 ET', type: 'forex', dualEtDisplay: '14:05 FX Post-Open', note: '5M Candle Close' },

    // Asia
    { sessionKey: 'asia', sessionName: 'Asia', name: 'Asia Open (Futures)', hour: 20, minute: 0, et: '20:00 ET', type: 'futures', dualEtDisplay: '20:00 CME • 20:05 FX', note: 'Futures Bell' },
    { sessionKey: 'asia', sessionName: 'Asia', name: 'Asia Open (Forex)', hour: 20, minute: 5, et: '20:05 ET', type: 'forex', dualEtDisplay: '20:05 FX Post-Open', note: '5M Candle Close' }
  ];

  // ── Calculate Next Scan ──
  let nextCheckpoint = scanCheckpoints.find(cp => (cp.hour * 3600 + cp.minute * 60) > currentSecTotal);
  let nextDaysAdd = 0;
  if (!nextCheckpoint) {
    nextCheckpoint = scanCheckpoints[0];
    nextDaysAdd = 1;
  }

  const nextTargetSec = nextCheckpoint.hour * 3600 + nextCheckpoint.minute * 60 + (nextDaysAdd * 24 * 3600);
  const diffNextSec = Math.max(0, nextTargetSec - currentSecTotal);

  const countdownH = Math.floor(diffNextSec / 3600);
  const countdownM = Math.floor((diffNextSec % 3600) / 60);
  const countdownS = diffNextSec % 60;

  const countdownStr = countdownH > 0
    ? `${countdownH}h ${countdownM}m ${countdownS}s`
    : countdownM > 0
    ? `${countdownM}m ${countdownS}s`
    : `${countdownS}s`;

  // Determine Next Scan Title & Badge
  const nextScanTitle = nextCheckpoint.type === 'futures' 
    ? `${nextCheckpoint.sessionName} Open` 
    : nextCheckpoint.note === 'Dynamic 30m Pre-News'
    ? `${nextCheckpoint.sessionName} Pre-News`
    : `${nextCheckpoint.sessionName} Forex`;

  const nextScanTimesDisplay = nextCheckpoint.dualEtDisplay;

  // ── Calculate Last Scan Done ──
  // 1. Prefer actual recorded run from backend database
  // 2. Fallback cleanly to mathematically computed previous boundary
  let lastScanLabel = '';
  let lastScanTimeET = '';
  let lastScanElapsedStr = '';
  let lastScanSetupsCount = 0;

  const dbLastRun = scanData?.lastRun;
  if (dbLastRun && dbLastRun.run_timestamp) {
    const runDate = new Date(dbLastRun.run_timestamp);
    const diffRunSec = Math.max(0, Math.floor((time.getTime() - runDate.getTime()) / 1000));
    
    const runH = Math.floor(diffRunSec / 3600);
    const runM = Math.floor((diffRunSec % 3600) / 60);

    if (diffRunSec < 60) {
      lastScanElapsedStr = 'just now';
    } else if (runH > 0) {
      lastScanElapsedStr = `${runH}h ${runM}m ago`;
    } else {
      lastScanElapsedStr = `${runM}m ago`;
    }

    // Format run time in ET
    const runParts = formatter.formatToParts(runDate);
    const getRunPart = (type: string) => runParts.find(p => p.type === type)?.value || '';
    lastScanTimeET = `${getRunPart('hour')}:${getRunPart('minute')} ET`;

    const kzName = (dbLastRun.killzone || 'ny_am').toUpperCase().replace('_', ' ');
    if (dbLastRun.trigger_type === 'manual') {
      lastScanLabel = `Manual Scan (${dbLastRun.market ? dbLastRun.market.toUpperCase() : 'ALL'})`;
    } else if (dbLastRun.market === 'forex') {
      lastScanLabel = `${kzName} (Forex +5m)`;
    } else if (dbLastRun.market === 'futures') {
      lastScanLabel = `${kzName} (Futures Bell)`;
    } else {
      lastScanLabel = `${kzName} Open`;
    }

    lastScanSetupsCount = dbLastRun.setups_created || 0;
  } else {
    // Client-side fallback: determine the latest checkpoint that has already passed
    const passedCheckpoints = scanCheckpoints.filter(cp => (cp.hour * 3600 + cp.minute * 60) <= currentSecTotal);
    let prevCheckpoint: ScanCheckpoint;
    let elapsedSec: number;

    if (passedCheckpoints.length > 0) {
      prevCheckpoint = passedCheckpoints[passedCheckpoints.length - 1];
      elapsedSec = currentSecTotal - (prevCheckpoint.hour * 3600 + prevCheckpoint.minute * 60);
    } else {
      // Prior checkpoint was the last checkpoint of yesterday
      prevCheckpoint = scanCheckpoints[scanCheckpoints.length - 1];
      elapsedSec = (24 * 3600 - (prevCheckpoint.hour * 3600 + prevCheckpoint.minute * 60)) + currentSecTotal;
    }

    const prevH = Math.floor(elapsedSec / 3600);
    const prevM = Math.floor((elapsedSec % 3600) / 60);

    lastScanElapsedStr = prevH > 0 ? `${prevH}h ${prevM}m ago` : `${prevM}m ago`;
    lastScanTimeET = prevCheckpoint.et;
    lastScanLabel = `${prevCheckpoint.sessionName} Open (${prevCheckpoint.type === 'forex' ? 'FX +5m' : 'CME Bell'})`;
  }

  // ── Market Open Status ──
  const isForexOpen = (() => {
    if (weekday === 'Fri' && currentHour >= 17) return false;
    if (weekday === 'Sat') return false;
    if (weekday === 'Sun' && currentHour < 17) return false;
    return true;
  })();

  const isFuturesOpen = (() => {
    if (weekday === 'Fri' && currentHour >= 17) return false;
    if (weekday === 'Sat') return false;
    if (weekday === 'Sun' && currentHour < 18) return false;
    if (['Mon', 'Tue', 'Wed', 'Thu'].includes(weekday) && currentHour === 17) return false;
    return true;
  })();

  const isAnyMarketOpen = isForexOpen || isFuturesOpen;

  // ── Midpoint Rescan Booster Check (Low Signals condition) ──
  const activeFuturesCount = setups.filter(s => (s.market || '').toLowerCase() === 'futures' && (s.signal_state === 'active' || s.signal_state === 'awaiting_entry')).length;
  const activeForexCount = setups.filter(s => (s.market || '').toLowerCase() === 'forex' && (s.signal_state === 'active' || s.signal_state === 'awaiting_entry')).length;

  const hasLowFutures = isFuturesOpen && activeFuturesCount < 2;
  const hasLowForex = isForexOpen && activeForexCount < 4;
  const isLowSignals = hasLowFutures || hasLowForex;

  const midpointsMap: Record<string, { hour: number; minute: number; label: string; et: string }> = {
    'london': { hour: 3, minute: 30, label: 'London Midpoint', et: '03:30 ET' },
    'ny_am':  { hour: 9, minute: 30, label: 'NY AM Midpoint', et: '09:30 ET' },
    'ny_pm':  { hour: 14, minute: 30, label: 'NY PM Midpoint', et: '14:30 ET' },
    'asia':   { hour: 21, minute: 30, label: 'Asia Midpoint', et: '21:30 ET' }
  };

  const activeMidpoint = midpointsMap[activeSessionKey];
  const isBeforeMidpoint = (() => {
    if (!activeMidpoint) return false;
    if (activeSessionKey === 'asia' && currentHour < 20) {
      return false; // past midnight in Asian session means past midpoint
    }
    return currentHour < activeMidpoint.hour || (currentHour === activeMidpoint.hour && currentMinute < activeMidpoint.minute);
  })();

  let midpointCountdownStr = '';
  if (activeMidpoint) {
    const midpointSecTotal = activeMidpoint.hour * 3600 + activeMidpoint.minute * 60;
    const diffMidpointSec = Math.max(0, midpointSecTotal - currentSecTotal);

    const midH = Math.floor(diffMidpointSec / 3600);
    const midM = Math.floor((diffMidpointSec % 3600) / 60);
    const midS = diffMidpointSec % 60;

    midpointCountdownStr = midH > 0
      ? `${midH}h ${midM}m ${midS}s`
      : `${midM}m ${midS}s`;
  }

  const showRescanTimer = isLowSignals && isBeforeMidpoint && activeMidpoint;

  return (
    <div className="killzone-clock glass-card">
      {/* ── 1. ACTIVE SESSION & MASTER ET CLOCK ── */}
      <div className="clock-section clock-session-section" title={`Active Trading Session: ${activeSessionName} (${sessionRangeET})`}>
        <div className="session-status-cluster">
          <div className={`kz-indicator ${isAnyMarketOpen ? 'active' : 'closed'} ${isPeakKillzone ? 'peak-glow' : ''}`} />
          <div className="session-badge-wrapper">
            <span className="kz-name">{activeSessionName}</span>
            <span className="session-range-tag">{sessionRangeET}</span>
          </div>
        </div>
        <span className="clock-time font-mono">{etTimeString} ET</span>
      </div>

      <div className="clock-divider" />

      {/* ── 2. LAST SCAN DONE SHOWCASE ── */}
      <div className="clock-section clock-last-scan font-mono" title={`Last execution: ${lastScanLabel} at ${lastScanTimeET} (${lastScanElapsedStr})`}>
        <span className="scan-pill-badge last-scan-badge">⏱️ LAST SCAN</span>
        <div className="scan-info-block">
          <span className="scan-primary-title">{lastScanLabel}</span>
          <span className="scan-secondary-detail">{lastScanTimeET}</span>
        </div>
        <span className="scan-elapsed-pill">{lastScanElapsedStr}</span>
        {lastScanSetupsCount > 0 && (
          <span className="scan-count-tag">+{lastScanSetupsCount} sig</span>
        )}
      </div>

      <div className="clock-divider" />

      {/* ── 3. NEXT SCAN UPCOMING SHOWCASE ── */}
      <div className="clock-section clock-next-scan font-mono" title={`Upcoming Scan: ${nextScanTitle} (${nextScanTimesDisplay}) in ${countdownStr}`}>
        <span className="scan-pill-badge next-scan-badge">📡 NEXT SCAN</span>
        <div className="scan-info-block">
          <span className="scan-primary-title scan-target-gold">{nextScanTitle}</span>
          <span className="scan-secondary-detail text-gold-muted">({nextScanTimesDisplay})</span>
        </div>
        <span className="scan-countdown">in {countdownStr}</span>
      </div>

      {/* ── 4. MIDPOINT BOOSTER RESCAN NOTICE (CONDITIONAL) ── */}
      {showRescanTimer && (
        <>
          <div className="clock-divider" />
          <div className="clock-section clock-midpoint-scan font-mono" title={`Session Midpoint Booster Scan: Triggering due to low active setups`}>
            <span className="scan-pill-badge midpoint-badge">⚡ MIDPOINT</span>
            <span className="scan-primary-title text-warning-amber">{activeMidpoint.label} ({activeMidpoint.et})</span>
            <span className="rescan-countdown-amber animate-rescan-flash">in {midpointCountdownStr}</span>
          </div>
        </>
      )}

      {/* ── 5. SCHEDULE INFO MODAL TOGGLE ── */}
      <button 
        type="button" 
        className="clock-schedule-toggle-btn"
        onClick={() => setShowScheduleInfo(!showScheduleInfo)}
        title="View Institutional Trading & Scan Schedule"
      >
        ℹ️
      </button>

      {/* ── MODAL: INSTITUTIONAL SCAN SCHEDULE BREAKDOWN ── */}
      {showScheduleInfo && (
        <div className="schedule-modal-overlay" onClick={() => setShowScheduleInfo(false)}>
          <div className="schedule-modal glass-card font-mono" onClick={e => e.stopPropagation()}>
            <div className="schedule-modal-header">
              <h3>🕒 Institutional Scan Schedule</h3>
              <button className="schedule-modal-close" onClick={() => setShowScheduleInfo(false)}>✕</button>
            </div>
            <div className="schedule-modal-body">
              <div className="schedule-note-banner">
                <span>⚡ <strong>Calibrated Dual-Cadence Scans</strong>: CME Futures bell triggers at <code>:00 ET</code>. Institutional Forex triggers at <code>:05 ET</code> to allow the initial 5M candle displacement to close.</span>
              </div>
              <div className="schedule-table">
                <div className="schedule-row header-row">
                  <span>Session</span>
                  <span>Hours (ET)</span>
                  <span>CME Bell</span>
                  <span>Forex (+5m)</span>
                  <span>Midpoint</span>
                </div>
                <div className={`schedule-row ${activeSessionKey === 'london' ? 'active-row' : ''}`}>
                  <span className="session-col">🇬🇧 London</span>
                  <span>02:00–08:00</span>
                  <span className="bell-col">02:00 ET</span>
                  <span className="fx-col">02:05 ET</span>
                  <span>03:30 ET</span>
                </div>
                <div className={`schedule-row ${activeSessionKey === 'ny_am' ? 'active-row' : ''}`}>
                  <span className="session-col">🇺🇸 NY AM</span>
                  <span>08:00–14:00</span>
                  <span className="bell-col">08:00 ET</span>
                  <span className="fx-col">08:05 ET</span>
                  <span>09:30 ET</span>
                </div>
                <div className={`schedule-row ${activeSessionKey === 'ny_pm' ? 'active-row' : ''}`}>
                  <span className="session-col">🇺🇸 NY PM</span>
                  <span>14:00–20:00</span>
                  <span className="bell-col">14:00 ET</span>
                  <span className="fx-col">14:05 ET</span>
                  <span>14:30 ET</span>
                </div>
                <div className={`schedule-row ${activeSessionKey === 'asia' ? 'active-row' : ''}`}>
                  <span className="session-col">🇯🇵 Asia</span>
                  <span>20:00–02:00</span>
                  <span className="bell-col">20:00 ET</span>
                  <span className="fx-col">20:05 ET</span>
                  <span>21:30 ET</span>
                </div>
              </div>
              <div className="schedule-footer-notes">
                <p>• <strong>Dynamic Pre-News Scan</strong>: On high-impact news days (CPI, NFP, PPI), early Forex scans trigger 30m prior to release (07:00–07:59 ET).</p>
                <p>• <strong>Midpoint Rescans</strong>: Run automatically if active setups drop below institutional threshold in the first half of a session.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
