import React from 'react';
import { useVoice } from '../context/VoiceContext';

interface VoiceSettingsModalProps {
  onClose: () => void;
}

export const VoiceSettingsModal: React.FC<VoiceSettingsModalProps> = ({ onClose }) => {
  const {
    voiceEnabled,
    toggleVoice,
    selectedVoiceURI,
    setSelectedVoiceURI,
    rate,
    setRate,
    pitch,
    setPitch,
    volume,
    setVolume,
    chimeEnabled,
    setChimeEnabled,
    availableVoices,
    testVoice
  } = useVoice();

  // Categorize / sort voices for clean dropdown display
  const sortedVoices = [...availableVoices].sort((a, b) => {
    // English voices first
    const aEng = a.lang.startsWith('en');
    const bEng = b.lang.startsWith('en');
    if (aEng && !bEng) return -1;
    if (!aEng && bEng) return 1;

    // Google / Natural / Premium voices higher
    const aNatural = /natural|google|enhanced|premium|samantha|karen|daniel/i.test(a.name);
    const bNatural = /natural|google|enhanced|premium|samantha|karen|daniel/i.test(b.name);
    if (aNatural && !bNatural) return -1;
    if (!aNatural && bNatural) return 1;

    return a.name.localeCompare(b.name);
  });

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(6, 2, 12, 0.88)',
        backdropFilter: 'blur(12px)',
        zIndex: 10002,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: '#0f0620',
          border: '1px solid #00e5ff',
          borderRadius: '16px',
          padding: '28px',
          maxWidth: '520px',
          width: '100%',
          color: '#fff',
          boxShadow: '0 0 50px rgba(0, 229, 255, 0.15), 0 20px 50px rgba(0,0,0,0.6)',
          fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid rgba(0, 229, 255, 0.2)', paddingBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.5rem' }}>🎙️</span>
            <div>
              <h3 style={{ margin: 0, color: '#00e5ff', fontSize: '1.2rem', fontWeight: 900 }}>
                Manna Voice Engine
              </h3>
              <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '2px' }}>
                High-Precision Audio Alerts & Synthesis Tuning
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#aaa',
              padding: '4px 10px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.8rem'
            }}
          >
            ✕
          </button>
        </div>

        {/* Voice Master Toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '12px 16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '20px' }}>
          <div>
            <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.9rem' }}>Voice Announcements</div>
            <div style={{ fontSize: '0.72rem', color: '#aaa' }}>Speak live signal triggers and target hits</div>
          </div>
          <button
            onClick={toggleVoice}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              border: 'none',
              fontWeight: 900,
              fontSize: '0.78rem',
              cursor: 'pointer',
              background: voiceEnabled ? '#00e5ff' : 'rgba(255,255,255,0.1)',
              color: voiceEnabled ? '#090314' : '#aaa',
              boxShadow: voiceEnabled ? '0 0 14px rgba(0, 229, 255, 0.4)' : 'none'
            }}
          >
            {voiceEnabled ? '🔊 ENABLED' : '🔇 MUTED'}
          </button>
        </div>

        {/* Voice Persona Dropdown */}
        <div style={{ marginBottom: '18px' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', color: '#00e5ff', marginBottom: '6px', fontWeight: 700 }}>
            🗣️ Select Voice Persona ({sortedVoices.length} System Voices)
          </label>
          <select
            value={selectedVoiceURI}
            onChange={e => setSelectedVoiceURI(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              background: '#090314',
              border: '1px solid rgba(0, 229, 255, 0.3)',
              color: '#fff',
              borderRadius: '8px',
              fontSize: '0.82rem',
              outline: 'none'
            }}
          >
            {sortedVoices.map((v) => {
              const isNatural = /natural|google|enhanced|premium|samantha|karen|daniel|aria|guy|jenny/i.test(v.name);
              const label = `${v.name} (${v.lang})${isNatural ? ' ✨ Neural/HD' : ''}`;
              return (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {label}
                </option>
              );
            })}
          </select>
        </div>

        {/* Audio Pre-Alert Chime Toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', background: 'rgba(0, 229, 255, 0.05)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(0, 229, 255, 0.15)' }}>
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>🔔 Pre-Alert Audio Chime</div>
            <div style={{ fontSize: '0.7rem', color: '#aaa' }}>Play high-tech dual-tone chime before voice speaks</div>
          </div>
          <input
            type="checkbox"
            checked={chimeEnabled}
            onChange={e => setChimeEnabled(e.target.checked)}
            style={{ width: '18px', height: '18px', accentColor: '#00e5ff', cursor: 'pointer' }}
          />
        </div>

        {/* Speech Controls Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
          {/* Rate / Speed Slider */}
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#aaa', marginBottom: '6px' }}>
              <span>⚡ Speed (Rate)</span>
              <span style={{ color: '#00e5ff', fontWeight: 700 }}>{rate.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="0.75"
              max="1.25"
              step="0.05"
              value={rate}
              onChange={e => setRate(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: '#00e5ff' }}
            />
          </div>

          {/* Pitch Slider */}
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#aaa', marginBottom: '6px' }}>
              <span>🎵 Pitch / Tone</span>
              <span style={{ color: '#00e5ff', fontWeight: 700 }}>{pitch.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.8"
              max="1.2"
              step="0.05"
              value={pitch}
              onChange={e => setPitch(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: '#00e5ff' }}
            />
          </div>
        </div>

        {/* Volume Slider */}
        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#aaa', marginBottom: '6px' }}>
            <span>🔊 Volume</span>
            <span style={{ color: '#00e5ff', fontWeight: 700 }}>{Math.round(volume * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={e => setVolume(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#00e5ff' }}
          />
        </div>

        {/* Actions Footer */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => testVoice('Manna Edge Markets voice system test. Take Profit 1 reached for EURUSD at 1.0850. Position risk free.')}
            style={{
              background: 'rgba(0, 229, 255, 0.12)',
              border: '1px solid #00e5ff',
              color: '#00e5ff',
              padding: '10px 18px',
              borderRadius: '8px',
              fontWeight: 900,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            ▶ Test Current Voice
          </button>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#00e5ff',
              color: '#090314',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '8px',
              fontWeight: 900,
              cursor: 'pointer'
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
