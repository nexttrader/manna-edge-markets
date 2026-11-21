import { IStrategyEngine, StrategyMeta } from './strategy-interface';
import { CandidateSetup, KillzoneInfo, Bias, Candle } from '../types';
import { aggregateToFourHourCandles, getLiveCandles, getLiveCurrentPrice } from '../yahoo-provider';
import { computeATR } from '../atr';
import { 
  computeMannaSndConvictionScore,
  computeLiquidityScore, 
  computeRMultiple
} from '../scoring';

import { getInstrumentDecimals, getLogicalStopDistance, getTimeframeStopDistance } from '../stop-loss-rules';
import { getInstrumentSpread } from '../spread-helper';
import * as queries from '../../db/queries';

export interface MannaSndTimeframeConfig {
  htf: '15m' | '1h' | '4h' | '1d';
  ltf: '5m' | '15m' | '1h' | '4h';
  htfLabel?: string;
  ltfLabel?: string;
  strategyId?: string;
  tradingStyle?: 'SCALP' | 'INTRADAY' | 'SWING';
  sourceTag?: string;
  candleFetcher?: (instrument: string, tf: '1m' | '5m' | '15m' | '1h' | '4h' | '1d', count: number) => Promise<Candle[]>;
  priceFetcher?: (instrument: string) => Promise<number>;
}

type CandleType = 'base' | 'leg_up' | 'leg_down';

interface Zone {
  type: 'demand' | 'supply';
  formation: 'Rally-Base-Rally' | 'Drop-Base-Rally' | 'Rally-Base-Drop' | 'Drop-Base-Drop' | 'Swing-Pivot-Demand' | 'Swing-Pivot-Supply';
  proximal: number; // Entry boundary (Limit Order level)
  distal: number;   // Stop Loss boundary
  bodyProximal?: number; // Body proximal level preserved for diagnostics when wick proximal is used
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
   * Check if a Supply/Demand zone is FRESH.
   * A zone is marked as used only if subsequent price has penetrated deeper than 50% into the zone depth.
   */
  private isFreshZone(zone: Zone, candles: Candle[], zoneIndex: number): boolean {
    if (zoneIndex < 0 || zoneIndex >= candles.length - 1) return true;
    const subsequentCandles = candles.slice(zoneIndex + 1);
    const depth = Math.abs(zone.proximal - zone.distal);

    for (const c of subsequentCandles) {
      if (zone.type === 'demand') {
        // Demand: marked used only if subsequent low penetrated deeper than 50% of zone depth
        const fiftyPctLevel = zone.proximal - (0.5 * depth);
        if (c.low < fiftyPctLevel) return false;
      } else {
        // Supply: marked used only if subsequent high penetrated deeper than 50% of zone depth
        const fiftyPctLevel = zone.proximal + (0.5 * depth);
        if (c.high > fiftyPctLevel) return false;
      }
    }
    return true;
  }

