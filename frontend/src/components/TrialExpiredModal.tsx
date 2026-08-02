import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';

export const TrialExpiredModal: React.FC = () => {
  const { user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'forex_only' | 'futures_forex'>('futures_forex');
  const [loading, setLoading] = useState(false);
  const [paymentPending, setPaymentPending] = useState(false);

  if (!user || !user.isTrial || !user.trialExpired) return null;

  const handleSelectPlan = async () => {
    setLoading(true);
    try {
      if (selectedPlan === 'free') {
        // Free tier is $0/mo - activates immediately
        const res = await fetch(`${API_BASE}/api/admin/users/${user.id}/tier`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tier: 'free' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to activate Free Tier');

        alert('✅ Free Tier activated! You have access to 2 Futures + 2 Forex setups daily.');
        window.location.reload();
      } else {
        // Paid Tiers require checkout payment / admin billing approval!
        setPaymentPending(true);
      }
    } catch (err: any) {
      alert(`⚠️ ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay font-mono" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(6, 2, 12, 0.96)', backdropFilter: 'blur(16px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="glass-card" style={{ background: '#0f0620', border: '2px solid #ffd700', borderRadius: '16px', padding: '32px', maxWidth: '520px', width: '100%', color: '#fff', boxShadow: '0 0 40px rgba(255, 215, 0, 0.3)' }}>
        
        {!paymentPending ? (
          <>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <span style={{ fontSize: '3rem' }}>⏰</span>
              <h2 style={{ color: '#ffd700', margin: '8px 0 4px 0', fontSize: '1.4rem', fontWeight: 900 }}>
                21-DAY VIP PASS EXPIRED
              </h2>
              <p style={{ color: '#00e5ff', margin: 0, fontSize: '0.9rem', fontWeight: 800 }}>
                CHOOSE A PLAN TO CONTINUE ACCESS
              </p>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#ccc', lineHeight: '1.5', textAlign: 'center', marginBottom: '24px' }}>
              Your 21-day trial of Manna Edge Markets has completed. Select a plan below. The Free Tier is 100% free, while Pro &amp; VIP plans require checkout completion.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
              {/* Free Tier */}
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
                  <div style={{ fontWeight: 900, color: '#00e5ff', fontSize: '0.95rem' }}>🟢 Free Tier ($0 / month)</div>
                  <div style={{ fontSize: '0.78rem', color: '#aaa', marginTop: '2px' }}>2 Futures + 2 Forex setups per day • Immediate Access</div>
                </div>
                <span style={{ fontWeight: 800, color: '#00e5ff' }}>FREE</span>
              </div>

              {/* Forex Only */}
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
                <span style={{ fontWeight: 800, color: '#e056fd' }}>💳 Subscribe</span>
              </div>

              {/* Futures & Forex VIP */}
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
                <span style={{ fontWeight: 800, color: '#ffd700' }}>💳 Subscribe</span>
              </div>
            </div>

            <button
              onClick={handleSelectPlan}
              disabled={loading}
              style={{ width: '100%', background: selectedPlan === 'free' ? '#00e5ff' : '#ffd700', color: '#090314', border: 'none', padding: '14px', borderRadius: '8px', fontWeight: 900, fontSize: '1rem', cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Processing...' : selectedPlan === 'free' ? 'Activate Free Tier ($0/mo)' : `💳 Proceed to Checkout (${selectedPlan === 'futures_forex' ? 'Futures & Forex VIP' : 'Forex Pro'})`}
            </button>
          </>
        ) : (
          /* Payment Redirect / Pending Modal State */
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '3rem' }}>💳</span>
            <h3 style={{ color: '#ffd700', margin: '8px 0 8px 0', fontSize: '1.25rem', fontWeight: 900 }}>
              MEMBERSHIP CHECKOUT &amp; ACTIVATION
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#ccc', lineHeight: '1.5', marginBottom: '20px' }}>
              You selected the <strong>{selectedPlan === 'futures_forex' ? 'Futures & Forex VIP Plan' : 'Forex Only Pro Plan'}</strong>. To complete your subscription and unlock full institutional market scanning:
            </p>

            <div style={{ background: 'rgba(255, 215, 0, 0.08)', border: '1px solid rgba(255, 215, 0, 0.3)', padding: '16px', borderRadius: '8px', marginBottom: '24px', textAlign: 'left' }}>
              <div style={{ fontSize: '0.82rem', color: '#ffd700', fontWeight: 800, marginBottom: '6px' }}>
                Option A: Instant Online Checkout
              </div>
              <div style={{ fontSize: '0.8rem', color: '#bbb', marginBottom: '14px' }}>
                Complete payment via our secure payment gateway to auto-activate your account immediately.
              </div>

              <div style={{ fontSize: '0.82rem', color: '#00e5ff', fontWeight: 800, marginBottom: '6px' }}>
                Option B: Contact Admin Support
              </div>
              <div style={{ fontSize: '0.8rem', color: '#bbb' }}>
                If you have an existing invoice or subscription, contact support at <strong>support@mannaedge.com</strong> or your account manager for instant manual activation.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setPaymentPending(false)}
                style={{ flex: 1, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#aaa', padding: '12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}
              >
                ⬅ Back to Plans
              </button>
              <button
                onClick={() => {
                  alert('💳 Redirecting to Secure Payment Gateway...');
                }}
                style={{ flex: 1.5, background: '#ffd700', color: '#090314', border: 'none', padding: '12px', borderRadius: '6px', fontWeight: 900, cursor: 'pointer' }}
              >
                💳 Complete Payment
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
