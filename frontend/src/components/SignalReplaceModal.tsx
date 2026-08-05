import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { EdgeSetup } from '../types';
import { SetupCard } from './SetupCard';
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

  const candidateEntryLow = candidate.entry_zone_low ?? candidate.levels?.entryMin ?? 0;
  const candidateEntryHigh = candidate.entry_zone_high ?? candidate.levels?.entryMax ?? 0;
  const candidateStop = candidate.stop ?? candidate.levels?.stopLoss ?? 0;
  const candidateTp1 = candidate.tp1 ?? candidate.levels?.takeProfit1 ?? 0;
  const candidateConviction = Math.round(candidate.conviction_score ?? candidate.conviction ?? 75);

  // Construct a full EdgeSetup object so candidate displays identically to standard setup cards
  const candidateSetup: EdgeSetup = {
    id: candidate.id || `candidate_${Date.now()}`,
    instrument: candidate.instrument || currentSetup.instrument,
    market: currentSetup.market || 'futures',
    bias: candidate.bias || 'long',
    conviction_score: candidateConviction,
    conviction: candidateConviction,
    entry_zone_low: candidateEntryLow,
    entry_zone_high: candidateEntryHigh,
    entry_zone_mid: candidate.entry_zone_mid || (candidateEntryLow && candidateEntryHigh ? (candidateEntryLow + candidateEntryHigh) / 2 : undefined),
    stop: candidateStop,
    tp1: candidateTp1,
    tp2: candidate.tp2,
    r_multiple_1: candidate.r_multiple_1 || 2.0,
    r_multiple_2: candidate.r_multiple_2 || 3.0,
    signal_state: 'awaiting_entry',
    killzone_origin: currentSetup.killzone_origin || 'ny_am',
    killzone_origin_at: currentSetup.killzone_origin_at,
    strategy_id: candidate.strategy_id || currentSetup.strategy_id || 'sentinel_v2',
    strategy_tier: candidate.strategy_tier || currentSetup.strategy_tier || 'basic',
    created_at: new Date().toISOString(),
    metadata: typeof candidate.metadata === 'string' ? candidate.metadata : JSON.stringify(candidate.metadata || {})
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

  const stratName = (currentSetup.strategy_id === 'sentinel_v2' ? 'Manna Elite V1' : (currentSetup.strategy_id === 'manna_snd' ? 'Manna SnD' : 'Manna Basic')).toUpperCase();

  return createPortal(
    <div className="replace-modal-backdrop font-sans">
      <div className="replace-modal-content glass-card animate-fade-in">
        {/* Header */}
        <div className="replace-modal-header">
          <h2>🔍 Single-Asset Rescan ({stratName}): <span className="font-mono text-cyan">{currentSetup.instrument}</span></h2>
          <button className="close-btn font-mono" onClick={onClose}>✕</button>
        </div>

        <p className="replace-subtitle">
          Discovered a new <strong>{stratName}</strong> setup proposal for <strong>{currentSetup.instrument}</strong>.
          Compare the full signal cards below, preview on chart, or confirm replacement.
        </p>

        {error && <div className="replace-error font-mono">⚠️ {error}</div>}

        {/* Side-by-Side Comparison using identical SetupCard UI */}
        <div className="comparison-grid">
          {/* Current Signal Card */}
          <div className="compare-card-col font-mono">
            <div className="card-badge current-badge">📌 CURRENT PENDING SIGNAL</div>
            <SetupCard setup={currentSetup} />
          </div>

          {/* VS Divider */}
          <div className="vs-divider font-mono">VS</div>

          {/* New Proposed Signal Card */}
          <div className="compare-card-col font-mono">
            <div className="card-badge candidate-badge">⚡ PROPOSED REPLACEMENT CANDIDATE</div>
            <SetupCard setup={candidateSetup} />
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
            setup={candidateSetup}
            onClose={() => setShowChartPreview(false)}
          />
        )}
      </div>
    </div>,
    document.body
  );
};
