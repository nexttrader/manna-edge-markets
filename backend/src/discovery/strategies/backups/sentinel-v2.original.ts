import { IStrategyEngine, StrategyMeta } from '../strategy-interface';
import { CandidateSetup, KillzoneInfo, Bias, Candle } from '../../types';
import { getLiveCandles, getLiveCurrentPrice } from '../../yahoo-provider';
import { computeATR } from '../../atr';
import {
  computeConvictionScore,
  computeLiquidityScore,
  computeRMultiple,
  computeKillzoneTimingScore,
  computeMultiTimeframeScore,
  computeLiquidityMagnetScore,
  computeFVGScore,
  computeRelativeStrengthScore,
  computeNewsProximityModifier
} from '../../scoring';
import { getLogicalStopDistance, getInstrumentDecimals } from '../../stop-loss-rules';

interface POI {
  type: 'FVG' | 'OC' | 'REVERSAL' | 'CONSOLIDATION';
  high: number;
  low: number;
}

/**
 * IMMUTABLE ORIGINAL BACKUP: Sentinel V2 Strategy Engine v1.0
 * Saved for reference and instant restoration.
 */
export class SentinelV2OriginalStrategy implements IStrategyEngine {
  public meta: StrategyMeta = {
    id: 'sentinel_v2',
    name: 'Sentinel V2 Original Master',
    tier: 'elite',
    description: 'Elite Frameworks: Fractal Swing Points — 4-stage state machine across H1/15M/1M for institutional expansion → POI → swing confirmation → precision entry.',
    enabled: true
  };

  private getExplanation(poiType: POI['type'], bias: Bias): string {
    const isBull = bias === 'long';
    switch (poiType) {
      case 'FVG':
        return isBull
          ? "Price returned to an unmitigated fair value gap on the 1-hour chart created during a strong bullish move."
          : "Price returned to an unmitigated fair value gap on the 1-hour chart created during a strong bearish move.";
      case 'OC':
        return isBull
          ? "Price pulled back to the order block where institutions were buying on the 1-hour chart."
          : "Price touched a strong seller zone on the 1-hour chart where big institutions sold earlier.";
      case 'REVERSAL':
        return isBull
          ? "Price swept liquidity below key support and reversed sharply — a classic institutional stop hunt."
          : "Price swept liquidity above key resistance and reversed sharply — a classic stop hunt by institutions.";
      case 'CONSOLIDATION':
        return isBull
          ? "Price is returning to the consolidation base it broke out from — a high-probability re-entry zone."
          : "Price is returning to the consolidation ceiling it broke down from — a high-probability re-entry zone.";
    }
  }

