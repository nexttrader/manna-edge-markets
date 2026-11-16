import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDecisionMatrix, type DecisionMatrixItem } from '../hooks/useDecisionMatrix';
import {
  computeSignalEdgeConfluence,
  findEdgeFinderScorecard,
  resolveEdgeFinderInstrument,
  type SignalEdgeConfluence,
  useEdgeFinderAccess,
  useEdgeFinderData
} from '../hooks/useEdgeFinder';
import type { EdgeSetup } from '../types';
import './AssetDecisionMatrix.css';

interface AssetDecisionMatrixProps {
  onOpenCalculator?: (setup: EdgeSetup) => void;
  rawSetups?: EdgeSetup[];
  defaultMaximized?: boolean;
}

type MatrixFilterTab = 'strong_confluence' | 'all' | 'futures' | 'forex' | 'imminent';

export const AssetDecisionMatrix: React.FC<AssetDecisionMatrixProps> = ({ 
  onOpenCalculator, 
  rawSetups = [],
  defaultMaximized = false
}) => {
  const { matrix, topFocus, loading, refetch } = useDecisionMatrix();
  const { canAccessEdgeFinder } = useEdgeFinderAccess();
  const { snapshot: efSnapshot, loading: efLoading } = useEdgeFinderData(canAccessEdgeFinder);

  const [isMaximized, setIsMaximized] = useState<boolean>(defaultMaximized);
  const [marketFilter, setMarketFilter] = useState<MatrixFilterTab>(
    canAccessEdgeFinder ? 'strong_confluence' : 'all'
  );
  const userSelectedTabRef = useRef(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (userSelectedTabRef.current) return;
    if (canAccessEdgeFinder) {
      setMarketFilter('strong_confluence');
    } else if (marketFilter === 'strong_confluence') {
      setMarketFilter('all');
    }
  }, [canAccessEdgeFinder, marketFilter]);

  const handleSelectFilter = (tab: MatrixFilterTab) => {
    userSelectedTabRef.current = true;
    setMarketFilter(tab);
  };

  // Compute read-only EdgeFinder confluence per asset (only when EdgeFinder is enabled for this role)
  const confluenceById = useMemo(() => {
    const map = new Map<string, { resolvedSymbol: string; confluence: SignalEdgeConfluence | null }>();
    if (!canAccessEdgeFinder || !efSnapshot?.scorecards) return map;
    for (const item of matrix) {
      const sc = findEdgeFinderScorecard(item.instrument, efSnapshot.scorecards);
      const confluence = sc ? computeSignalEdgeConfluence(item.bias, sc) : null;
      map.set(item.id, {
        resolvedSymbol: resolveEdgeFinderInstrument(item.instrument),
        confluence
      });
    }
    return map;
  }, [canAccessEdgeFinder, efSnapshot?.scorecards, matrix]);

  const strongConfluenceCount = useMemo(() => {
    if (!canAccessEdgeFinder) return 0;
    return matrix.filter((item) => confluenceById.get(item.id)?.confluence?.state === 'STRONG_AGREEMENT').length;
  }, [canAccessEdgeFinder, matrix, confluenceById]);

  // Filter matrix items
  const filteredMatrix = useMemo(() => {
    return matrix.filter((item) => {
      if (marketFilter === 'strong_confluence') {
        if (!canAccessEdgeFinder) return true;
        // While EdgeFinder snapshot is still loading, show nothing misleading or wait cleanly
        if (!efSnapshot?.scorecards) return false;
        return confluenceById.get(item.id)?.confluence?.state === 'STRONG_AGREEMENT';
      }
      if (marketFilter === 'futures') return item.market === 'futures';
      if (marketFilter === 'forex') return item.market === 'forex';
      if (marketFilter === 'imminent') return item.priority_tier === 'IMMINENT_FOCUS' || item.is_in_zone;
      return true;
    });
  }, [matrix, marketFilter, canAccessEdgeFinder, efSnapshot?.scorecards, confluenceById]);

  const activeTopFocus =
    filteredMatrix.length > 0
      ? filteredMatrix[0]
      : marketFilter === 'strong_confluence'
        ? null
        : topFocus;

  const handleCalculatorClick = (item: DecisionMatrixItem) => {
    if (!onOpenCalculator) return;
    
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

  // Compact Collapsed / Minimized Bar Mode
  if (!isMaximized) {
    return (
      <div className="asset-decision-matrix-collapsed">
        <div className="collapsed-left" onClick={() => setIsMaximized(true)}>
          <div className="matrix-pulse-dot" />
          <span className="collapsed-title">REAL-TIME ASSET DECISION MATRIX</span>
          <span className="matrix-live-pill">LIVE SCANNER</span>
          
          {activeTopFocus && (
            <div className="collapsed-top-ticker">
              <span className="ticker-label">#1 FOCUS:</span>
              <span className="ticker-symbol">{activeTopFocus.instrument}</span>
              {getBiasBadge(activeTopFocus.bias)}
              <span className="ticker-score">{activeTopFocus.priority_score} PTS</span>
              <span className="ticker-status">{activeTopFocus.status_label}</span>
            </div>
          )}
        </div>

        <button 
          className="maximize-matrix-btn"
          onClick={() => setIsMaximized(true)}
          title="Maximize Real-Time Decision Matrix"
        >
          ⤢ MAXIMIZE DECISION MATRIX
        </button>
      </div>
    );
  }

  // Maximized Full View Mode
  return (
    <div className="asset-decision-matrix-container animate-fade-in">
      {/* Header Bar */}
      <div className="matrix-header">
        <div className="matrix-title-group">
          <div className="matrix-pulse-dot" />
          <h2 className="matrix-heading">REAL-TIME ASSET DECISION MATRIX</h2>
          <span className="matrix-live-pill">LIVE SIGNAL SCANNER</span>
        </div>
        
        <div className="matrix-controls">
          <div className="matrix-filter-tabs">
            {canAccessEdgeFinder && (
              <button
                className={`filter-tab filter-tab-ef ${marketFilter === 'strong_confluence' ? 'active' : ''}`}
                onClick={() => handleSelectFilter('strong_confluence')}
                title="Show only assets where EdgeFinder confirms Strong Confluence (3/3 TF aligned)"
              >
                🔥 STRONG CONFLUENCE ({strongConfluenceCount})
              </button>
            )}
            <button 
              className={`filter-tab ${marketFilter === 'all' ? 'active' : ''}`}
              onClick={() => handleSelectFilter('all')}
            >
              ALL ASSETS ({matrix.length})
            </button>
            <button 
              className={`filter-tab ${marketFilter === 'imminent' ? 'active' : ''}`}
              onClick={() => handleSelectFilter('imminent')}
            >
              🎯 TOP FOCUS
            </button>
            <button 
              className={`filter-tab ${marketFilter === 'futures' ? 'active' : ''}`}
              onClick={() => handleSelectFilter('futures')}
            >
              FUTURES
            </button>
            <button 
              className={`filter-tab ${marketFilter === 'forex' ? 'active' : ''}`}
              onClick={() => handleSelectFilter('forex')}
            >
              FOREX
            </button>
          </div>
          
          <button className="matrix-refresh-btn" onClick={refetch} title="Force scan recalculation">
            ↻
          </button>

          <button 
            className="minimize-matrix-btn"
            onClick={() => setIsMaximized(false)}
            title="Minimize Decision Matrix"
          >
            ⤡ HIDE MATRIX
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
                {canAccessEdgeFinder && confluenceById.get(activeTopFocus.id)?.confluence?.state === 'STRONG_AGREEMENT' && (
                  <Link
                    to={`/edge-finder?asset=${encodeURIComponent(confluenceById.get(activeTopFocus.id)!.resolvedSymbol)}&tab=scorecard`}
                    className="matrix-ef-strong-pill"
                    title="EdgeFinder confirms 3/3 Timeframe Strong Confluence — Click to open Scorecard"
                  >
                    🔥 EDGEFINDER STRONG CONFLUENCE →
                  </Link>
                )}
              </div>

              <div className="spotlight-metrics-row">
                <div className="spotlight-metric" title={`Entry Zone: ${activeTopFocus.entry_zone_low} - ${activeTopFocus.entry_zone_high}`}>
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
              <span className="factor-name">Conviction (25%)</span>
              <div className="factor-progress"><div className="factor-fill" style={{ width: `${activeTopFocus.factors.conviction}%` }} /></div>
              <span className="factor-val">{activeTopFocus.factors.conviction}%</span>
            </div>
            <div className="factor-bar-item">
              <span className="factor-name">Win Rate Edge (25%)</span>
              <div className="factor-progress"><div className="factor-fill" style={{ width: `${activeTopFocus.factors.winrate || 75}%` }} /></div>
              <span className="factor-val">{activeTopFocus.factors.winrate || 75}%</span>
            </div>
            <div className="factor-bar-item">
              <span className="factor-name">Liquidity Sweep (15%)</span>
              <div className="factor-progress"><div className="factor-fill" style={{ width: `${activeTopFocus.factors.liquiditySweep || 80}%` }} /></div>
              <span className="factor-val">{activeTopFocus.factors.liquiditySweep || 80}%</span>
            </div>
            <div className="factor-bar-item">
              <span className="factor-name">Risk Reward (15%)</span>
              <div className="factor-progress"><div className="factor-fill" style={{ width: `${activeTopFocus.factors.riskReward}%` }} /></div>
              <span className="factor-val">{activeTopFocus.factors.riskReward}%</span>
            </div>
            <div className="factor-bar-item">
              <span className="factor-name">Timing & KZ (10%)</span>
              <div className="factor-progress"><div className="factor-fill" style={{ width: `${activeTopFocus.factors.timing || 85}%` }} /></div>
              <span className="factor-val">{activeTopFocus.factors.timing || 85}%</span>
            </div>
            <div className="factor-bar-item">
              <span className="factor-name">Zone Proximity (10%)</span>
              <div className="factor-progress"><div className="factor-fill" style={{ width: `${activeTopFocus.factors.proximity}%` }} /></div>
              <span className="factor-val">{activeTopFocus.factors.proximity}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Decision Matrix Grid / Table */}
      {(loading || (marketFilter === 'strong_confluence' && canAccessEdgeFinder && efLoading && !efSnapshot)) && filteredMatrix.length === 0 ? (
        <div className="matrix-loading">Evaluating asset signals and EdgeFinder multi-timeframe confluence...</div>
      ) : filteredMatrix.length === 0 ? (
        <div className="matrix-empty">
          {marketFilter === 'strong_confluence' ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <span>No active setups currently have EdgeFinder Strong Confluence (3/3 Timeframes aligned).</span>
              <button
                type="button"
                className="maximize-matrix-btn"
                onClick={() => handleSelectFilter('all')}
              >
                View All {matrix.length} Assets
              </button>
            </div>
          ) : (
            'No active setups match the selected filter.'
          )}
        </div>
      ) : (
        <div className="matrix-grid">
          {filteredMatrix.map((item) => {
            const isExpanded = expandedId === item.id;
            const efInfo = confluenceById.get(item.id);
            const isStrongEf = canAccessEdgeFinder && efInfo?.confluence?.state === 'STRONG_AGREEMENT';
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
                    {isStrongEf && efInfo && (
                      <Link
                        to={`/edge-finder?asset=${encodeURIComponent(efInfo.resolvedSymbol)}&tab=scorecard`}
                        className="matrix-ef-strong-pill"
                        onClick={(e) => e.stopPropagation()}
                        title="EdgeFinder confirms 3/3 Timeframe Strong Confluence — Click to open Scorecard"
                      >
                        🔥 3/3 EF CONFLUENCE →
                      </Link>
                    )}
                    <span className="distance-text">
                      {item.is_in_zone ? '🎯 Inside Zone' : `${item.distance_in_r || 0} R away`}
                    </span>
                  </div>

                  {/* Factor Summary Pills */}
                  <div className="factor-summary-pills">
                    <span className="factor-badge" title="Conviction Score (25%)">🧠 Conv {item.factors.conviction}%</span>
                    <span className="factor-badge" title="Historical Win-Rate Edge (25%)">📈 WinEdge {item.factors.winrate || 75}%</span>
                    <span className="factor-badge" title="Liquidity Sweep Score (15%)">🌊 Liq {item.factors.liquiditySweep || 80}%</span>
                    <span className="factor-badge" title="Zone Proximity (10%)">📍 Prox {item.factors.proximity}%</span>
                  </div>

                  {isExpanded && (
                    <div className="matrix-card-details">
                      <div className="detail-row" title={`Entry Zone: ${item.entry_zone_low} - ${item.entry_zone_high}`}>
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