  /**
   * Find fresh Supply and Demand imbalance zones in candle history with candle index.
   * Formations: RBR (Rally-Base-Rally), DBR (Drop-Base-Rally), RBD (Rally-Base-Drop), DBD (Drop-Base-Drop).
   * Imbalance rule: Leg-Out departure (single candle or consecutive series of same-colour candles) > 1.0x Base Range.
   */
  private findZonesWithIndex(
    candles: Candle[],
    minDepartureAtrMultiple: number = 0,
    atr: number = 0,
    proximalMode: 'body' | 'wick' = 'body'
  ): (Zone & { index: number })[] {
    const zones: (Zone & { index: number })[] = [];
    if (candles.length < 5) return zones;

    const types = candles.map(c => this.classifyCandle(c));

    for (let i = 1; i < candles.length - 1; i++) {
      for (let baseCount = 1; baseCount <= 4; baseCount++) {
        if (i + baseCount >= candles.length) break;

        const prevType = types[i - 1];
        const baseCandles = candles.slice(i, i + baseCount);
        const baseTypes = types.slice(i, i + baseCount);

        const allBase = baseTypes.every(t => t === 'base');
        if (!allBase) continue;

        const baseHigh = Math.max(...baseCandles.map(c => c.high));
        const baseLow  = Math.min(...baseCandles.map(c => c.low));
        const baseRange = baseHigh - baseLow;
        if (baseRange <= 0) continue;

        const depStartIndex = i + baseCount;
        const firstDepCandle = candles[depStartIndex];
        const baseTime = baseCandles[0].timestamp;

        // 1. DEMAND ZONES: RBR (Rally-Base-Rally) & DBR (Drop-Base-Rally)
        // Leg-out is bullish: first departure candle is green (close > open)
        if (firstDepCandle.close > firstDepCandle.open) {
          const legoutCandles: Candle[] = [];
          for (let j = depStartIndex; j < candles.length; j++) {
            if (candles[j].close >= candles[j].open) {
              legoutCandles.push(candles[j]);
            } else {
              break;
            }
          }
          if (legoutCandles.length === 0) continue;
          const legoutHigh = Math.max(...legoutCandles.map(c => c.high));
          const legoutGain = legoutHigh - baseHigh;

          // Institutional Imbalance: Leg-Out expansion must be > 1.0x Base Range
          if (legoutGain > 1.0 * baseRange) {
            let formation: Zone['formation'] | null = null;
            if (prevType === 'leg_up') formation = 'Rally-Base-Rally';
            else if (prevType === 'leg_down') formation = 'Drop-Base-Rally';

            if (formation) {
              const bodyProximal = Math.max(...baseCandles.map(c => Math.max(c.open, c.close)));
              const proximal = proximalMode === 'wick' ? baseHigh : bodyProximal;
              const distal = baseLow;
              zones.push({
                type: 'demand',
                formation,
                proximal,
                distal,
                bodyProximal,
                timestamp: baseTime,
                index: i + baseCount
              });
            }
          }
        }

        // 2. SUPPLY ZONES: RBD (Rally-Base-Drop) & DBD (Drop-Base-Drop)
        // Leg-out is bearish: first departure candle is red (close < open)
        else if (firstDepCandle.close < firstDepCandle.open) {
          const legoutCandles: Candle[] = [];
          for (let j = depStartIndex; j < candles.length; j++) {
            if (candles[j].close <= candles[j].open) {
              legoutCandles.push(candles[j]);
            } else {
              break;
            }
          }
          if (legoutCandles.length === 0) continue;
          const legoutLow = Math.min(...legoutCandles.map(c => c.low));
          const legoutDrop = baseLow - legoutLow;

          // Institutional Imbalance: Leg-Out expansion must be > 1.0x Base Range
          if (legoutDrop > 1.0 * baseRange) {
            let formation: Zone['formation'] | null = null;
            if (prevType === 'leg_up') formation = 'Rally-Base-Drop';
            else if (prevType === 'leg_down') formation = 'Drop-Base-Drop';

            if (formation) {
              const bodyProximal = Math.min(...baseCandles.map(c => Math.min(c.open, c.close)));
              const proximal = proximalMode === 'wick' ? baseLow : bodyProximal;
              const distal = baseHigh;
              zones.push({
                type: 'supply',
                formation,
                proximal,
                distal,
                bodyProximal,
                timestamp: baseTime,
                index: i + baseCount
              });
            }
          }
        }
      }
    }

    return zones;
  }

  /**
   * Computes stop, TP1/TP2 (2R/3R), rounded boundaries, and TP1 progress fraction for a candidate zone.
   */
  private buildSetupLevels(params: {
    zone: Zone;
    isLong: boolean;
    instrument: string;
    market: 'futures' | 'forex';
    atr14: number;
    levelTf: '5m' | '15m' | '1h' | '4h';
    isHalvedFloor: boolean;
    isParameterized: boolean;
    currentPrice: number;
    spreadPad?: number;
  }) {
    const {
      zone,
      isLong,
      instrument,
      market,
      atr14,
      levelTf,
      isHalvedFloor,
      isParameterized,
      currentPrice,
      spreadPad = 0,
    } = params;

    const entry_zone_mid = zone.proximal + (isLong ? spreadPad : 0);
    const isJpy = instrument.includes('JPY');
    const distalBuffer = market === 'futures' ? (atr14 * 0.4) : isJpy ? (atr14 * 0.40 + 0.03) : (atr14 * 0.25);
    const rawStop = isLong ? zone.distal - distalBuffer : zone.distal + distalBuffer;
    const rawRisk = Math.abs(isLong ? entry_zone_mid - rawStop : rawStop - entry_zone_mid);
    const risk = levelTf === '15m'
      ? getLogicalStopDistance(instrument, atr14, rawRisk, market, isHalvedFloor)
      : getTimeframeStopDistance(instrument, atr14, rawRisk, market, levelTf);
    const stop = isLong ? entry_zone_mid - risk : entry_zone_mid + risk;
    if (risk <= 0) return null;

    // Derive TPs from rounded stop/entry so displayed TP1/TP2 strictly match 2R/3R
    const decimals = isParameterized
      ? getInstrumentDecimals(instrument, market)
      : (market === 'futures' ? 2 : 5);
    const roundedEntry = Number(entry_zone_mid.toFixed(decimals));
    const roundedStop = Number(stop.toFixed(decimals));
    const publishedRisk = Math.abs(roundedEntry - roundedStop);
    if (isParameterized && publishedRisk <= 0) return null;

    const tp1 = isLong ? roundedEntry + (publishedRisk * 2.0) : roundedEntry - (publishedRisk * 2.0);
    const tp2 = isLong ? roundedEntry + (publishedRisk * 3.0) : roundedEntry - (publishedRisk * 3.0);
    const roundedTp1 = Number(tp1.toFixed(decimals));
    const roundedTp2 = Number(tp2.toFixed(decimals));

    const ez_mid = roundedEntry;
    const ez_low = isLong ? Number(zone.distal.toFixed(decimals)) : roundedEntry;
    const ez_high = isLong ? roundedEntry : Number(zone.distal.toFixed(decimals));

    const distToTp1 = isLong ? (roundedTp1 - roundedEntry) : (roundedEntry - roundedTp1);
    const progressToTp1 = distToTp1 > 0
      ? (isLong ? (currentPrice - roundedEntry) / distToTp1 : (roundedEntry - currentPrice) / distToTp1)
      : 0;

    return {
      zone,
      entry_zone_mid,
      stop,
      tp1,
      tp2,
      decimals,
      roundedEntry,
      roundedStop,
      roundedTp1,
      roundedTp2,
      ez_mid,
      ez_low,
      ez_high,
      progressToTp1,
    };
  }

