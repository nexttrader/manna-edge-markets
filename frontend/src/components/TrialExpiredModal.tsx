import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';

type Step = 'plan_select' | 'submitting' | 'submitted' | 'free_activating';

export const TrialExpiredModal: React.FC = () => {
  const { user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'forex_only' | 'futures_forex'>('futures_forex');
  const [step, setStep] = useState<Step>('plan_select');
  const [loading, setLoading] = useState(false);

  if (!user || !user.isTrial || !user.trialExpired) return null;

  const TIER_LABEL: Record<string, string> = {
    futures_forex: 'Futures & Forex VIP',
    forex_only: 'Forex Only Pro',
    free: 'Free Tier'
  };

  const handleSelectPlan = async () => {
    setLoading(true);
    try {
      if (selectedPlan === 'free') {
        // Free tier activates immediately — no payment needed
        setStep('free_activating');
        const res = await fetch(`${API_BASE}/api/admin/users/${user.id}/tier`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tier: 'free' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to activate Free Tier');
        window.location.reload();
      } else {
        // Paid plan → fire a support ticket, admin will review + send invoice
        setStep('submitting');
        const tierLabel = TIER_LABEL[selectedPlan];
        const trialText = user.customFeatures?.trialName ? `custom '${user.customFeatures.trialName}' trial` : '21-day VIP trial';
        const body = `${user.name} has completed a ${trialText} and is requesting an upgrade to the ${tierLabel} plan. Please review, send an invoice to ${user.email}, and activate their account once payment is confirmed.`;

        const res = await fetch(`${API_BASE}/api/support/tickets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            userName: user.name,
            userEmail: user.email,
            requestedTier: selectedPlan,
            currentTier: user.tier || 'free',
            type: 'tier_upgrade_request',
            subject: `Tier Upgrade Request — ${tierLabel}`,
            body,
            priority: selectedPlan === 'futures_forex' ? 'urgent' : 'high'
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to submit request');
        setStep('submitted');
      }
    } catch (err: any) {
      alert(`⚠️ ${err.message}`);
      setStep('plan_select');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(6, 2, 12, 0.96)', backdropFilter: 'blur(16px)',
      zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px', fontFamily: "'Space Mono', 'Courier New', monospace"
    }}>
      <div style={{
        background: '#0f0620', border: '2px solid #ffd700', borderRadius: '16px',
        padding: '32px', maxWidth: '520px', width: '100%', color: '#fff',
        boxShadow: '0 0 40px rgba(255, 215, 0, 0.3)'
      }}>

        {/* ── Plan Select ── */}
        {(step === 'plan_select' || step === 'free_activating') && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <span style={{ fontSize: '3rem' }}>⏰</span>
              <h2 style={{ color: '#ffd700', margin: '8px 0 4px 0', fontSize: '1.4rem', fontWeight: 900 }}>
                VIP PASS EXPIRED
              </h2>
              <p style={{ color: '#00e5ff', margin: 0, fontSize: '0.9rem', fontWeight: 800 }}>
                CHOOSE A PLAN TO CONTINUE ACCESS
              </p>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#ccc', lineHeight: '1.6', textAlign: 'center', marginBottom: '24px' }}>
              Your VIP Trial has completed. Select a plan below. Free Tier activates instantly. Paid plans require an invoice — your admin will send payment details directly to your inbox.
            </p>

            {/* Plan cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
              {/* Free */}
              <div
                onClick={() => setSelectedPlan('free')}
                style={{
                  padding: '14px 18px', borderRadius: '8px', cursor: 'pointer',
                  border: selectedPlan === 'free' ? '2px solid #00e5ff' : '1px solid rgba(255,255,255,0.1)',
                  background: selectedPlan === 'free' ? 'rgba(0, 229, 255, 0.12)' : 'rgba(255,255,255,0.03)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontWeight: 900, color: '#00e5ff', fontSize: '0.95rem' }}>🟢 Free Tier ($0 / month)</div>
                  <div style={{ fontSize: '0.78rem', color: '#aaa', marginTop: '2px' }}>2 Futures + 2 Forex setups per day • Activates immediately</div>
                </div>
                <span style={{ fontWeight: 800, color: '#00e5ff' }}>FREE</span>
              </div>

              {/* Forex Only */}
              <div
                onClick={() => setSelectedPlan('forex_only')}
                style={{
                  padding: '14px 18px', borderRadius: '8px', cursor: 'pointer',
                  border: selectedPlan === 'forex_only' ? '2px solid #e056fd' : '1px solid rgba(255,255,255,0.1)',
                  background: selectedPlan === 'forex_only' ? 'rgba(224, 86, 253, 0.12)' : 'rgba(255,255,255,0.03)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontWeight: 900, color: '#e056fd', fontSize: '0.95rem' }}>🔵 Forex Only Pro</div>
                  <div style={{ fontSize: '0.78rem', color: '#aaa', marginTop: '2px' }}>Unlimited Forex pairs + multi-timeframe conviction scores</div>
                  <div style={{ fontSize: '0.72rem', color: '#e056fd', marginTop: '3px', fontWeight: 700 }}>💳 Admin sends invoice to your inbox after request</div>
                </div>
                <span style={{ fontWeight: 800, color: '#e056fd' }}>Invoice</span>
              </div>

              {/* Futures & Forex VIP */}
              <div
                onClick={() => setSelectedPlan('futures_forex')}
                style={{
                  padding: '14px 18px', borderRadius: '8px', cursor: 'pointer',
                  border: selectedPlan === 'futures_forex' ? '2px solid #ffd700' : '1px solid rgba(255,255,255,0.1)',
                  background: selectedPlan === 'futures_forex' ? 'rgba(255, 215, 0, 0.15)' : 'rgba(255,255,255,0.03)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontWeight: 900, color: '#ffd700', fontSize: '0.95rem' }}>👑 Futures &amp; Forex VIP</div>
                  <div style={{ fontSize: '0.78rem', color: '#aaa', marginTop: '2px' }}>All CME Futures (NQ, ES, CL, GC) + All Forex pairs</div>
                  <div style={{ fontSize: '0.72rem', color: '#ffd700', marginTop: '3px', fontWeight: 700 }}>💳 Admin sends invoice to your inbox after request</div>
                </div>
                <span style={{ fontWeight: 800, color: '#ffd700' }}>Invoice</span>
              </div>
            </div>

            <button
              onClick={handleSelectPlan}
              disabled={loading}
              style={{
                width: '100%',
                background: selectedPlan === 'free' ? '#00e5ff' : '#ffd700',
                color: '#090314', border: 'none', padding: '14px',
                borderRadius: '8px', fontWeight: 900, fontSize: '1rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', opacity: loading ? 0.7 : 1
              }}
            >
              {loading
                ? '⏳ Processing...'
                : selectedPlan === 'free'
                  ? '✅ Activate Free Tier ($0/mo)'
                  : `📬 Request ${TIER_LABEL[selectedPlan]} Upgrade`}
            </button>
          </>
        )}

        {/* ── Submitting ── */}
        {step === 'submitting' && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>⏳</div>
            <div style={{ fontWeight: 900, color: '#ffd700', fontSize: '1.1rem' }}>Submitting your request...</div>
          </div>
        )}

        {/* ── Submitted Confirmation ── */}
        {step === 'submitted' && (
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '3rem' }}>✅</span>
            <h3 style={{ color: '#00e5ff', margin: '12px 0 8px 0', fontSize: '1.2rem', fontWeight: 900 }}>
              UPGRADE REQUEST RECEIVED
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#ccc', lineHeight: '1.6', marginBottom: '20px' }}>
              Your request to upgrade to <strong style={{ color: '#ffd700' }}>{TIER_LABEL[selectedPlan]}</strong> has been submitted to our admin team.
            </p>

            <div style={{
              background: 'rgba(255,215,0,0.07)', border: '1px solid rgba(255,215,0,0.25)',
              borderRadius: '10px', padding: '16px', textAlign: 'left', marginBottom: '20px'
            }}>
              <div style={{ fontWeight: 900, color: '#ffd700', fontSize: '0.85rem', marginBottom: '10px' }}>
                📬 What happens next:
              </div>
              <div style={{ fontSize: '0.82rem', color: '#ccc', lineHeight: 1.7 }}>
                <div>1. An admin will review your request and be assigned to your case.</div>
                <div>2. You will receive a <strong>payment invoice</strong> sent directly to your <strong>Inbox</strong> on this platform.</div>
                <div>3. Follow the payment instructions in the invoice.</div>
                <div>4. Once confirmed, your account will be upgraded <strong>immediately</strong>.</div>
              </div>
            </div>

            <div style={{ background: 'rgba(0,229,255,0.07)', border: '1px solid rgba(0,229,255,0.2)', borderRadius: '8px', padding: '12px', marginBottom: '20px', fontSize: '0.8rem', color: '#00e5ff' }}>
              📬 Check your <strong>Inbox</strong> button on the Dashboard for the invoice and admin replies.
              <br />
              <span style={{ color: '#888', fontSize: '0.75rem' }}>Contacting: <strong>{user.email}</strong></span>
            </div>

            <button
              onClick={() => window.location.reload()}
              style={{
                width: '100%', background: '#ffd700', color: '#090314',
                border: 'none', padding: '13px', borderRadius: '8px',
                fontWeight: 900, fontSize: '0.95rem', cursor: 'pointer',
                fontFamily: 'inherit'
              }}
            >
              📊 Return to Dashboard
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
