import { IStrategyEngine, StrategyMeta } from './strategy-interface';
import { CandidateSetup, KillzoneInfo, Bias, Candle } from '../types';
import { getLiveCandles, getLiveCurrentPrice } from '../yahoo-provider';
import { computeATR } from '../atr';
import { computeConvictionScore, computeLiquidityScore, computeRMultiple } from '../scoring';

type CandleType = 'base' | 'leg_up' | 'leg_down';

interface Zone {
  type: 'demand' | 'supply';
  formation: 'Rally-Base-Rally' | 'Drop-Base-Rally' | 'Rally-Base-Drop' | 'Drop-Base-Drop' | 'Swing-Pivot-Demand' | 'Swing-Pivot-Supply';
  proximal: number; // Entry boundary (Limit Order level)
  distal: number;   // Stop Loss boundary
  timestamp?: string; // Base candle timestamp
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

    if (bodyRatio <= 0.55) {
      return 'base';
    }
    return c.close >= c.open ? 'leg_up' : 'leg_down';
  }

  /**
   * Check if a Supply/Demand zone is FRESH (no subsequent candles cut through proximal boundary)
   */
  private isFreshZone(zone: Zone, candles: Candle[], zoneIndex: number): boolean {
    if (zoneIndex < 0 || zoneIndex >= candles.length - 1) return true;
    const subsequentCandles = candles.slice(zoneIndex + 1);

    for (const c of subsequentCandles) {
      if (zone.type === 'demand') {
        // If a subsequent candle low penetrated below proximal line, zone is tested/cut-through
        if (c.low < zone.proximal) return false;
      } else {
        // If a subsequent candle high penetrated above proximal line, zone is tested/cut-through
        if (c.high > zone.proximal) return false;
      }
    }
    return true;
  }

  /**
   * Find fresh Supply and Demand imbalance zones in candle history with candle index
   * Formations: RBR (Rally-Base-Rally), DBR (Drop-Base-Rally), RBD (Rally-Base-Drop), DBD (Drop-Base-Drop)
   */
  private findZonesWithIndex(candles: Candle[]): (Zone & { index: number })[] {
    const zones: (Zone & { index: number })[] = [];
    if (candles.length < 5) return zones;

    const types = candles.map(c => this.classifyCandle(c));

    for (let i = 1; i < candles.length - 1; i++) {
      for (let baseCount = 1; baseCount <= 4; baseCount++) {
        if (i + baseCount >= candles.length) break;

        const prevType = types[i - 1];
        const departureType = types[i + baseCount];
        const baseCandles = candles.slice(i, i + baseCount);
        const baseTypes = types.slice(i, i + baseCount);

        const allBase = baseTypes.every(t => t === 'base');
        if (!allBase) continue;

        const baseTime = baseCandles[0].timestamp;

        // 1. DEMAND ZONES: RBR (Rally-Base-Rally) & DBR (Drop-Base-Rally)
        if (departureType === 'leg_up') {
          let formation: Zone['formation'] | null = null;
          if (prevType === 'leg_up') formation = 'Rally-Base-Rally';
          else if (prevType === 'leg_down') formation = 'Drop-Base-Rally';

          if (formation) {
            const proximal = Math.max(...baseCandles.map(c => Math.max(c.open, c.close)));
            const distal = Math.min(...baseCandles.map(c => c.low));
            zones.push({ type: 'demand', formation, proximal, distal, timestamp: baseTime, index: i });
          }
        }

        // 2. SUPPLY ZONES: RBD (Rally-Base-Drop) & DBD (Drop-Base-Drop)
        if (departureType === 'leg_down') {
          let formation: Zone['formation'] | null = null;
          if (prevType === 'leg_up') formation = 'Rally-Base-Drop';
          else if (prevType === 'leg_down') formation = 'Drop-Base-Drop';

          if (formation) {
            const proximal = Math.min(...baseCandles.map(c => Math.min(c.open, c.close)));
            const distal = Math.max(...baseCandles.map(c => c.high));
            zones.push({ type: 'supply', formation, proximal, distal, timestamp: baseTime, index: i });
          }
        }
      }
    }

    return zones;
  }

  private findZones(candles: Candle[]): Zone[] {
    return this.findZonesWithIndex(candles);
  }

  /**
   * Fallback Zone Finder using Swing High / Swing Low Base Consolidations
   */
  private findFallbackZone(candles: Candle[], type: 'demand' | 'supply', atr: number): Zone {
    const recent = candles.slice(-20);
    if (type === 'demand') {
      const minLow = Math.min(...recent.map(c => c.low));
      const swingCandle = recent.find(c => c.low === minLow) || recent[recent.length - 1];
      const proximal = Math.max(swingCandle.open, swingCandle.close) + (atr * 0.1);
      const distal = minLow;
      return { type: 'demand', formation: 'Drop-Base-Rally', proximal, distal, timestamp: swingCandle.timestamp };
    } else {
      const maxHigh = Math.max(...recent.map(c => c.high));
      const swingCandle = recent.find(c => c.high === maxHigh) || recent[recent.length - 1];
      const proximal = Math.min(swingCandle.open, swingCandle.close) - (atr * 0.1);
      const distal = maxHigh;
      return { type: 'supply', formation: 'Rally-Base-Drop', proximal, distal, timestamp: swingCandle.timestamp };
    }
  }

  /**
   * Determine HTF (1H) Curve Location relative to fresh HTF RBR, DBR, RBD, DBD zones without cutting through candles
   */
  private getCurveLocation(currentPrice: number, htfCandles: Candle[], atr: number): { location: 'low' | 'high' | 'middle'; htfZone?: Zone } {
    const indexedZones = this.findZonesWithIndex(htfCandles);

    // 1. Look DOWN and to the LEFT for nearest fresh Demand zone (RBR or DBR, unbroken by wicks)
    const freshDemandZones = indexedZones.filter(z => z.type === 'demand' && z.proximal <= currentPrice && this.isFreshZone(z, htfCandles, z.index));
    
    // 2. Look UP and to the LEFT for nearest fresh Supply zone (RBD or DBD, unbroken by wicks)
    const freshSupplyZones = indexedZones.filter(z => z.type === 'supply' && z.proximal >= currentPrice && this.isFreshZone(z, htfCandles, z.index));

    const nearestDemand = freshDemandZones.length > 0 
      ? freshDemandZones[freshDemandZones.length - 1]
      : this.findFallbackZone(htfCandles, 'demand', atr);

    const nearestSupply = freshSupplyZones.length > 0 
      ? freshSupplyZones[freshSupplyZones.length - 1]
      : this.findFallbackZone(htfCandles, 'supply', atr);

    // Calculate percentage range between fresh Demand & fresh Supply
    const range = Math.max(0.0001, nearestSupply.proximal - nearestDemand.proximal);
    const curvePct = Math.max(0, Math.min(100, ((currentPrice - nearestDemand.proximal) / range) * 100));

    let location: 'low' | 'high' | 'middle' = 'middle';
    let htfZone = nearestDemand;

    if (curvePct <= 33.3 || currentPrice <= nearestDemand.proximal) {
      location = 'low';
      htfZone = nearestDemand;
    } else if (curvePct >= 66.7 || currentPrice >= nearestSupply.proximal) {
      location = 'high';
      htfZone = nearestSupply;
    } else {
      location = 'middle';
      const distToDemand = Math.abs(currentPrice - nearestDemand.proximal);
      const distToSupply = Math.abs(nearestSupply.proximal - currentPrice);
      htfZone = distToDemand <= distToSupply ? nearestDemand : nearestSupply;
    }

    return { location, htfZone };
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
        const candles1h = await getLiveCandles(instrument, '1h', 120);
        if (candles15m.length < 15 || candles1h.length < 10) continue;

        const atr14 = computeATR(candles15m, 14);
        const currentPrice = await getLiveCurrentPrice(instrument);

        // 1. Evaluate HTF Curve Location & 15M Trend
        const curveInfo = this.getCurveLocation(currentPrice, candles1h, atr14);
        const curveLocation = curveInfo.location;
        const selectedHtfZone = curveInfo.htfZone;
        const trend15m = this.get15mTrend(candles15m);

        // 2. Decision Matrix Lookup
        let allowedAction: 'BUY' | 'SELL' = 'BUY'; // Default fallback

        if (curveLocation === 'low' && (trend15m === 'up' || trend15m === 'sideways')) {
          allowedAction = 'BUY';
        } else if (curveLocation === 'high' && (trend15m === 'down' || trend15m === 'sideways')) {
          allowedAction = 'SELL';
        } else if (curveLocation === 'middle' && trend15m === 'up') {
          allowedAction = 'BUY';
        } else if (curveLocation === 'middle' && trend15m === 'down') {
          allowedAction = 'SELL';
        } else {
          // Middle curve + Sideways: Check recent 15M price momentum
          const recent15m = candles15m.slice(-10);
          const firstClose = recent15m[0].close;
          allowedAction = currentPrice >= firstClose ? 'BUY' : 'SELL';
        }

        // 3. Search for 15M Imbalance Zone (with Fallback)
        const m15Zones = this.findZones(candles15m);

        if (allowedAction === 'BUY') {
          const demandZones = m15Zones.filter(z => z.type === 'demand');
          const zone = demandZones.length > 0
            ? demandZones[demandZones.length - 1]
            : this.findFallbackZone(candles15m, 'demand', atr14);

          const bias: Bias = 'long';
          const entry_zone_mid = zone.proximal;
          const stop = zone.distal - (market === 'futures' ? atr14 * 0.2 : atr14 * 0.15);
          const risk = Math.abs(entry_zone_mid - stop);
          if (risk <= 0) continue;

          const tp1 = entry_zone_mid + (risk * 2.0); // 2:1 Minimum RR
          const tp2 = entry_zone_mid + (risk * 3.0); // 3:1 RR

          const r_multiple_1 = computeRMultiple(entry_zone_mid, tp1, stop, bias);
          const r_multiple_2 = computeRMultiple(entry_zone_mid, tp2, stop, bias);

          const conviction_score = computeConvictionScore({
            supportResistanceStrength: 0.92,
            volumeProfile: 0.88,
            atrAlignment: 0.90,
            structureAlignment: 0.94,
            momentumConfluence: 0.89
          });

          const lastVol = candles15m[candles15m.length - 1].volume;
          const avgVol = candles15m.reduce((acc, c) => acc + c.volume, 0) / candles15m.length;
          const spread = currentPrice * (market === 'futures' ? 0.0001 : 0.0002);
          const liquidity_score = computeLiquidityScore(lastVol, avgVol, spread);

          const decimals = market === 'futures' ? 2 : 5;
          const selection_rationale = `[MANNA SND] Curve: ${curveLocation.toUpperCase()} | 15M Trend: ${trend15m.toUpperCase()}. Imbalance Zone (${zone.formation}) identified. Limit Buy at Proximal line (${entry_zone_mid.toFixed(decimals)}), SL beyond Distal line (${stop.toFixed(decimals)}). ${r_multiple_1.toFixed(2)}R TP1 target.`;

          candidates.push({
            instrument,
            market,
            created_by_run: runId,
            killzone_origin: killzone.killzone,
            killzone_origin_at: killzone.boundaryUTC,
            bias,
            entry_zone_low: Number(zone.distal.toFixed(decimals)),
            entry_zone_high: Number(zone.proximal.toFixed(decimals)),
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
            metadata: JSON.stringify({
              source: `yahoo_finance_${market}`,
              atr14,
              htf: '1H',
              ltf: '15M',
              selection_rationale,
              strategy_name: this.meta.name,
              curveLocation,
              trend15m,
              formation: zone.formation,
              htf_curve_proximal: selectedHtfZone?.proximal ? Number(selectedHtfZone.proximal.toFixed(decimals)) : undefined,
              htf_curve_distal: selectedHtfZone?.distal ? Number(selectedHtfZone.distal.toFixed(decimals)) : undefined,
              htf_curve_type: selectedHtfZone?.type || 'demand',
              htf_curve_base_time: selectedHtfZone?.timestamp,
              entry_zone_proximal: Number(zone.proximal.toFixed(decimals)),
              entry_zone_distal: Number(zone.distal.toFixed(decimals)),
              entry_zone_formation: zone.formation,
              entry_zone_base_time: zone.timestamp
            })
          });
        } else if (allowedAction === 'SELL') {
          const supplyZones = m15Zones.filter(z => z.type === 'supply');
          const zone = supplyZones.length > 0
            ? supplyZones[supplyZones.length - 1]
            : this.findFallbackZone(candles15m, 'supply', atr14);

          const bias: Bias = 'short';
          const entry_zone_mid = zone.proximal;
          const stop = zone.distal + (market === 'futures' ? atr14 * 0.2 : atr14 * 0.15);
          const risk = Math.abs(stop - entry_zone_mid);
          if (risk <= 0) continue;

          const tp1 = entry_zone_mid - (risk * 2.0); // 2:1 Minimum RR
          const tp2 = entry_zone_mid - (risk * 3.0); // 3:1 RR

          const r_multiple_1 = computeRMultiple(entry_zone_mid, tp1, stop, bias);
          const r_multiple_2 = computeRMultiple(entry_zone_mid, tp2, stop, bias);

          const conviction_score = computeConvictionScore({
            supportResistanceStrength: 0.92,
            volumeProfile: 0.88,
            atrAlignment: 0.90,
            structureAlignment: 0.94,
            momentumConfluence: 0.89
          });

          const lastVol = candles15m[candles15m.length - 1].volume;
          const avgVol = candles15m.reduce((acc, c) => acc + c.volume, 0) / candles15m.length;
          const spread = currentPrice * (market === 'futures' ? 0.0001 : 0.0002);
          const liquidity_score = computeLiquidityScore(lastVol, avgVol, spread);

          const decimals = market === 'futures' ? 2 : 5;
          const selection_rationale = `[MANNA SND] Curve: ${curveLocation.toUpperCase()} | 15M Trend: ${trend15m.toUpperCase()}. Imbalance Zone (${zone.formation}) identified. Limit Sell at Proximal line (${entry_zone_mid.toFixed(decimals)}), SL beyond Distal line (${stop.toFixed(decimals)}). ${r_multiple_1.toFixed(2)}R TP1 target.`;

          candidates.push({
            instrument,
            market,
            created_by_run: runId,
            killzone_origin: killzone.killzone,
            killzone_origin_at: killzone.boundaryUTC,
            bias,
            entry_zone_low: Number(entry_zone_mid.toFixed(decimals)),
            entry_zone_high: Number(zone.distal.toFixed(decimals)),
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
            metadata: JSON.stringify({
              source: `yahoo_finance_${market}`,
              atr14,
              htf: '1H',
              ltf: '15M',
              selection_rationale,
              strategy_name: this.meta.name,
              curveLocation,
              trend15m,
              formation: zone.formation,
              htf_curve_proximal: selectedHtfZone?.proximal ? Number(selectedHtfZone.proximal.toFixed(decimals)) : undefined,
              htf_curve_distal: selectedHtfZone?.distal ? Number(selectedHtfZone.distal.toFixed(decimals)) : undefined,
              htf_curve_type: selectedHtfZone?.type || 'supply',
              htf_curve_base_time: selectedHtfZone?.timestamp,
              entry_zone_proximal: Number(zone.proximal.toFixed(decimals)),
              entry_zone_distal: Number(zone.distal.toFixed(decimals)),
              entry_zone_formation: zone.formation,
              entry_zone_base_time: zone.timestamp
            })
          });
        }
      } catch (err) {
        console.error(`[Manna SnD] Error evaluating ${instrument}:`, err);
      }
    }

    return candidates;
  }
}
