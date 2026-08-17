import React, { useState, useEffect } from 'react';
import './SessionScanCountdown.css';

interface Boundary {
  name: string;
  hour: number;
  et: string;
}

const BOUNDARIES: Boundary[] = [
  { name: 'London Open', hour: 2, et: '02:00 ET' },
  { name: 'NY AM Open', hour: 8, et: '08:00 ET' },
  { name: 'NY PM Open', hour: 14, et: '14:00 ET' },
  { name: 'Asia Open', hour: 20, et: '20:00 ET' }
];

export const SessionScanCountdown: React.FC = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
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

  let nextB = BOUNDARIES.find(b => b.hour > currentHour);
  let daysAdd = 0;

  if (!nextB) {
    nextB = BOUNDARIES[0];
    daysAdd = 1;
  }

  const currentSecTotal = currentHour * 3600 + currentMinute * 60 + currentSecond;
  const targetSecTotal = nextB.hour * 3600 + (daysAdd * 24 * 3600);
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
