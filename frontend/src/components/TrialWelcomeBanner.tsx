import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export const TrialWelcomeBanner: React.FC = () => {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  if (!user || !user.isTrial || user.trialExpired || dismissed) return null;

  const daysLeft = user.trialDaysRemaining !== undefined ? user.trialDaysRemaining : 21;

  return (
    <div className="font-mono" style={{ background: 'linear-gradient(135deg, rgba(224, 86, 253, 0.25), rgba(0, 229, 255, 0.2))', border: '1px solid #e056fd', borderRadius: '10px', padding: '16px 20px', marginBottom: '20px', color: '#fff', boxShadow: '0 0 20px rgba(224, 86, 253, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <span style={{ fontSize: '2rem' }}>🎁</span>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h3 style={{ margin: 0, color: '#e056fd', fontSize: '1rem', fontWeight: 900 }}>
              WELCOME BACK! YOUR 21-DAY VIP PASS IS ACTIVE
            </h3>
            <span style={{ background: '#ffd700', color: '#090314', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 900 }}>
              {daysLeft} Days Left
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#e2e8f0', lineHeight: '1.4' }}>
            We completely rebuilt Manna Edge Markets with institutional-grade scanning &amp; automated bias engines! Enjoy <strong>21 Days of Unlimited VIP Access</strong> (All Futures &amp; Forex signals) on us.
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
