import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useMaintenance } from '../context/MaintenanceContext';

export const AdminMaintenanceBanner: React.FC = () => {
  const { user, isImpersonating, originalAdmin } = useAuth();
  const { maintenance, toggleMaintenance } = useMaintenance();

  const isAdmin = (user?.role === 'admin' || user?.role === 'super_admin') || (isImpersonating && (originalAdmin?.role === 'admin' || originalAdmin?.role === 'super_admin'));

  if (!isAdmin || !maintenance.enabled) {
    return null;
  }

  return (
    <div style={{
      background: 'linear-gradient(90deg, #ff1744 0%, #b71c1c 100%)',
      color: '#fff',
      padding: '10px 16px',
      textAlign: 'center',
      fontWeight: 900,
      fontSize: '0.85rem',
      fontFamily: 'monospace',
      letterSpacing: '0.5px',
      boxShadow: '0 0 20px rgba(255, 23, 68, 0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: '14px',
      position: 'sticky',
      top: 0,
      zIndex: 999999
    }}>
      <span>
        🛠️ <strong>SYSTEM MAINTENANCE MODE IS ACTIVE</strong> — Clients see maintenance screen. Estimated return: <span style={{ textDecoration: 'underline', color: '#ffd700' }}>{maintenance.estimatedReturnTime}</span>
      </span>
      <button
        onClick={() => toggleMaintenance(false)}
        style={{
          background: '#fff',
          color: '#b71c1c',
          border: 'none',
          padding: '4px 12px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: 900,
          fontSize: '0.75rem',
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
        }}
      >
        ⚡ TURN OFF MAINTENANCE MODE
      </button>
    </div>
  );
};
