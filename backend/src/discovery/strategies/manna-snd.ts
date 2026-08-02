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

import { getLogicalStopDistance } from '../stop-loss-rules';

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
   * Fallback Zone Finder using Swing High / Swing Low Base Consolidations (30 candle lookback)
   * Anchors proximal/distal lines directly to the body and wick of the actual swing pivot base candle.
   */
  private findFallbackZone(candles: Candle[], type: 'demand' | 'supply', atr: number): Zone {
    if (!candles || candles.length === 0) {
      const lastPrice = 100;
      return type === 'demand'
        ? { type: 'demand', formation: 'Swing-Pivot-Demand', proximal: lastPrice - atr * 0.4, distal: lastPrice - atr * 0.7 }
        : { type: 'supply', formation: 'Swing-Pivot-Supply', proximal: lastPrice + atr * 0.4, distal: lastPrice + atr * 0.7 };
    }

    const recent = candles.slice(-30);
    const lastCandle = recent[recent.length - 1];

    if (type === 'demand') {
      // Find recent swing low base candle (lowest low)
      let pivotCandle = recent[0];
      for (const c of recent) {
        if (c.low < pivotCandle.low) {
          pivotCandle = c;
        }
      }
      // Proximal = body top (highest open/close) of the pivot base candle
      const proximal = Math.max(pivotCandle.open, pivotCandle.close);
      // Distal = lowest low wick of the pivot base candle
      const distal = pivotCandle.low;
      return {
        type: 'demand',
        formation: 'Swing-Pivot-Demand',
        proximal,
        distal: distal < proximal ? distal : proximal - (atr * 0.3),
        timestamp: pivotCandle.timestamp
      };
    } else {
      // Find recent swing high base candle (highest high)
      let pivotCandle = recent[0];
      for (const c of recent) {
        if (c.high > pivotCandle.high) {
          pivotCandle = c;
        }
      }
      // Proximal = body bottom (lowest open/close) of the pivot base candle
      const proximal = Math.min(pivotCandle.open, pivotCandle.close);
      // Distal = highest high wick of the pivot base candle
      const distal = pivotCandle.high;
      return {
        type: 'supply',
        formation: 'Swing-Pivot-Supply',
        proximal,
        distal: distal > proximal ? distal : proximal + (atr * 0.3),
        timestamp: pivotCandle.timestamp
      };
    }
  }

  /**
   * Determine HTF (1H) Curve Location relative to fresh HTF RBR, DBR, RBD, DBD zones without cutting through candles
   */
  private getCurveLocation(currentPrice: number, htfCandles: Candle[], atr: number): { location: 'low' | 'high' | 'middle'; htfZone?: Zone; htfDemand?: Zone; htfSupply?: Zone } {
    const indexedZones = this.findZonesWithIndex(htfCandles);

    // 1. Look DOWN and to the LEFT for nearest fresh Demand zone (highest proximal line below currentPrice)
    const freshDemandZones = indexedZones.filter(z => z.type === 'demand' && z.proximal <= currentPrice && this.isFreshZone(z, htfCandles, z.index));
    
    // 2. Look UP and to the LEFT for nearest fresh Supply zone (lowest proximal line above currentPrice)
    const freshSupplyZones = indexedZones.filter(z => z.type === 'supply' && z.proximal >= currentPrice && this.isFreshZone(z, htfCandles, z.index));

    const nearestDemand = freshDemandZones.length > 0 
      ? freshDemandZones.reduce((closest, z) => z.proximal > closest.proximal ? z : closest, freshDemandZones[0])
      : this.findFallbackZone(htfCandles, 'demand', atr);

    const nearestSupply = freshSupplyZones.length > 0 
      ? freshSupplyZones.reduce((closest, z) => z.proximal < closest.proximal ? z : closest, freshSupplyZones[0])
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

    return { location, htfZone, htfDemand: nearestDemand, htfSupply: nearestSupply };
  }

  /**
   * Determine 15M Trend Direction (30 candle lookback)
   */
  private get15mTrend(candles15m: Candle[]): 'up' | 'down' | 'sideways' {
    if (candles15m.length < 5) return 'sideways';
    const recent = candles15m.slice(-30);

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
        if (candles15m.length < 10 || candles1h.length < 10) continue;

        const atr14 = computeATR(candles15m, 14);
        const currentPrice = await getLiveCurrentPrice(instrument);

        // 1. Evaluate HTF Curve Location & 15M Trend
        const curveInfo = this.getCurveLocation(currentPrice, candles1h, atr14);
        const curveLocation = curveInfo.location;
        const selectedHtfZone = curveInfo.htfZone;
        const htfDemand = curveInfo.htfDemand;
        const htfSupply = curveInfo.htfSupply;
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
          const demandZones = m15Zones.filter(z => z.type === 'demand' && z.proximal < currentPrice && (currentPrice - z.proximal) <= atr14 * 5);
          const zone = demandZones.length > 0
            ? demandZones.reduce((closest, z) => z.proximal > closest.proximal ? z : closest, demandZones[0])
            : this.findFallbackZone(candles15m, 'demand', atr14);

          const bias: Bias = 'long';
          const entry_zone_mid = zone.proximal;
          const rawStop = zone.distal - (market === 'futures' ? atr14 * 0.4 : atr14 * 0.25);
          const rawRisk = Math.abs(entry_zone_mid - rawStop);
          const risk = getLogicalStopDistance(instrument, atr14, rawRisk, market);
          const stop = entry_zone_mid - risk;
          if (risk <= 0) continue;

          const tp1 = entry_zone_mid + (risk * 2.0); // 2:1 Minimum RR
          const tp2 = entry_zone_mid + (risk * 3.0); // 3:1 RR

          // Discard setup if current market price has breached Stop Loss or is excessively displaced (> 6x ATR)
          if (currentPrice <= stop || (currentPrice - entry_zone_mid) > (atr14 * 6)) continue;

          const r_multiple_1 = computeRMultiple(entry_zone_mid, tp1, stop, bias);
          const r_multiple_2 = computeRMultiple(entry_zone_mid, tp2, stop, bias);

          const supportResistanceStrength = curveLocation === 'low' ? 0.96 : curveLocation === 'middle' ? 0.85 : 0.70;
          const structureAlignment = trend15m === 'up' ? 0.95 : trend15m === 'sideways' ? 0.86 : 0.72;
          const lastVol = candles15m[candles15m.length - 1].volume;
          const avgVol = candles15m.reduce((acc, c) => acc + c.volume, 0) / candles15m.length;
          const volumeProfile = avgVol > 0 ? Math.min(0.98, Math.max(0.65, lastVol / avgVol)) : 0.85;
          const zoneWidth = Math.abs(zone.proximal - zone.distal);
          const atrAlignment = atr14 > 0 ? Math.min(0.98, Math.max(0.70, 0.92 - Math.abs((zoneWidth / atr14) - 0.5) * 0.3)) : 0.88;

          // 6 New Institutional Factors
          const now = new Date();
          const hourET = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false }).format(now), 10);
          const killzoneTiming = computeKillzoneTimingScore(hourET);
          const multiTimeframeAlignment = computeMultiTimeframeScore(candles1h, candles15m, bias);
          const liquidityPoolMagnet = computeLiquidityMagnetScore(candles15m, tp1, bias);
          const fvgDisbalance = computeFVGScore(candles15m, bias);
          const relativeStrength = computeRelativeStrengthScore(candles15m, bias);
          const newsProximityModifier = computeNewsProximityModifier(now);

          const conviction_score = computeConvictionScore({
            supportResistanceStrength,
            structureAlignment,
            volumeProfile,
            killzoneTiming,
            multiTimeframeAlignment,
            liquidityPoolMagnet,
            fvgDisbalance,
            relativeStrength,
            atrAlignment,
            newsProximityModifier
          });

          const spread = currentPrice * (market === 'futures' ? 0.0001 : 0.0002);
          const liquidity_score = computeLiquidityScore(lastVol, avgVol, spread);

          const decimals = market === 'futures' ? 2 : 5;
          const ez_mid = Number(zone.proximal.toFixed(decimals));
          const ez_low = Number(zone.distal.toFixed(decimals));
          const ez_high = Number(zone.proximal.toFixed(decimals));

          // Discard setup if current market price has breached Stop Loss, is inside/below entry zone, or is excessively displaced
          if (currentPrice <= stop || currentPrice <= ez_high || (currentPrice - ez_high) > (atr14 * 6)) continue;

          const selection_rationale = `[MANNA SND] Curve: ${curveLocation.toUpperCase()} | 15M Trend: ${trend15m.toUpperCase()}. Imbalance Zone (${zone.formation}) identified. Limit Buy at Proximal line (${entry_zone_mid.toFixed(decimals)}), SL beyond Distal line (${stop.toFixed(decimals)}). ${r_multiple_1.toFixed(2)}R TP1 target.`;

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
              htf_demand_proximal: htfDemand?.proximal ? Number(htfDemand.proximal.toFixed(decimals)) : undefined,
              htf_demand_distal: htfDemand?.distal ? Number(htfDemand.distal.toFixed(decimals)) : undefined,
              htf_demand_formation: htfDemand?.formation,
              htf_demand_base_time: htfDemand?.timestamp,
              htf_supply_proximal: htfSupply?.proximal ? Number(htfSupply.proximal.toFixed(decimals)) : undefined,
              htf_supply_distal: htfSupply?.distal ? Number(htfSupply.distal.toFixed(decimals)) : undefined,
              htf_supply_formation: htfSupply?.formation,
              htf_supply_base_time: htfSupply?.timestamp,
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
          const supplyZones = m15Zones.filter(z => z.type === 'supply' && z.proximal > currentPrice && (z.proximal - currentPrice) <= atr14 * 5);
          const zone = supplyZones.length > 0
            ? supplyZones.reduce((closest, z) => z.proximal < closest.proximal ? z : closest, supplyZones[0])
            : this.findFallbackZone(candles15m, 'supply', atr14);

          const bias: Bias = 'short';
          const entry_zone_mid = zone.proximal;
          const rawStop = zone.distal + (market === 'futures' ? atr14 * 0.4 : atr14 * 0.25);
          const rawRisk = Math.abs(rawStop - entry_zone_mid);
          const risk = getLogicalStopDistance(instrument, atr14, rawRisk, market);
          const stop = entry_zone_mid + risk;
          if (risk <= 0) continue;

          const tp1 = entry_zone_mid - (risk * 2.0); // 2:1 Minimum RR
          const tp2 = entry_zone_mid - (risk * 3.0); // 3:1 RR

          const r_multiple_1 = computeRMultiple(entry_zone_mid, tp1, stop, bias);
          const r_multiple_2 = computeRMultiple(entry_zone_mid, tp2, stop, bias);

          const supportResistanceStrength = curveLocation === 'high' ? 0.96 : curveLocation === 'middle' ? 0.85 : 0.70;
          const structureAlignment = trend15m === 'down' ? 0.95 : trend15m === 'sideways' ? 0.86 : 0.72;
          const lastVol = candles15m[candles15m.length - 1].volume;
          const avgVol = candles15m.reduce((acc, c) => acc + c.volume, 0) / candles15m.length;
          const volumeProfile = avgVol > 0 ? Math.min(0.98, Math.max(0.65, lastVol / avgVol)) : 0.85;
          const zoneWidth = Math.abs(zone.proximal - zone.distal);
          const atrAlignment = atr14 > 0 ? Math.min(0.98, Math.max(0.70, 0.92 - Math.abs((zoneWidth / atr14) - 0.5) * 0.3)) : 0.88;

          // 6 New Institutional Factors
          const now = new Date();
          const hourET = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false }).format(now), 10);
          const killzoneTiming = computeKillzoneTimingScore(hourET);
          const multiTimeframeAlignment = computeMultiTimeframeScore(candles1h, candles15m, bias);
          const liquidityPoolMagnet = computeLiquidityMagnetScore(candles15m, tp1, bias);
          const fvgDisbalance = computeFVGScore(candles15m, bias);
          const relativeStrength = computeRelativeStrengthScore(candles15m, bias);
          const newsProximityModifier = computeNewsProximityModifier(now);

          const conviction_score = computeConvictionScore({
            supportResistanceStrength,
            structureAlignment,
            volumeProfile,
            killzoneTiming,
            multiTimeframeAlignment,
            liquidityPoolMagnet,
            fvgDisbalance,
            relativeStrength,
            atrAlignment,
            newsProximityModifier
          });

          const spread = currentPrice * (market === 'futures' ? 0.0001 : 0.0002);
          const liquidity_score = computeLiquidityScore(lastVol, avgVol, spread);

          const decimals = market === 'futures' ? 2 : 5;
          const ez_mid = Number(zone.proximal.toFixed(decimals));
          // For a SUPPLY zone: proximal = bottom of the zone (limit sell entry), distal = top (above proximal, zone ceiling/stop boundary)
          const ez_low = Number(zone.proximal.toFixed(decimals));  // proximal = entry lower boundary
          const ez_high = Number(zone.distal.toFixed(decimals));   // distal = zone top (above entry, near stop)

          // Discard setup if current market price has breached Stop Loss, is inside/above supply zone, or is excessively displaced
          if (currentPrice >= stop || currentPrice >= ez_low || (ez_low - currentPrice) > (atr14 * 6)) continue;

          const selection_rationale = `[MANNA SND] Curve: ${curveLocation.toUpperCase()} | 15M Trend: ${trend15m.toUpperCase()}. Imbalance Zone (${zone.formation}) identified. Limit Sell at Proximal line (${entry_zone_mid.toFixed(decimals)}), SL beyond Distal line (${stop.toFixed(decimals)}). ${r_multiple_1.toFixed(2)}R TP1 target.`;

          candidates.push({
            instrument,
            market,
            created_by_run: runId,
            killzone_origin: killzone.killzone,
            killzone_origin_at: killzone.boundaryUTC,
            bias,
            entry_zone_low: ez_low,   // proximal: limit sell boundary (lower edge of supply zone)
            entry_zone_high: ez_high, // distal: upper edge of supply zone (stop reference)
            entry_zone_mid: ez_mid,
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
              htf_demand_proximal: htfDemand?.proximal ? Number(htfDemand.proximal.toFixed(decimals)) : undefined,
              htf_demand_distal: htfDemand?.distal ? Number(htfDemand.distal.toFixed(decimals)) : undefined,
              htf_demand_formation: htfDemand?.formation,
              htf_demand_base_time: htfDemand?.timestamp,
              htf_supply_proximal: htfSupply?.proximal ? Number(htfSupply.proximal.toFixed(decimals)) : undefined,
              htf_supply_distal: htfSupply?.distal ? Number(htfSupply.distal.toFixed(decimals)) : undefined,
              htf_supply_formation: htfSupply?.formation,
              htf_supply_base_time: htfSupply?.timestamp,
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
