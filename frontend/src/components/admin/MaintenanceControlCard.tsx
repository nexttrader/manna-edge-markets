import React, { useState, useEffect } from 'react';
import { useMaintenance } from '../../context/MaintenanceContext';

export const MaintenanceControlCard: React.FC = () => {
  const { maintenance, toggleMaintenance } = useMaintenance();

  const [enabled, setEnabled] = useState(maintenance.enabled);
  const [returnTime, setReturnTime] = useState(maintenance.estimatedReturnTime || 'Asia Session Today');
  const [message, setMessage] = useState(maintenance.message || 'Manna is currently undergoing scheduled system maintenance.');
  const [isSaving, setIsSaving] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  useEffect(() => {
    setEnabled(maintenance.enabled);
    if (maintenance.estimatedReturnTime) setReturnTime(maintenance.estimatedReturnTime);
    if (maintenance.message) setMessage(maintenance.message);
  }, [maintenance]);

  const handleSave = async () => {
    setIsSaving(true);
    setStatusNotice(null);
    const success = await toggleMaintenance(enabled, message, returnTime);
    setIsSaving(false);
    if (success) {
      setStatusNotice(enabled ? '✅ Maintenance mode enabled! Clients see maintenance lock.' : '✅ Maintenance mode disabled! Clients can view live signals.');
      setTimeout(() => setStatusNotice(null), 4000);
    } else {
      setStatusNotice('⚠️ Failed to update maintenance settings');
      setTimeout(() => setStatusNotice(null), 4000);
    }
  };

  const setPresetTime = (preset: string) => {
    setReturnTime(preset);
  };

  return (
    <div className="glass-card font-mono" style={{
      padding: '20px',
      marginBottom: '24px',
      borderRadius: '12px',
      background: enabled ? 'rgba(255, 23, 68, 0.08)' : 'rgba(0, 229, 255, 0.04)',
      border: enabled ? '2px solid #ff1744' : '1px solid rgba(0, 229, 255, 0.3)',
      boxShadow: enabled ? '0 0 25px rgba(255, 23, 68, 0.25)' : 'none'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: enabled ? '#ff1744' : '#00e5ff' }}>
            🛠️ SYSTEM MAINTENANCE MODE CONTROL
          </h3>
          <span style={{ fontSize: '0.78rem', color: '#aaa' }}>
            Toggle maintenance mode across the platform. Clients see a locked maintenance screen while admins maintain full access.
          </span>
        </div>

        {/* Master Toggle Switch */}
        <button
          type="button"
          onClick={() => setEnabled(!enabled)}
          style={{
            background: enabled ? '#ff1744' : 'rgba(255, 255, 255, 0.1)',
            border: `2px solid ${enabled ? '#ff1744' : 'rgba(255, 255, 255, 0.3)'}`,
            color: '#fff',
            padding: '8px 20px',
            borderRadius: '24px',
            cursor: 'pointer',
            fontWeight: 900,
            fontSize: '0.88rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: enabled ? '0 0 15px rgba(255, 23, 68, 0.5)' : 'none',
            transition: 'all 0.2s ease'
          }}
        >
          <span>{enabled ? '🔴 MAINTENANCE MODE: ACTIVE' : '⚪ MAINTENANCE MODE: OFF'}</span>
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '16px' }}>
        {/* Estimated Return Time Input & Presets */}
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#ffd700', marginBottom: '6px' }}>
            ⏳ ESTIMATED RETURN TIME
          </label>
          <input
            type="text"
            value={returnTime}
            onChange={(e) => setReturnTime(e.target.value)}
            placeholder="e.g. Asia Session Today, 21:00 EST"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '6px',
              background: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid rgba(255, 215, 0, 0.4)',
              color: '#fff',
              fontSize: '0.85rem',
              fontFamily: 'monospace'
            }}
          />
          {/* Quick Presets */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
            {['Asia Session Today', 'London Session Today', 'NY Session Today', '21:00 EST'].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setPresetTime(preset)}
                style={{
                  background: returnTime === preset ? 'rgba(255, 215, 0, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${returnTime === preset ? '#ffd700' : 'rgba(255, 255, 255, 0.15)'}`,
                  color: returnTime === preset ? '#ffd700' : '#ccc',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.72rem',
                  fontWeight: 700
                }}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Maintenance Message Input */}
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: '#00e5ff', marginBottom: '6px' }}>
            📢 CLIENT ANNOUNCEMENT MESSAGE
          </label>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Manna is undergoing scheduled maintenance..."
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '6px',
              background: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid rgba(0, 229, 255, 0.4)',
              color: '#fff',
              fontSize: '0.85rem',
              fontFamily: 'monospace'
            }}
          />
        </div>
      </div>

      {statusNotice && (
        <div style={{
          padding: '10px 14px',
          borderRadius: '6px',
          background: statusNotice.includes('✅') ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255, 23, 68, 0.15)',
          border: `1px solid ${statusNotice.includes('✅') ? '#00e676' : '#ff1744'}`,
          color: statusNotice.includes('✅') ? '#00e676' : '#ff1744',
          fontSize: '0.82rem',
          fontWeight: 800,
          marginBottom: '14px'
        }}>
          {statusNotice}
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          style={{
            background: enabled ? 'linear-gradient(90deg, #ff1744 0%, #b71c1c 100%)' : 'linear-gradient(90deg, #00e5ff 0%, #00b0ff 100%)',
            color: enabled ? '#fff' : '#000',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 900,
            fontSize: '0.85rem',
            boxShadow: enabled ? '0 0 15px rgba(255, 23, 68, 0.4)' : '0 0 15px rgba(0, 229, 255, 0.3)'
          }}
        >
          {isSaving ? '⏳ Saving...' : enabled ? '⚡ UPDATE & ENABLE MAINTENANCE' : '💾 SAVE SETTINGS'}
        </button>
      </div>
    </div>
  );
};
