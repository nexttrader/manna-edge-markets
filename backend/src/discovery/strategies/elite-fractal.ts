import { IStrategyEngine, StrategyMeta } from './strategy-interface';
import { CandidateSetup, KillzoneInfo, Bias, Candle } from '../types';
import { getLiveCandles } from '../yahoo-provider';
import { createLogger } from '../../telemetry/logger';

const logger = createLogger('EliteFractal');

// ============================================================================
// STATE MACHINE ENUMS (4-Timeframe Fractal Alignment)
// ============================================================================

export enum StateMachineState {
  IDLE = 'IDLE',
  H1_POI_DETECTED = 'H1_POI_DETECTED',
  M15_OC_FORMED = 'M15_OC_FORMED',
  M15_RETRACEMENT_ACTIVE = 'M15_RETRACEMENT_ACTIVE',
  M15_POI_TAPPED = 'M15_POI_TAPPED',
  M15_REVERSAL_CONFIRMED = 'M15_REVERSAL_CONFIRMED',
  M5_SCANNING = 'M5_SCANNING',
  M5_SWING_CONFIRMED = 'M5_SWING_CONFIRMED',
  M1_SCANNING = 'M1_SCANNING',
  M1_OC_CONFIRMED = 'M1_OC_CONFIRMED',
  ENTRY_READY = 'ENTRY_READY',
  INVALIDATED = 'INVALIDATED'
}

export enum StateMachinePhase {
  SCANNING = 'SCANNING',
  CANDIDATE = 'CANDIDATE',
  VALIDATED = 'VALIDATED',
  ENTRY_READY = 'ENTRY_READY',
  REJECTED = 'REJECTED'
}

export enum POIType {
  FVG = 'FVG',
  ORDER_BLOCK = 'ORDER_BLOCK',
  SWING_HIGH = 'SWING_HIGH',
  SWING_LOW = 'SWING_LOW'
}

// Dashboard phase definitions for the live state machine view
export const DASHBOARD_PHASES = [
  { name: StateMachinePhase.SCANNING,    label: 'H1 Context Scanning', states: [StateMachineState.IDLE, StateMachineState.H1_POI_DETECTED] },
  { name: StateMachinePhase.CANDIDATE,   label: 'M15 Setup Building',  states: [StateMachineState.M15_OC_FORMED, StateMachineState.M15_RETRACEMENT_ACTIVE, StateMachineState.M15_POI_TAPPED] },
  { name: StateMachinePhase.VALIDATED,   label: 'M5 Confirmation',     states: [StateMachineState.M15_REVERSAL_CONFIRMED, StateMachineState.M5_SCANNING, StateMachineState.M5_SWING_CONFIRMED] },
  { name: StateMachinePhase.ENTRY_READY, label: 'M1 Entry Trigger',    states: [StateMachineState.M1_SCANNING, StateMachineState.M1_OC_CONFIRMED, StateMachineState.ENTRY_READY] },
  { name: StateMachinePhase.REJECTED,    label: 'Setup Invalidated',   states: [StateMachineState.INVALIDATED] }
];

// Live telemetry store — keyed by instrument symbol, read by API endpoint for dashboard
export const instrumentStateTelemetry: Map<string, InstrumentTelemetry> = new Map();

export interface InstrumentTelemetry {
  instrument: string;
  state: StateMachineState;
  phase: StateMachinePhase;
  stateChangedAt: string;
  phaseChangedAt: string;
  invalidationReason?: string;
  h1PoiLevel?: number;
  h1PoiType?: string;
  m15SwingHigh?: number;
  m5ConfirmationTime?: string;
  m1OcCount?: number;
  lastScannedAt: string;
  entryZoneLow?: number;
  entryZoneHigh?: number;
  stop?: number;
  tp1?: number;
  convictionScore?: number;
}

// ============================================================================
// INTERNAL TYPES
// ============================================================================

interface FVGDetails {
  high: number;
  low: number;
  middleCandleIdx: number;
  middleCandleHigh: number;
  timestamp: string;
}

