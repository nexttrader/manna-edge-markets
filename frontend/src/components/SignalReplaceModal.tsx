import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { EdgeSetup } from '../types';
import { SetupChartModal } from './SetupChartModal';
import { API_BASE } from '../config';
import './SignalReplaceModal.css';

interface SignalReplaceModalProps {
  currentSetup: EdgeSetup;
  candidate: any;
  onClose: () => void;
  onSuccess: (newSetup: EdgeSetup) => void;
}

export const SignalReplaceModal: React.FC<SignalReplaceModalProps> = ({
  currentSetup,
  candidate,
  onClose,
  onSuccess
}) => {
  const [showChartPreview, setShowChartPreview] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCurrentLong = (currentSetup.bias || 'long').toLowerCase() === 'long';
  const isCandidateLong = (candidate.bias || 'long').toLowerCase() === 'long';

  const currentEntryLow = currentSetup.entry_zone_low ?? currentSetup.levels?.entryMin ?? 0;
  const currentEntryHigh = currentSetup.entry_zone_high ?? currentSetup.levels?.entryMax ?? 0;
  const currentStop = currentSetup.stop ?? currentSetup.levels?.stopLoss ?? 0;
  const currentTp1 = currentSetup.tp1 ?? currentSetup.levels?.takeProfit1 ?? 0;
  const currentConviction = Math.round(currentSetup.conviction_score ?? currentSetup.conviction ?? 75);

  const candidateEntryLow = candidate.entry_zone_low ?? candidate.levels?.entryMin ?? 0;
  const candidateEntryHigh = candidate.entry_zone_high ?? candidate.levels?.entryMax ?? 0;
  const candidateStop = candidate.stop ?? candidate.levels?.stopLoss ?? 0;
  const candidateTp1 = candidate.tp1 ?? candidate.levels?.takeProfit1 ?? 0;
  const candidateConviction = Math.round(candidate.conviction_score ?? candidate.conviction ?? 75);

  // Construct a synthetic EdgeSetup object for chart preview of the candidate
  const candidateAsSetup: EdgeSetup = {
    id: 'candidate-preview',
    instrument: candidate.instrument || currentSetup.instrument,
    market: currentSetup.market || 'futures',
    bias: candidate.bias || 'long',
    conviction_score: candidateConviction,
    entry_zone_low: candidateEntryLow,
    entry_zone_high: candidateEntryHigh,
    entry_zone_mid: candidate.entry_zone_mid || (candidateEntryLow + candidateEntryHigh) / 2,
    stop: candidateStop,
    tp1: candidateTp1,
    tp2: candidate.tp2,
    r_multiple_1: candidate.r_multiple_1 || 2.0,
    r_multiple_2: candidate.r_multiple_2 || 3.0,
    signal_state: 'awaiting_entry',
    strategy_id: candidate.strategy_id || currentSetup.strategy_id || 'manna_basic',
    created_at: new Date().toISOString()
  };

  const handleConfirmReplace = async () => {
    try {
      setReplacing(true);
      setError(null);
      const res = await fetch(`${API_BASE}/api/admin/confirm-replace-signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          existingSetupId: currentSetup.id,
          candidate: candidate,
          market: currentSetup.market || 'futures'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to replace signal');

      onSuccess(data.newSetup);
    } catch (err: any) {
      setError(err.message || 'Signal replacement failed');
      setReplacing(false);
    }
  };

  return createPortal(
    <div className="replace-modal-backdrop font-sans">
      <div className="replace-modal-content glass-card animate-fade-in">
        {/* Header */}
        <div className="replace-modal-header">
          <h2>🔍 Signal Replacement Discovered: <span className="font-mono text-cyan">{currentSetup.instrument}</span></h2>
          <button className="close-btn font-mono" onClick={onClose}>✕</button>
        </div>

        <p className="replace-subtitle">
          A new setup candidate was discovered for <strong>{currentSetup.instrument}</strong> during single-asset rescan.
          Compare metrics below, preview on chart, or confirm replacement.
        </p>

        {error && <div className="replace-error font-mono">⚠️ {error}</div>}

        {/* Side-by-Side Comparison */}
        <div className="comparison-grid">
          {/* Current Signal Card */}
          <div className="compare-card current font-mono">
            <div className="card-badge current-badge">CURRENT PENDING SIGNAL</div>
            <h3 className="inst-title">{currentSetup.instrument}</h3>
            <div className={`bias-pill ${isCurrentLong ? 'long' : 'short'}`}>
              {isCurrentLong ? '⬆ LONG' : '⬇ SHORT'}
            </div>

            <div className="metric-row">
              <span className="metric-label">Conviction:</span>
              <span className="metric-value text-gold">{currentConviction}%</span>
            </div>
            <div className="metric-row">
              <span className="metric-label">Entry Zone:</span>
              <span className="metric-value">{currentEntryLow} – {currentEntryHigh}</span>
            </div>
            <div className="metric-row">
              <span className="metric-label">Stop Loss:</span>
              <span className="metric-value text-red">{currentStop}</span>
            </div>
            <div className="metric-row">
              <span className="metric-label">Target 1 (R):</span>
              <span className="metric-value text-green">{currentTp1} (+{currentSetup.r_multiple_1 || 2.0}R)</span>
            </div>
            <div className="metric-row">
              <span className="metric-label">Strategy:</span>
              <span className="metric-value">{currentSetup.strategy_id === 'manna_snd' ? 'Manna SnD' : 'Manna Basic'}</span>
            </div>
          </div>

          {/* VS Divider */}
          <div className="vs-divider font-mono">VS</div>

          {/* New Proposed Signal Card */}
          <div className="compare-card candidate font-mono">
            <div className="card-badge candidate-badge">⚡ PROPOSED REPLACEMENT</div>
            <h3 className="inst-title">{candidate.instrument}</h3>
            <div className={`bias-pill ${isCandidateLong ? 'long' : 'short'}`}>
              {isCandidateLong ? '⬆ LONG' : '⬇ SHORT'}
            </div>

            <div className="metric-row">
              <span className="metric-label">Conviction:</span>
              <span className="metric-value text-cyan">{candidateConviction}%</span>
            </div>
            <div className="metric-row">
              <span className="metric-label">Entry Zone:</span>
              <span className="metric-value text-cyan">{candidateEntryLow} – {candidateEntryHigh}</span>
            </div>
            <div className="metric-row">
              <span className="metric-label">Stop Loss:</span>
              <span className="metric-value text-red">{candidateStop}</span>
            </div>
            <div className="metric-row">
              <span className="metric-label">Target 1 (R):</span>
              <span className="metric-value text-green">{candidateTp1} (+{candidate.r_multiple_1 || 2.0}R)</span>
            </div>
            <div className="metric-row">
              <span className="metric-label">Strategy:</span>
              <span className="metric-value">{candidate.strategy_id === 'manna_snd' ? 'Manna SnD' : 'Manna Basic'}</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="replace-actions font-mono">
          <button className="action-btn chart-preview-btn" onClick={() => setShowChartPreview(true)}>
            👁️ PREVIEW CANDIDATE ON CHART
          </button>
          
          <div className="right-actions">
            <button className="action-btn discard-btn" onClick={onClose} disabled={replacing}>
              ❌ DISCARD PROPOSAL
            </button>
            <button className="action-btn confirm-replace-btn" onClick={handleConfirmReplace} disabled={replacing}>
              {replacing ? '⏳ REPLACING SIGNAL...' : '⚡ REPLACE CURRENT SIGNAL'}
            </button>
          </div>
        </div>

        {/* Interactive Chart Preview Modal */}
        {showChartPreview && (
          <SetupChartModal
            setup={candidateAsSetup}
            onClose={() => setShowChartPreview(false)}
          />
        )}
      </div>
    </div>,
    document.body
  );
};