  public async evaluateSetups(
    killzone: KillzoneInfo,
    runId: string,
    market: 'futures' | 'forex',
    instruments: string[],
    preCalculatedBiases: Record<string, Bias>
  ): Promise<CandidateSetup[]> {
    const candidates: CandidateSetup[] = [];

    for (const instrument of instruments) {
      try {
        // Stage 1: HTF Expansion Candle Detection
        const candles1h = await getLiveCandles(instrument, '1h', 120);
        if (candles1h.length < 30) continue;

        const closed1h = candles1h.slice(0, -1);
        if (closed1h.length < 20) continue;

        const last10 = closed1h.slice(-10);
        const avgRange = last10.reduce((acc, c) => acc + (c.high - c.low), 0) / 10;

        let expansionIdx = -1;
        let expansionCandle: Candle | null = null;
        const walkLimit = Math.max(0, closed1h.length - 20);
        for (let i = closed1h.length - 1; i >= walkLimit; i--) {
          const c = closed1h[i];
          const range = c.high - c.low;
          const body = Math.abs(c.close - c.open);
          if (range > 0 && (body / range) >= 0.50 && range > avgRange * 1.02) {
            expansionIdx = i;
            expansionCandle = c;
            break;
          }
        }

        if (expansionIdx === -1 || !expansionCandle) continue;

        const bias: Bias = expansionCandle.close > expansionCandle.open ? 'long' : 'short';
        const cycleCount = closed1h.length - 1 - expansionIdx;
        const cyclePriority = cycleCount === 3 || cycleCount === 4;

        const postExpansion = closed1h.slice(expansionIdx);
        const phaseHigh = Math.max(...postExpansion.map(c => c.high));
        const phaseLow = Math.min(...postExpansion.map(c => c.low));

        const price = await getLiveCurrentPrice(instrument);
        if (!price || price <= 0) continue;

        // Stage 2: POI Scanning
        const pois: POI[] = [];

        for (let i = expansionIdx; i < closed1h.length - 1; i++) {
          if (i < 2) continue;
          if (bias === 'long' && closed1h[i].low > closed1h[i - 2].high) {
            pois.push({ type: 'FVG', high: closed1h[i].low, low: closed1h[i - 2].high });
          } else if (bias === 'short' && closed1h[i - 2].low > closed1h[i].high) {
            pois.push({ type: 'FVG', high: closed1h[i - 2].low, low: closed1h[i].high });
          }
        }

        const ocLimit = Math.max(0, expansionIdx - 8);
        for (let i = expansionIdx - 1; i >= ocLimit; i--) {
          const c = closed1h[i];
          if (bias === 'long' && c.close < c.open) {
            pois.push({ type: 'OC', high: Math.max(c.open, c.close), low: Math.min(c.open, c.close) });
            break;
          } else if (bias === 'short' && c.close > c.open) {
            pois.push({ type: 'OC', high: Math.max(c.open, c.close), low: Math.min(c.open, c.close) });
            break;
          }
        }

        for (let i = Math.max(1, expansionIdx - 5); i < closed1h.length - 1; i++) {
          const c = closed1h[i];
          const prev = closed1h[i - 1];
          const next = closed1h[i + 1];
          if (bias === 'long' && c.low < prev.low && c.close > prev.low && next.close > next.open) {
            pois.push({ type: 'REVERSAL', high: c.close, low: c.low });
          } else if (bias === 'short' && c.high > prev.high && c.close < prev.high && next.close < next.open) {
            pois.push({ type: 'REVERSAL', high: c.high, low: c.close });
          }
        }

        if (expansionIdx >= 3) {
          const consCandles = closed1h.slice(Math.max(0, expansionIdx - 6), expansionIdx - 2);
          if (consCandles.length >= 3) {
            const maxR = Math.max(...consCandles.map(c => c.high - c.low));
            if (maxR < avgRange * 1.5) {
              const cHigh = Math.max(...consCandles.map(c => c.high));
              const cLow = Math.min(...consCandles.map(c => c.low));
              pois.push({ type: 'CONSOLIDATION', high: cHigh, low: cLow });
            }
          }
        }

        if (pois.length === 0) continue;

        const recentHTF = candles1h.slice(-4);
        let mitigatedPoi: POI | null = null;
        for (const p of pois) {
          for (const htf of recentHTF) {
            if (bias === 'long' && htf.low <= p.high && htf.high >= p.low) {
              mitigatedPoi = p;
              break;
            }
            if (bias === 'short' && htf.high >= p.low && htf.low <= p.high) {
              mitigatedPoi = p;
              break;
            }
          }
          if (mitigatedPoi) break;
        }

        if (!mitigatedPoi) continue;

        // Stage 3: 15M Swing Confirmation
        const candles15m = await getLiveCandles(instrument, '15m', 50);
        if (candles15m.length < 8) continue;
        const closed15m = candles15m.slice(0, -1);
        const last6 = closed15m.slice(-6);

        let mtfConfirmCandle: Candle | null = null;
        for (const c of last6) {
          if (bias === 'long' && c.close > c.open && c.low <= mitigatedPoi.high * 1.002 && c.high >= mitigatedPoi.low * 0.998) {
            mtfConfirmCandle = c;
            break;
          }
          if (bias === 'short' && c.close < c.open && c.high >= mitigatedPoi.low * 0.998 && c.low <= mitigatedPoi.high * 1.002) {
            mtfConfirmCandle = c;
            break;
          }
        }

        if (!mtfConfirmCandle) continue;

        // Stage 4: 1M / Precision Entry Trigger
        const candles1m = await getLiveCandles(instrument, '1m', 15);
        let entryConfirmed = false;

        if (candles1m.length >= 6) {
          const current1M = candles1m[candles1m.length - 1];
          const prior1M = candles1m[candles1m.length - 2];
          if (bias === 'long' && (current1M.close >= prior1M.high || current1M.close >= current1M.open)) {
            entryConfirmed = true;
          } else if (bias === 'short' && (current1M.close <= prior1M.low || current1M.close <= current1M.open)) {
            entryConfirmed = true;
          }
        }

        if (!entryConfirmed && price > 0) {
          if (bias === 'long' && price >= mitigatedPoi.low * 0.998 && price <= mitigatedPoi.high * 1.005) {
            entryConfirmed = true;
          } else if (bias === 'short' && price <= mitigatedPoi.high * 1.002 && price >= mitigatedPoi.low * 0.995) {
            entryConfirmed = true;
          }
        }

        if (!entryConfirmed) continue;

        const entry = price > 0 ? price : (candles1m.length > 0 ? candles1m[candles1m.length - 1].close : mtfConfirmCandle.close);
        const last5_1m = candles1m.slice(-5);
        let stop = 0;
        if (bias === 'long') {
          const minLow1m = last5_1m.length > 0 ? Math.min(...last5_1m.map(c => c.low)) : mtfConfirmCandle.low;
          stop = Math.min(minLow1m, mtfConfirmCandle.low);
        } else {
          const maxHigh1m = last5_1m.length > 0 ? Math.max(...last5_1m.map(c => c.high)) : mtfConfirmCandle.high;
          stop = Math.max(maxHigh1m, mtfConfirmCandle.high);
        }

        const atr14 = computeATR(candles15m, 14);
        const rawRisk = Math.abs(entry - stop);
        const logicalRisk = getLogicalStopDistance(instrument, atr14, rawRisk, market);
        
        stop = bias === 'long' ? entry - logicalRisk : entry + logicalRisk;
        let tp1 = bias === 'long' ? entry + (logicalRisk * 2) : entry - (logicalRisk * 2);
        let tp2 = bias === 'long' ? phaseHigh : phaseLow;
        
        const tp2_rr = computeRMultiple(entry, tp2, stop, bias);
        if (tp2_rr < 3.0) {
          tp2 = bias === 'long' ? entry + (logicalRisk * 3.0) : entry - (logicalRisk * 3.0);
        }

        const r1 = computeRMultiple(entry, tp1, stop, bias);
        const r2 = computeRMultiple(entry, tp2, stop, bias);
        const decimals = getInstrumentDecimals(instrument, market);

        const now = new Date();
        const hourET = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false }).format(now), 10);
        const kzScore = computeKillzoneTimingScore(hourET);
        const mtfScore = computeMultiTimeframeScore(candles1h, candles15m, bias);
        const magnetScore = computeLiquidityMagnetScore(candles15m, tp1, bias);
        const fvgScore = computeFVGScore(candles15m, bias);
        const rsScore = computeRelativeStrengthScore(candles15m, bias);
        const newsModifier = computeNewsProximityModifier(now);

