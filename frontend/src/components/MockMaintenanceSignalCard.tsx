import React from 'react';
import { useMaintenance } from '../context/MaintenanceContext';

export const MockMaintenanceSignalCard: React.FC = () => {
  const { maintenance } = useMaintenance();

  return (
    <div className="setup-card glass-card font-mono" style={{
      gridColumn: '1 / -1',
      maxWidth: '850px',
      margin: '20px auto',
      padding: '24px',
      borderRadius: '16px',
      background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(10, 15, 30, 0.98))',
      border: '2px solid rgba(255, 215, 0, 0.5)',
      boxShadow: '0 0 35px rgba(255, 215, 0, 0.2)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Decorative Glow Stripe */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '4px',
        background: 'linear-gradient(90deg, #ffd700 0%, #ff1744 50%, #00e5ff 100%)',
        boxShadow: '0 0 10px #ffd700'
      }} />

      {/* Top Card Meta Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{
            background: 'rgba(255, 215, 0, 0.15)',
            border: '1px solid #ffd700',
            color: '#ffd700',
            padding: '4px 10px',
            borderRadius: '6px',
            fontWeight: 900,
            fontSize: '0.9rem',
            letterSpacing: '0.5px'
          }}>
            🛠️ SYSTEM / MAINTENANCE
          </span>
          <span style={{
            background: 'rgba(255, 23, 68, 0.15)',
            border: '1px solid #ff1744',
            color: '#ff1744',
            padding: '4px 10px',
            borderRadius: '6px',
            fontWeight: 900,
            fontSize: '0.8rem'
          }}>
            🔒 SIGNALS LOCKED
          </span>
          <span style={{ fontSize: '0.78rem', color: '#888' }}>
            MANNA CORE ENGINE
          </span>
        </div>

        {/* Conviction Pill Mock */}
        <div style={{
          background: 'rgba(0, 229, 255, 0.1)',
          border: '1px solid #00e5ff',
          padding: '6px 14px',
          borderRadius: '20px',
          color: '#00e5ff',
          fontWeight: 900,
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <span>⚡ OPTIMIZATION SCORE:</span>
          <span style={{ fontSize: '1rem', color: '#fff' }}>99.9%</span>
        </div>
      </div>

      {/* Main Signal Title & Status Body */}
      <div style={{ marginBottom: '20px', textAlign: 'center', padding: '16px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
        <h2 style={{ color: '#ffd700', margin: '0 0 8px 0', fontSize: '1.4rem', fontWeight: 900, letterSpacing: '0.5px' }}>
          MANNA SYSTEM MAINTENANCE IN PROGRESS
        </h2>
        <p style={{ color: '#e2e8f0', fontSize: '0.92rem', margin: 0, lineHeight: '1.5' }}>
          {maintenance.message || "Manna is undergoing scheduled maintenance and core engine optimization."}
        </p>
      </div>

      {/* Grid Stats Mock (Entry, TP, SL) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '12px',
        marginBottom: '20px'
      }}>
        {/* Entry Zone */}
        <div style={{ background: 'rgba(30, 41, 59, 0.6)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,215,0,0.3)' }}>
          <div style={{ fontSize: '0.72rem', color: '#ffd700', fontWeight: 800, marginBottom: '4px' }}>
            ⏳ ESTIMATED RETURN TIME
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#fff' }}>
            {maintenance.estimatedReturnTime || 'Asia Session Today'}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#aaa', marginTop: '2px' }}>
            Scheduled System Back Online
          </div>
        </div>

        {/* Target 1 */}
        <div style={{ background: 'rgba(30, 41, 59, 0.6)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(0,230,118,0.3)' }}>
          <div style={{ fontSize: '0.72rem', color: '#00e676', fontWeight: 800, marginBottom: '4px' }}>
            🎯 ENGINE UPGRADE
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#00e676' }}>
            REAL-TIME DATA SYNC
          </div>
          <div style={{ fontSize: '0.7rem', color: '#aaa', marginTop: '2px' }}>
            Zero synthetic data guarantee
          </div>
        </div>

        {/* Target 2 */}
        <div style={{ background: 'rgba(30, 41, 59, 0.6)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(0,229,255,0.3)' }}>
          <div style={{ fontSize: '0.72rem', color: '#00e5ff', fontWeight: 800, marginBottom: '4px' }}>
            🚀 LIVE SIGNAL STREAM
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#00e5ff' }}>
            AUTO-RESUME READY
          </div>
          <div style={{ fontSize: '0.7rem', color: '#aaa', marginTop: '2px' }}>
            Signals restore on completion
          </div>
        </div>
      </div>

      {/* Footer Controls & Lock Action */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#aaa', fontSize: '0.78rem' }}>
          <span className="live-dot" style={{ background: '#ffd700', width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }} />
          <span>Platform Status: <strong>MAINTENANCE MODE</strong></span>
        </div>

        <button
          type="button"
          disabled
          style={{
            background: 'rgba(255, 215, 0, 0.12)',
            border: '1px solid #ffd700',
            color: '#ffd700',
            padding: '8px 18px',
            borderRadius: '6px',
            fontWeight: 900,
            fontSize: '0.82rem',
            cursor: 'not-allowed',
            opacity: 0.8
          }}
        >
          🔒 LIVE SIGNAL CARDS TEMPORARILY LOCKED
        </button>
      </div>
    </div>
  );
};
