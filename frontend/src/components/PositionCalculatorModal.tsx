import React, { useState } from 'react';
import type { EdgeSetup } from '../types';
import './PositionCalculatorModal.css';

interface PositionCalculatorModalProps {
  setup: EdgeSetup;
  onClose: () => void;
}

export const PositionCalculatorModal: React.FC<PositionCalculatorModalProps> = ({ setup, onClose }) => {
  const [accountSize, setAccountSize] = useState<number>(50000);
  const [riskPercent, setRiskPercent] = useState<number>(1.0);

  const entryMid = (setup as any).entry_zone_mid || (setup.levels ? (setup.levels.entryMin + setup.levels.entryMax) / 2 : 0);
  const stopLoss = (setup as any).stop || (setup.levels ? setup.levels.stopLoss : 0);
  const tp1 = (setup as any).tp1 || (setup.levels ? setup.levels.takeProfit1 : 0);
  const tp2 = (setup as any).tp2 || (setup.levels ? setup.levels.takeProfit2 : 0);

  const riskAmount = (accountSize * riskPercent) / 100;
  const priceRisk = Math.abs(entryMid - stopLoss);

  // Position sizing formulas
  const isForex = setup.market === 'forex' || setup.instrument.includes('/');
  
  // Standard Forex lot calculation: Risk / (Pips * $10 per lot)
  let positionSizeText = '0.00';
  let unitName = 'Lots';

  if (isForex) {
    const pipsRisk = priceRisk * 10000;
    const lots = pipsRisk > 0 ? riskAmount / (pipsRisk * 10) : 0;
    positionSizeText = lots.toFixed(2);
    unitName = 'Standard Lots';
  } else {
    // Futures contract calculation: Risk / (Price Points * Point Value)
    // NQ = $20 per point, ES = $50 per point, Gold GC = $100 per point
    let pointValue = 20; // Default NQ
    if (setup.instrument.includes('ES')) pointValue = 50;
    else if (setup.instrument.includes('GC')) pointValue = 100;
    else if (setup.instrument.includes('SI')) pointValue = 5000;

    const contracts = priceRisk > 0 ? Math.max(1, Math.floor(riskAmount / (priceRisk * pointValue))) : 0;
    positionSizeText = `${contracts}`;
    unitName = 'Contracts';
  }

  const r1Mult = (setup as any).r_multiple_1 || 2.0;
  const r2Mult = (setup as any).r_multiple_2 || 3.0;

  const profitTP1 = riskAmount * r1Mult;
  const profitTP2 = riskAmount * r2Mult;

  return (
    <div className="calc-modal-backdrop" onClick={onClose}>
      <div className="calc-modal-card animate-scale-up" onClick={e => e.stopPropagation()}>
        <div className="calc-modal-header">
          <div>
            <h3>🧮 POSITION & RISK CALCULATOR</h3>
            <span className="calc-symbol">{setup.instrument} ({setup.bias.toUpperCase()})</span>
          </div>
          <button className="calc-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="calc-modal-body">
          <div className="calc-inputs-grid">
            <div className="calc-field">
              <label>ACCOUNT BALANCE ($)</label>
              <input
                type="number"
                value={accountSize}
                onChange={e => setAccountSize(Number(e.target.value))}
                step="1000"
              />
              <div className="quick-size-btns">
                <button onClick={() => setAccountSize(10000)}>$10K</button>
                <button onClick={() => setAccountSize(50000)}>$50K</button>
                <button onClick={() => setAccountSize(100000)}>$100K</button>
              </div>
            </div>

            <div className="calc-field">
              <label>RISK PER TRADE (%)</label>
              <input
                type="number"
                value={riskPercent}
                onChange={e => setRiskPercent(Number(e.target.value))}
                step="0.25"
                max="5"
                min="0.1"
              />
              <div className="quick-size-btns">
                <button onClick={() => setRiskPercent(0.5)}>0.5%</button>
                <button onClick={() => setRiskPercent(1.0)}>1.0%</button>
                <button onClick={() => setRiskPercent(2.0)}>2.0%</button>
              </div>
            </div>
          </div>

          <div className="calc-results-box">
            <div className="res-row main-res">
              <span className="res-label">MAX DOLLAR RISK:</span>
              <span className="res-val text-red">-${riskAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>

            <div className="res-row main-res">
              <span className="res-label">RECOMMENDED POSITION:</span>
              <span className="res-val text-gold">{positionSizeText} {unitName}</span>
            </div>

            <div className="res-divider" />

            <div className="res-row">
              <span className="res-label">TARGET TP1 ({r1Mult}R):</span>
              <span className="res-val text-green">+${profitTP1.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>

            <div className="res-row">
              <span className="res-label">TARGET TP2 ({r2Mult}R):</span>
              <span className="res-val text-green">+${profitTP2.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div className="calc-price-levels">
            <div><span>ENTRY:</span> <strong className="font-mono">{entryMid}</strong></div>
            <div><span>STOP LOSS:</span> <strong className="font-mono text-red">{stopLoss}</strong></div>
            <div><span>TARGET 1:</span> <strong className="font-mono text-green">{tp1}</strong></div>
            <div><span>TARGET 2:</span> <strong className="font-mono text-green">{tp2}</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
};
