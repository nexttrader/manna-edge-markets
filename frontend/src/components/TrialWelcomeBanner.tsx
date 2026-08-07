import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export const TrialWelcomeBanner: React.FC = () => {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [timeLeftStr, setTimeLeftStr] = useState<string>('');

  useEffect(() => {
    if (!user || !user.trialExpiresAt) return;
    const targetTime = new Date(user.trialExpiresAt).getTime();

    const updateTimer = () => {
      const diff = targetTime - Date.now();
      if (diff <= 0) {
        setTimeLeftStr('Expired');
        return;
      }

      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      setTimeLeftStr(`${days}d ${hours}h ${minutes}m ${seconds}s Left`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [user?.trialExpiresAt]);

  if (!user || !user.isTrial || user.trialExpired || dismissed) return null;

  const hasCustomTrial = Boolean(user.customFeatures?.trialName);
  const trialName = user.customFeatures?.trialName || 'VIP PASS';
  const displayTimeLeft = timeLeftStr || (user.trialDaysRemaining !== undefined ? `${user.trialDaysRemaining} Days Left` : '21 Days Left');

  // Styles based on custom vs default trial
  const bgStyle = hasCustomTrial 
    ? 'linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(123, 31, 162, 0.25))'
    : 'linear-gradient(135deg, rgba(224, 86, 253, 0.25), rgba(0, 229, 255, 0.2))';
  const borderStyle = hasCustomTrial ? '1px solid #ffd700' : '1px solid #e056fd';
  const shadowStyle = hasCustomTrial ? '0 0 20px rgba(255, 215, 0, 0.2)' : '0 0 20px rgba(224, 86, 253, 0.25)';
  const badgeBg = hasCustomTrial ? '#ffd700' : '#e056fd';
  const badgeColor = '#090314';

  const defaultDesc = "We completely rebuilt Manna Edge Markets with institutional-grade scanning & automated bias engines! Enjoy your VIP Access (All CME Futures & Forex signals) on us.";
  const customDesc = `Your custom VIP trial profile is active. Tier Access: ${user.tier === 'futures_forex' ? 'Futures & Forex' : user.tier === 'forex_only' ? 'Forex Only' : 'Free'}. Max Signals: ${user.customFeatures?.maxSignals || 'Unlimited'}. Strategy Limit: ${user.customFeatures?.strategyAccess || 'Institutional'}.`;

  return (
    <div className="font-mono" style={{ background: bgStyle, border: borderStyle, borderRadius: '10px', padding: '16px 20px', marginBottom: '20px', color: '#fff', boxShadow: shadowStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <span style={{ fontSize: '2rem' }}>{hasCustomTrial ? '👑' : '🎁'}</span>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h3 style={{ margin: 0, color: hasCustomTrial ? '#ffd700' : '#e056fd', fontSize: '1rem', fontWeight: 900 }}>
              WELCOME BACK! YOUR {trialName.toUpperCase()} IS ACTIVE
            </h3>
            <span style={{ background: badgeBg, color: badgeColor, padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 900 }}>
              ⏱️ {displayTimeLeft}
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#e2e8f0', lineHeight: '1.4' }}>
            {hasCustomTrial ? customDesc : defaultDesc}
          </p>
        </div>
      </div>

      <button
        onClick={() => setDismissed(true)}
        style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#ccc', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}
      >
        Dismiss ✖
      </button>
    </div>
  );
};
