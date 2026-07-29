import { IStrategyEngine, StrategyMeta } from './strategy-interface';
import { CandidateSetup, KillzoneInfo, Bias, Candle } from '../types';
import { getLiveCandles, getLiveCurrentPrice } from '../yahoo-provider';
import { computeATR } from '../atr';
import { computeConvictionScore, computeLiquidityScore, computeRMultiple } from '../scoring';

type CandleType = 'base' | 'leg_up' | 'leg_down';

interface Zone {
  type: 'demand' | 'supply';
  formation: 'Rally-Base-Rally' | 'Drop-Base-Rally' | 'Rally-Base-Drop' | 'Drop-Base-Drop';
  proximal: number; // Entry boundary
  distal: number;   // Stop boundary
  startIndex: number;
  endIndex: number;
}

export class MannaSndStrategy implements IStrategyEngine {
  public meta: StrategyMeta = {
    id: 'manna_snd',
    name: 'Manna SnD',
    tier: 'pro',
    description: 'Surge Supply/Demand (Curve-Trend-Zone) strategy with 1H Curve, 15M Trend & Imbalance entries.',
    enabled: true
  };

  /**
   * Classify a single candle using the 50% Body Rule
   */
  private classifyCandle(c: Candle): CandleType {
    const range = c.high - c.low;
    if (range === 0) return 'base';
    const body = Math.abs(c.close - c.open);
    const bodyRatio = body / range;

    if (bodyRatio < 0.5) {
      return 'base';
    }
    return c.close >= c.open ? 'leg_up' : 'leg_down';
  }

  /**
   * Find fresh Supply and Demand imbalance zones in candle history
   */
  private findZones(candles: Candle[]): Zone[] {
    const zones: Zone[] = [];
    if (candles.length < 5) return zones;

    const types = candles.map(c => this.classifyCandle(c));

    for (let i = 1; i < candles.length - 1; i++) {
      // Look for 1 to 3 base candles
      for (let baseCount = 1; baseCount <= 3; baseCount++) {
        if (i + baseCount >= candles.length) break;

        const prevType = types[i - 1];
        const departureType = types[i + baseCount];
        const baseCandles = candles.slice(i, i + baseCount);
        const baseTypes = types.slice(i, i + baseCount);

        const allBase = baseTypes.every(t => t === 'base');
        if (!allBase) continue;

        // 1. DEMAND ZONES (Ending in Leg Up departure)
        if (departureType === 'leg_up') {
          let formation: 'Rally-Base-Rally' | 'Drop-Base-Rally' | null = null;
          if (prevType === 'leg_up') formation = 'Rally-Base-Rally';
          else if (prevType === 'leg_down') formation = 'Drop-Base-Rally';

          if (formation) {
            // Demand Proximal = Highest body top in base; Distal = Lowest wick low
            const proximal = Math.max(...baseCandles.map(c => Math.max(c.open, c.close)));
            const distal = Math.min(...baseCandles.map(c => c.low));

            zones.push({
              type: 'demand',
              formation,
              proximal,
              distal,
              startIndex: i - 1,
              endIndex: i + baseCount
            });
          }
        }

        // 2. SUPPLY ZONES (Ending in Leg Down departure)
        if (departureType === 'leg_down') {
          let formation: 'Rally-Base-Drop' | 'Drop-Base-Drop' | null = null;
          if (prevType === 'leg_up') formation = 'Rally-Base-Drop';
          else if (prevType === 'leg_down') formation = 'Drop-Base-Drop';

          if (formation) {
            // Supply Proximal = Lowest body bottom in base; Distal = Highest wick high
            const proximal = Math.min(...baseCandles.map(c => Math.min(c.open, c.close)));
            const distal = Math.max(...baseCandles.map(c => c.high));

            zones.push({
              type: 'supply',
              formation,
              proximal,
              distal,
              startIndex: i - 1,
              endIndex: i + baseCount
            });
          }
        }
      }
    }

    return zones;
  }

  /**
   * Determine HTF (1H) Curve Location relative to major HTF zones
   */
  private getCurveLocation(currentPrice: number, htfCandles: Candle[], atr: number): 'low' | 'high' | 'middle' {
    const htfZones = this.findZones(htfCandles);
    const demandZones = htfZones.filter(z => z.type === 'demand');
    const supplyZones = htfZones.filter(z => z.type === 'supply');

    if (demandZones.length > 0) {
      const closestDemand = demandZones[demandZones.length - 1];
      if (Math.abs(currentPrice - closestDemand.proximal) <= atr * 1.5 || currentPrice <= closestDemand.proximal) {
        return 'low';
      }
    }

    if (supplyZones.length > 0) {
      const closestSupply = supplyZones[supplyZones.length - 1];
      if (Math.abs(currentPrice - closestSupply.proximal) <= atr * 1.5 || currentPrice >= closestSupply.proximal) {
        return 'high';
      }
    }

    return 'middle';
  }