interface OCDetails {
  high: number;
  low: number;
  displacementIdx: number;
  poiType: POIType;
  swingHigh: number;
  fvgMiddleHigh?: number;
  complete: boolean;
  swingHighBroken: boolean;
  timestamp: string;
}

interface POIContext {
  type: POIType;
  priceLevel: number;
  candleIndex: number;
  timestamp: string;
  high?: number;
  low?: number;
  fvgDetails?: FVGDetails;
}

interface StateData {
  state: StateMachineState;
  phase: StateMachinePhase;
  stateChangedAt: string;
  phaseChangedAt: string;
  h1POI?: POIContext;
  h1WindowStart?: number;
  h1CandleCount?: number;
  m15SwingHigh?: number;
  m15ConfirmationTime?: number;
  m15POI?: POIContext;
  m5ConfirmationTime?: number;
  m5SwingPoint?: any;
  m1OCs: OCDetails[];
  m1FinalOCPOIType?: POIType;
  m1FinalOCSwingHigh?: number;
  m1FVGMiddleHigh?: number;
  invalidationReason?: string;
}

interface RetrospectiveScanResult {
  foundPattern: boolean;
  jumpToState?: StateMachineState;
  data?: any;
}

// ============================================================================
// CANDLE FETCHING
// ============================================================================

async function fetchCandles(instrument: string, interval: '1h' | '15m' | '5m' | '1m', count: number): Promise<Candle[]> {
  try {
    const candles = await getLiveCandles(instrument, interval as any, count);
    return candles || [];
  } catch {
    return [];
  }
}

// ============================================================================
// ELITE FRACTAL STRATEGY ENGINE
// ============================================================================

export class EliteFractalStrategy implements IStrategyEngine {
  public meta: StrategyMeta = {
    id: 'elite_fractal',
    name: 'Elite Fractal Alignment',
    tier: 'elite',
    description: '4-Timeframe Fractal Alignment state machine: H1 (Context) \u2192 M15 (Primary Setup) \u2192 M5 (Confirmation) \u2192 M1 (Entry). Bearish SELL setups only. Exclusively visible to SuperAdmin.',
    enabled: true,
    visibility: 'superadmin_only'
  };

  private instrumentStates: Map<string, StateData> = new Map();

