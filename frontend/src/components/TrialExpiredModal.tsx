import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';

export const TrialExpiredModal: React.FC = () => {
  const { user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'forex_only' | 'futures_forex'>('futures_forex');
  const [loading, setLoading] = useState(false);

  if (!user || !user.isTrial || !user.trialExpired) return null;

  const handleSelectPlan = async (tier: 'free' | 'forex_only' | 'futures_forex') => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${user.id}/tier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update plan');

      alert(`✅ Subscription plan selected! Welcome to ${tier === 'futures_forex' ? 'Futures & Forex VIP' : tier === 'forex_only' ? 'Forex Only' : 'Free Tier'}.`);
      window.location.reload();
    } catch (err: any) {
      alert(`⚠️ ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay font-mono" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(6, 2, 12, 0.96)', backdropFilter: 'blur(16px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="glass-card" style={{ background: '#0f0620', border: '2px solid #ffd700', borderRadius: '16px', padding: '32px', maxWidth: '520px', width: '100%', color: '#fff', boxShadow: '0 0 40px rgba(255, 215, 0, 0.3)' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <span style={{ fontSize: '3rem' }}>⏰</span>
          <h2 style={{ color: '#ffd700', margin: '8px 0 4px 0', fontSize: '1.4rem', fontWeight: 900 }}>
            21-DAY VIP PASS EXPIRED
          </h2>
          <p style={{ color: '#00e5ff', margin: 0, fontSize: '0.9rem', fontWeight: 800 }}>
            PLEASE CHOOSE YOUR ACCESS PLAN TO CONTINUE
          </p>
        </div>

        <p style={{ fontSize: '0.85rem', color: '#ccc', lineHeight: '1.5', textAlign: 'center', marginBottom: '24px' }}>
          We hope you enjoyed your 21-day trial of Manna Edge Markets! Please select an access plan below to continue unlocking live market setups and conviction scores.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
          {/* Plan 1: Free Tier */}
          <div
            onClick={() => setSelectedPlan('free')}
            style={{
              padding: '14px 18px',
              borderRadius: '8px',
              border: selectedPlan === 'free' ? '2px solid #00e5ff' : '1px solid rgba(255,255,255,0.1)',
              background: selectedPlan === 'free' ? 'rgba(0, 229, 255, 0.12)' : 'rgba(255,255,255,0.03)',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <div>
              <div style={{ fontWeight: 900, color: '#00e5ff', fontSize: '0.95rem' }}>🟢 Free Tier Access</div>
              <div style={{ fontSize: '0.78rem', color: '#aaa', marginTop: '2px' }}>2 Futures + 2 Forex setups per day</div>
            </div>
            <span style={{ fontWeight: 800, color: '#00e5ff' }}>$0 / mo</span>
          </div>

          {/* Plan 2: Forex Only */}
          <div
            onClick={() => setSelectedPlan('forex_only')}
            style={{
              padding: '14px 18px',
              borderRadius: '8px',
              border: selectedPlan === 'forex_only' ? '2px solid #e056fd' : '1px solid rgba(255,255,255,0.1)',
              background: selectedPlan === 'forex_only' ? 'rgba(224, 86, 253, 0.12)' : 'rgba(255,255,255,0.03)',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <div>
              <div style={{ fontWeight: 900, color: '#e056fd', fontSize: '0.95rem' }}>🔵 Forex Only Pro</div>
              <div style={{ fontSize: '0.78rem', color: '#aaa', marginTop: '2px' }}>Unlimited Forex pairs + 15M/1H conviction scores</div>
            </div>
            <span style={{ fontWeight: 800, color: '#e056fd' }}>Pro Plan</span>
          </div>

          {/* Plan 3: Futures & Forex VIP */}
          <div
            onClick={() => setSelectedPlan('futures_forex')}
            style={{
              padding: '14px 18px',
              borderRadius: '8px',
              border: selectedPlan === 'futures_forex' ? '2px solid #ffd700' : '1px solid rgba(255,255,255,0.1)',
              background: selectedPlan === 'futures_forex' ? 'rgba(255, 215, 0, 0.15)' : 'rgba(255,255,255,0.03)',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <div>
              <div style={{ fontWeight: 900, color: '#ffd700', fontSize: '0.95rem' }}>👑 Futures &amp; Forex VIP Access</div>
              <div style={{ fontSize: '0.78rem', color: '#aaa', marginTop: '2px' }}>All CME Futures (NQ, ES, CL, GC) + All Forex pairs</div>
            </div>
            <span style={{ fontWeight: 800, color: '#ffd700' }}>Full VIP</span>
          </div>
        </div>

        <button
          onClick={() => handleSelectPlan(selectedPlan)}
          disabled={loading}
          style={{ width: '100%', background: '#ffd700', color: '#090314', border: 'none', padding: '14px', borderRadius: '8px', fontWeight: 900, fontSize: '1rem', cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? 'Activating Plan...' : `🚀 Activate ${selectedPlan === 'futures_forex' ? 'VIP Access' : selectedPlan === 'forex_only' ? 'Forex Pro' : 'Free Tier'}`}
        </button>
      </div>
    </div>
  );
};
