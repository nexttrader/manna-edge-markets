import { IStrategyEngine, StrategyMeta } from './strategy-interface';
import { CandidateSetup, KillzoneInfo, Bias, Candle } from '../types';
import { getLiveCandles, getLiveCurrentPrice } from '../yahoo-provider';
import { computeATR } from '../atr';
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
} from '../scoring';
import { getLogicalStopDistance, getInstrumentDecimals } from '../stop-loss-rules';
import * as queries from '../../db/queries';

export interface POI {
  type: 'FVG' | 'OC' | 'REV' | 'CON';
  high: number;
  low: number;
}

export interface SentinelSignalPayload {
  signalId: string;
  strategy: 'TRADE_SENTINEL_ELITE_V2';
  symbol: string;
  action: 'BUY' | 'SELL';
  phase: 'LTF_ENTRY_ACTIVE';
  cycleCount: number;
  isCyclePriority: boolean;
  poi: {
    variant: POI['type'];
    high: number;
    low: number;
    mid: number;
  };
  orders: {
    entryPrice: number;
    stopLoss: number;
    target1: number;
    target2: number;
    riskPips: number;
    rewardRiskRatio: number;
  };
  timestamps: {
    expansionTime: number;
    mtfConfirmTime: number;
    triggerTime: number;
  };
}

export class SentinelV2Strategy implements IStrategyEngine {
  public meta: StrategyMeta = {
    id: 'sentinel_v2',
    name: 'Manna Elite v1.2',
    tier: 'elite',
    description: 'Manna Elite v1.2 (Trade Sentinel Elite Framework): Strictly deterministic 4-stage state machine across 1H/15M/1M for institutional expansion, POI discovery & mitigation, 15M swing reversal confirmation, and closed 1M precision entry.',
    enabled: true
  };

