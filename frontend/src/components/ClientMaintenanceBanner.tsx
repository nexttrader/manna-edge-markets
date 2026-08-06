import React from 'react';
import { useMaintenance } from '../context/MaintenanceContext';

export const ClientMaintenanceBanner: React.FC = () => {
  const { maintenance } = useMaintenance();

  if (!maintenance.enabled) return null;

  return (
    <div className="glass-card font-mono" style={{
      padding: '40px 24px',
      textAlign: 'center',
      borderRadius: '16px',
      background: 'linear-gradient(135deg, rgba(20, 10, 35, 0.95), rgba(10, 5, 20, 0.98))',
      border: '2px solid rgba(0, 229, 255, 0.4)',
      boxShadow: '0 0 40px rgba(0, 229, 255, 0.2)',
      margin: '24px auto',
      maxWidth: '720px'
    }}>
      <div style={{ fontSize: '3.5rem', marginBottom: '16px' }}>🛠️</div>
      <h2 style={{ color: '#00e5ff', fontSize: '1.5rem', fontWeight: 900, marginBottom: '12px', letterSpacing: '1px' }}>
        MANNA SYSTEM MAINTENANCE IN PROGRESS
      </h2>
      <p style={{ color: '#e2e8f0', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '24px', maxWidth: '580px', margin: '0 auto 24px auto' }}>
        {maintenance.message || "Manna is undergoing scheduled system maintenance and engine upgrades to optimize real-time execution algorithms."}
      </p>
      
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        background: 'rgba(255, 215, 0, 0.12)',
        border: '1px solid #ffd700',
        color: '#ffd700',
        padding: '10px 20px',
        borderRadius: '8px',
        fontWeight: 900,
        fontSize: '0.9rem',
        marginBottom: '20px'
      }}>
        <span>⏳ ESTIMATED RETURN:</span>
        <span style={{ fontSize: '1rem', color: '#fff' }}>{maintenance.estimatedReturnTime}</span>
      </div>

      <div style={{ fontSize: '0.78rem', color: '#888', marginTop: '10px' }}>
        🔒 Live signal streams are temporarily locked during maintenance mode to protect ongoing engine optimizations.
      </div>
    </div>
  );
};
