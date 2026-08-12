import React, { useState, useEffect } from 'react';
import './KillzoneClock.css';
import { type EdgeSetup } from '../types';

interface KillzoneInfo {
  name: string;
  start: number; // Hour in ET
  end: number;
}

const KILLZONES: KillzoneInfo[] = [
  { name: 'LONDON', start: 2, end: 5 },
  { name: 'NY_AM', start: 8, end: 11 },
  { name: 'NY_PM', start: 13, end: 16 },
  { name: 'ASIAN', start: 20, end: 0 }
];

export const KillzoneClock: React.FC<{ setups?: EdgeSetup[] }> = ({ setups = [] }) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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

  let current: string | null = null;
  for (const kz of KILLZONES) {
    if (kz.start <= kz.end) {
      if (currentHour >= kz.start && currentHour < kz.end) current = kz.name;
    } else {
      if (currentHour >= kz.start || currentHour < kz.end) current = kz.name;
    }
  }

  // Calculate Next Scan Boundary (02:00, 08:00, 14:00, 20:00 ET)
  const boundaries = [
    { name: 'London Open', hour: 2, et: '02:00 ET' },
    { name: 'NY AM Open', hour: 8, et: '08:00 ET' },
    { name: 'NY PM Open', hour: 14, et: '14:00 ET' },
    { name: 'Asia Open', hour: 20, et: '20:00 ET' }
  ];

  let nextB = boundaries.find(b => {
    if (b.hour > currentHour) return true;
    return false;
  });

  let daysAdd = 0;
  if (!nextB) {
    nextB = boundaries[0];
    daysAdd = 1;
  }

  const currentSecTotal = currentHour * 3600 + currentMinute * 60 + currentSecond;
  const targetSecTotal = nextB.hour * 3600 + (daysAdd * 24 * 3600);
  const diffSec = Math.max(0, targetSecTotal - currentSecTotal);

  const countdownH = Math.floor(diffSec / 3600);
  const countdownM = Math.floor((diffSec % 3600) / 60);
  const countdownS = diffSec % 60;

  const countdownStr = countdownH > 0 
    ? `${countdownH}h ${countdownM}m ${countdownS}s`
    : `${countdownM}m ${countdownS}s`;

  // Market Open checks to match backend rules
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

  // Filter for active setups to calculate low signal threshold
  const activeFuturesCount = setups.filter(s => (s.market || '').toLowerCase() === 'futures' && (s.signal_state === 'active' || s.signal_state === 'awaiting_entry')).length;
  const activeForexCount = setups.filter(s => (s.market || '').toLowerCase() === 'forex' && (s.signal_state === 'active' || s.signal_state === 'awaiting_entry')).length;

  const hasLowFutures = isFuturesOpen && activeFuturesCount <= 2;
  const hasLowForex = isForexOpen && activeForexCount <= 2;
  const isLowSignals = hasLowFutures || hasLowForex;

  // Check if we are currently before the midpoint of the active session
  const midpointsMap: Record<string, { hour: number; minute: number; label: string; et: string }> = {
    'LONDON': { hour: 3, minute: 30, label: 'London Midpoint', et: '03:30 ET' },
    'NY_AM': { hour: 9, minute: 30, label: 'NY AM Midpoint', et: '09:30 ET' },
    'NY_PM': { hour: 14, minute: 30, label: 'NY PM Midpoint', et: '14:30 ET' },
    'ASIAN': { hour: 21, minute: 30, label: 'Asia Midpoint', et: '21:30 ET' }
  };

  const activeMidpoint = current ? midpointsMap[current] : null;

  const isBeforeMidpoint = (() => {
    if (!activeMidpoint) return false;
    if (current === 'ASIAN' && currentHour < 20) {
      return false; // past midnight in Asian session means past midpoint
    }
    return currentHour < activeMidpoint.hour || (currentHour === activeMidpoint.hour && currentMinute < activeMidpoint.minute);
  })();

  let midpointCountdownStr = '';
  if (activeMidpoint) {
    const midpointSecTotal = activeMidpoint.hour * 3600 + activeMidpoint.minute * 60;
    const currentSecTotal = currentHour * 3600 + currentMinute * 60 + currentSecond;
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
      <div className="clock-left">
        <div className={`kz-indicator ${current ? 'active' : ''}`} />
        <span className="kz-name">{current || 'INTERSESSION'}</span>
        <span className="clock-time font-mono">{etTimeString} ET</span>
      </div>

      <div className="clock-divider" />

      <div className="clock-next-scan font-mono">
        <span className="scan-label">📡 Next Scan:</span>
        <span className="scan-target">{nextB.name} ({nextB.et})</span>
        <span className="scan-countdown">in {countdownStr}</span>
      </div>

      {showRescanTimer && (
        <>
          <div className="clock-divider" />
          <div className="clock-next-scan font-mono clock-midpoint-scan">
            <span className="scan-label text-warning-amber">⚡ Midpoint Rescan ({activeMidpoint.et}):</span>
            <span className="scan-countdown rescan-countdown-amber animate-rescan-flash">in {midpointCountdownStr}</span>
          </div>
        </>
      )}
    </div>
  );
};