  private findZones(candles: Candle[], minDepartureAtrMultiple: number = 0, atr: number = 0): Zone[] {
    return this.findZonesWithIndex(candles, minDepartureAtrMultiple, atr);
  }

  /**
   * Fallback Zone Finder enforcing strict 3-candle Leg-In -> Base -> Leg-Out formations
   */
  private findFallbackZone(candles: Candle[], type: 'demand' | 'supply', atr: number): Zone {
    if (!candles || candles.length < 3) {
      const lastPrice = 100;
      return type === 'demand'
        ? { type: 'demand', formation: 'Drop-Base-Rally', proximal: lastPrice - atr * 0.4, distal: lastPrice - atr * 0.7 }
        : { type: 'supply', formation: 'Rally-Base-Drop', proximal: lastPrice + atr * 0.4, distal: lastPrice + atr * 0.7 };
    }

    const currentPrice = candles[candles.length - 1].close;

    // 1. Scan for any historical fresh 3-candle Leg-In -> Base -> Leg-Out zones on the correct side of price
    const allZones = this.findZonesWithIndex(candles).filter(z => {
      if (z.type !== type) return false;
      if (type === 'demand' ? z.proximal > currentPrice : z.proximal < currentPrice) return false;
      return this.isFreshZone(z, candles, z.index);
    });

    if (allZones.length > 0) {
      const closest = type === 'demand'
        ? allZones.reduce((best, z) => z.proximal > best.proximal ? z : best, allZones[0])
        : allZones.reduce((best, z) => z.proximal < best.proximal ? z : best, allZones[0]);

      return {
        type: closest.type,
        formation: closest.formation,
        proximal: closest.proximal,
        distal: closest.distal,
        timestamp: closest.timestamp
      };
    }

    // 2. Construct explicit Leg-In -> Base -> Leg-Out zone around unmitigated swing extreme
    if (type === 'demand') {
      for (let i = candles.length - 2; i >= 1; i--) {
        const c = candles[i];
        if (c.low <= currentPrice) {
          const proximal = Math.max(c.open, c.close);
          const subsequent = candles.slice(i + 1);
          // Verify no subsequent candle cut through the proximal line
          const cutThrough = subsequent.some(sub => sub.low < proximal);
          if (!cutThrough) {
            const distal = c.low;
            const legIn = candles[i - 1];
            const isLegInDrop = legIn.close <= legIn.open;
            return {
              type: 'demand',
              formation: isLegInDrop ? 'Drop-Base-Rally' : 'Rally-Base-Rally',
              proximal,
              distal: distal < proximal ? distal : proximal - (atr * 0.3),
              timestamp: c.timestamp
            };
          }
        }
      }
      const lowest = candles.reduce((min, c) => c.low < min.low ? c : min, candles[0]);
      const prox = Math.min(currentPrice * 0.998, Math.max(lowest.open, lowest.close));
      return {
        type: 'demand',
        formation: 'Drop-Base-Rally',
        proximal: prox,
        distal: Math.min(prox - (atr * 0.5), lowest.low),
        timestamp: lowest.timestamp
      };
    } else {
      // Supply: Find nearest unmitigated high ABOVE current price (Rally-Base-Drop preference)
      for (let i = candles.length - 2; i >= 1; i--) {
        const c = candles[i];
        const proximal = Math.min(c.open, c.close);
        if (proximal >= currentPrice) {
          const subsequent = candles.slice(i + 1);
          const cutThrough = subsequent.some(sub => sub.high > proximal);
          if (!cutThrough) {
            const distal = c.high;
            return {
              type: 'supply',
              formation: 'Rally-Base-Drop',
              proximal,
              distal: distal > proximal ? distal : proximal + (atr * 0.3),
              timestamp: c.timestamp
            };
          }
        }
      }
      // Fallback above current price
      const highest = candles.reduce((max, c) => c.high > max.high ? c : max, candles[0]);
      const prox = Math.max(currentPrice * 1.002, Math.min(highest.open, highest.close));
      return {
        type: 'supply',
        formation: 'Rally-Base-Drop',
        proximal: prox,
        distal: Math.max(prox + atr * 0.5, highest.high),
        timestamp: highest.timestamp
      };
    }
  }

