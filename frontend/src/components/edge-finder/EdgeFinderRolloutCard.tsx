import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useEdgeFinderAccess } from '../../hooks/useEdgeFinder';

export const EdgeFinderRolloutCard: React.FC = () => {
  const { isSuperAdmin, rollout, updatingRollout, updateRollout } = useEdgeFinderAccess();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!isSuperAdmin) return null;

  const handleToggle = async (target: 'visibleToAdmins' | 'visibleToTraders') => {
    try {
      const next = await updateRollout({ [target]: !rollout[target] });
      const who = target === 'visibleToAdmins' ? 'Admins' : 'All Clients';
      setStatusMessage(`${who} access switched ${next[target] ? 'ON' : 'OFF'}.`);
      window.setTimeout(() => setStatusMessage(null), 3500);
    } catch (err: any) {
      setStatusMessage(err?.message || 'Failed to update EdgeFinder rollout');
    }
  };

  return (
    <div
      className="super-card font-mono"
      style={{
        marginBottom: '18px',
        background: 'linear-gradient(135deg, rgba(30, 13, 56, 0.96), rgba(49, 21, 92, 0.9))',
        border: '1px solid rgba(201, 168, 76, 0.55)',
        borderRadius: '12px',
        padding: '18px 20px'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, color: '#DFC46B', fontSize: '1.02rem' }}>
              🧭 Manna EdgeFinder Pro — Rollout &amp; Access Control
            </h3>
            <span style={{
              fontSize: '0.72rem',
              padding: '2px 8px',
              borderRadius: '999px',
              background: 'rgba(201, 168, 76, 0.18)',
              border: '1px solid rgba(201, 168, 76, 0.5)',
              color: '#DFC46B',
              fontWeight: 700
            }}>
              SUPER ADMIN: ALWAYS ON
            </span>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: '#cfc5e8' }}>
            Staged institutional release: enable for Admins first to verify telemetry, then open to All Clients across Manna Edge Markets.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={updatingRollout}
            onClick={() => handleToggle('visibleToAdmins')}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              cursor: updatingRollout ? 'wait' : 'pointer',
              fontWeight: 800,
              fontSize: '0.78rem',
              border: rollout.visibleToAdmins ? '1px solid #00e676' : '1px solid rgba(255, 82, 82, 0.55)',
              background: rollout.visibleToAdmins ? 'rgba(0, 230, 118, 0.16)' : 'rgba(255, 82, 82, 0.12)',
              color: rollout.visibleToAdmins ? '#69f0ae' : '#ff8a80'
            }}
          >
            {rollout.visibleToAdmins ? '👁️ Admins: ON' : '🔒 Turn ON for Admins'}
          </button>

          <button
            type="button"
            disabled={updatingRollout}
            onClick={() => handleToggle('visibleToTraders')}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              cursor: updatingRollout ? 'wait' : 'pointer',
              fontWeight: 800,
              fontSize: '0.78rem',
              border: rollout.visibleToTraders ? '1px solid #00e5ff' : '1px solid rgba(255, 82, 82, 0.55)',
              background: rollout.visibleToTraders ? 'rgba(0, 229, 255, 0.16)' : 'rgba(255, 82, 82, 0.12)',
              color: rollout.visibleToTraders ? '#80d8ff' : '#ff8a80'
            }}
          >
            {rollout.visibleToTraders ? '🌐 All Clients: ON' : '🔒 Turn ON for All Clients'}
          </button>

          <Link
            to="/edge-finder"
            style={{
              padding: '8px 15px',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 800,
              fontSize: '0.78rem',
              background: 'linear-gradient(135deg, #DFC46B, #C9A84C)',
              color: '#140926'
            }}
          >
            🧭 Launch EdgeFinder →
          </Link>
        </div>
      </div>

      {statusMessage && (
        <div style={{ marginTop: '10px', fontSize: '0.78rem', color: '#69f0ae', fontWeight: 700 }}>
          ✓ {statusMessage}
        </div>
      )}
    </div>
  );
};
