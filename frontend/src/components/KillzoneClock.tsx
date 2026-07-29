import React, { useState, useEffect } from 'react';
import './KillzoneClock.css';

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

export const KillzoneClock: React.FC = () => {
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
    </div>
  );
};