  /**
   * Check if a Drop-Base-Drop (DBD) supply zone has broken through an opposing
   * demand zone (RBR or DBR) situated to its left (prior to the DBD).
   */
  private hasBrokenOpposingDemand(
    supplyZone: Zone & { index: number },
    candles: Candle[],
    allZones: (Zone & { index: number })[]
  ): boolean {
    const opposingDemandZones = allZones.filter(z =>
      z.type === 'demand' &&
      (z.formation === 'Rally-Base-Rally' || z.formation === 'Drop-Base-Rally') &&
      z.index < supplyZone.index &&
      z.proximal < supplyZone.proximal
    );

    if (opposingDemandZones.length === 0) return false;

    for (const demandZone of opposingDemandZones) {
      // 1. Verify opposing demand was intact before this DBD formed
      const candlesBeforeDbd = candles.slice(demandZone.index + 1, supplyZone.index);
      const brokenBefore = candlesBeforeDbd.some(c => c.close < demandZone.proximal || c.low < demandZone.distal);
      if (brokenBefore) continue;

      // 2. Verify the DBD departure / subsequent move broke through the opposing demand
      const candlesAfterDbd = candles.slice(supplyZone.index);
      const brokeThrough = candlesAfterDbd.some(c => c.close < demandZone.proximal || c.low < demandZone.distal);
      if (brokeThrough) {
        return true;
      }
    }

    return false;
  }

  /**
   * Determine HTF (1H) Curve Location relative to fresh HTF RBR, DBR, RBD, DBD zones without cutting through candles
   */
  private getCurveLocation(currentPrice: number, htfCandles: Candle[], atr: number): { location: 'low' | 'high' | 'middle'; htfZone: Zone; htfDemand: Zone; htfSupply: Zone } {
    const indexedZones = this.findZonesWithIndex(htfCandles);

    // 1. Look DOWN and to the LEFT for nearest fresh Demand zone (highest proximal line below currentPrice)
    const freshDemandZones = indexedZones.filter(z => z.type === 'demand' && z.proximal <= currentPrice && this.isFreshZone(z, htfCandles, z.index));
    
    // 2. Look UP and to the LEFT for nearest fresh Supply zone (lowest proximal line above currentPrice without candle cut-throughs)
    // - RBD (Rally-Base-Drop) rules remain intact as reversal origins
    // - DBD (Drop-Base-Drop) is allowed ONLY if it broke through an opposing RBR or DBR demand zone to its left
    const freshSupplyZones = indexedZones.filter(z => {
      if (z.type !== 'supply' || z.proximal < currentPrice) return false;
      if (!this.isFreshZone(z, htfCandles, z.index)) return false;

      // Keep RBD rules intact: RBD is always valid as an institutional swing reversal origin
      if (z.formation === 'Rally-Base-Drop') return true;

      // Allow DBD only if it has broken through an opposing RBR or DBR on the left
      if (z.formation === 'Drop-Base-Drop') {
        return this.hasBrokenOpposingDemand(z, htfCandles, indexedZones);
      }

      return false;
    });

    const nearestDemand = freshDemandZones.length > 0 
      ? freshDemandZones.reduce((closest, z) => z.proximal > closest.proximal ? z : closest, freshDemandZones[0])
      : this.findFallbackZone(htfCandles, 'demand', atr);

    const nearestSupply = freshSupplyZones.length > 0 
      ? freshSupplyZones.sort((a, b) => a.proximal - b.proximal)[0]
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
    preCalculatedBiases: Record<string, Bias>
  ): Promise<CandidateSetup[]> {
    return this.evaluateSetupsForTimeframes(killzone, runId, market, instruments, preCalculatedBiases);
  }

