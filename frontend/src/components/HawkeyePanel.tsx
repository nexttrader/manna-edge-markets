import React, { useState } from 'react';
import './HawkeyePanel.css';
import { useHawkeye } from '../hooks/useHawkeye';
import { formatETTime } from '../utils/time';

export function formatPlainEnglishAudit(reasonCode: string, detail?: string) {
  const code = (reasonCode || '').toLowerCase();
  const det = detail || '';

  let title = 'Signal Updated';
  let icon = 'ℹ️';
  let explanation = det;

  if (code === 'sl_breached') {
    title = 'Stop Loss Breached';
    icon = '🛑';
    const match = det.match(/Price ([\d.]+) breached SL ([\d.]+)/i);
    if (match) {
      explanation = `Market price (${match[1]}) crossed Stop Loss level (${match[2]}). Position closed in Loss.`;
    } else {
      explanation = 'Market price touched Stop Loss level. Position closed in Loss.';
    }
  } else if (code === 'price_displaced') {
    title = 'Price Displaced';
    icon = '🏃';
    const match = det.match(/Price ([\d.]+) displaced > 1\.5x ATR \(([\d.]+)\) from entry mid ([\d.]+)/i);
    if (match) {
      explanation = `Market price (${match[1]}) moved too far away from entry mid (${match[3]}), exceeding 1.5x ATR volatility limit (${match[2]}). Signal cancelled to avoid chasing overextended moves.`;
    } else {
      explanation = 'Price moved too far away from entry zone. Signal cancelled to prevent overextended entry.';
    }
  } else if (code === 'structure_displaced') {
    title = 'Structure Breakout';
    icon = '🚀';
    explanation = 'Market price broke out aggressively beyond entry zone in bias direction without filling order. Signal cancelled.';
  } else if (code === 'entry_expired') {
    title = 'Entry Expired';
    icon = '⏰';
    explanation = 'Setup remained unfilled for longer than 12 hours (2 full session cycles). Order cancelled as stale.';
  } else if (code === 'superseded') {
    title = 'Superseded by Higher Conviction';
    icon = '⚡';
    explanation = 'Existing setup was replaced by a newly scanned setup with significantly higher conviction score.';
  } else if (code === 'opposing_signal') {
    title = 'Opposing Bias Reversal';
    icon = '🔄';
    explanation = 'Replaced by an opposing signal with higher market structure conviction.';
  } else if (code === 'discarded_duplicate') {
    title = 'Duplicate Filtered';
    icon = '📋';
    explanation = 'Lower-ranked duplicate candidate setup was filtered out during deduplication.';
  } else if (code === 'tp1_hit') {
    title = 'Take Profit 1 Reached';
    icon = '🟢';
    explanation = 'Market price reached Target 1. Scalped partial profit (+2.0R).';
  } else if (code === 'tp2_hit') {
    title = 'Take Profit 2 Reached';
    icon = '🎯';
    explanation = 'Market price reached Target 2. Full profit target achieved (+3.0R).';
  }

  return { title, icon, explanation };
}

export const HawkeyePanel: React.FC = () => {
  const { invalidations, loading } = useHawkeye();
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');

  const filtered = invalidations.filter((inv: any) => {
    const inst = inv.instrument || inv.setup_id || '';
    const reason = inv.reasonCode || inv.reason_code || '';
    return inst.toLowerCase().includes(filter.toLowerCase()) || 
           reason.toLowerCase().includes(filter.toLowerCase());
  });

  return (
    <>
      <button className="hawkeye-toggle glass-card font-mono" onClick={() => setIsOpen(!isOpen)}>
        🤖 Manna AI Assistant <span className="badge">{invalidations.length}</span>
      </button>

      {isOpen && (
        <div className="hawkeye-panel glass-card animate-slide-up">
          <div className="hp-header font-mono">
            <h3>🤖 Manna AI Assistant Audit Trail</h3>
            <div className="hp-controls">
              <input 
                type="text" 
                placeholder="Search symbol or audit reason..." 
                value={filter}
                onChange={e => setFilter(e.target.value)}
                className="hp-search font-mono"
              />
              <button className="hp-close" onClick={() => setIsOpen(false)}>✕</button>
            </div>
          </div>
          
          <div className="hp-content font-sans">
            {loading ? (
              <div className="hp-loading font-mono">Loading Manna AI Assistant audit log...</div>
            ) : filtered.length === 0 ? (
              <div className="hp-empty font-mono">No AI Assistant audit records logged yet.</div>
            ) : (
              <div className="hp-list">
                {filtered.map((inv: any) => {
                  let inst = inv.instrument || inv.setup_id || 'Setup';
                  if (inst.includes('-') && inst.length > 20) {
                    inst = (inv.setup_market || inv.market || 'futures').toUpperCase() === 'FOREX' ? 'Forex Setup' : 'Futures Setup';
                  }
                  const market = (inv.market || inv.setup_market || 'futures').toUpperCase();
                  const time = inv.timestamp || inv.created_at || new Date().toISOString();
                  const oldSt = inv.oldState || inv.previous_state || 'awaiting_entry';
                  const newSt = inv.newState || inv.new_state || 'invalidated';
                  const reason = inv.reasonCode || inv.reason_code || 'unknown';
                  const run = inv.runId || inv.run_id;

                  const auditInfo = formatPlainEnglishAudit(reason, inv.detail);

                  return (
                    <div key={inv.id} className="hp-item">
                      <div className="hp-item-header font-mono">
                        <span className="hp-instrument">
                          {auditInfo.icon} {inst} <span className="hp-market-chip">({market})</span>
                        </span>
                        <span className="hp-time">{formatETTime(time)}</span>
                      </div>
                      
                      <div className="hp-transition font-mono">
                        <span className="state-old">{oldSt.replace('_', ' ')}</span>
                        <span className="transition-arrow">→</span>
                        <span className="state-new">{newSt.replace('_', ' ')}</span>
                      </div>

                      <div className="hp-plain-reason">
                        <div className="reason-title font-mono">{auditInfo.title}</div>
                        <div className="reason-desc">{auditInfo.explanation}</div>
                      </div>

                      {run && <div className="hp-run font-mono">Run ID: {run}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
