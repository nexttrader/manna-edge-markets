import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import './MasterPasscodeModal.css';

interface MasterPasscodeModalProps {
  onSuccess: () => void;
  onCancel?: () => void;
}

export const MasterPasscodeModal: React.FC<MasterPasscodeModalProps> = ({ onSuccess, onCancel }) => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Master Key Passcode check
    if (passcode === '5287' || passcode === 'manna-master-key' || passcode === 'master') {
      login('superadmin@mannaedge.com', 'super_admin', 'Master Telemetry Admin', 'futures_forex');
      onSuccess();
      navigate('/vault-5287');
    } else {
      setError('Invalid Access Key');
      setPasscode('');
    }
  };

  return (
    <div className="master-passcode-overlay font-mono">
      <div className="master-passcode-card glass-card animate-scale-up">
        <h2 className="master-passcode-title">🔒 KERNEL ACCESS KEY REQUIRED</h2>
        <p className="master-passcode-subtitle">Enter Master Security Passcode to access Telemetry Desk.</p>

        {error && <div style={{ color: '#ff1744', fontSize: '0.85rem', marginBottom: '12px' }}>⚠️ {error}</div>}

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="••••••••"
            value={passcode}
            onChange={e => setPasscode(e.target.value)}
            className="passcode-input-field font-mono"
            autoFocus
          />

          <button type="submit" className="btn-passcode-submit font-mono">
            🔑 AUTHENTICATE KERNEL KEY
          </button>

          {onCancel && (
            <button
              type="button"
              className="font-mono"
              style={{ background: 'transparent', border: 'none', color: '#888', marginTop: '12px', cursor: 'pointer', fontSize: '0.8rem' }}
              onClick={onCancel}
            >
              Cancel &amp; Return
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
