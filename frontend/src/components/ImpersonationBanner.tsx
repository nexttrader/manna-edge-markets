import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import './ImpersonationBanner.css';

export const ImpersonationBanner: React.FC = () => {
  const { isImpersonating, user, stopImpersonating } = useAuth();
  const navigate = useNavigate();

  if (!isImpersonating || !user) return null;

  const handleExit = () => {
    stopImpersonating();
    navigate('/admin');
  };

  return (
    <div className="impersonation-banner font-mono">
      <div className="impersonation-content">
        <span className="impersonation-icon">🥸</span>
        <span className="impersonation-text">
          <strong>USER IMPERSONATION ACTIVE:</strong> Logged in as <strong>{user.name}</strong> ({user.email} &bull; Tier: <span className="tier-tag">{user.tier?.toUpperCase() || 'TRADER'}</span>)
        </span>
        <button type="button" className="btn-stop-impersonate font-mono" onClick={handleExit}>
          ⏹ Exit Impersonation &amp; Return to Admin Desk
        </button>
      </div>
    </div>
  );
};