        let baseConviction = computeConvictionScore({
          supportResistanceStrength: 0.90,
          structureAlignment: mtfScore,
          volumeProfile: 0.85,
          killzoneTiming: kzScore,
          multiTimeframeAlignment: mtfScore,
          liquidityPoolMagnet: magnetScore,
          fvgDisbalance: fvgScore,
          relativeStrength: rsScore,
          atrAlignment: 0.90,
          newsProximityModifier: newsModifier
        });

        if (cyclePriority) baseConviction += 2.5;
        const convictionScore = Math.min(99.5, Math.max(70.0, Number(baseConviction.toFixed(1))));

        const spread = price * (market === 'futures' ? 0.0001 : 0.0002);
        const avgVol = candles15m.reduce((acc, c) => acc + c.volume, 0) / candles15m.length;
        const curVol = candles1m.length > 0 ? candles1m[candles1m.length - 1].volume : avgVol;
        const liquidityScore = computeLiquidityScore(curVol, avgVol, spread);

        const roundedEntry = Number(entry.toFixed(decimals));
        const roundedStop = Number(stop.toFixed(decimals));

        let entryLow = roundedEntry;
        let entryHigh = roundedEntry;
        if (market === 'futures') {
          const quarterPoint = 0.25;
          entryLow = Number((roundedEntry - quarterPoint).toFixed(decimals));
          entryHigh = Number((roundedEntry + quarterPoint).toFixed(decimals));
        } else {
          const halfPip = 0.00005;
          entryLow = Number((roundedEntry - halfPip).toFixed(decimals));
          entryHigh = Number((roundedEntry + halfPip).toFixed(decimals));
        }

        const setupExplanation = this.getExplanation(mitigatedPoi.type, bias);
        const setupMetadata = JSON.stringify({
          engine: 'Sentinel V2 Original Master (Immutable)',
          poi_type: mitigatedPoi.type,
          poi_high: mitigatedPoi.high,
          poi_low: mitigatedPoi.low,
          cycle_count: cycleCount,
          cycle_priority: cyclePriority,
          phase_high: phaseHigh,
          phase_low: phaseLow,
          explanation: setupExplanation,
          confluence_factors: [
            `HTF Expansion (${expansionCandle.close > expansionCandle.open ? 'Bullish' : 'Bearish'} Body)`,
            `1H ${mitigatedPoi.type} Mitigation Zone`,
            `15M Swing Confirmation Candle`,
            `1M Trigger Confirmation`
          ]
        });

        candidates.push({
          instrument,
          market,
          killzone_origin: killzone.killzone,
          killzone_origin_at: killzone.boundaryUTC,
          bias,
          entry_zone_low: entryLow,
          entry_zone_high: entryHigh,
          entry_zone_mid: roundedEntry,
          entry_price_recorded: roundedEntry,
          entry_price_executed: roundedEntry,
          stop: roundedStop,
          initial_stop: roundedStop,
          tp1: Number(tp1.toFixed(decimals)),
          tp2: Number(tp2.toFixed(decimals)),
          r_multiple_1: Number(r1.toFixed(2)),
          r_multiple_2: Number(r2.toFixed(2)),
          conviction_score: convictionScore,
          liquidity_score: liquidityScore,
          strategy_id: 'sentinel_v2',
          strategy_tier: 'elite',
          metadata: setupMetadata
        });
      } catch (err) {
        // Continue
      }
    }

    return candidates;
  }
}