  // ============================================================================
  // MAIN ENTRY POINT
  // ============================================================================

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
        const bias = preCalculatedBiases[instrument];
        if (bias !== 'short') {
          this.updateTelemetry(instrument, StateMachineState.IDLE, StateMachinePhase.SCANNING);
          continue;
        }
        const result = await this.processInstrument(instrument, market, killzone, runId);
        if (result) candidates.push(result);
      } catch (err: any) {
        logger.warn({ instrument, err: err.message }, 'EliteFractal: Error evaluating instrument');
      }
    }

    return candidates;
  }

  // ============================================================================
  // INSTRUMENT PROCESSING
  // ============================================================================

  private async processInstrument(
    instrument: string,
    market: 'futures' | 'forex',
    killzone: KillzoneInfo,
    runId: string
  ): Promise<CandidateSetup | null> {
    this.resetState(instrument);

    // Step 1: H1 scan
    const h1Candles = await fetchCandles(instrument, '1h', 60);
    if (h1Candles.length < 15) return null;

    const h1POI = this.scanH1ForPOI(h1Candles);
    if (!h1POI) {
      this.updateTelemetry(instrument, StateMachineState.IDLE, StateMachinePhase.SCANNING);
      return null;
    }

    const state = this.getState(instrument);
    state.h1POI = h1POI;
    state.h1WindowStart = new Date(h1POI.timestamp).getTime();
    state.h1CandleCount = 0;
    this.transitionTo(instrument, StateMachineState.H1_POI_DETECTED);

    // Step 2: M15 retrospective scan
    const m15Candles = await fetchCandles(instrument, '15m', 120);
    if (m15Candles.length < 20) return null;

    const m15Scan = this.retrospectiveScanM15(m15Candles, state);
    if (!m15Scan.foundPattern || !m15Scan.jumpToState) return null;

    Object.assign(state, m15Scan.data || {});
    this.transitionTo(instrument, m15Scan.jumpToState);

    // Allow both M15_REVERSAL_CONFIRMED (strongest) and M15_OC_FORMED (valid setup stage)
    // to proceed to M5 confirmation — M15_OC_FORMED is a legitimate bearish setup initiation.
    const m15StateOk = state.state === StateMachineState.M15_REVERSAL_CONFIRMED ||
                       state.state === StateMachineState.M15_OC_FORMED;
    if (!m15StateOk) return null;

    // Step 3: M5 retrospective scan
    const m5Candles = await fetchCandles(instrument, '5m', 180);
    if (m5Candles.length < 30) return null;

    const m5Scan = this.retrospectiveScanM5(m5Candles, state);
    if (!m5Scan.foundPattern || !m5Scan.jumpToState) return null;

    Object.assign(state, m5Scan.data || {});
    this.transitionTo(instrument, m5Scan.jumpToState);
    if ((state.state as string) !== StateMachineState.M5_SWING_CONFIRMED) return null;

    // Step 4: M1 retrospective scan — entry trigger must be recent and fresh!
    const m1Candles = await fetchCandles(instrument, '1m', 100);
    if (m1Candles.length < 25) return null;

    // Guard: check that recent price action hasn't broken above the M15 swing high
    if (state.m15SwingHigh) {
      const recentHigh = Math.max(...m1Candles.slice(-10).map(c => c.high));
      if (recentHigh >= state.m15SwingHigh) {
        this.transitionTo(instrument, StateMachineState.INVALIDATED);
        return null;
      }
    }

    const m1Scan = this.retrospectiveScanM1(m1Candles, state);
    if (!m1Scan.foundPattern) return null;

    Object.assign(state, m1Scan.data || {});
    // Require at least 1 confirmed M1 displacement OC for ENTRY_READY.
    // 2 OCs gives higher conviction (bonus conviction score) but 1 is sufficient.
    if (state.m1OCs && state.m1OCs.length >= 1) {
      this.transitionTo(instrument, StateMachineState.ENTRY_READY);
      return this.buildCandidateSetup(instrument, market, killzone, runId, state, h1Candles, m15Candles);
    } else {
      this.transitionTo(instrument, StateMachineState.M1_SCANNING);
      return null;
    }
  }

  // ============================================================================
  // H1 SCANNING
  // ============================================================================

  private scanH1ForPOI(candles: Candle[]): POIContext | null {
    for (let i = 1; i <= Math.min(10, candles.length - 2); i++) {
      const idx = candles.length - 1 - i;
      const candle = candles[idx];

      const fvg = this.detectFVG(candles, idx, 'BEARISH');
      if (fvg && this.isPriceTappingFVG(candle, fvg)) {
        return { type: POIType.FVG, priceLevel: fvg.high, candleIndex: idx, timestamp: candle.timestamp, high: fvg.high, low: fvg.low, fvgDetails: fvg };
      }

      const swingHigh = this.detectSwingHighAt(candles, idx);
      if (swingHigh && Math.abs(candle.high - swingHigh) < swingHigh * 0.001) {
        return { type: POIType.SWING_HIGH, priceLevel: swingHigh, candleIndex: idx, timestamp: candle.timestamp, high: swingHigh };
      }
    }
    return null;
  }

  // ============================================================================
  // M15 SCAN
  // ============================================================================

  private retrospectiveScanM15(candles: Candle[], state: StateData): RetrospectiveScanResult {
    const h1WindowEnd = (state.h1WindowStart || 0) + (4 * 60 * 60 * 1000);

    for (let i = 1; i <= Math.min(25, candles.length - 3); i++) {
      const idx = candles.length - 1 - i;
      const candle = candles[idx];
      const ts = new Date(candle.timestamp).getTime();

      if (state.h1WindowStart && (ts < state.h1WindowStart || ts > h1WindowEnd)) continue;

      const reversal = this.detect3to4CandleReversal(candles, idx, 'BEARISH');
      if (reversal?.complete && !reversal.swingHighBroken) {
        return {
          foundPattern: true,
          jumpToState: StateMachineState.M15_REVERSAL_CONFIRMED,
          data: { m15SwingHigh: reversal.swingHigh, m15ConfirmationTime: new Date(reversal.timestamp).getTime(), m15POI: reversal.poi }
        };
      }

      const oc = this.detectBearishOC(candles, idx);
      if (oc?.complete) {
        return {
          foundPattern: true,
          jumpToState: StateMachineState.M15_OC_FORMED,
          data: {
            m15POI: { type: POIType.ORDER_BLOCK, priceLevel: oc.high, candleIndex: idx, timestamp: candle.timestamp, high: oc.high, low: oc.low },
            m15ConfirmationTime: new Date(candle.timestamp).getTime(), // anchor M5 afterTime
            m15SwingHigh: oc.swingHigh  // use OC high as swing reference for invalidation guard
          }
        };
      }
    }
    return { foundPattern: false };
  }

  // ============================================================================
  // M5 SCAN
  // ============================================================================

  private retrospectiveScanM5(candles: Candle[], state: StateData): RetrospectiveScanResult {
    const afterTime = state.m15ConfirmationTime || 0;

    for (let i = 1; i <= Math.min(50, candles.length - 3); i++) {
      const idx = candles.length - 1 - i;
      const candle = candles[idx];
      const ts = new Date(candle.timestamp).getTime();
      if (ts <= afterTime) continue;

      const reversal = this.detect3to4CandleReversal(candles, idx, 'BEARISH');
      if (reversal?.complete && !reversal.swingHighBroken) {
        return {
          foundPattern: true,
          jumpToState: StateMachineState.M5_SWING_CONFIRMED,
          data: { m5SwingPoint: reversal, m5ConfirmationTime: new Date(reversal.timestamp).getTime() }
        };
      }
    }
    return { foundPattern: false };
  }

  // ============================================================================
  // M1 SCAN
  // ============================================================================

  private retrospectiveScanM1(candles: Candle[], state: StateData): RetrospectiveScanResult {
    const afterTime = state.m5ConfirmationTime || 0;
    const validOCs: OCDetails[] = [];

    // Only look back up to 25 M1 candles — entry trigger MUST be recent and active
    for (let i = 1; i <= Math.min(25, candles.length - 3); i++) {
      const idx = candles.length - 1 - i;
      const candle = candles[idx];
      const ts = new Date(candle.timestamp).getTime();
      if (ts <= afterTime) continue;

      const oc = this.detectBearishOC(candles, idx);
      if (oc?.complete && !oc.swingHighBroken) validOCs.push(oc);
    }

    validOCs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (validOCs.length === 0) return { foundPattern: true, data: { m1OCs: [] } };

    const top = validOCs.slice(0, 2);
    return {
      foundPattern: true,
      data: {
        m1OCs: top,
        m1FinalOCPOIType: top[0].poiType,
        m1FinalOCSwingHigh: top[0].swingHigh,
        m1FVGMiddleHigh: top[0].fvgMiddleHigh
      }
    };
  }

  // ============================================================================
  // PATTERN DETECTORS
  // ============================================================================

  private detectFVG(candles: Candle[], centerIdx: number, direction: 'BEARISH' | 'BULLISH'): FVGDetails | null {
    if (centerIdx < 1 || centerIdx >= candles.length - 1) return null;
    const c1 = candles[centerIdx - 1];
    const c2 = candles[centerIdx];
    const c3 = candles[centerIdx + 1];
    if (direction === 'BEARISH' && c1.low > c3.high) {
      return { high: c1.low, low: c3.high, middleCandleIdx: centerIdx, middleCandleHigh: c2.high, timestamp: c2.timestamp };
    }
    if (direction === 'BULLISH' && c1.high < c3.low) {
      return { high: c3.low, low: c1.high, middleCandleIdx: centerIdx, middleCandleHigh: c2.high, timestamp: c2.timestamp };
    }
    return null;
  }

  private detectSwingHighAt(candles: Candle[], centerIdx: number): number | null {
    if (centerIdx < 1 || centerIdx >= candles.length - 1) return null;
    const left = candles[centerIdx - 1];
    const center = candles[centerIdx];
    const right = candles[centerIdx + 1];
    if (center.close > left.close && center.close > right.close) return center.high;
    return null;
  }

  private detectBearishOC(candles: Candle[], displacementIdx: number): OCDetails | null {
    if (displacementIdx < 3) return null;
    const displacement = candles[displacementIdx];
    if (displacement.close >= displacement.open) return null;

    let setupHigh = -Infinity;
    let setupLow = Infinity;
    let foundPOI = false;
    let poiType: POIType = POIType.SWING_HIGH;

    // First pass: collect the high/low range of the setup candles leading into the displacement
    // AND check for a POI (FVG or swing high) among those setup candles.
    // We MUST accumulate highs/lows regardless of whether a POI is found so setupHigh is valid.
    for (let i = displacementIdx - 1; i >= Math.max(0, displacementIdx - 8); i--) {
      const c = candles[i];
      // Always accumulate range — this was the bug: break fired before accumulation
      setupHigh = Math.max(setupHigh, c.high);
      setupLow = Math.min(setupLow, c.low);
      const fvg = this.detectFVG(candles, i, 'BEARISH');
      const swing = this.detectSwingHighAt(candles, i);
      if (fvg || swing) {
        foundPOI = true;
        poiType = fvg ? POIType.FVG : POIType.SWING_HIGH;
        // Do NOT break — keep accumulating to ensure setupHigh covers full setup range
      }
    }

    if (!foundPOI || setupHigh === -Infinity) return null;

    // Confirm: the bodies of the setup candles must sit above the displacement candle's close
    const setupCandles = Array.from({ length: Math.min(3, displacementIdx) }, (_, k) => candles[displacementIdx - 1 - k]);
    const allBodiesAbove = setupCandles.every(c => Math.min(c.open, c.close) > displacement.close);
    if (!allBodiesAbove) return null;

    return { high: setupHigh, low: setupLow, displacementIdx, poiType, swingHigh: setupHigh, fvgMiddleHigh: poiType === POIType.FVG ? setupHigh : undefined, complete: true, swingHighBroken: false, timestamp: displacement.timestamp };
  }

  private detect3to4CandleReversal(candles: Candle[], c2Idx: number, direction: 'BEARISH' | 'BULLISH'): any | null {
    if (c2Idx < 1 || c2Idx >= candles.length - 2) return null;
    const c1 = candles[c2Idx - 1];
    const c2 = candles[c2Idx];
    const c3 = candles[c2Idx + 1];

    if (direction === 'BEARISH') {
      if (c2.close > c1.high) return null;
      if (c3.close >= c2.close) return null;

      const c1FVG = this.detectFVG(candles, c2Idx - 1, 'BEARISH');
      const c2FVG = this.detectFVG(candles, c2Idx, 'BEARISH');
      const c1Swing = this.detectSwingHighAt(candles, c2Idx - 1);
      const c2Swing = this.detectSwingHighAt(candles, c2Idx);
      const hasPOI = !!(c1FVG || c2FVG || c1Swing || c2Swing);
      if (!hasPOI) return null;

      const poi = c2FVG ? { type: POIType.FVG, priceLevel: c2FVG.high, candleIndex: c2Idx, timestamp: c2.timestamp, high: c2FVG.high, low: c2FVG.low } :
                  c1FVG ? { type: POIType.FVG, priceLevel: c1FVG.high, candleIndex: c2Idx - 1, timestamp: c1.timestamp, high: c1FVG.high, low: c1FVG.low } :
                  c2Swing ? { type: POIType.SWING_HIGH, priceLevel: c2Swing, candleIndex: c2Idx, timestamp: c2.timestamp, high: c2Swing } :
                  { type: POIType.SWING_HIGH, priceLevel: c1Swing!, candleIndex: c2Idx - 1, timestamp: c1.timestamp, high: c1Swing! };

      return { complete: true, swingHigh: c2.high, timestamp: c2.timestamp, poi, swingHighBroken: false };
    }
    return null;
  }

  private isPriceTappingFVG(candle: Candle, fvg: FVGDetails): boolean {
    return candle.high >= fvg.low && candle.low <= fvg.high;
  }

  // ============================================================================
  // CANDIDATE SETUP BUILDER
  // ============================================================================

  private buildCandidateSetup(
    instrument: string,
    market: 'futures' | 'forex',
    killzone: KillzoneInfo,
    runId: string,
    state: StateData,
    h1Candles: Candle[],
    m15Candles: Candle[]
  ): CandidateSetup {
    const isForex = market === 'forex';
    const decimals = isForex ? 5 : 2;
    const round = (v: number) => parseFloat(v.toFixed(decimals));

    const finalOC = state.m1OCs?.[0];
    const entryHigh = finalOC ? round(finalOC.high) : round((state.h1POI?.priceLevel || 0) * 1.001);
    const entryLow = finalOC ? round(finalOC.low) : round((state.h1POI?.priceLevel || 0) * 0.999);
    const entryMid = round((entryHigh + entryLow) / 2);

    const bufferPct = isForex ? 0.0003 : 0.002;
    let stop: number;
    if (state.m1FinalOCPOIType === POIType.FVG && state.m1FVGMiddleHigh) {
      stop = round(state.m1FVGMiddleHigh * (1 + bufferPct));
    } else if (state.m1FinalOCSwingHigh) {
      stop = round(state.m1FinalOCSwingHigh * (1 + bufferPct));
    } else if (state.m15SwingHigh) {
      stop = round(state.m15SwingHigh * (1 + bufferPct));
    } else {
      stop = round(entryHigh * (1 + bufferPct * 3));
    }

    // Ensure stop is strictly above entry for bearish SHORT trade
    if (stop <= entryHigh) {
      stop = round(entryHigh * (1 + bufferPct * 3));
    }

    const minStopDist = isForex ? 0.0005 : 1.5;
    const stopDistance = Math.max(Math.abs(stop - entryMid), minStopDist);
    const tp1 = round(entryMid - (2 * stopDistance));
    const tp2 = round(entryMid - (3.5 * stopDistance));
    const rMultiple1 = parseFloat((Math.abs(entryMid - tp1) / stopDistance).toFixed(2));
    const rMultiple2 = parseFloat((Math.abs(entryMid - tp2) / stopDistance).toFixed(2));

    let conviction = 75.0;
    if (state.m15POI) conviction += 5;
    if (state.m5SwingPoint) conviction += 5;
    if (state.m1OCs && state.m1OCs.length >= 2) conviction += 10;
    if (state.h1POI?.type === POIType.FVG) conviction += 5;
    conviction = Math.min(98, conviction);

    const now = new Date().toISOString();

    const metadata = JSON.stringify({
      strategy: 'elite_fractal',
      stateAtEntry: state.state,
      phases: {
        h1POIType: state.h1POI?.type,
        h1POILevel: state.h1POI?.priceLevel,
        m15POIType: state.m15POI?.type,
        m15SwingHigh: state.m15SwingHigh,
        m5ConfirmedAt: state.m5ConfirmationTime,
        m1OCCount: state.m1OCs?.length || 0,
        finalOCPOIType: state.m1FinalOCPOIType
      },
      selection_rationale: `Elite Fractal 4TF Alignment: H1 ${state.h1POI?.type || 'POI'} tapped \u2192 M15 reversal confirmed at ${state.m15SwingHigh?.toFixed(decimals)} \u2192 M5 swing point validated \u2192 M1 entry OC alignment (${state.m1OCs?.length || 0} OCs). Bearish setup with ${conviction.toFixed(1)}% conviction targeting 2R/3.5R.`
    });

    this.updateTelemetryFromState(instrument, state, entryLow, entryHigh, stop, tp1, conviction);

    return {
      instrument,
      market,
      bias: 'short',
      killzone_origin: killzone.killzone,
      killzone_origin_at: now,
      entry_zone_low: entryLow,
      entry_zone_high: entryHigh,
      entry_zone_mid: entryMid,
      stop,
      tp1,
      tp2,
      r_multiple_1: rMultiple1,
      r_multiple_2: rMultiple2,
      conviction_score: conviction,
      liquidity_score: 97.5,
      strategy_id: 'elite_fractal',
      strategy_tier: 'elite',
      metadata
    } as CandidateSetup;
  }

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  private getState(instrument: string): StateData {
    if (!this.instrumentStates.has(instrument)) this.resetState(instrument);
    return this.instrumentStates.get(instrument)!;
  }

  private resetState(instrument: string): void {
    const now = new Date().toISOString();
    this.instrumentStates.set(instrument, {
      state: StateMachineState.IDLE,
      phase: StateMachinePhase.SCANNING,
      stateChangedAt: now,
      phaseChangedAt: now,
      m1OCs: []
    });
  }

  private transitionTo(instrument: string, newState: StateMachineState): void {
    const state = this.getState(instrument);
    const now = new Date().toISOString();
    const newPhase = this.getPhaseForState(newState);
    if (newPhase !== state.phase) state.phaseChangedAt = now;
    state.state = newState;
    state.phase = newPhase;
    state.stateChangedAt = now;
    this.updateTelemetry(instrument, newState, newPhase);
  }

  private getPhaseForState(state: StateMachineState): StateMachinePhase {
    const map: Record<StateMachineState, StateMachinePhase> = {
      [StateMachineState.IDLE]: StateMachinePhase.SCANNING,
      [StateMachineState.H1_POI_DETECTED]: StateMachinePhase.SCANNING,
      [StateMachineState.M15_OC_FORMED]: StateMachinePhase.CANDIDATE,
      [StateMachineState.M15_RETRACEMENT_ACTIVE]: StateMachinePhase.CANDIDATE,
      [StateMachineState.M15_POI_TAPPED]: StateMachinePhase.CANDIDATE,
      [StateMachineState.M15_REVERSAL_CONFIRMED]: StateMachinePhase.VALIDATED,
      [StateMachineState.M5_SCANNING]: StateMachinePhase.VALIDATED,
      [StateMachineState.M5_SWING_CONFIRMED]: StateMachinePhase.VALIDATED,
      [StateMachineState.M1_SCANNING]: StateMachinePhase.ENTRY_READY,
      [StateMachineState.M1_OC_CONFIRMED]: StateMachinePhase.ENTRY_READY,
      [StateMachineState.ENTRY_READY]: StateMachinePhase.ENTRY_READY,
      [StateMachineState.INVALIDATED]: StateMachinePhase.REJECTED
    };
    return map[state];
  }

  private updateTelemetry(instrument: string, state: StateMachineState, phase: StateMachinePhase): void {
    const existing = instrumentStateTelemetry.get(instrument) || {} as InstrumentTelemetry;
    instrumentStateTelemetry.set(instrument, {
      ...existing,
      instrument,
      state,
      phase,
      stateChangedAt: new Date().toISOString(),
      phaseChangedAt: existing.phase !== phase ? new Date().toISOString() : (existing.phaseChangedAt || new Date().toISOString()),
      lastScannedAt: new Date().toISOString()
    });
  }

  private updateTelemetryFromState(instrument: string, state: StateData, entryLow: number, entryHigh: number, stop: number, tp1: number, conviction: number): void {
    instrumentStateTelemetry.set(instrument, {
      instrument,
      state: state.state,
      phase: state.phase,
      stateChangedAt: state.stateChangedAt,
      phaseChangedAt: state.phaseChangedAt,
      h1PoiLevel: state.h1POI?.priceLevel,
      h1PoiType: state.h1POI?.type,
      m15SwingHigh: state.m15SwingHigh,
      m5ConfirmationTime: state.m5ConfirmationTime ? new Date(state.m5ConfirmationTime).toISOString() : undefined,
      m1OcCount: state.m1OCs?.length || 0,
      lastScannedAt: new Date().toISOString(),
      entryZoneLow: entryLow,
      entryZoneHigh: entryHigh,
      stop,
      tp1,
      convictionScore: conviction
    });
  }
}

export const eliteFractalStrategy = new EliteFractalStrategy();