  public async evaluateSetupsForTimeframes(
    killzone: KillzoneInfo,
    runId: string,
    market: 'futures' | 'forex',
    instruments: string[],
    preCalculatedBiases: Record<string, Bias>,
    tfConfig?: MannaSndTimeframeConfig
  ): Promise<CandidateSetup[]> {
    const candidates: CandidateSetup[] = [];
    const isHalvedFloor = await queries.isHalvedFloorTp1BeEnabled('manna_snd');

    const isParameterized = Boolean(tfConfig);
    const htf = tfConfig?.htf || '1h';
    const ltf = tfConfig?.ltf || '15m';
    const htfLabel = (tfConfig?.htfLabel || htf).toUpperCase();
    const ltfLabel = (tfConfig?.ltfLabel || ltf).toUpperCase();
    const strategyId = tfConfig?.strategyId || this.meta.id;
    const fetchCandles = tfConfig?.candleFetcher || getLiveCandles;
    const fetchPrice = tfConfig?.priceFetcher || getLiveCurrentPrice;
    const minCandles = isParameterized ? 15 : 10;

    for (const instrument of instruments) {
      try {
        // Session-Specific Asset Alignment:
        // Exclude USD/CAD during London open (02:00-05:00 EST / 06:00-09:00 UTC)
        // Canadian and US interbank desks are offline, generating 0% WR illiquid chop in London.
        if (market === 'forex' && (killzone.killzone || '').toLowerCase().includes('london') && instrument === 'USD/CAD') {
          continue;
        }

        const rawLtf = await fetchCandles(instrument, ltf, ltf === '4h' ? 120 : 50);
        const rawHtf = await fetchCandles(instrument, htf, 120);
        const candlesLtf = (ltf === '4h' ? aggregateToFourHourCandles(rawLtf) : rawLtf).slice(-50);
        const candlesHtf = (htf === '4h' ? aggregateToFourHourCandles(rawHtf) : rawHtf).slice(-120);
        if (candlesLtf.length < minCandles || candlesHtf.length < minCandles) continue;

        const atr14 = computeATR(candlesLtf, 14);
        if (isParameterized && (!atr14 || atr14 <= 0)) continue;

        const currentPrice = tfConfig?.priceFetcher
          ? await tfConfig.priceFetcher(instrument)
          : await getLiveCurrentPrice(instrument, true);
        if (!currentPrice || currentPrice <= 0) continue;

        // 1. Evaluate HTF Curve Location & LTF Trend
        const curveInfo = this.getCurveLocation(currentPrice, candlesHtf, atr14);
        const curveLocation = curveInfo.location;
        const selectedHtfZone = curveInfo.htfZone;
        const htfDemand = curveInfo.htfDemand;
        const htfSupply = curveInfo.htfSupply;
        const trendLtf = this.get15mTrend(candlesLtf);

        // Enforce: Current Price & LTF Trend MUST be strictly inside the HTF Curve Channel
        if (currentPrice < htfDemand.distal || currentPrice > htfSupply.distal) {
          continue;
        }

        // 2. Decision Matrix Lookup (with Precalculated / Forced Direction support)
        let allowedAction: 'BUY' | 'SELL';

        if (preCalculatedBiases && preCalculatedBiases[instrument]) {
          allowedAction = preCalculatedBiases[instrument] === 'long' ? 'BUY' : 'SELL';
        } else if (curveLocation === 'low' && (trendLtf === 'up' || trendLtf === 'sideways')) {
          allowedAction = 'BUY';
        } else if (curveLocation === 'high' && (trendLtf === 'down' || trendLtf === 'sideways')) {
          allowedAction = 'SELL';
        } else if (curveLocation === 'middle' && trendLtf === 'up') {
          allowedAction = 'BUY';
        } else if (curveLocation === 'middle' && trendLtf === 'down') {
          allowedAction = 'SELL';
        } else {
          // Middle curve + Sideways: Check recent LTF price momentum
          const recentLtf = candlesLtf.slice(-10);
          const firstClose = recentLtf[0].close;
          allowedAction = currentPrice >= firstClose ? 'BUY' : 'SELL';
        }

        // 3. Search for LTF Imbalance Zone (STRICTLY BETWEEN HTF DEMAND & HTF SUPPLY CURVES)
        // Enforce institutional imbalance: Leg-Out departure > 1.0x Base Range
        const ltfZones = this.findZonesWithIndex(candlesLtf);
        const isLong = allowedAction === 'BUY';

        // Verified Scalping Rule 2: 5M LTF trend must strictly agree with signal bias
        // (eliminates sideways / counter-5M-trend whipsaws without impacting Intraday or Swing)
        if (tfConfig?.tradingStyle === 'SCALP') {
          const ltfTrendAgrees = isLong ? trendLtf === 'up' : trendLtf === 'down';
          if (!ltfTrendAgrees) continue;
        }

        let selectedZone: Zone | null = null;
        if (isLong) {
          // LTF Entry Zone MUST sit strictly BETWEEN HTF Demand distal and HTF Supply proximal boundaries
          // and MUST be fresh (no subsequent candles cutting through proximal line)
          const demandInCurve = ltfZones.filter(z =>
            z.type === 'demand' &&
            z.proximal <= currentPrice &&
            z.distal >= htfDemand.distal &&
            z.proximal <= htfSupply.proximal &&
            this.isFreshZone(z, candlesLtf, z.index)
          );

          if (demandInCurve.length > 0) {
            selectedZone = demandInCurve.reduce((closest, z) => z.proximal > closest.proximal ? z : closest, demandInCurve[0]);
          } else {
            // HTF Fallback Refinement: Search for an LTF demand zone nested INSIDE the HTF demand area [htfDemand.distal, htfDemand.proximal]
            const nestedDemand = ltfZones.filter(z =>
              z.type === 'demand' &&
              z.proximal <= currentPrice &&
              z.distal >= htfDemand.distal &&
              z.proximal <= htfDemand.proximal
            );
            if (nestedDemand.length > 0) {
              selectedZone = nestedDemand.reduce((closest, z) => z.proximal > closest.proximal ? z : closest, nestedDemand[0]);
            }
          }
        } else {
          // LTF Entry Zone MUST sit strictly BETWEEN HTF Supply distal and HTF Demand proximal boundaries
          // and MUST be fresh (no subsequent candles cutting through proximal line)
          const supplyInCurve = ltfZones.filter(z =>
            z.type === 'supply' &&
            z.proximal >= currentPrice &&
            z.distal <= htfSupply.distal &&
            z.proximal >= htfDemand.proximal &&
            this.isFreshZone(z, candlesLtf, z.index)
          );

          if (supplyInCurve.length > 0) {
            selectedZone = supplyInCurve.reduce((closest, z) => z.proximal < closest.proximal ? z : closest, supplyInCurve[0]);
          } else {
            // HTF Fallback Refinement: Search for an LTF supply zone nested INSIDE the HTF supply area [htfSupply.proximal, htfSupply.distal]
            const nestedSupply = ltfZones.filter(z =>
              z.type === 'supply' &&
              z.proximal >= currentPrice &&
              z.proximal >= htfSupply.proximal &&
              z.distal <= htfSupply.distal
            );
            if (nestedSupply.length > 0) {
              selectedZone = nestedSupply.reduce((closest, z) => z.proximal < closest.proximal ? z : closest, nestedSupply[0]);
            }
          }
        }

        // If neither an open-curve LTF zone nor a nested LTF zone in the HTF area qualifies, skip this session
        if (!selectedZone) continue;

        // Verified Scalping Rule 3: Block selling a Rally-Base-Drop reversal zone at the bottom 33% of the 15M demand curve
        if (
          tfConfig?.tradingStyle === 'SCALP' &&
          !isLong &&
          curveLocation === 'low' &&
          selectedZone.formation === 'Rally-Base-Drop'
        ) {
          continue;
        }

        const bias: Bias = isLong ? 'long' : 'short';
        const initialLevels = this.buildSetupLevels({
          zone: selectedZone,
          isLong,
          instrument,
          market,
          atr14,
          levelTf: ltf,
          isHalvedFloor,
          isParameterized,
          currentPrice,
          spreadPad: 0,
        });
        if (!initialLevels) continue;

        let activeLevels = initialLevels;
        let effectiveLtfLabel = ltfLabel;
        let nested5mUpgrade = false;
        let appliedSpreadPad = 0;

        // Option A (T4): Protect close 15M zones (< 0.50 progress to TP1).
        // When price has already moved >= 50% of the way to TP1 on 15M, upgrade to a fresher closed 5M SnD zone
        // using wick proximal (+ broker spread on Longs so Ask fills reach the institutional level).
        if (ltf === '15m' && initialLevels.progressToTp1 >= 0.50) {
          try {
            const raw5m = await fetchCandles(instrument, '5m', 60);
            const last5mTs = raw5m.length > 0 ? Date.parse(raw5m[raw5m.length - 1].timestamp) : NaN;
            const isLast5mForming = Number.isFinite(last5mTs)
              && (Date.now() - last5mTs) >= 0
              && (Date.now() - last5mTs) < 5 * 60 * 1000;
            const closed5m = (isLast5mForming ? raw5m.slice(0, -1) : raw5m).slice(-60);

            if (closed5m.length >= 10) {
              const ltf5mZones = this.findZonesWithIndex(closed5m, 0, 0, 'wick');
              const spreadPad = isLong ? getInstrumentSpread(instrument) : 0;

              let candidate5mZone: Zone | null = null;
              if (isLong) {
                const demand5m = ltf5mZones.filter(z =>
                  z.type === 'demand' &&
                  (z.proximal + spreadPad) <= currentPrice &&
                  (z.proximal + spreadPad) > selectedZone!.proximal &&
                  z.distal >= htfDemand.distal &&
                  (z.proximal + spreadPad) <= htfSupply.proximal &&
                  this.isFreshZone(z, closed5m, z.index)
                );
                if (demand5m.length > 0) {
                  candidate5mZone = demand5m.reduce((closest, z) => z.proximal > closest.proximal ? z : closest, demand5m[0]);
                }
              } else {
                const supply5m = ltf5mZones.filter(z =>
                  z.type === 'supply' &&
                  z.proximal >= currentPrice &&
                  z.proximal < selectedZone!.proximal &&
                  z.distal <= htfSupply.distal &&
                  z.proximal >= htfDemand.proximal &&
                  this.isFreshZone(z, closed5m, z.index)
                );
                if (supply5m.length > 0) {
                  candidate5mZone = supply5m.reduce((closest, z) => z.proximal < closest.proximal ? z : closest, supply5m[0]);
                }
              }

              if (candidate5mZone) {
                const upgradedLevels = this.buildSetupLevels({
                  zone: candidate5mZone,
                  isLong,
                  instrument,
                  market,
                  atr14,
                  levelTf: '15m', // Preserve 15M ATR & institutional stop floors to prevent 5m stop-out compression
                  isHalvedFloor,
                  isParameterized,
                  currentPrice,
                  spreadPad,
                });

                if (upgradedLevels) {
                  const withinBounds = isLong
                    ? (upgradedLevels.ez_low >= htfDemand.distal
                      && upgradedLevels.ez_high <= htfSupply.proximal
                      && currentPrice > upgradedLevels.stop
                      && currentPrice < upgradedLevels.tp1
                      && (currentPrice - upgradedLevels.ez_high) <= (atr14 * 6))
                    : (upgradedLevels.ez_high <= htfSupply.distal
                      && upgradedLevels.ez_low >= htfDemand.proximal
                      && currentPrice < upgradedLevels.stop
                      && currentPrice > upgradedLevels.tp1
                      && (upgradedLevels.ez_low - currentPrice) <= (atr14 * 6));

                  if (withinBounds) {
                    activeLevels = upgradedLevels;
                    effectiveLtfLabel = '5M';
                    nested5mUpgrade = true;
                    appliedSpreadPad = spreadPad;
                  }
                }
              }
            }
          } catch (err5m) {
            console.warn(`[Manna SnD] 5M continuation upgrade skipped for ${instrument}:`, err5m);
          }
        }

        // Pre-publish extended-move gate (T4): drop 15M setups still > 55% of the way to TP1
        if (ltf === '15m' && activeLevels.progressToTp1 > 0.55) continue;

        const {
          zone,
          entry_zone_mid,
          stop,
          tp1,
          tp2,
          decimals,
          roundedEntry,
          roundedStop,
          roundedTp1,
          roundedTp2,
          ez_mid,
          ez_low,
          ez_high,
          progressToTp1,
        } = activeLevels;

        // Enforce: Entry Zone MUST sit strictly BETWEEN HTF Demand floor and HTF Supply ceiling
        if (isLong) {
          if (ez_low < htfDemand.distal || ez_high > htfSupply.proximal) continue;
          if (currentPrice <= stop || currentPrice >= tp1 || (currentPrice - ez_high) > (atr14 * 6)) continue;
        } else {
          if (ez_high > htfSupply.distal || ez_low < htfDemand.proximal) continue;
          if (currentPrice >= stop || currentPrice <= tp1 || (ez_low - currentPrice) > (atr14 * 6)) continue;
        }

        const r_multiple_1 = isParameterized
          ? computeRMultiple(roundedEntry, roundedTp1, roundedStop, bias)
          : computeRMultiple(entry_zone_mid, tp1, stop, bias);
        const r_multiple_2 = isParameterized
          ? computeRMultiple(roundedEntry, roundedTp2, roundedStop, bias)
          : computeRMultiple(entry_zone_mid, tp2, stop, bias);

        if (isParameterized && r_multiple_1 < 1.95) continue;

        const lastVol = candlesLtf[candlesLtf.length - 1].volume;
        const avgVol = candlesLtf.reduce((acc, c) => acc + c.volume, 0) / candlesLtf.length;

        const now = new Date();
        const hourET = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false }).format(now), 10);

