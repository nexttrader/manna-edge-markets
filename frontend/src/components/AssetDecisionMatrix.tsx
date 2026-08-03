import React, { useState } from 'react';
import { useDecisionMatrix, type DecisionMatrixItem } from '../hooks/useDecisionMatrix';
import type { EdgeSetup } from '../types';
import './AssetDecisionMatrix.css';

interface AssetDecisionMatrixProps {
  onOpenCalculator?: (setup: EdgeSetup) => void;
  rawSetups?: EdgeSetup[];
}

export const AssetDecisionMatrix: React.FC<AssetDecisionMatrixProps> = ({ onOpenCalculator, rawSetups = [] }) => {
  const { matrix, topFocus, loading, refetch } = useDecisionMatrix();
  const [marketFilter, setMarketFilter] = useState<'all' | 'futures' | 'forex' | 'imminent'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filter matrix items
  const filteredMatrix = matrix.filter(item => {
    if (marketFilter === 'futures') return item.market === 'futures';
    if (marketFilter === 'forex') return item.market === 'forex';
    if (marketFilter === 'imminent') return item.priority_tier === 'IMMINENT_FOCUS' || item.is_in_zone;
    return true;
  });

  const activeTopFocus = topFocus || (filteredMatrix.length > 0 ? filteredMatrix[0] : null);

  const handleCalculatorClick = (item: DecisionMatrixItem) => {
    if (!onOpenCalculator) return;
    
    // Find matching setup in rawSetups or construct lightweight EdgeSetup
    const foundSetup = rawSetups.find(s => s.id === item.id) || {
      id: item.id,
      instrument: item.instrument,
      market: item.market,
      bias: item.bias,
      conviction_score: item.conviction_score,
      entry_zone_low: item.entry_zone_low,
      entry_zone_high: item.entry_zone_high,
      entry_zone_mid: item.entry_zone_mid,
      stop: item.stop,
      tp1: item.tp1,
      r_multiple_1: item.r_multiple_1,
      signal_state: item.signal_state,
      current_price: item.current_price
    } as EdgeSetup;

    onOpenCalculator(foundSetup);
  };

  const getTierColorClass = (tier: string) => {
    switch (tier) {
      case 'IMMINENT_FOCUS': return 'tier-imminent';
      case 'HIGH_ATTENTION': return 'tier-high';
      case 'MONITORING': return 'tier-monitoring';
      default: return 'tier-low';
    }
  };

  const getBiasBadge = (bias: string) => {
    const isLong = bias.toLowerCase() === 'long';
    return (
      <span className={`matrix-bias-badge ${isLong ? 'bias-long' : 'bias-short'}`}>
        {isLong ? '▲ LONG' : '▼ SHORT'}
      </span>
    );
  };

  return (
    <div className="asset-decision-matrix-container">
      {/* Header Bar */}
      <div className="matrix-header">
        <div className="matrix-title-group">
          <div className="matrix-pulse-dot" />
          <h2 className="matrix-heading">REAL-TIME ASSET DECISION MATRIX</h2>
          <span className="matrix-live-pill">LIVE SIGNAL SCANNER</span>
        </div>
        
        <div className="matrix-controls">
          <div className="matrix-filter-tabs">
            <button 
              className={`filter-tab ${marketFilter === 'all' ? 'active' : ''}`}
              onClick={() => setMarketFilter('all')}
            >
              ALL ASSETS ({matrix.length})
            </button>
            <button 
              className={`filter-tab ${marketFilter === 'imminent' ? 'active' : ''}`}
              onClick={() => setMarketFilter('imminent')}
            >
              🎯 TOP FOCUS
            </button>
            <button 
              className={`filter-tab ${marketFilter === 'futures' ? 'active' : ''}`}
              onClick={() => setMarketFilter('futures')}
            >
              FUTURES
            </button>
            <button 
              className={`filter-tab ${marketFilter === 'forex' ? 'active' : ''}`}
              onClick={() => setMarketFilter('forex')}
            >
              FOREX
            </button>
          </div>
          
          <button className="matrix-refresh-btn" onClick={refetch} title="Force scan recalculation">
            ↻
          </button>
        </div>
      </div>

      {/* Hero Spotlight: Top Focus Asset */}
      {activeTopFocus && (
        <div className={`matrix-top-spotlight ${getTierColorClass(activeTopFocus.priority_tier)}`}>
          <div className="spotlight-badge-banner">
            <span className="spotlight-rank">RANK #1 FOCUS ASSET</span>
            <span className="spotlight-action">{activeTopFocus.status_label}</span>
          </div>

          <div className="spotlight-content">
            <div className="spotlight-main">
              <div className="spotlight-instrument-row">
                <span className="spotlight-symbol">{activeTopFocus.instrument}</span>
                {getBiasBadge(activeTopFocus.bias)}
                <span className="spotlight-market">{activeTopFocus.market.toUpperCase()}</span>
              </div>

              <div className="spotlight-metrics-row">
                <div className="spotlight-metric">
                  <span className="metric-label">ENTRY ZONE</span>
                  <span className="metric-val">{activeTopFocus.entry_zone_low} - {activeTopFocus.entry_zone_high}</span>
                </div>
                <div className="spotlight-metric">
                  <span className="metric-label">CURRENT PRICE</span>
                  <span className="metric-val highlight">
                    {activeTopFocus.current_price ? activeTopFocus.current_price : 'Scanning...'}
                  </span>
                </div>
                <div className="spotlight-metric">
                  <span className="metric-label">PROXIMITY</span>
                  <span className="metric-val">
                    {activeTopFocus.is_in_zone ? '0.00 R (IN ZONE)' : `${activeTopFocus.distance_in_r || 0} R away`}
                  </span>
                </div>
                <div className="spotlight-metric">
                  <span className="metric-label">R:R POTENTIAL</span>
                  <span className="metric-val">{activeTopFocus.r_multiple_1}R TP1</span>
                </div>
              </div>
            </div>

            <div className="spotlight-score-box">
              <div className="score-ring">
                <span className="score-number">{activeTopFocus.priority_score}</span>
                <span className="score-max">/ 100</span>
              </div>
              <span className="score-label">DECISION INDEX</span>

              <button 
                className="spotlight-calc-btn"
                onClick={() => handleCalculatorClick(activeTopFocus)}
              >
                ⚡ POSITION CALCULATOR
              </button>
            </div>
          </div>

          {/* Factor Breakdown Bars */}
          <div className="spotlight-factors">
            <div className="factor-bar-item">
              <span className="factor-name">Conviction (35%)</span>
              <div className="factor-progress"><div className="factor-fill" style={{ width: `${activeTopFocus.factors.conviction}%` }} /></div>
              <span className="factor-val">{activeTopFocus.factors.conviction}%</span>
            </div>
            <div className="factor-bar-item">
              <span className="factor-name">Proximity (30%)</span>
              <div className="factor-progress"><div className="factor-fill" style={{ width: `${activeTopFocus.factors.proximity}%` }} /></div>
              <span className="factor-val">{activeTopFocus.factors.proximity}%</span>
            </div>
            <div className="factor-bar-item">
              <span className="factor-name">Killzone (15%)</span>
              <div className="factor-progress"><div className="factor-fill" style={{ width: `${activeTopFocus.factors.killzone}%` }} /></div>
              <span className="factor-val">{activeTopFocus.factors.killzone}%</span>
            </div>
            <div className="factor-bar-item">
              <span className="factor-name">News Safety (10%)</span>
              <div className="factor-progress"><div className="factor-fill" style={{ width: `${activeTopFocus.factors.newsSafety}%` }} /></div>
              <span className="factor-val">{activeTopFocus.factors.newsSafety}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Decision Matrix Grid / Table */}
      {loading && filteredMatrix.length === 0 ? (
        <div className="matrix-loading">Evaluating asset signals and scanning real-time order flow...</div>
      ) : filteredMatrix.length === 0 ? (
        <div className="matrix-empty">No active setups match the selected filter.</div>
      ) : (
        <div className="matrix-grid">
          {filteredMatrix.map((item) => {
            const isExpanded = expandedId === item.id;
            return (
              <div 
                key={item.id} 
                className={`matrix-card ${getTierColorClass(item.priority_tier)} ${item.rank === 1 ? 'is-top-rank' : ''}`}
              >
                <div className="matrix-card-header">
                  <div className="matrix-rank-tag">#{item.rank}</div>
                  <div className="matrix-instrument-info">
                    <span className="matrix-symbol">{item.instrument}</span>
                    {getBiasBadge(item.bias)}
                  </div>
                  
                  <div className="matrix-score-pill">
                    <span className="matrix-score-val">{item.priority_score}</span>
                    <span className="matrix-score-unit">PTS</span>
                  </div>
                </div>

                <div className="matrix-card-body">
                  <div className="matrix-status-line">
                    <span className={`status-pill ${item.is_in_zone ? 'in-zone' : ''}`}>
                      {item.status_label}
                    </span>
                    <span className="distance-text">
                      {item.is_in_zone ? '🎯 Inside Zone' : `${item.distance_in_r || 0} R away`}
                    </span>
                  </div>

                  {/* Factor Summary Pill */}
                  <div className="factor-summary-pills">
                    <span className="factor-badge" title="Conviction Score">🧠 Conv {item.factors.conviction}%</span>
                    <span className="factor-badge" title="Proximity Score">📍 Prox {item.factors.proximity}%</span>
                    <span className="factor-badge" title="Killzone Alignment">⏰ KZ {item.factors.killzone}%</span>
                  </div>

                  {isExpanded && (
                    <div className="matrix-card-details">
                      <div className="detail-row">
                        <span>Entry Zone:</span>
                        <span>{item.entry_zone_low} - {item.entry_zone_high}</span>
                      </div>
                      <div className="detail-row">
                        <span>Stop Loss:</span>
                        <span>{item.stop}</span>
                      </div>
                      <div className="detail-row">
                        <span>Take Profit 1:</span>
                        <span>{item.tp1} ({item.r_multiple_1}R)</span>
                      </div>
                      {item.opposing_strategy_warning && (
                        <div className="matrix-warning-box">
                          {item.opposing_strategy_warning}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="matrix-card-footer">
                  <button 
                    className="details-toggle-btn"
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  >
                    {isExpanded ? 'Hide Details ▲' : 'View Factors ▼'}
                  </button>

                  <button 
                    className="calc-quick-btn"
                    onClick={() => handleCalculatorClick(item)}
                  >
                    Calculate Position 📐
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
