import React, { useState, useEffect } from 'react';
import './SessionScanCountdown.css';

import { API_BASE } from '../config';

interface Boundary {
  name: string;
  hour: number;
  minute: number;
  et: string;
}

const DEFAULT_BOUNDARIES: Boundary[] = [
  { name: 'London Open', hour: 2, minute: 0, et: '02:00 ET' },
  { name: 'NY AM Open', hour: 8, minute: 0, et: '08:00 ET' },
  { name: 'NY PM Open', hour: 14, minute: 0, et: '14:00 ET' },
  { name: 'Asia Open', hour: 20, minute: 0, et: '20:00 ET' }
];

export const SessionScanCountdown: React.FC = () => {
  const [time, setTime] = useState(new Date());
  const [hasEarlyScan, setHasEarlyScan] = useState(false);
  const [earlyCompleted, setEarlyCompleted] = useState(false);
  const [isEarlyScanNeeded, setIsEarlyScanNeeded] = useState(false);
  const [scanHour, setScanHour] = useState(7);
  const [scanMinute, setScanMinute] = useState(30);
  const [scanTimeET, setScanTimeET] = useState('07:30 ET');

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchEarlyScan = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/news/early-scan-status`);
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted) {
          setHasEarlyScan(Boolean(data.hasEarlyScanToday));
          setEarlyCompleted(Boolean(data.hasCompletedToday));
          setIsEarlyScanNeeded(Boolean(data.isEarlyScanNeeded));
          if (typeof data.scanHour === 'number') setScanHour(data.scanHour);
          if (typeof data.scanMinute === 'number') setScanMinute(data.scanMinute);
          if (data.earlyScanTimeET) {
            setScanTimeET(data.earlyScanTimeET.replace(' AM', '').replace(' PM', ''));
          }
        }
      } catch {
        // Silently catch network errors
      }
    };

    fetchEarlyScan();
    const interval = setInterval(fetchEarlyScan, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const etParts = formatter.formatToParts(time);
  const getPart = (type: string) => parseInt(etParts.find(p => p.type === type)?.value || '0', 10);

  const currentHour = getPart('hour');
  const currentMinute = getPart('minute');
  const currentSecond = getPart('second');
  const currentSecTotal = currentHour * 3600 + currentMinute * 60 + currentSecond;

  let activeBoundaries = [...DEFAULT_BOUNDARIES];
  if (hasEarlyScan && isEarlyScanNeeded) {
    activeBoundaries = [
      { name: 'London Open', hour: 2, minute: 0, et: '02:00 ET' },
      ...(earlyCompleted ? [] : [{ name: 'Forex Pre-News Scan', hour: scanHour, minute: scanMinute, et: scanTimeET }]),
      { name: 'NY AM Futures Open', hour: 8, minute: 0, et: '08:00 ET' },
      { name: 'NY PM Open', hour: 14, minute: 0, et: '14:00 ET' },
      { name: 'Asia Open', hour: 20, minute: 0, et: '20:00 ET' }
    ];
  }

  let nextB = activeBoundaries.find(b => (b.hour * 3600 + b.minute * 60) > currentSecTotal);
  let daysAdd = 0;

  if (!nextB) {
    nextB = activeBoundaries[0];
    daysAdd = 1;
  }

  const targetSecTotal = nextB.hour * 3600 + nextB.minute * 60 + (daysAdd * 24 * 3600);
  const diffSec = Math.max(0, targetSecTotal - currentSecTotal);

  const countdownH = Math.floor(diffSec / 3600);
  const countdownM = Math.floor((diffSec % 3600) / 60);
  const countdownS = diffSec % 60;

  const countdownStr = countdownH > 0
    ? `${countdownH}h ${String(countdownM).padStart(2, '0')}m ${String(countdownS).padStart(2, '0')}s`
    : `${String(countdownM).padStart(2, '0')}m ${String(countdownS).padStart(2, '0')}s`;

  return (
    <div className="session-scan-countdown-box glass-card font-mono">
      <div className="countdown-header">
        <span className="radar-pulse">📡</span>
        <span className="countdown-label">Next Institutional Scan Boundary</span>
      </div>
      <div className="countdown-body">
        <span className="target-name">{nextB.name} ({nextB.et})</span>
        <span className="countdown-timer text-gold animate-pulse">in {countdownStr}</span>
      </div>
    </div>
  );
};