        const conviction_score = computeMannaSndConvictionScore({
          curveLocation,
          trend15m: trendLtf,
          bias,
          instrument,
          market,
          hourET,
          formation: zone.formation,
          tp1: roundedTp1,
          candles1h: candlesHtf,
          candles15m: candlesLtf,
          now
        });

        const spread = currentPrice * (market === 'futures' ? 0.0001 : 0.0002);
        const liquidity_score = computeLiquidityScore(lastVol, avgVol, spread);

        const stylePrefix = tfConfig?.tradingStyle ? ` · ${tfConfig.tradingStyle}` : '';
        const upgradeTag = nested5mUpgrade ? ' [5M CONTINUATION]' : '';
        const selection_rationale = isParameterized
          ? `[MANNA SND${stylePrefix}]${upgradeTag} Curve: ${curveLocation.toUpperCase()} | ${ltfLabel} Trend: ${trendLtf.toUpperCase()}. Imbalance Zone (${zone.formation}) inside ${htfLabel} ${isLong ? 'Demand' : 'Supply'} Curve. Limit ${isLong ? 'Buy' : 'Sell'} at Proximal line (${roundedEntry.toFixed(decimals)}), SL beyond Distal line (${roundedStop.toFixed(decimals)}). ${r_multiple_1.toFixed(2)}R TP1 target.`
          : `[MANNA SND]${upgradeTag} Curve: ${curveLocation.toUpperCase()} | 15M Trend: ${trendLtf.toUpperCase()}. ${effectiveLtfLabel} Imbalance Zone (${zone.formation}) inside 1H ${isLong ? 'Demand' : 'Supply'} Curve. Limit ${isLong ? 'Buy' : 'Sell'} at Proximal line (${roundedEntry.toFixed(decimals)}), SL beyond Distal line (${roundedStop.toFixed(decimals)}). ${r_multiple_1.toFixed(2)}R TP1 target.`;