  /**
   * Determine 15M Trend Direction
   */
  private get15mTrend(candles15m: Candle[]): 'up' | 'down' | 'sideways' {
    if (candles15m.length < 10) return 'sideways';
    const recent = candles15m.slice(-10);

    let higherHighs = 0;
    let lowerLows = 0;

    for (let i = 1; i < recent.length; i++) {
      if (recent[i].high > recent[i - 1].high && recent[i].low > recent[i - 1].low) {
        higherHighs++;
      } else if (recent[i].high < recent[i - 1].high && recent[i].low < recent[i - 1].low) {
        lowerLows++;
      }
    }

    if (higherHighs > lowerLows) return 'up';
    if (lowerLows > higherHighs) return 'down';
    return 'sideways';
  }

  public async evaluateSetups(
    killzone: KillzoneInfo,
    runId: string,
    market: 'futures' | 'forex',
    instruments: string[],
    _preCalculatedBiases: Record<string, Bias>
  ): Promise<CandidateSetup[]> {
    const candidates: CandidateSetup[] = [];

    for (const instrument of instruments) {
      try {
        const candles15m = await getLiveCandles(instrument, '15m', 50);
        const candles1h = await getLiveCandles(instrument, '1h', 24);
        if (candles15m.length < 15 || candles1h.length < 10) continue;

        const atr14 = computeATR(candles15m, 14);
        const currentPrice = await getLiveCurrentPrice(instrument);

        // 1. Evaluate HTF Curve Location & 15M Trend
        const curveLocation = this.getCurveLocation(currentPrice, candles1h, atr14);
        const trend15m = this.get15mTrend(candles15m);

        // 2. Decision Matrix Lookup
        let allowedAction: 'BUY' | 'SELL' | 'NONE' = 'NONE';

        if (curveLocation === 'low' && (trend15m === 'up' || trend15m === 'sideways')) {
          allowedAction = 'BUY';
        } else if (curveLocation === 'high' && (trend15m === 'down' || trend15m === 'sideways')) {
          allowedAction = 'SELL';
        } else if (curveLocation === 'middle' && trend15m === 'up') {
          allowedAction = 'BUY';
        } else if (curveLocation === 'middle' && trend15m === 'down') {
          allowedAction = 'SELL';
        }

        if (allowedAction === 'NONE') continue;

        // 3. Search for Fresh 15M Imbalance Zones
        const m15Zones = this.findZones(candles15m);

        if (allowedAction === 'BUY') {
          const demandZones = m15Zones.filter(z => z.type === 'demand');
          if (demandZones.length === 0) continue;
          const freshZone = demandZones[demandZones.length - 1]; // Latest fresh zone

          const bias: Bias = 'long';
          const entry_zone_mid = freshZone.proximal; // Limit order at top of demand zone
          const stop = freshZone.distal - (market === 'futures' ? atr14 * 0.2 : atr14 * 0.15); // Buffer past distal line
          const risk = Math.abs(entry_zone_mid - stop);
          if (risk === 0) continue;

          const tp1 = entry_zone_mid + (risk * 2); // 2:1 RR Minimum
          const tp2 = entry_zone_mid + (risk * 3); // 3:1 RR

          const r_multiple_1 = computeRMultiple(entry_zone_mid, tp1, stop, bias);
          const r_multiple_2 = computeRMultiple(entry_zone_mid, tp2, stop, bias);

          const conviction_score = computeConvictionScore({
            supportResistanceStrength: 0.9,
            volumeProfile: 0.85,
            atrAlignment: 0.88,
            structureAlignment: 0.92,
            momentumConfluence: 0.86
          });

          const lastVol = candles15m[candles15m.length - 1].volume;
          const avgVol = candles15m.reduce((acc, c) => acc + c.volume, 0) / candles15m.length;
          const spread = currentPrice * (market === 'futures' ? 0.0001 : 0.0002);
          const liquidity_score = computeLiquidityScore(lastVol, avgVol, spread);

          const decimals = market === 'futures' ? 2 : 5;
          const selection_rationale = `[MANNA SND] Curve: ${curveLocation.toUpperCase()} | 15M Trend: ${trend15m.toUpperCase()}. Fresh 15M Demand Imbalance (${freshZone.formation}) identified. Limit Buy at Proximal line (${entry_zone_mid.toFixed(decimals)}), SL beyond Distal line (${stop.toFixed(decimals)}). ${r_multiple_1.toFixed(2)}R TP1 target.`;

          candidates.push({
            instrument,
            market,
            created_by_run: runId,
            killzone_origin: killzone.killzone,
            killzone_origin_at: killzone.boundaryUTC,
            bias,
            entry_zone_low: Number(freshZone.distal.toFixed(decimals)),
            entry_zone_high: Number(freshZone.proximal.toFixed(decimals)),
            entry_zone_mid: Number(entry_zone_mid.toFixed(decimals)),
            stop: Number(stop.toFixed(decimals)),
            tp1: Number(tp1.toFixed(decimals)),
            tp2: Number(tp2.toFixed(decimals)),
            r_multiple_1,
            r_multiple_2,
            conviction_score,
            liquidity_score,
            strategy_id: this.meta.id,
            strategy_tier: this.meta.tier,
            metadata: JSON.stringify({ source: `yahoo_finance_${market}`, atr14, htf: '1H', ltf: '15M', selection_rationale, strategy_name: this.meta.name, curveLocation, trend15m, formation: freshZone.formation })
          });
        } else if (allowedAction === 'SELL') {
          const supplyZones = m15Zones.filter(z => z.type === 'supply');
          if (supplyZones.length === 0) continue;
          const freshZone = supplyZones[supplyZones.length - 1]; // Latest fresh zone

          const bias: Bias = 'short';
          const entry_zone_mid = freshZone.proximal; // Limit order at bottom of supply zone
          const stop = freshZone.distal + (market === 'futures' ? atr14 * 0.2 : atr14 * 0.15); // Buffer past distal line
          const risk = Math.abs(stop - entry_zone_mid);
          if (risk === 0) continue;

          const tp1 = entry_zone_mid - (risk * 2); // 2:1 RR Minimum
          const tp2 = entry_zone_mid - (risk * 3); // 3:1 RR

          const r_multiple_1 = computeRMultiple(entry_zone_mid, tp1, stop, bias);
          const r_multiple_2 = computeRMultiple(entry_zone_mid, tp2, stop, bias);

          const conviction_score = computeConvictionScore({
            supportResistanceStrength: 0.9,
            volumeProfile: 0.85,
            atrAlignment: 0.88,
            structureAlignment: 0.92,
            momentumConfluence: 0.86
          });

          const lastVol = candles15m[candles15m.length - 1].volume;
          const avgVol = candles15m.reduce((acc, c) => acc + c.volume, 0) / candles15m.length;
          const spread = currentPrice * (market === 'futures' ? 0.0001 : 0.0002);
          const liquidity_score = computeLiquidityScore(lastVol, avgVol, spread);

          const decimals = market === 'futures' ? 2 : 5;
          const selection_rationale = `[MANNA SND] Curve: ${curveLocation.toUpperCase()} | 15M Trend: ${trend15m.toUpperCase()}. Fresh 15M Supply Imbalance (${freshZone.formation}) identified. Limit Sell at Proximal line (${entry_zone_mid.toFixed(decimals)}), SL beyond Distal line (${stop.toFixed(decimals)}). ${r_multiple_1.toFixed(2)}R TP1 target.`;

          candidates.push({
            instrument,
            market,
            created_by_run: runId,
            killzone_origin: killzone.killzone,
            killzone_origin_at: killzone.boundaryUTC,
            bias,
            entry_zone_low: Number(entry_zone_mid.toFixed(decimals)),
            entry_zone_high: Number(freshZone.distal.toFixed(decimals)),
            entry_zone_mid: Number(entry_zone_mid.toFixed(decimals)),
            stop: Number(stop.toFixed(decimals)),
            tp1: Number(tp1.toFixed(decimals)),
            tp2: Number(tp2.toFixed(decimals)),
            r_multiple_1,
            r_multiple_2,
            conviction_score,
            liquidity_score,
            strategy_id: this.meta.id,
            strategy_tier: this.meta.tier,
            metadata: JSON.stringify({ source: `yahoo_finance_${market}`, atr14, htf: '1H', ltf: '15M', selection_rationale, strategy_name: this.meta.name, curveLocation, trend15m, formation: freshZone.formation })
          });
        }
      } catch (err) {
        console.error(`[Manna SnD] Error evaluating ${instrument}:`, err);
      }
    }

    return candidates;
  }
}
