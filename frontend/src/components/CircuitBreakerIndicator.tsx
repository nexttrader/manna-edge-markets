import React, { useState, useEffect } from 'react';
import './CircuitBreakerIndicator.css';
import { useSystemStatus } from '../hooks/useAdmin';
import { formatETTime } from '../utils/time';

export const CircuitBreakerIndicator: React.FC = () => {
  const { status } = useSystemStatus();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const cb = status.circuitBreaker;
  const isTripped = cb?.tripped ?? (status.status !== 'ok');
  const resetsAt = cb?.resetsAt || status.resetsAt;

  let countdownStr = '';
  if (isTripped && resetsAt) {
    const targetMs = new Date(resetsAt).getTime();
    const diffMs = Math.max(0, targetMs - now);
    const mins = Math.floor(diffMs / 60000);
    const secs = Math.floor((diffMs % 60000) / 1000);
    countdownStr = diffMs > 0 ? `${mins}m ${secs}s` : 'Restoring...';
  }

  return (
    <div 
      className={`circuit-breaker ${!isTripped ? 'ok' : 'tripped'}`} 
      title={isTripped ? `Failures: ${cb?.failureCount || status.failureCount}. Restores at ${resetsAt ? formatETTime(resetsAt) : '30m'}` : 'System OK'}
    >
      <div className="cb-dot" />
      <span className="cb-label">
        {!isTripped 
          ? 'System OK' 
          : `CIRCUIT TRIPPED ${resetsAt ? `(Restores ${formatETTime(resetsAt)}${countdownStr ? ` in ${countdownStr}` : ''})` : '(Auto-Restoring)'}`
        }
      </span>
    </div>
  );
};