        const metadataObj: Record<string, any> = {
          source: tfConfig?.sourceTag || (isParameterized ? 'mtf_manna_snd' : `yahoo_finance_${market}`),
          ...(isParameterized ? { engine: 'manna_snd' } : {}),
          ...(tfConfig?.tradingStyle ? { trading_style: tfConfig.tradingStyle } : {}),
          atr14,
          htf: htfLabel,
          ltf: effectiveLtfLabel,
          zone_timeframe: effectiveLtfLabel,
          nested_5m_upgrade: nested5mUpgrade,
          progress_to_tp1_pct: Number((progressToTp1 * 100).toFixed(1)),
          ...(nested5mUpgrade ? {
            parent_15m_proximal: Number(selectedZone.proximal.toFixed(decimals)),
            parent_15m_distal: Number(selectedZone.distal.toFixed(decimals)),
            spread_pad_applied: Number(appliedSpreadPad.toFixed(decimals)),
          } : {}),
          ...(isParameterized ? {
            context_tf: htfLabel,
            entry_tf: effectiveLtfLabel,
            order_type: bias === 'long' ? 'BUY LIMIT' : 'SELL LIMIT',
            trendLtf,
          } : {}),
          selection_rationale,
          strategy_name: this.meta.name,
          curveLocation,
          trend15m: trendLtf,
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
          htf_curve_type: selectedHtfZone?.type || (isLong ? 'demand' : 'supply'),
          htf_curve_base_time: selectedHtfZone?.timestamp,
          entry_zone_proximal: Number(zone.proximal.toFixed(decimals)),
          entry_zone_distal: Number(zone.distal.toFixed(decimals)),
          entry_zone_formation: zone.formation,
          entry_zone_base_time: zone.timestamp
        };

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
          stop: roundedStop,
          tp1: roundedTp1,
          tp2: roundedTp2,
          r_multiple_1,
          r_multiple_2,
          conviction_score,
          liquidity_score,
          strategy_id: strategyId,
          strategy_tier: this.meta.tier,
          metadata: JSON.stringify(metadataObj)
        });
      } catch (err) {
        console.error(`[Manna SnD] Error evaluating ${instrument}:`, err);
      }
    }

    return candidates;
  }
}
