import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';

type Step = 'request_form' | 'submitting' | 'submitted';

export const TrialExpiredModal: React.FC = () => {
  const { user, logout } = useAuth();
  const [step, setStep] = useState<Step>('request_form');
  const [loading, setLoading] = useState(false);
  const [requestedTier, setRequestedTier] = useState<'futures_forex' | 'forex_only' | 'custom'>('futures_forex');
  const [contactInfo, setContactInfo] = useState('');
  const [message, setMessage] = useState(
    "Hi Admin Team, I've completed my 14-day free trial on Manna Edge Markets and would like to request continued access. Please send payment details or invoice to activate my trading desk."
  );
  const [error, setError] = useState<string | null>(null);

  // Expired check: check both flag and real-time timestamp
  const isExpired = Boolean(
    user && user.isTrial && (
      user.trialExpired || 
      (user.trialExpiresAt && new Date(user.trialExpiresAt).getTime() <= Date.now())
    )
  );

  if (!user || !user.isTrial || !isExpired) return null;

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setError('Please enter a brief message requesting access.');
      return;
    }

    setLoading(true);
    setError(null);
    setStep('submitting');

    try {
      const res = await fetch(`${API_BASE}/api/support/request-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          userName: user.name,
          userEmail: user.email,
          requestedTier,
          contactInfo: contactInfo.trim(),
          message: message.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit access request');
      }

      setStep('submitted');
    } catch (err: any) {
      setError(err.message || 'Error sending request to admins. Please try again.');
      setStep('request_form');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    if (window.confirm('Sign out of Manna Edge Markets?')) {
      logout();
      window.location.href = '/login';
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(6, 2, 14, 0.97)', backdropFilter: 'blur(16px)',
      zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px', fontFamily: "'Space Mono', 'Courier New', monospace"
    }}>
      <div style={{
        background: '#0d061a', border: '2px solid #ffd700', borderRadius: '16px',
        padding: '32px', maxWidth: '540px', width: '100%', color: '#fff',
        boxShadow: '0 0 50px rgba(255, 215, 0, 0.35)',
        maxHeight: '92vh', overflowY: 'auto'
      }}>

        {/* ── STEP 1: REQUEST FORM ── */}
        {step === 'request_form' && (
          <form onSubmit={handleSubmitRequest}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '3rem', marginBottom: '4px' }}>🔒</div>
              <h2 style={{ color: '#ffd700', margin: '4px 0', fontSize: '1.35rem', fontWeight: 900, letterSpacing: '1px' }}>
                14-DAY FREE TRIAL CONCLUDED
              </h2>
              <p style={{ color: '#00e5ff', margin: 0, fontSize: '0.85rem', fontWeight: 800 }}>
                SUBMIT AN ACCESS REQUEST TO CONTINUE
              </p>
            </div>

            <div style={{
              background: 'rgba(255, 215, 0, 0.08)',
              border: '1px solid rgba(255, 215, 0, 0.3)',
              borderRadius: '10px',
              padding: '14px',
              fontSize: '0.82rem',
              color: '#e2e8f0',
              lineHeight: 1.5,
              marginBottom: '20px'
            }}>
              Your 14-day free trial has automatically concluded. To unlock live signal discovery, fill in the box below. <strong>Your message will be delivered privately to all administrators.</strong>
            </div>

            {error && (
              <div style={{
                background: 'rgba(255, 59, 59, 0.15)',
                border: '1px solid #ff3b3b',
                color: '#ff3b3b',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '0.82rem',
                marginBottom: '16px'
              }}>
                ⚠️ {error}
              </div>
            )}

            {/* Trader details (pre-filled) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '4px' }}>
                  Trader Name
                </label>
                <input
                  type="text"
                  value={user.name}
                  disabled
                  style={{
                    width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px',
                    color: '#94a3b8', fontSize: '0.85rem', fontFamily: 'inherit'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '4px' }}>
                  Account Email
                </label>
                <input
                  type="text"
                  value={user.email}
                  disabled
                  style={{
                    width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px',
                    color: '#94a3b8', fontSize: '0.85rem', fontFamily: 'inherit'
                  }}
                />
              </div>
            </div>

            {/* Desired Access Tier */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#ffd700', fontWeight: 800, marginBottom: '6px' }}>
                Select Desired Membership / Plan
              </label>
              <select
                value={requestedTier}
                onChange={e => setRequestedTier(e.target.value as any)}
                style={{
                  width: '100%', padding: '10px', background: '#160b2b',
                  border: '1px solid #ffd700', borderRadius: '6px',
                  color: '#fff', fontSize: '0.85rem', fontFamily: 'inherit',
                  fontWeight: 700
                }}
              >
                <option value="futures_forex">👑 Futures &amp; Forex VIP Access ($149 / mo)</option>
                <option value="forex_only">🔵 Forex Only Pro Access ($79 / mo)</option>
                <option value="custom">⚡ Trial Extension / Custom Institutional Arrangement</option>
              </select>
            </div>

            {/* Contact Info (Optional) */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '4px' }}>
                Phone Number / Telegram Handle <span style={{ color: '#666' }}>(Optional for fast contact)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. +1 555-0199 or @trader_handle"
                value={contactInfo}
                onChange={e => setContactInfo(e.target.value)}
                style={{
                  width: '100%', padding: '10px', background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px',
                  color: '#fff', fontSize: '0.85rem', fontFamily: 'inherit'
                }}
              />
            </div>

            {/* Request Message Box */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#00e5ff', fontWeight: 800, marginBottom: '6px' }}>
                Your Private Message to Admins <span style={{ color: '#ff3b3b' }}>*</span>
              </label>
              <textarea
                rows={4}
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Write your request message here..."
                required
                style={{
                  width: '100%', padding: '12px', background: '#120824',
                  border: '1px solid #00e5ff', borderRadius: '8px',
                  color: '#fff', fontSize: '0.85rem', fontFamily: 'inherit',
                  lineHeight: 1.5, resize: 'vertical', boxSizing: 'border-box'
                }}
              />
              <span style={{ fontSize: '0.72rem', color: '#888', marginTop: '4px', display: 'block' }}>
                💡 Tip: Mention preferred payment method (Crypto, Card, Wire) or any specific instruments you trade.
              </span>
            </div>

            {/* Submit Action */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', background: 'linear-gradient(135deg, #ffd700 0%, #ff8c00 100%)',
                color: '#090314', border: 'none', padding: '14px',
                borderRadius: '8px', fontWeight: 900, fontSize: '0.95rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', opacity: loading ? 0.7 : 1,
                boxShadow: '0 0 20px rgba(255, 215, 0, 0.4)',
                marginBottom: '12px'
              }}
            >
              {loading ? '⏳ Delivering Private Message to Admins...' : '✉️ Submit Private Access Request to Admins'}
            </button>

            <div style={{ textAlign: 'center', marginTop: '12px' }}>
              <button
                type="button"
                onClick={handleLogout}
                style={{
                  background: 'none', border: 'none', color: '#888',
                  fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline'
                }}
              >
                Sign out of this account
              </button>
            </div>
          </form>
        )}

        {/* ── STEP 2: SUBMITTING ── */}
        {step === 'submitting' && (
          <div style={{ textAlign: 'center', padding: '36px 0' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '16px' }}>⏳</div>
            <h3 style={{ color: '#ffd700', fontSize: '1.2rem', fontWeight: 900, margin: '0 0 8px 0' }}>
              Broadcasting Private Request to Admins...
            </h3>
            <p style={{ color: '#aaa', fontSize: '0.85rem', margin: 0 }}>
              Posting your message to the Admin Support Command Centre and sending direct alerts.
            </p>
          </div>
        )}

        {/* ── STEP 3: SUBMITTED CONFIRMATION ── */}
        {step === 'submitted' && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '8px' }}>✅</div>
            <h3 style={{ color: '#00e5ff', margin: '4px 0 8px 0', fontSize: '1.3rem', fontWeight: 900 }}>
              REQUEST SENT PRIVATELY TO ALL ADMINS
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#ccc', lineHeight: '1.6', marginBottom: '20px' }}>
              Your message has been delivered directly into our administrators' private command centre.
            </p>

            <div style={{
              background: 'rgba(255,215,0,0.07)', border: '1px solid rgba(255,215,0,0.3)',
              borderRadius: '10px', padding: '16px', textAlign: 'left', marginBottom: '20px'
            }}>
              <div style={{ fontWeight: 900, color: '#ffd700', fontSize: '0.85rem', marginBottom: '10px' }}>
                📬 Next Steps:
              </div>
              <div style={{ fontSize: '0.82rem', color: '#ccc', lineHeight: 1.7 }}>
                <div>1. Our admin team has received your private alert.</div>
                <div>2. An admin will review your message and reach out via your <strong>Dashboard Inbox</strong> and email.</div>
                <div>3. You will receive an activation invoice or payment details.</div>
                <div>4. Once approved, your live signal desk will be unlocked immediately.</div>
              </div>
            </div>

            <div style={{ background: 'rgba(0,229,255,0.07)', border: '1px solid rgba(0,229,255,0.2)', borderRadius: '8px', padding: '12px', marginBottom: '24px', fontSize: '0.8rem', color: '#00e5ff' }}>
              📬 Contacting: <strong>{user.email}</strong>
              <br />
              <span style={{ color: '#888', fontSize: '0.75rem' }}>You can check your desk inbox periodically for updates.</span>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  flex: 1, background: '#ffd700', color: '#090314',
                  border: 'none', padding: '13px', borderRadius: '8px',
                  fontWeight: 900, fontSize: '0.9rem', cursor: 'pointer',
                  fontFamily: 'inherit'
                }}
              >
                🔄 Refresh Desk Status
              </button>

              <button
                type="button"
                onClick={handleLogout}
                style={{
                  background: 'rgba(255,255,255,0.08)', color: '#ccc',
                  border: '1px solid rgba(255,255,255,0.2)', padding: '13px 18px',
                  borderRadius: '8px', fontWeight: 700, fontSize: '0.85rem',
                  cursor: 'pointer', fontFamily: 'inherit'
                }}
              >
                Sign Out
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