  private getExplanation(poiType: POI['type'], bias: Bias): string {
    const isBull = bias === 'long';
    switch (poiType) {
      case 'FVG':
        return isBull
          ? "Price returned to an unmitigated Fair Value Gap (FVG) on the 1-hour chart created during strong institutional displacement."
          : "Price returned to an unmitigated Fair Value Gap (FVG) on the 1-hour chart created during strong institutional displacement.";
      case 'OC':
        return isBull
          ? "Price retested the institutional Order Candle (OC) base formed before 1H expansion."
          : "Price retested the institutional Order Candle (OC) ceiling formed before 1H expansion.";
      case 'REV':
        return isBull
          ? "Price swept liquidity below prior lows and reversed sharply on 1H before confirming 15M/1M order-flow."
          : "Price swept liquidity above prior highs and reversed sharply on 1H before confirming 15M/1M order-flow.";
      case 'CON':
        return isBull
          ? "Price returned to the 1H consolidation breakout base — a high-probability institutional re-entry zone."
          : "Price returned to the 1H consolidation breakout ceiling — a high-probability institutional re-entry zone.";
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
        // =========================================================================
        // STAGE 1: 1H Institutional Expansion & Bias
        // =========================================================================
        // Ingestion: Lookback 30 to 120 closed candles
        const candles1h = await getLiveCandles(instrument, '1h', 120);
        if (candles1h.length < 30) continue;

        // Use strictly closed candle data to eliminate repainting
        const closed1h = candles1h.slice(0, -1);
        if (closed1h.length < 20) continue;

        // 1. Average Range: 10-bar average range on closed 1H candles
        const last10 = closed1h.slice(-10);
        const avgRange = last10.reduce((acc, c) => acc + (c.high - c.low), 0) / 10;
        if (avgRange <= 0) continue;

        // 2. Expansion Candle Discovery: Walking backward from most recent closed 1H bar (i = 1 to 20)
        let expansionIdx = -1;
        let expansionCandle: Candle | null = null;
        const walkLimit = Math.max(0, closed1h.length - 20);
        const forcedBias = preCalculatedBiases && preCalculatedBiases[instrument];

        for (let i = closed1h.length - 1; i >= walkLimit; i--) {
          const c = closed1h[i];
          const range = c.high - c.low;
          const body = Math.abs(c.close - c.open);
          
          // Rule: Body / Range >= 0.60 (60% solid body) and Range >= avgRange * 1.0
          if (range > 0 && (body / range) >= 0.60 && range >= avgRange * 1.0) {
            const candleBias: Bias = c.close > c.open ? 'long' : 'short';
            if (forcedBias && candleBias !== forcedBias) {
              continue; // Skip expansion candle if it does not match enforced bias
            }
            expansionIdx = i;
            expansionCandle = c;
            break; // First passing candle walking backwards = most recent matching
          }
        }

        if (expansionIdx === -1 || !expansionCandle) continue;

        // 3. Bias & Cycle Count
        const bias: Bias = expansionCandle.close > expansionCandle.open ? 'long' : 'short';
        const cycleCount = (closed1h.length - 1) - expansionIdx;
        const isCyclePriority = cycleCount === 3 || cycleCount === 4;

        // 4. Expansion Phase Extremes
        const postExpansion = closed1h.slice(expansionIdx);
        const phaseHigh = Math.max(...postExpansion.map(c => c.high));
        const phaseLow = Math.min(...postExpansion.map(c => c.low));

        // Fetch live current price
        const livePrice = await getLiveCurrentPrice(instrument);
        const currentPrice = livePrice && livePrice > 0 ? livePrice : closed1h[closed1h.length - 1].close;
        if (!currentPrice || currentPrice <= 0) continue;

        // =========================================================================
        // STAGE 1.5: 1H Expansion Quadrant Filter (Equilibrium of Expansion Candle)
        // =========================================================================
        const expansionMidpoint = (expansionCandle.high + expansionCandle.low) / 2;
        const quadrantPassed = bias === 'long'
          ? currentPrice > expansionMidpoint
          : currentPrice < expansionMidpoint;

        if (!quadrantPassed) continue;

        // =========================================================================
        // STAGE 2: 1H Point of Interest (POI) Scanners & Mitigation
        // =========================================================================
        const pois: POI[] = [];

        // 1. Fair Value Gap (FVG)
        for (let i = expansionIdx; i < closed1h.length; i++) {
          if (i < 2) continue;
          if (bias === 'long' && closed1h[i].low > closed1h[i - 2].high) {
            pois.push({ type: 'FVG', high: closed1h[i].low, low: closed1h[i - 2].high });
          } else if (bias === 'short' && closed1h[i - 2].low > closed1h[i].high) {
            pois.push({ type: 'FVG', high: closed1h[i - 2].low, low: closed1h[i].high });
          }
        }

        // 2. Order Candle / Block (OC): Last opposite candle within 1–8 bars before expansion
        const ocLimit = Math.max(0, expansionIdx - 8);
        for (let i = expansionIdx - 1; i >= ocLimit; i--) {
          const c = closed1h[i];
          if (bias === 'long' && c.close < c.open) {
            pois.push({
              type: 'OC',
              high: Math.max(c.open, c.close),
              low: Math.min(c.open, c.close)
            });
            break;
          } else if (bias === 'short' && c.close > c.open) {
            pois.push({
              type: 'OC',
              high: Math.max(c.open, c.close),
              low: Math.min(c.open, c.close)
            });
            break;
          }
        }

        // 3. Liquidity Sweep / Reversal (REV): Within 5 bars prior to expansion
        const revStart = Math.max(1, expansionIdx - 5);
        for (let i = revStart; i < expansionIdx; i++) {
          const c = closed1h[i];
          const prev = closed1h[i - 1];
          const next = closed1h[i + 1] || closed1h[i];
          if (bias === 'long' && c.low < prev.low && c.close > prev.low && next.close > next.open) {
            pois.push({ type: 'REV', high: c.close, low: c.low });
          } else if (bias === 'short' && c.high > prev.high && c.close < prev.high && next.close < next.open) {
            pois.push({ type: 'REV', high: c.high, low: c.close });
          }
        }

        // 4. Consolidation Breakout (CON): 3–6 candles before expansion where max single candle range < 1.5 * avgRange
        if (expansionIdx >= 3) {
          const consCandles = closed1h.slice(Math.max(0, expansionIdx - 6), expansionIdx);
          if (consCandles.length >= 3) {
            const maxCandleRange = Math.max(...consCandles.map(c => c.high - c.low));
            if (maxCandleRange < 1.5 * avgRange) {
              const cHigh = Math.max(...consCandles.map(c => c.high));
              const cLow = Math.min(...consCandles.map(c => c.low));
              pois.push({ type: 'CON', high: cHigh, low: cLow });
            }
          }
        }

        if (pois.length === 0) continue;

        // Mitigation (Retest) Condition:
        // Bullish: Candle Low <= POI High && Candle Close >= POI Low
        // Bearish: Candle High >= POI Low && Candle Close <= POI High
        const recentHTFCandles = closed1h.slice(Math.max(0, expansionIdx));
        let mitigatedPoi: POI | null = null;

        for (const poi of pois) {
          for (const c of recentHTFCandles) {
            if (bias === 'long' && c.low <= poi.high && c.close >= poi.low) {
              mitigatedPoi = poi;
              break;
            }
            if (bias === 'short' && c.high >= poi.low && c.close <= poi.high) {
              mitigatedPoi = poi;
              break;
            }
          }
          if (mitigatedPoi) break;
        }

        // Also check if current price or latest closed 1H is currently in/touching the zone
        if (!mitigatedPoi) {
          for (const poi of pois) {
            if (bias === 'long' && currentPrice <= poi.high && currentPrice >= poi.low) {
              mitigatedPoi = poi;
              break;
            }
            if (bias === 'short' && currentPrice >= poi.low && currentPrice <= poi.high) {
              mitigatedPoi = poi;
              break;
            }
          }
        }

        if (!mitigatedPoi) continue;

        // =========================================================================
        // STAGE 3: 15M Swing Reversal Confirmation
        // =========================================================================
        // Lookback 20 to 50 closed candles
        const candles15m = await getLiveCandles(instrument, '15m', 50);
        if (candles15m.length < 8) continue;
        const closed15m = candles15m.slice(0, -1);
        if (closed15m.length < 5) continue;

        // Evaluate last 5 closed 15M candles
        const last5_15m = closed15m.slice(-5);
        let mtfConfirmCandle: Candle | null = null;

        for (let i = last5_15m.length - 1; i >= 0; i--) {
          const c = last5_15m[i];
          if (bias === 'long') {
            // Closed green candle touching POI zone
            if (c.close > c.open && c.low <= mitigatedPoi.high && c.close >= mitigatedPoi.low) {
              mtfConfirmCandle = c;
              break;
            }
          } else {
            // Closed red candle touching POI zone
            if (c.close < c.open && c.high >= mitigatedPoi.low && c.close <= mitigatedPoi.high) {
              mtfConfirmCandle = c;
              break;
            }
          }
        }

        if (!mtfConfirmCandle) continue;

        // =========================================================================
        // STAGE 4: 1M Closed-Bar Precision Entry Trigger
        // =========================================================================
        // Lookback 15 to 30 closed candles
        const candles1m = await getLiveCandles(instrument, '1m', 30);
        if (candles1m.length < 5) continue;

        const closed1m = candles1m.slice(0, -1);
        if (closed1m.length < 2) continue;

        const bar1 = closed1m[closed1m.length - 1]; // Latest closed 1M bar
        const bar2 = closed1m[closed1m.length - 2]; // Previous 1M bar

        // 1. Window Constraint: Bar 1 price must remain within the range of mtfConfirmCandle
        const withinMtfWindow = bar1.close >= mtfConfirmCandle.low && bar1.close <= mtfConfirmCandle.high;
        if (!withinMtfWindow) continue;

        // 2. Break of Structure (BOS) on closed 1M bar:
        // Long Entry: Close1 > High2 && Close1 > Open1
        // Short Entry: Close1 < Low2 && Close1 < Open1
        const bosLong = bar1.close > bar2.high && bar1.close > bar1.open;
        const bosShort = bar1.close < bar2.low && bar1.close < bar1.open;

        const entryTriggered = bias === 'long' ? bosLong : bosShort;
        if (!entryTriggered) continue;

        // =========================================================================
        // 3. RISK MANAGEMENT & TARGET ENGINE
        // =========================================================================
        const entry = bar1.close;
        const last5_1m = closed1m.slice(-5);
        const decimals = getInstrumentDecimals(instrument, market);

        // Spread Buffer
        const spreadBuffer = market === 'futures'
          ? (instrument === 'NQ' || instrument === 'YM' ? 1.0 : 0.25)
          : (instrument.includes('JPY') ? 0.020 : 0.00015);

        // Stop Loss Anchoring
        let rawStop = 0;
        if (bias === 'long') {
          const minLow1m = Math.min(...last5_1m.map(c => c.low));
          rawStop = Math.min(minLow1m, mtfConfirmCandle.low) - spreadBuffer;
        } else {
          const maxHigh1m = Math.max(...last5_1m.map(c => c.high));
          rawStop = Math.max(maxHigh1m, mtfConfirmCandle.high) + spreadBuffer;
        }

        const rawRiskDistance = Math.abs(entry - rawStop);
        if (rawRiskDistance <= 0) continue;

        const atr14_15m = computeATR(candles15m, 14);
        const logicalRisk = getLogicalStopDistance(instrument, atr14_15m, rawRiskDistance, market);

        // Re-anchor stop loss ensuring logical floor compliance
        const stop = bias === 'long' ? entry - logicalRisk : entry + logicalRisk;
        const riskDistance = Math.abs(entry - stop);
        if (riskDistance <= 0) continue;

        // Target 1: Hard Broker TP (+2.0R Exact)
        let tp1 = bias === 'long' ? entry + (2.0 * riskDistance) : entry - (2.0 * riskDistance);

        // Target 2: Structural Runner Target (Phase High/Low with minimum +2.0R floor)
        let tp2 = bias === 'long' ? phaseHigh : phaseLow;
        const tp2_rr = computeRMultiple(entry, tp2, stop, bias);
        if (tp2_rr < 2.0) {
          tp2 = bias === 'long' ? entry + (3.0 * riskDistance) : entry - (3.0 * riskDistance);
        }

        // Minimum R:R Filter: Enforce >= 2.0R
        const actualRR1 = computeRMultiple(entry, tp1, stop, bias);
        if (actualRR1 < 2.0) continue;

        // Rounded levels
        const roundedEntry = Number(entry.toFixed(decimals));
        const roundedStop = Number(stop.toFixed(decimals));
        const publishedRisk = Math.abs(roundedEntry - roundedStop);

        tp1 = bias === 'long' ? roundedEntry + (publishedRisk * 2.0) : roundedEntry - (publishedRisk * 2.0);
        if (tp2_rr < 2.0) {
          tp2 = bias === 'long' ? roundedEntry + (publishedRisk * 3.0) : roundedEntry - (publishedRisk * 3.0);
        }

        const finalEntry = roundedEntry;
        const finalStop = roundedStop;
        const finalTp1 = Number(tp1.toFixed(decimals));
        const finalTp2 = Number(tp2.toFixed(decimals));

        const r_multiple_1 = computeRMultiple(finalEntry, finalTp1, finalStop, bias);
        const r_multiple_2 = computeRMultiple(finalEntry, finalTp2, finalStop, bias);

        // Calculate risk pips
        const pipUnit = market === 'forex' ? (instrument.includes('JPY') ? 0.01 : 0.0001) : 1.0;
        const riskPips = Number((publishedRisk / pipUnit).toFixed(1));

        // Entry zone tolerance
        const ez_low = Number((finalEntry - (logicalRisk * 0.1)).toFixed(decimals));
        const ez_high = Number((finalEntry + (logicalRisk * 0.1)).toFixed(decimals));
        const ez_mid = finalEntry;

        // Conviction & Scoring
        let rawPoints = 20; // 1H Expansion detected
        if (isCyclePriority) rawPoints += 10;
        if (quadrantPassed) rawPoints += 10;
        rawPoints += 15; // POI detected
        if (mitigatedPoi.type === 'FVG' || mitigatedPoi.type === 'REV') rawPoints += 5;
        rawPoints += 15; // POI mitigated
        rawPoints += 15; // 15M swing confirmed
        rawPoints += 10; // 1M BOS entry confirmed

        const sentinel_raw_conviction = rawPoints;
        const normalizedScore = Math.min(99.5, Math.max(70.0, (rawPoints / 100) * 100));

        const now = new Date();
        const hourET = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false }).format(now), 10);
        const platformConviction = computeConvictionScore({
          supportResistanceStrength: 0.92,
          structureAlignment: 0.96,
          volumeProfile: 0.88,
          killzoneTiming: computeKillzoneTimingScore(hourET),
          multiTimeframeAlignment: computeMultiTimeframeScore(candles1h, candles15m, bias),
          liquidityPoolMagnet: computeLiquidityMagnetScore(candles15m, finalTp1, bias),
          fvgDisbalance: computeFVGScore(candles15m, bias),
          relativeStrength: computeRelativeStrengthScore(candles15m, bias),
          atrAlignment: 0.92,
          newsProximityModifier: computeNewsProximityModifier(now)
        });

        const finalConviction = Number(Math.max(normalizedScore, platformConviction).toFixed(1));

        const spread = currentPrice * (market === 'futures' ? 0.0001 : 0.0002);
        const avgVol = candles15m.reduce((acc, c) => acc + c.volume, 0) / candles15m.length;
        const curVol = closed1m.length > 0 ? closed1m[closed1m.length - 1].volume : avgVol;
        const liquidity_score = computeLiquidityScore(curVol, avgVol, spread);

        // Tuning & Audience Qualification
        const tuning = await queries.getStrategyTuning('sentinel_v2');
        const isSuperAdminQual = finalConviction >= tuning.superAdminMinConviction;
        const isPublicQual = finalConviction >= tuning.publicMinConviction;
        if (!isSuperAdminQual && !isPublicQual) continue;

        const targetAudience = (isSuperAdminQual && isPublicQual) ? 'both' : (isSuperAdminQual ? 'super_admin' : 'public');

        const expansionTimeSec = expansionCandle.timestamp ? Math.floor(new Date(expansionCandle.timestamp).getTime() / 1000) : Math.floor(Date.now() / 1000) - 7200;
        const mtfConfirmTimeSec = mtfConfirmCandle.timestamp ? Math.floor(new Date(mtfConfirmCandle.timestamp).getTime() / 1000) : Math.floor(Date.now() / 1000) - 900;
        const triggerTimeSec = bar1.timestamp ? Math.floor(new Date(bar1.timestamp).getTime() / 1000) : Math.floor(Date.now() / 1000);

        const cleanSymbol = instrument.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const signalId = `SENTINEL-${cleanSymbol}-${triggerTimeSec}`;

        const payload: SentinelSignalPayload = {
          signalId,
          strategy: 'TRADE_SENTINEL_ELITE_V2',
          symbol: instrument,
          action: bias === 'long' ? 'BUY' : 'SELL',
          phase: 'LTF_ENTRY_ACTIVE',
          cycleCount,
          isCyclePriority,
          poi: {
            variant: mitigatedPoi.type,
            high: Number(mitigatedPoi.high.toFixed(decimals)),
            low: Number(mitigatedPoi.low.toFixed(decimals)),
            mid: Number(((mitigatedPoi.high + mitigatedPoi.low) / 2).toFixed(decimals))
          },
          orders: {
            entryPrice: finalEntry,
            stopLoss: finalStop,
            target1: finalTp1,
            target2: finalTp2,
            riskPips,
            rewardRiskRatio: 2.0
          },
          timestamps: {
            expansionTime: expansionTimeSec,
            mtfConfirmTime: mtfConfirmTimeSec,
            triggerTime: triggerTimeSec
          }
        };

        const selection_rationale = `[MANNA ELITE V1.2] ${this.getExplanation(mitigatedPoi.type, bias)} Limit ${bias === 'long' ? 'Buy' : 'Sell'} at ${finalEntry.toFixed(decimals)}, SL ${finalStop.toFixed(decimals)}. Target 1: ${finalTp1.toFixed(decimals)} (2.0R).`;

        candidates.push({
          instrument,
          market,
          created_by_run: runId,
          killzone_origin: killzone.killzone,
          killzone_origin_at: killzone.boundaryUTC,
          bias,
          entry_zone_low: ez_low,
          entry_zone_high: ez_high,
          entry_zone_mid: ez_mid,
          stop: finalStop,
          tp1: finalTp1,
          tp2: finalTp2,
          r_multiple_1,
          r_multiple_2,
          conviction_score: finalConviction,
          liquidity_score,
          strategy_id: this.meta.id,
          strategy_tier: this.meta.tier,
          metadata: JSON.stringify({
            source: `yahoo_finance_${market}`,
            strategy_name: this.meta.name,
            target_audience: targetAudience,
            htf: "1H",
            mtf: "15M",
            ltf: "1M",
            selection_rationale,
            sentinel_phase: "LTF_ENTRY_ACTIVE",
            sentinel_raw_conviction,
            poi_type: mitigatedPoi.type,
            cycle_count: cycleCount,
            cycle_priority: isCyclePriority,
            expansion_direction: bias === 'long' ? 'BULLISH' : 'BEARISH',
            poi_zone_high: Number(mitigatedPoi.high.toFixed(decimals)),
            poi_zone_low: Number(mitigatedPoi.low.toFixed(decimals)),
            phase_high: Number(phaseHigh.toFixed(decimals)),
            phase_low: Number(phaseLow.toFixed(decimals)),
            mtf_confirm_high: Number(mtfConfirmCandle.high.toFixed(decimals)),
            mtf_confirm_low: Number(mtfConfirmCandle.low.toFixed(decimals)),
            quadrant_passed: quadrantPassed,
            order_type: bias === 'long' ? "BUY_LIMIT" : "SELL_LIMIT",
            context_tf: "1H Context",
            entry_tf: "1M Entry",
            payload
          })
        });

      } catch (err) {
        console.error(`[Sentinel V2] Error evaluating ${instrument}:`, err);
      }
    }

    return candidates;
  }
}
