import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';

export const FirstLoginPasswordModal: React.FC = () => {
  const { user, updateMustChangePassword } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!user || !user.mustChangePassword) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (newPassword.length < 4) {
      setErrorMsg('⚠️ Password must be at least 4 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('⚠️ Passwords do not match. Please verify.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/first-login-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          newPassword
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to complete password setup');

      updateMustChangePassword(false);
      alert('✅ Account password activated! Welcome to Manna Edge Markets.');
    } catch (err: any) {
      setErrorMsg(`⚠️ ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay font-mono" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(6, 2, 12, 0.95)', backdropFilter: 'blur(12px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="glass-card" style={{ background: '#0f0620', border: '2px solid #00e5ff', borderRadius: '14px', padding: '28px', maxWidth: '440px', width: '100%', color: '#fff', boxShadow: '0 0 30px rgba(0, 229, 255, 0.3)' }}>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <span style={{ fontSize: '2.5rem' }}>🔒</span>
          <h2 style={{ color: '#00e5ff', margin: '8px 0 4px 0', fontSize: '1.25rem', fontWeight: 900 }}>
            FIRST-TIME SIGN IN
          </h2>
          <p style={{ color: '#ffd700', margin: 0, fontSize: '0.85rem', fontWeight: 800 }}>
            ACCOUNT ACTIVATION &amp; PASSWORD SETUP
          </p>
        </div>

        <p style={{ fontSize: '0.82rem', color: '#ccc', lineHeight: '1.5', background: 'rgba(0, 229, 255, 0.08)', border: '1px solid rgba(0, 229, 255, 0.2)', padding: '12px', borderRadius: '8px', marginBottom: '20px' }}>
          Welcome, <strong>{user.name}</strong> ({user.email})! {user.role === 'admin' || user.role === 'super_admin' ? 'Your administrative account was preloaded.' : user.isTrial ? 'Your trial account was preloaded.' : 'Your membership account was preloaded.'} Please set a secure password for your account to complete activation.
        </p>

        {errorMsg && (
          <div style={{ background: 'rgba(255, 23, 68, 0.2)', border: '1px solid #ff1744', color: '#ff1744', padding: '10px 14px', borderRadius: '6px', fontSize: '0.8rem', marginBottom: '16px', fontWeight: 800 }}>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '4px' }}>New Account Password *</label>
            <input
              type="password"
              placeholder="Enter new password..."
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              style={{ width: '100%', padding: '10px 14px', background: '#090314', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: '6px', fontSize: '0.9rem' }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '4px' }}>Confirm New Password *</label>
            <input
              type="password"
              placeholder="Confirm new password..."
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              style={{ width: '100%', padding: '10px 14px', background: '#090314', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: '6px', fontSize: '0.9rem' }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="font-mono"
            style={{ width: '100%', background: '#00e5ff', color: '#090314', border: 'none', padding: '12px', borderRadius: '6px', fontWeight: 900, fontSize: '0.95rem', cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? 'Activating Account...' : '🚀 Save Password & Activate Account'}
          </button>
        </form>
      </div>
    </div>
  );
};
