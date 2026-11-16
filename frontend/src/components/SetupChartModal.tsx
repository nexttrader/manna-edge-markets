import React, { useEffect, useRef, useState, useCallback, useId, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  createChart,
  ColorType,
  LineStyle,
  CrosshairMode,
  CandlestickSeries,
  createSeriesMarkers,
  type AutoscaleInfo,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { EdgeSetup } from '../types';
import { API_BASE } from '../config';
import { formatTelegramTradeId } from '../utils/tradeId';
import './SetupChartModal.css';

interface SetupChartModalProps {
  setup: EdgeSetup;
  onClose: () => void;
}

export type ChartTimeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

type ExtendedSetup = EdgeSetup & {
  entry_low?: number;
  entry_high?: number;
  entry_mid?: number;
  entry_price?: number;
  stop_loss?: number;
  initialStop?: number;
  target1?: number;
  target2?: number;
  time_entered?: string;
  time_signaled?: string;
  time_exited?: string;
  execution_time?: string;
  closed_at?: string;
  exit_price?: number;
  levels?: {
    entryMin?: number;
    entryMax?: number;
    entryMid?: number;
    entry_low?: number;
    entry_high?: number;
    stopLoss?: number;
    stop?: number;
    takeProfit1?: number;
    takeProfit2?: number;
    tp1?: number;
    tp2?: number;
  };
};

interface RawCandle {
  timestamp: string | number;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
}

interface SndMetadata {
  htf_curve_proximal?: number | string;
  htf_curve_distal?: number | string;
  htf_curve_type?: string;
  htf_curve_base_time?: string;
  htf_demand_proximal?: number | string;
  htf_demand_distal?: number | string;
  htf_demand_base_time?: string;
  htf_demand_formation?: string;
  htf_supply_proximal?: number | string;
  htf_supply_distal?: number | string;
  htf_supply_base_time?: string;
  htf_supply_formation?: string;
  entry_zone_base_time?: string;
  entry_zone_formation?: string;
  curveLocation?: string;
  trend15m?: string;
  formation?: string;
  htf?: string;
  ltf?: string;
  context_tf?: string;
  entry_tf?: string;
  trading_style?: string;
}

type RoundRectCanvasCtx = CanvasRenderingContext2D & {
  roundRect?: (x: number, y: number, w: number, h: number, r: number) => void;
};

const TIMEFRAMES: { id: ChartTimeframe; label: string; title: string }[] = [
  { id: '1m', label: '1M', title: '1 Minute Precision' },
  { id: '5m', label: '5M', title: '5 Minute Scalp Entry' },
  { id: '15m', label: '15M', title: '15 Minute Intraday Entry / Scalp Context' },
  { id: '1h', label: '1H', title: '1 Hour Market Structure / Swing Entry' },
  { id: '4h', label: '4H', title: '4 Hour Trend / Swing Entry' },
  { id: '1d', label: '1D', title: 'Daily Macro View' },
];

function normalizeTfCode(raw: string | undefined, fallback: ChartTimeframe): ChartTimeframe {
  const s = (raw || '').trim().toLowerCase();
  if (s === '1m' || s === '5m' || s === '15m' || s === '1h' || s === '4h' || s === '1d') {
    return s;
  }
  if (s === 'd1' || s === 'd') return '1d';
  if (s === 'h4') return '4h';
  if (s === 'h1') return '1h';
  if (s === 'm15') return '15m';
  if (s === 'm5') return '5m';
  if (s === 'm1') return '1m';
  return fallback;
}

function getSetupTimeframeConfig(
  setup: EdgeSetup,
  metadata: SndMetadata
): { defaultEntryTf: ChartTimeframe; entryTfLabel: string; contextTfLabel: string } {
  const ext = setup as EdgeSetup & { entry_tf?: string; context_tf?: string; trading_style?: string };
  const strat = (setup.strategy_id || '').toLowerCase();
  const rawEntry = ext.entry_tf || metadata.entry_tf || metadata.ltf;
  const rawContext = ext.context_tf || metadata.context_tf || metadata.htf;

  if (strat === 'manna_scalper' || (ext.trading_style || metadata.trading_style) === 'SCALP') {
    const tf = normalizeTfCode(rawEntry, '5m');
    return {
      defaultEntryTf: tf,
      entryTfLabel: tf.toUpperCase(),
      contextTfLabel: (rawContext || '15M').toUpperCase(),
    };
  }
  if (strat === 'manna_swing' || (ext.trading_style || metadata.trading_style) === 'SWING') {
    const tf = normalizeTfCode(rawEntry, '4h');
    return {
      defaultEntryTf: tf,
      entryTfLabel: tf.toUpperCase(),
      contextTfLabel: (rawContext || (tf === '4h' ? '1D' : '4H')).toUpperCase(),
    };
  }
  const tf = normalizeTfCode(rawEntry, '15m');
  return {
    defaultEntryTf: tf,
    entryTfLabel: tf.toUpperCase(),
    contextTfLabel: (rawContext || '1H').toUpperCase(),
  };
}

function getTimeframeSeconds(timeframe: ChartTimeframe): number {
  switch (timeframe) {
    case '1m': return 60;
    case '5m': return 300;
    case '15m': return 900;
    case '1h': return 3600;
    case '4h': return 14400;
    case '1d': return 86400;
  }
}

/**
 * Finds the candle bar that contains `targetUnix` (i.e. the latest candle with time <= targetUnix).
 * If targetUnix is before the oldest candle by more than one bar, returns null so we never
 * snap an off-screen timestamp onto candle 0.
 */
function findContainingCandle<T extends { time: Time }>(
  candles: T[],
  targetUnix: number,
  timeframe: ChartTimeframe
): T | null {
  if (!candles || candles.length === 0 || !Number.isFinite(targetUnix)) return null;
  const tfSec = getTimeframeSeconds(timeframe);
  const firstTime = candles[0].time as number;
  if (targetUnix < firstTime - tfSec) {
    return null;
  }
  if (targetUnix < firstTime) {
    return candles[0];
  }
  let chosen = candles[0];
  for (let i = 0; i < candles.length; i++) {
    const t = candles[i].time as number;
    if (t <= targetUnix) {
      chosen = candles[i];
    } else {
      break;
    }
  }
  return chosen;
}

export const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'New York (ET · Killzones)' },
  { value: 'UTC', label: 'UTC (Universal)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Berlin', label: 'Frankfurt (CET/CEST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
  { value: 'local', label: 'Local (Device Time)' },
];

function getEffectiveTimezone(tz: string): string {
  if (tz === 'local') {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }
  return tz;
}

function formatTzTime(unixSec: number, tz: string, includeSeconds = false): string {
  try {
    const d = new Date(unixSec * 1000);
    const targetTz = getEffectiveTimezone(tz);
    return d.toLocaleTimeString('en-US', {
      timeZone: targetTz,
      hour: '2-digit',
      minute: '2-digit',
      second: includeSeconds ? '2-digit' : undefined,
      hour12: false,
    });
  } catch {
    return new Date(unixSec * 1000).toISOString().substring(11, includeSeconds ? 19 : 16);
  }
}

function getTimezoneBadge(tz: string): string {
  switch (tz) {
    case 'America/New_York': return 'ET';
    case 'UTC': return 'UTC';
    case 'Europe/London': return 'LON';
    case 'Europe/Berlin': return 'CET';
    case 'Asia/Tokyo': return 'JST';
    case 'Asia/Singapore': return 'SGT';
    case 'Australia/Sydney': return 'SYD';
    case 'local': return 'LOC';
    default: return tz;
  }
}

function getCurrentCandleTime(timeframe: ChartTimeframe): UTCTimestamp {
  const date = new Date(Date.now());
  const minutes = date.getUTCMinutes();

  if (timeframe === '1m') {
    date.setUTCSeconds(0, 0);
  } else if (timeframe === '5m') {
    date.setUTCMinutes(Math.floor(minutes / 5) * 5, 0, 0);
  } else if (timeframe === '15m') {
    date.setUTCMinutes(Math.floor(minutes / 15) * 15, 0, 0);
  } else if (timeframe === '1h') {
    date.setUTCMinutes(0, 0, 0);
  } else if (timeframe === '4h') {
    date.setUTCHours(Math.floor(date.getUTCHours() / 4) * 4, 0, 0, 0);
  } else if (timeframe === '1d') {
    date.setUTCHours(0, 0, 0, 0);
  }

  return Math.floor(date.getTime() / 1000) as UTCTimestamp;
}

const parseNum = (val: unknown): number => {
  if (val === undefined || val === null) return 0;
  const n = typeof val === 'number' ? val : parseFloat(String(val));
  return isNaN(n) ? 0 : n;
};

function getInstrumentFormat(instrument: string) {
  const sym = instrument.toUpperCase();
  const isForex = instrument.includes('/');

  if (isForex) {
    if (sym.includes('JPY')) {
      return { decimals: 3, minMove: 0.001, unit: 'pips' };
    }
    return { decimals: 5, minMove: 0.00001, unit: 'pips' };
  }

  switch (sym) {
    case 'YM':
      return { decimals: 0, minMove: 1, unit: 'pts' };
    case 'SI':
      return { decimals: 3, minMove: 0.001, unit: 'pts' };
    case 'ZN':
      return { decimals: 4, minMove: 0.0001, unit: 'pts' };
    default:
      return { decimals: 2, minMove: 0.01, unit: 'pts' };
  }
}

function formatPrice(val: number | undefined | null, decimals: number): string {
  if (val === undefined || val === null || isNaN(val) || val <= 0) return '--';
  return val.toFixed(decimals);
}

function safeStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable in restricted contexts
  }
}

export function getBidAskData(
  instrument: string,
  price: number,
  quote?: { bid?: number; ask?: number; spread?: number } | null
) {
  const sym = instrument.toUpperCase();
  const isForex = instrument.includes('/');
  const { decimals, unit } = getInstrumentFormat(instrument);

  let spread: number;
  if (isForex) {
    spread = sym.includes('JPY') ? 0.015 : 0.00012;
  } else {
    switch (sym) {
      case 'ES':
      case 'NQ':
        spread = 0.25;
        break;
      case 'YM':
        spread = 1.0;
        break;
      case 'RTY':
      case 'GC':
        spread = 0.10;
        break;
      case 'SI':
        spread = 0.005;
        break;
      case 'CL':
        spread = 0.01;
        break;
      case 'ZN':
        spread = 0.0156;
        break;
      default:
        spread = price > 1000 ? 0.25 : 0.01;
        break;
    }
  }

  const effectiveSpread = quote?.spread && quote.spread > 0 ? quote.spread : spread;
  let bid = quote?.bid && quote.bid > 0 ? quote.bid : price - effectiveSpread / 2;
  let ask = quote?.ask && quote.ask > 0 ? quote.ask : price + effectiveSpread / 2;

  if (bid >= ask) {
    bid = price - effectiveSpread / 2;
    ask = price + effectiveSpread / 2;
  }

  return { bid, ask, spread: effectiveSpread, decimals, unit };
}

/**
 * Returns the bid & ask prices for a fill, anchored to the CORRECT side.
 *
 * Market mechanics:
 *   ENTRY  LONG  → you buy  at the ASK  (ask = fillPrice, bid = fillPrice - spread)
 *   ENTRY  SHORT → you sell at the BID  (bid = fillPrice, ask = fillPrice + spread)
 *   EXIT   LONG  → you sell at the BID  (bid = fillPrice, ask = fillPrice + spread)
 *   EXIT   SHORT → you buy  at the ASK  (ask = fillPrice, bid = fillPrice - spread)
 */
export function getDirectionalBidAsk(
  instrument: string,
  fillPrice: number,
  isLong: boolean,
  isEntry: boolean,
  quote?: { bid?: number; ask?: number; spread?: number } | null
): { bid: number; ask: number; filledSide: 'bid' | 'ask'; spread: number; decimals: number } {
  const { spread, decimals } = getBidAskData(instrument, fillPrice, quote);
  const fillsAtAsk = (isEntry && isLong) || (!isEntry && !isLong);

  let bid: number;
  let ask: number;
  if (fillsAtAsk) {
    ask = fillPrice;
    bid = fillPrice - spread;
  } else {
    bid = fillPrice;
    ask = fillPrice + spread;
  }

  return { bid, ask, filledSide: fillsAtAsk ? 'ask' : 'bid', spread, decimals };
}

/* ── Minimal Crisp SVG Icons (12px–14px, currentColor) ──────────────────── */

const IconArrowBias = ({ isLong }: { isLong: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    {isLong ? (
      <path d="M8 13V3M8 3L3.5 7.5M8 3L12.5 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    ) : (
      <path d="M8 3V13M8 13L3.5 8.5M8 13L12.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    )}
  </svg>
);

const IconGlobe = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.4" />
    <ellipse cx="8" cy="8" rx="2.75" ry="6.25" stroke="currentColor" strokeWidth="1.2" />
    <path d="M2 8H14" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

const IconSun = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 1.5V3M8 13V14.5M1.5 8H3M13 8H14.5M3.4 3.4L4.45 4.45M11.55 11.55L12.6 12.6M12.6 3.4L11.55 4.45M4.45 11.55L3.4 12.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const IconMoon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M13.5 9.8A5.7 5.7 0 0 1 6.2 2.5a5.8 5.8 0 1 0 7.3 7.3Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconClose = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3.5 3.5L12.5 12.5M12.5 3.5L3.5 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const IconZoomIn = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="7" cy="7" r="4.75" stroke="currentColor" strokeWidth="1.5" />
    <path d="M10.5 10.5L14 14M7 5V9M5 7H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const IconZoomOut = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="7" cy="7" r="4.75" stroke="currentColor" strokeWidth="1.5" />
    <path d="M10.5 10.5L14 14M5 7H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const IconFitAll = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M2.5 5.5V2.5H5.5M10.5 2.5H13.5V5.5M13.5 10.5V13.5H10.5M5.5 13.5H2.5V10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconBidAsk = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M2 5.5H14M2 10.5H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2" />
    <circle cx="5.5" cy="5.5" r="1.5" fill="currentColor" />
    <circle cx="10.5" cy="10.5" r="1.5" fill="currentColor" />
  </svg>
);

const IconCopy = ({ copied }: { copied: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    {copied ? (
      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    ) : (
      <>
        <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M10.5 3.5V2.8A1.3 1.3 0 0 0 9.2 1.5H2.8A1.3 1.3 0 0 0 1.5 2.8V9.2A1.3 1.3 0 0 0 2.8 10.5H3.5" stroke="currentColor" strokeWidth="1.4" />
      </>
    )}
  </svg>
);

function getChartThemePalette(theme: 'dark' | 'light') {
  const isLight = theme === 'light';
  return {
    bg: isLight ? '#ffffff' : '#0b0f17',
    text: isLight ? '#475569' : '#94a3b8',
    grid: isLight ? 'rgba(15, 23, 42, 0.05)' : 'rgba(148, 163, 184, 0.06)',
    border: isLight ? '#e2e8f0' : 'rgba(148, 163, 184, 0.16)',
    crosshair: isLight ? 'rgba(71, 85, 105, 0.5)' : 'rgba(148, 163, 184, 0.45)',
    crosshairLabelBg: isLight ? '#1e293b' : '#334155',
    upColor: isLight ? '#059669' : '#10b981',
    downColor: isLight ? '#dc2626' : '#ef4444',
  };
}

interface CrosshairOhlc {
  open: number;
  high: number;
  low: number;
  close: number;
  timeStr: string;
  isUp: boolean;
}

export const SetupChartModal: React.FC<SetupChartModalProps> = ({ setup, onClose }) => {
  const headingId = useId();
  const chartContainerId = useId();
  const extSetup = setup as ExtendedSetup;

  const dialogRef = useRef<HTMLDialogElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const seriesMarkersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const displayCandlesRef = useRef<CandlestickData<Time>[]>([]);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const bidLineRef = useRef<IPriceLine | null>(null);
  const askLineRef = useRef<IPriceLine | null>(null);
  const lastFittedKeyRef = useRef<string | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const liveCandleRef = useRef<CandlestickData<Time> | null>(null);
  const onCloseRef = useRef(onClose);
  const levelsRef = useRef<number[]>([]);
  const drawZonesRef = useRef<() => void>(() => {});
  const showBidAskRef = useRef<boolean>(false);

  const metadata: SndMetadata = useMemo(() => {
    try {
      if (typeof setup.metadata === 'string') {
        return JSON.parse(setup.metadata) as SndMetadata;
      }
      if (setup.metadata) {
        return setup.metadata as SndMetadata;
      }
    } catch {
      // Malformed metadata JSON falls back to defaults
    }
    return {};
  }, [setup.metadata]);

  const { defaultEntryTf, entryTfLabel } = useMemo(
    () => getSetupTimeframeConfig(setup, metadata),
    [setup, metadata]
  );

  const [tfOverride, setTfOverride] = useState<{ setupId: string; tf: ChartTimeframe } | null>(null);
  const timeframe: ChartTimeframe = tfOverride?.setupId === setup.id ? tfOverride.tf : defaultEntryTf;
  const setTimeframe = useCallback(
    (nextTf: ChartTimeframe) => setTfOverride({ setupId: setup.id, tf: nextTf }),
    [setup.id]
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveStatusMsg, setLiveStatusMsg] = useState('');
  const [crosshairOhlc, setCrosshairOhlc] = useState<CrosshairOhlc | null>(null);

  const [selectedTz, setSelectedTz] = useState<string>(() => {
    return localStorage.getItem('manna_chart_timezone') || 'America/New_York';
  });
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('manna_chart_theme') as 'dark' | 'light') || 'dark';
  });

  const [showBidAsk, setShowBidAsk] = useState<boolean>(() => {
    try {
      return localStorage.getItem('manna_chart_show_bid_ask') === 'true';
    } catch {
      return false;
    }
  });
  const [serverQuote, setServerQuote] = useState<{ bid?: number; ask?: number; spread?: number; price?: number } | null>(null);
  const [feedProvider, setFeedProvider] = useState<string>('');
  const [copiedTradeId, setCopiedTradeId] = useState(false);

  const announce = useCallback((msg: string) => {
    setLiveStatusMsg('');
    requestAnimationFrame(() => setLiveStatusMsg(msg));
  }, []);

  const toggleBidAsk = () => {
    setShowBidAsk(prev => {
      const next = !prev;
      safeStorageSet('manna_chart_show_bid_ask', String(next));
      return next;
    });
  };

  const isLong = (setup.bias || 'long').toLowerCase() === 'long';
  const { decimals, minMove } = getInstrumentFormat(setup.instrument);
  const priceEps = minMove * 2;

  const levels: Partial<NonNullable<ExtendedSetup['levels']>> = extSetup.levels || {};

  // Robust level extraction with fallbacks for all property naming variants
  const entryLow = parseNum(setup.entry_zone_low ?? extSetup.entry_low ?? levels.entryMin ?? levels.entry_low);
  const entryHigh = parseNum(setup.entry_zone_high ?? extSetup.entry_high ?? levels.entryMax ?? levels.entry_high);
  const entryMid =
    parseNum(setup.entry_zone_mid ?? extSetup.entry_mid ?? extSetup.entry_price ?? levels.entryMid) ||
    (entryLow && entryHigh ? (entryLow + entryHigh) / 2 : 0);
  const stopVal = parseNum(setup.stop ?? extSetup.stop_loss ?? levels.stopLoss ?? levels.stop);
  const initialStopVal = parseNum(setup.initial_stop ?? extSetup.initialStop ?? stopVal);
  const tp1Val = parseNum(setup.tp1 ?? extSetup.target1 ?? levels.takeProfit1 ?? levels.tp1);
  const tp2Val = (setup.tp2 || extSetup.target2 || levels.takeProfit2 || levels.tp2)
    ? parseNum(setup.tp2 ?? extSetup.target2 ?? levels.takeProfit2 ?? levels.tp2)
    : undefined;
  const currentPrice = parseNum(setup.current_price);

  const isPending = setup.signal_state === 'awaiting_entry';
  const isActive = setup.signal_state === 'active';
  const isRunner = setup.signal_state === 'runner';
  const isResolved =
    setup.signal_state === 'resolved' ||
    setup.signal_state === 'invalidated' ||
    setup.signal_state === 'superseded';

  const actualEntryTimestamp =
    setup.entry_triggered_at ||
    setup.entryAt ||
    extSetup.time_entered ||
    null;

  const signalCreatedTimestamp =
    setup.created_at ||
    setup.createdAt ||
    setup.validatedAt ||
    extSetup.time_signaled ||
    null;

  const entryTimestamp = actualEntryTimestamp;

  const resolvedTimestamp =
    setup.resolved_at ||
    extSetup.time_exited ||
    extSetup.execution_time ||
    extSetup.closed_at;

  const computedFillMinutes = (() => {
    if (setup.time_to_fill_min !== undefined) return setup.time_to_fill_min;
    if (!signalCreatedTimestamp || !actualEntryTimestamp) return undefined;
    const diff = Math.round((new Date(actualEntryTimestamp).getTime() - new Date(signalCreatedTimestamp).getTime()) / 60000);
    return Number.isFinite(diff) && diff >= 0 ? diff : undefined;
  })();

  const computedHeldMinutes = (() => {
    if (setup.holding_duration_min !== undefined) return setup.holding_duration_min;
    if (setup.duration_min !== undefined) return setup.duration_min;
    if (!actualEntryTimestamp || !resolvedTimestamp) return undefined;
    const diff = Math.max(0.1, (new Date(resolvedTimestamp).getTime() - new Date(actualEntryTimestamp).getTime()) / 60000);
    return Number.isFinite(diff) ? Number(diff.toFixed(1)) : undefined;
  })();

  const execPrice = parseNum(setup.entry_price_recorded ?? setup.entry_price_executed ?? entryMid);

  const exitPriceVal = parseNum(
    setup.execution_price ?? extSetup.exit_price ?? (
      isResolved && (setup.invalidation_reason || setup.outcome_type)?.includes('tp1') ? tp1Val :
      isResolved && (setup.invalidation_reason || setup.outcome_type)?.includes('tp2') ? (tp2Val || tp1Val) :
      isResolved && (setup.invalidation_reason || setup.outcome_type)?.includes('sl') ? initialStopVal :
      isResolved && (setup.invalidation_reason || setup.outcome_type)?.includes('be') ? execPrice : 0
    )
  );

  const outcomeR = setup.realized_r !== undefined ? setup.realized_r : (
    (setup.outcome_type || setup.invalidation_reason)?.includes('tp2') ? (setup.r_multiple_2 || 3.0) :
    (setup.outcome_type || setup.invalidation_reason)?.includes('tp1') ? (setup.r_multiple_1 || 2.0) :
    (setup.outcome_type || setup.invalidation_reason)?.includes('sl') ? -1.0 :
    (setup.outcome_type || setup.invalidation_reason)?.includes('be') ? 0.0 : undefined
  );
  const outcomePl = setup.realized_pl !== undefined ? setup.realized_pl : (outcomeR !== undefined ? outcomeR * 100 : undefined);

  const tradeTelegramId = formatTelegramTradeId(setup);
  const isMannaSnd = setup.strategy_id === 'manna_snd';

  const htfProximal = parseNum(metadata.htf_curve_proximal);
  const htfDistal = parseNum(metadata.htf_curve_distal);
  const htfType = (metadata.htf_curve_type || (isLong ? 'demand' : 'supply')).toLowerCase();
  const curveLocation = metadata.curveLocation || (isLong ? 'low' : 'high');
  const trend15m = metadata.trend15m || 'up';
  const formation = metadata.formation || metadata.entry_zone_formation || (isLong ? 'Rally-Base-Rally' : 'Drop-Base-Drop');

  const activeDemandProx = parseNum(metadata.htf_demand_proximal || (htfType === 'demand' ? htfProximal : (entryLow ? entryLow * 0.995 : 0)));
  const activeDemandDist = parseNum(metadata.htf_demand_distal || (htfType === 'demand' ? htfDistal : (activeDemandProx ? activeDemandProx * 0.997 : 0)));
  const activeDemandTime = metadata.htf_demand_base_time || metadata.htf_curve_base_time || metadata.entry_zone_base_time;

  const activeSupplyProx = parseNum(metadata.htf_supply_proximal || (htfType === 'supply' ? htfProximal : (entryHigh ? entryHigh * 1.005 : 0)));
  const activeSupplyDist = parseNum(metadata.htf_supply_distal || (htfType === 'supply' ? htfDistal : (activeSupplyProx ? activeSupplyProx * 1.003 : 0)));
  const activeSupplyTime = metadata.htf_supply_base_time || metadata.htf_curve_base_time || metadata.entry_zone_base_time;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    levelsRef.current = [
      entryLow, entryHigh, entryMid, stopVal, initialStopVal, tp1Val, tp2Val, exitPriceVal,
      activeDemandProx, activeDemandDist, activeSupplyProx, activeSupplyDist,
    ].filter((p): p is number => typeof p === 'number' && p > 0);
  }, [
    entryLow, entryHigh, entryMid, stopVal, initialStopVal, tp1Val, tp2Val, exitPriceVal,
    activeDemandProx, activeDemandDist, activeSupplyProx, activeSupplyDist,
  ]);

  useEffect(() => {
    showBidAskRef.current = showBidAsk;
  }, [showBidAsk]);

  const handleZoom = (zoomIn: boolean) => {
    if (!chartRef.current) return;
    const timeScale = chartRef.current.timeScale();
    const visibleRange = timeScale.getVisibleLogicalRange();
    if (visibleRange) {
      const delta = (visibleRange.to - visibleRange.from) * 0.25;
      const newFrom = zoomIn ? visibleRange.from + delta : visibleRange.from - delta;
      const newTo = zoomIn ? visibleRange.to - delta : visibleRange.to + delta;
      timeScale.setVisibleLogicalRange({ from: newFrom, to: newTo });
    }
  };

  const handleFitAll = () => {
    if (!chartRef.current) return;
    chartRef.current.priceScale('right').applyOptions({ autoScale: true });
    chartRef.current.timeScale().fitContent();
    setTimeout(() => {
      chartRef.current?.priceScale('right').applyOptions({ autoScale: false });
    }, 100);
    announce('Chart view fitted to all candles and levels');
  };

  const handleCopyTradeId = async () => {
    try {
      await navigator.clipboard.writeText(tradeTelegramId);
      setCopiedTradeId(true);
      announce(`Copied trade ID ${tradeTelegramId}`);
      setTimeout(() => setCopiedTradeId(false), 2000);
    } catch {
      announce('Copy failed');
    }
  };

  const handleRequestClose = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog && dialog.open) {
      dialog.close();
    } else {
      onCloseRef.current();
    }
  }, []);

  const drawZones = useCallback(() => {
    if (!chartRef.current || !candleSeriesRef.current || !overlayCanvasRef.current || !chartContainerRef.current) return;
    const canvas = overlayCanvasRef.current;
    const ctx = canvas.getContext('2d') as RoundRectCanvasCtx | null;
    if (!ctx) return;

    const container = chartContainerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width <= 0 || height <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const series = candleSeriesRef.current;
    const timeScale = chartRef.current.timeScale();
    const isLight = theme === 'light';

    let priceScaleWidth = 84;
    try {
      const w = chartRef.current.priceScale('right').width();
      if (w > 40) priceScaleWidth = w + 10;
    } catch {
      // Default right margin used when scale width is unavailable
    }
    const plotRightEdge = Math.max(120, width - priceScaleWidth);

    const getY = (price: number) => {
      if (!price || price <= 0) return null;
      try {
        return series.priceToCoordinate(price);
      } catch {
        return null;
      }
    };

    const getCandleX = (targetUnix: number): number | null => {
      const candles = displayCandlesRef.current;
      if (!candles || candles.length === 0) return null;

      try {
        const exactX = timeScale.timeToCoordinate(targetUnix as UTCTimestamp);
        if (exactX !== null && !isNaN(exactX) && exactX >= 0 && exactX <= width) {
          return exactX;
        }
      } catch {
        // Fallback to containing candle below
      }

      const containingCandle = findContainingCandle(candles, targetUnix, timeframe);
      if (containingCandle) {
        try {
          const cX = timeScale.timeToCoordinate(containingCandle.time);
          if (cX !== null && !isNaN(cX)) {
            return cX;
          }
        } catch {
          return null;
        }
      }

      return null;
    };

    const getX = (timeStr?: string) => {
      if (!timeStr) return 0;
      try {
        const unixTime = Math.floor(new Date(timeStr).getTime() / 1000);
        return getCandleX(unixTime) ?? 0;
      } catch {
        return 0;
      }
    };

    const drawZonePill = (text: string, x: number, y: number, fg: string, border: string) => {
      ctx.save();
      ctx.font = '600 10px "JetBrains Mono", monospace';
      const padX = 6;
      const textW = ctx.measureText(text).width;
      const pillW = textW + padX * 2;
      const pillH = 16;
      const clampedX = Math.max(8, Math.min(plotRightEdge - pillW - 6, x));
      const clampedY = Math.max(6, Math.min(height - pillH - 28, y));

      ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.92)' : 'rgba(11, 15, 23, 0.9)';
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(clampedX, clampedY, pillW, pillH, 3);
      } else {
        ctx.rect(clampedX, clampedY, pillW, pillH);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = fg;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, clampedX + padX, clampedY + pillH / 2 + 0.5);
      ctx.restore();
    };

    // 1. Draw 1H HTF Demand & Supply Curve Zones for Manna SnD
    if (isMannaSnd) {
      if (activeDemandProx > 0 && activeDemandDist > 0) {
        const rawY1 = series.priceToCoordinate(activeDemandProx);
        const rawY2 = series.priceToCoordinate(activeDemandDist);

        const y1 = rawY1 !== null ? rawY1 : height - 20;
        const y2 = rawY2 !== null ? rawY2 : height - 5;

        const topY = Math.max(0, Math.min(height - 25, Math.min(y1, y2)));
        const bottomY = Math.max(0, Math.min(height - 2, Math.max(y1, y2)));
        const boxHeight = Math.max(12, Math.abs(bottomY - topY));
        const startX = getX(activeDemandTime);

        let endX = plotRightEdge;
        if (isResolved && resolvedTimestamp) {
          const exitUnix = Math.floor(new Date(resolvedTimestamp).getTime() / 1000);
          const resolvedX = getCandleX(exitUnix);
          if (resolvedX !== null && resolvedX > startX) {
            endX = Math.min(plotRightEdge, resolvedX);
          }
        } else {
          const candles = displayCandlesRef.current;
          const baseUnix = activeDemandTime ? Math.floor(new Date(activeDemandTime).getTime() / 1000) : 0;
          for (const c of candles) {
            if ((c.time as number) > baseUnix && c.low < Math.min(activeDemandProx, activeDemandDist)) {
              const bX = getCandleX(c.time as number);
              if (bX !== null && bX > startX) { endX = Math.min(plotRightEdge, bX); break; }
            }
          }
        }
        const boxWidth = Math.max(10, endX - startX);

        ctx.save();
        ctx.fillStyle = isLight ? 'rgba(5, 150, 105, 0.07)' : 'rgba(16, 185, 129, 0.08)';
        ctx.strokeStyle = isLight ? 'rgba(5, 150, 105, 0.4)' : 'rgba(16, 185, 129, 0.38)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.fillRect(startX, topY, boxWidth, boxHeight);
        ctx.strokeRect(startX, topY, boxWidth, boxHeight);
        ctx.restore();

        const dMin = formatPrice(Math.min(activeDemandProx, activeDemandDist), decimals);
        const dMax = formatPrice(Math.max(activeDemandProx, activeDemandDist), decimals);
        const form = metadata.htf_demand_formation ? ` · ${metadata.htf_demand_formation}` : '';
        drawZonePill(
          `1H DEMAND${form} ${dMin}–${dMax}`,
          startX + 8,
          topY + 4,
          isLight ? '#047857' : '#34d399',
          isLight ? 'rgba(5, 150, 105, 0.35)' : 'rgba(16, 185, 129, 0.4)'
        );
      }

      if (activeSupplyProx > 0 && activeSupplyDist > 0) {
        const rawY1 = series.priceToCoordinate(activeSupplyProx);
        const rawY2 = series.priceToCoordinate(activeSupplyDist);

        const y1 = rawY1 !== null ? rawY1 : 5;
        const y2 = rawY2 !== null ? rawY2 : 20;

        const topY = Math.max(0, Math.min(height - 25, Math.min(y1, y2)));
        const bottomY = Math.max(0, Math.min(height - 2, Math.max(y1, y2)));
        const boxHeight = Math.max(12, Math.abs(bottomY - topY));
        const startX = getX(activeSupplyTime);

        let endX = plotRightEdge;
        if (isResolved && resolvedTimestamp) {
          const exitUnix = Math.floor(new Date(resolvedTimestamp).getTime() / 1000);
          const resolvedX = getCandleX(exitUnix);
          if (resolvedX !== null && resolvedX > startX) {
            endX = Math.min(plotRightEdge, resolvedX);
          }
        } else {
          const candles = displayCandlesRef.current;
          const baseUnix = activeSupplyTime ? Math.floor(new Date(activeSupplyTime).getTime() / 1000) : 0;
          for (const c of candles) {
            if ((c.time as number) > baseUnix && c.high > Math.max(activeSupplyProx, activeSupplyDist)) {
              const bX = getCandleX(c.time as number);
              if (bX !== null && bX > startX) { endX = Math.min(plotRightEdge, bX); break; }
            }
          }
        }
        const boxWidth = Math.max(10, endX - startX);

        ctx.save();
        ctx.fillStyle = isLight ? 'rgba(220, 38, 38, 0.06)' : 'rgba(239, 68, 68, 0.08)';
        ctx.strokeStyle = isLight ? 'rgba(220, 38, 38, 0.38)' : 'rgba(239, 68, 68, 0.38)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.fillRect(startX, topY, boxWidth, boxHeight);
        ctx.strokeRect(startX, topY, boxWidth, boxHeight);
        ctx.restore();

        const sMin = formatPrice(Math.min(activeSupplyProx, activeSupplyDist), decimals);
        const sMax = formatPrice(Math.max(activeSupplyProx, activeSupplyDist), decimals);
        const form = metadata.htf_supply_formation ? ` · ${metadata.htf_supply_formation}` : '';
        drawZonePill(
          `1H SUPPLY${form} ${sMin}–${sMax}`,
          startX + 8,
          topY + 4,
          isLight ? '#b91c1c' : '#f87171',
          isLight ? 'rgba(220, 38, 38, 0.35)' : 'rgba(239, 68, 68, 0.4)'
        );
      }
    }

    // 2. Draw 15M Entry Zone Shaded Box
    if (entryLow > 0 && entryHigh > 0) {
      const y1 = getY(entryHigh);
      const y2 = getY(entryLow);

      if (y1 !== null && y2 !== null) {
        const topY = Math.min(y1, y2);
        const boxHeight = Math.max(4, Math.abs(y2 - y1));
        const zoneBaseTime = metadata.entry_zone_base_time || setup.created_at || setup.createdAt;
        let startX = getX(zoneBaseTime);
        if ((startX === null || startX === undefined) && setup.created_at) {
          startX = getX(setup.created_at);
        }
        if (startX === null || startX === undefined) {
          startX = 0;
        }

        let endX = plotRightEdge;
        if (isResolved && resolvedTimestamp) {
          const exitUnix = Math.floor(new Date(resolvedTimestamp).getTime() / 1000);
          const resolvedX = getCandleX(exitUnix);
          if (resolvedX !== null && resolvedX > startX) {
            endX = Math.min(plotRightEdge, resolvedX);
          }
        } else {
          const candles = displayCandlesRef.current;
          const zoneBaseUnix = zoneBaseTime ? Math.floor(new Date(zoneBaseTime).getTime() / 1000) : 0;
          for (const c of candles) {
            const cUnix = c.time as number;
            if (cUnix > zoneBaseUnix) {
              const isBreached = isLong ? c.low < entryLow : c.high > entryHigh;
              if (isBreached) {
                const breachX = getCandleX(cUnix);
                if (breachX !== null && breachX > startX) {
                  endX = Math.min(plotRightEdge, breachX);
                  break;
                }
              }
            }
          }
        }
        const boxWidth = Math.max(10, endX - startX);

        ctx.save();
        ctx.fillStyle = isLong
          ? (isLight ? 'rgba(217, 119, 6, 0.08)' : 'rgba(245, 158, 11, 0.09)')
          : (isLight ? 'rgba(220, 38, 38, 0.07)' : 'rgba(239, 68, 68, 0.09)');
        ctx.strokeStyle = isLong
          ? (isLight ? 'rgba(180, 83, 9, 0.45)' : 'rgba(245, 158, 11, 0.45)')
          : (isLight ? 'rgba(185, 28, 28, 0.45)' : 'rgba(239, 68, 68, 0.45)');
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.fillRect(startX, topY, boxWidth, boxHeight);
        ctx.strokeRect(startX, topY, boxWidth, boxHeight);
        ctx.restore();

        drawZonePill(
          `${entryTfLabel} ZONE ${formatPrice(entryLow, decimals)}–${formatPrice(entryHigh, decimals)}`,
          startX + 8,
          topY - 20 > 8 ? topY - 20 : topY + 4,
          isLong ? (isLight ? '#92400e' : '#fbbf24') : (isLight ? '#991b1b' : '#fca5a5'),
          isLong
            ? (isLight ? 'rgba(180, 83, 9, 0.35)' : 'rgba(245, 158, 11, 0.4)')
            : (isLight ? 'rgba(185, 28, 28, 0.35)' : 'rgba(239, 68, 68, 0.4)')
        );
      }
    }

    // 3. Draw Exact Entry Point Marker (or Signal Sent Reference for Unfilled Setups)
    const markerTimestampStr = actualEntryTimestamp || (isPending ? signalCreatedTimestamp : null);
    const targetEntryTime = markerTimestampStr
      ? new Date(markerTimestampStr).getTime()
      : null;

    if (targetEntryTime && Number.isFinite(targetEntryTime)) {
      try {
        const entryUnix = Math.floor(targetEntryTime / 1000);
        const entryX = getCandleX(entryUnix);
        const entryPriceVal = execPrice > 0 ? execPrice : (entryMid > 0 ? entryMid : (entryLow + entryHigh) / 2);
        const entryY = entryPriceVal > 0 ? getY(entryPriceVal) : null;

        if (entryX !== null && entryX > 0 && entryX < plotRightEdge) {
          let line1Text: string;
          let line2Text: string | null = null;
          const timeSuffix = formatTzTime(entryUnix, selectedTz, false);
          if (!actualEntryTimestamp) {
            const formatted = entryPriceVal > 0 ? formatPrice(entryPriceVal, decimals) : 'Zone';
            line1Text = `SENT · TARGET ${formatted}`;
            line2Text = `${timeSuffix} ${getTimezoneBadge(selectedTz)}`;
          } else if (showBidAsk && entryPriceVal > 0) {
            const { bid: entryBid, ask: entryAsk, filledSide } = getDirectionalBidAsk(
              setup.instrument, entryPriceVal, isLong, true, serverQuote
            );
            if (filledSide === 'ask') {
              line1Text = `${isLong ? '▲' : '▼'} ENTRY · ASK ${entryAsk.toFixed(decimals)}`;
              line2Text = `${timeSuffix} ${getTimezoneBadge(selectedTz)} · BID ${entryBid.toFixed(decimals)}`;
            } else {
              line1Text = `${isLong ? '▲' : '▼'} ENTRY · BID ${entryBid.toFixed(decimals)}`;
              line2Text = `${timeSuffix} ${getTimezoneBadge(selectedTz)} · ASK ${entryAsk.toFixed(decimals)}`;
            }
          } else {
            const formatted = entryPriceVal > 0 ? formatPrice(entryPriceVal, decimals) : 'Zone';
            line1Text = `${isLong ? '▲ ENTRY' : '▼ ENTRY'} ${formatted}`;
            line2Text = `${timeSuffix} ${getTimezoneBadge(selectedTz)}`;
          }

          ctx.save();
          ctx.strokeStyle = isLight ? 'rgba(3, 105, 161, 0.22)' : 'rgba(56, 189, 248, 0.22)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(entryX, 0);
          ctx.lineTo(entryX, height);
          ctx.stroke();
          ctx.restore();

          if (entryY !== null && !isNaN(entryY) && entryY >= 0 && entryY <= height) {
            ctx.save();
            const accentColor = isLong ? (isLight ? '#0284c7' : '#38bdf8') : (isLight ? '#c2410c' : '#fb923c');

            ctx.beginPath();
            ctx.arc(entryX, entryY, 10, 0, Math.PI * 2);
            ctx.fillStyle = isLong
              ? (isLight ? 'rgba(2, 132, 199, 0.22)' : 'rgba(56, 189, 248, 0.26)')
              : (isLight ? 'rgba(194, 65, 12, 0.22)' : 'rgba(251, 146, 60, 0.26)');
            ctx.fill();

            ctx.beginPath();
            ctx.arc(entryX, entryY, 5, 0, Math.PI * 2);
            ctx.fillStyle = accentColor;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.fillStyle = accentColor;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            if (isLong) {
              const tipY = entryY + 8;
              ctx.moveTo(entryX, tipY);
              ctx.lineTo(entryX - 5, tipY + 9);
              ctx.lineTo(entryX + 5, tipY + 9);
            } else {
              const tipY = entryY - 8;
              ctx.moveTo(entryX, tipY);
              ctx.lineTo(entryX - 5, tipY - 9);
              ctx.lineTo(entryX + 5, tipY - 9);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.font = '700 11px "JetBrains Mono", monospace';
            const padX = 9;
            const line1W = ctx.measureText(line1Text).width;
            ctx.font = '500 10px "JetBrains Mono", monospace';
            const line2W = line2Text ? ctx.measureText(line2Text).width : 0;
            const badgeW = Math.max(line1W, line2W) + padX * 2;
            const badgeH = line2Text ? 36 : 22;

            let pillX = entryX + 14;
            if (pillX + badgeW > plotRightEdge - 8) {
              pillX = Math.max(8, entryX - badgeW - 14);
            }
            let pillY = isLong ? entryY - badgeH - 10 : entryY + 12;
            if (pillY < 10) pillY = entryY + 12;
            if (pillY + badgeH > height - 28) pillY = Math.max(10, entryY - badgeH - 10);

            ctx.shadowColor = isLight ? 'rgba(15, 23, 42, 0.12)' : 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetY = 2;

            ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.96)' : 'rgba(15, 23, 42, 0.94)';
            ctx.strokeStyle = accentColor;
            ctx.lineWidth = 1.25;
            ctx.setLineDash([]);
            ctx.beginPath();
            if (ctx.roundRect) {
              ctx.roundRect(pillX, pillY, badgeW, badgeH, 5);
            } else {
              ctx.rect(pillX, pillY, badgeW, badgeH);
            }
            ctx.fill();
            ctx.shadowColor = 'transparent';
            ctx.stroke();

            ctx.textBaseline = 'middle';
            ctx.fillStyle = accentColor;
            ctx.font = '700 11px "JetBrains Mono", monospace';
            ctx.fillText(line1Text, pillX + padX, line2Text ? pillY + 11 : pillY + badgeH / 2);

            if (line2Text) {
              ctx.fillStyle = isLight ? '#475569' : '#94a3b8';
              ctx.font = '500 10px "JetBrains Mono", monospace';
              ctx.fillText(line2Text, pillX + padX, pillY + 25);
            }

            ctx.restore();
          }
        }
      } catch (err) {
        console.warn('Failed to draw entry marker:', err);
      }
    }

    // 4. Vertical Resolved / Exit Timestamp Line & Badge (Review Charts Only)
    if (resolvedTimestamp && isResolved) {
      try {
        const resUnix = Math.floor(new Date(resolvedTimestamp).getTime() / 1000);
        const resX = getCandleX(resUnix);

        if (resX !== null && resX > 0 && resX < plotRightEdge) {
          const reason = (setup.outcome_type || setup.invalidation_reason || 'resolved').toUpperCase();
          const isWin = reason.includes('TP');
          const flagColor = isWin
            ? (isLight ? 'rgba(5, 150, 105, 0.35)' : 'rgba(16, 185, 129, 0.38)')
            : (isLight ? 'rgba(220, 38, 38, 0.35)' : 'rgba(239, 68, 68, 0.38)');
          const pillFg = isWin
            ? (isLight ? '#047857' : '#34d399')
            : (isLight ? '#b91c1c' : '#f87171');

          ctx.save();
          ctx.strokeStyle = flagColor;
          ctx.lineWidth = 1.25;
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(resX, 0);
          ctx.lineTo(resX, height);
          ctx.stroke();
          ctx.restore();

          const exitY = exitPriceVal > 0 ? getY(exitPriceVal) : 28;
          const cleanReason = reason.replace('_HIT', '').replace('_PRE_ENTRY', '');
          const exitTimeLabel = `${formatTzTime(resUnix, selectedTz, false)} ${getTimezoneBadge(selectedTz)}`;
          const exitText = exitPriceVal > 0
            ? `EXIT ${cleanReason} ${formatPrice(exitPriceVal, decimals)} · ${exitTimeLabel}`
            : `${cleanReason} · ${exitTimeLabel}`;
          drawZonePill(
            exitText,
            resX - 90,
            exitY !== null ? exitY - 26 : 16,
            pillFg,
            flagColor
          );
        }
      } catch {
        // Ignore unparseable resolved timestamp
      }
    }
  }, [
    isMannaSnd, entryLow, entryHigh, entryMid, entryTfLabel, timeframe,
    isLong, isResolved, isPending, metadata, actualEntryTimestamp, signalCreatedTimestamp,
    resolvedTimestamp, execPrice, exitPriceVal, theme, showBidAsk, serverQuote, selectedTz,
    decimals, activeDemandProx, activeDemandDist, activeDemandTime,
    activeSupplyProx, activeSupplyDist, activeSupplyTime, setup.created_at,
    setup.createdAt, setup.invalidation_reason, setup.outcome_type, setup.instrument,
  ]);

  useEffect(() => {
    drawZonesRef.current = drawZones;
  }, [drawZones]);

  // 0. Open native <dialog> in the top layer on mount and wire native close/Esc
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!dialog.open) {
      dialog.showModal();
    }

    const handleClose = () => {
      onCloseRef.current();
    };
    dialog.addEventListener('close', handleClose);

    return () => {
      dialog.removeEventListener('close', handleClose);
      if (dialog.open) {
        dialog.close();
      }
    };
  }, []);

  // 0b. Toolbar roving-tabindex fallback only where native focusgroup is unsupported
  useEffect(() => {
    const bar = toolbarRef.current;
    if (!bar || 'focusGroup' in HTMLElement.prototype) return;

    const getItems = () => Array.from(bar.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
    const initialItems = getItems();
    initialItems.forEach((b, i) => {
      b.tabIndex = i === 0 ? 0 : -1;
    });

    const handleFocusIn = (e: FocusEvent) => {
      const items = getItems();
      const target = e.target as HTMLButtonElement | null;
      if (target && items.includes(target)) {
        items.forEach((b) => {
          b.tabIndex = b === target ? 0 : -1;
        });
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const items = getItems();
      if (items.length === 0) return;
      const activeIdx = items.indexOf(document.activeElement as HTMLButtonElement);
      if (activeIdx === -1) return;

      const rtl = getComputedStyle(bar).direction === 'rtl';
      const step =
        e.key === 'ArrowRight' ? (rtl ? -1 : 1) :
        e.key === 'ArrowLeft' ? (rtl ? 1 : -1) :
        e.key === 'Home' ? -activeIdx :
        e.key === 'End' ? items.length - 1 - activeIdx : 0;

      if (step === 0 && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      const nextIdx = (activeIdx + step + items.length) % items.length;
      items[nextIdx].focus();
    };

    bar.addEventListener('focusin', handleFocusIn);
    bar.addEventListener('keydown', handleKeyDown);
    return () => {
      bar.removeEventListener('focusin', handleFocusIn);
      bar.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // 1. Initialize Chart Canvas ONCE on mount
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const container = chartContainerRef.current;
    container.innerHTML = '';

    const containerHeight = container.clientHeight || (window.innerHeight - 140);
    const initialTheme = (localStorage.getItem('manna_chart_theme') as 'dark' | 'light') || 'dark';
    const initialTz = localStorage.getItem('manna_chart_timezone') || 'America/New_York';
    const palette = getChartThemePalette(initialTheme);
    const targetTz = getEffectiveTimezone(initialTz);

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: palette.bg },
        textColor: palette.text,
        fontSize: 11,
        fontFamily: "'JetBrains Mono', monospace",
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      width: container.clientWidth,
      height: containerHeight,
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: palette.crosshair,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: palette.crosshairLabelBg,
        },
        horzLine: {
          color: palette.crosshair,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: palette.crosshairLabelBg,
        },
      },
      rightPriceScale: {
        borderColor: palette.border,
        scaleMargins: { top: 0.1, bottom: 0.1 },
        autoScale: true,
      },
      timeScale: {
        borderColor: palette.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
        tickMarkFormatter: (time: Time, tickMarkType: number, locale: string) => {
          try {
            const d = new Date((time as number) * 1000);
            if (tickMarkType < 3) {
              return d.toLocaleDateString(locale || 'en-US', { timeZone: targetTz, month: 'short', day: 'numeric' });
            }
            return d.toLocaleTimeString(locale || 'en-US', { timeZone: targetTz, hour: '2-digit', minute: '2-digit', hour12: false });
          } catch {
            return '';
          }
        },
      },
      localization: {
        timeFormatter: (time: Time) => {
          try {
            const d = new Date((time as number) * 1000);
            return d.toLocaleString('en-US', {
              timeZone: targetTz,
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            });
          } catch {
            return new Date((time as number) * 1000).toISOString();
          }
        },
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: palette.upColor,
      downColor: palette.downColor,
      borderUpColor: palette.upColor,
      borderDownColor: palette.downColor,
      wickUpColor: palette.upColor,
      wickDownColor: palette.downColor,
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null): AutoscaleInfo | null => {
        const res = original();
        let min = res?.priceRange?.minValue;
        let max = res?.priceRange?.maxValue;

        for (const p of levelsRef.current) {
          if (min === undefined || p < min) min = p;
          if (max === undefined || p > max) max = p;
        }

        if (min !== undefined && max !== undefined) {
          const margin = (max - min) * 0.08;
          min -= margin;
          max += margin;
        }

        return min !== undefined && max !== undefined
          ? { priceRange: { minValue: min, maxValue: max } }
          : res;
      },
    });

    const handleCrosshairMove = (param: MouseEventParams<Time>) => {
      if (!param || !param.time || !param.seriesData) {
        setCrosshairOhlc(null);
        return;
      }
      const bar = param.seriesData.get(candleSeries) as CandlestickData<Time> | undefined;
      if (!bar || bar.open === undefined) {
        setCrosshairOhlc(null);
        return;
      }
      const tz = getEffectiveTimezone(localStorage.getItem('manna_chart_timezone') || 'America/New_York');
      let timeStr: string;
      try {
        const d = new Date((param.time as number) * 1000);
        timeStr = d.toLocaleString('en-US', {
          timeZone: tz,
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
      } catch {
        timeStr = '';
      }
      setCrosshairOhlc({
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        timeStr,
        isUp: bar.close >= bar.open,
      });
    };

    chart.subscribeCrosshairMove(handleCrosshairMove);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        const width = chartContainerRef.current.clientWidth;
        const height = chartContainerRef.current.clientHeight;
        if (width > 0 && height > 0) {
          chartRef.current.applyOptions({ width, height });
        }
      }
    };
    window.addEventListener('resize', handleResize);

    let resizeObserver: ResizeObserver | null = null;
    if (chartContainerRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(chartContainerRef.current);
    }

    return () => {
      try { chart.unsubscribeCrosshairMove(handleCrosshairMove); } catch { /* ignored */ }
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, []);

  // Update series priceFormat precision dynamically for the active instrument
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    candleSeriesRef.current.applyOptions({
      priceFormat: {
        type: 'price',
        precision: decimals,
        minMove,
      },
    });
  }, [decimals, minMove]);

  // Dynamically update theme options on existing chart canvas
  useEffect(() => {
    safeStorageSet('manna_chart_theme', theme);
    if (!chartRef.current) return;

    const palette = getChartThemePalette(theme);
    chartRef.current.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: palette.bg },
        textColor: palette.text,
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      crosshair: {
        vertLine: {
          color: palette.crosshair,
          labelBackgroundColor: palette.crosshairLabelBg,
        },
        horzLine: {
          color: palette.crosshair,
          labelBackgroundColor: palette.crosshairLabelBg,
        },
      },
      rightPriceScale: {
        borderColor: palette.border,
      },
      timeScale: {
        borderColor: palette.border,
      },
    });

    if (candleSeriesRef.current) {
      candleSeriesRef.current.applyOptions({
        upColor: palette.upColor,
        downColor: palette.downColor,
        borderUpColor: palette.upColor,
        borderDownColor: palette.downColor,
        wickUpColor: palette.upColor,
        wickDownColor: palette.downColor,
      });
    }
  }, [theme]);

  // Dynamically update timezone formatting on existing chart canvas
  useEffect(() => {
    safeStorageSet('manna_chart_timezone', selectedTz);
    if (!chartRef.current) return;

    const targetTz = getEffectiveTimezone(selectedTz);
    chartRef.current.applyOptions({
      timeScale: {
        tickMarkFormatter: (time: Time, tickMarkType: number, locale: string) => {
          try {
            const d = new Date((time as number) * 1000);
            if (tickMarkType < 3) {
              return d.toLocaleDateString(locale || 'en-US', { timeZone: targetTz, month: 'short', day: 'numeric' });
            }
            return d.toLocaleTimeString(locale || 'en-US', { timeZone: targetTz, hour: '2-digit', minute: '2-digit', hour12: false });
          } catch {
            return '';
          }
        },
      },
      localization: {
        timeFormatter: (time: Time) => {
          try {
            const d = new Date((time as number) * 1000);
            return d.toLocaleString('en-US', {
              timeZone: targetTz,
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            });
          } catch {
            return new Date((time as number) * 1000).toISOString();
          }
        },
      },
    });
  }, [selectedTz]);

  // 2. Fetch candles and draw price lines whenever timeframe, timezone, or levels update
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    const candleSeries = candleSeriesRef.current;

    priceLinesRef.current.forEach(line => {
      try { candleSeries.removePriceLine(line); } catch { /* ignored */ }
    });
    priceLinesRef.current = [];

    let count =
      timeframe === '1m' ? 1000 :
      timeframe === '5m' ? 1000 :
      timeframe === '15m' ? 800 :
      timeframe === '1h' ? 720 :
      timeframe === '4h' ? 500 : 365;
    if (isResolved) {
      count = Math.max(count, 2000);
    }

    const encodedInst = encodeURIComponent(setup.instrument);
    fetch(`${API_BASE}/api/candles/${encodedInst}?timeframe=${timeframe}&count=${count}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (!isMounted || !candleSeriesRef.current) return;
        if (!data.candles || data.candles.length === 0) {
          throw new Error('No candle data available for ' + setup.instrument);
        }

        if (data.quote) setServerQuote(data.quote);
        if (data.provider) setFeedProvider(data.provider);

        const formattedCandles: CandlestickData<Time>[] = (data.candles as RawCandle[]).map((c) => ({
          time: Math.floor(new Date(c.timestamp).getTime() / 1000) as UTCTimestamp,
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
        }));

        let displayCandles = formattedCandles;
        if (isResolved && resolvedTimestamp) {
          try {
            const exitUnix = Math.floor(new Date(resolvedTimestamp).getTime() / 1000);
            const filtered = formattedCandles.filter((c) => (c.time as number) <= exitUnix);
            if (filtered.length > 0) {
              displayCandles = filtered;
            }
          } catch (e) {
            console.warn('Failed to filter post-exit candles for review chart:', e);
          }
        }

        displayCandlesRef.current = displayCandles;
        candleSeries.setData(displayCandles);

        const lines: IPriceLine[] = [];
        const primaryEntry = execPrice > 0 ? execPrice : (entryMid > 0 ? entryMid : ((entryLow + entryHigh) / 2));
        const isBeStopAtEntry = primaryEntry > 0 && stopVal > 0 && Math.abs(stopVal - primaryEntry) <= priceEps;

        // 1. Entry Line
        if (!isPending && primaryEntry > 0) {
          lines.push(candleSeries.createPriceLine({
            price: primaryEntry,
            color: '#f59e0b',
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: isBeStopAtEntry ? 'ENTRY / BE' : 'ENTRY',
          }));
        } else if (isPending && entryMid > 0) {
          lines.push(candleSeries.createPriceLine({
            price: entryMid,
            color: '#f59e0b',
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: 'PENDING',
          }));
        }

        // 2. Initial Stop Line
        const effectiveInitialStop = initialStopVal > 0 ? initialStopVal : stopVal;
        const exitMatchesStop = exitPriceVal > 0 && Math.abs(exitPriceVal - effectiveInitialStop) <= priceEps;
        if (effectiveInitialStop > 0 && !exitMatchesStop && !(isBeStopAtEntry && Math.abs(effectiveInitialStop - primaryEntry) <= priceEps)) {
          lines.push(candleSeries.createPriceLine({
            price: effectiveInitialStop,
            color: '#ef4444',
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: isResolved ? 'INIT SL' : 'SL',
          }));
        }

        // 3. Trailed / Break-Even Stop Line
        if (stopVal > 0 && Math.abs(stopVal - effectiveInitialStop) > priceEps && !isBeStopAtEntry) {
          const exitMatchesTrailedStop = exitPriceVal > 0 && Math.abs(exitPriceVal - stopVal) <= priceEps;
          if (!exitMatchesTrailedStop) {
            lines.push(candleSeries.createPriceLine({
              price: stopVal,
              color: '#eab308',
              lineWidth: 2,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: isRunner ? 'BE SL' : 'TRAIL SL',
            }));
          }
        }

        // 4. Target 1 (TP1) Line
        const exitMatchesTp1 = isResolved && exitPriceVal > 0 && Math.abs(exitPriceVal - tp1Val) <= priceEps;
        if (tp1Val > 0) {
          lines.push(candleSeries.createPriceLine({
            price: tp1Val,
            color: '#10b981',
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: exitMatchesTp1
              ? `EXIT TP1 +${setup.r_multiple_1 || 2.0}R`
              : (isRunner ? `TP1 ✓ +${setup.r_multiple_1 || 2.0}R` : `TP1 +${setup.r_multiple_1 || 2.0}R`),
          }));
        }

        // 5. Target 2 (TP2) Line
        const exitMatchesTp2 = isResolved && exitPriceVal > 0 && tp2Val && Math.abs(exitPriceVal - tp2Val) <= priceEps;
        if (tp2Val && tp2Val > 0) {
          lines.push(candleSeries.createPriceLine({
            price: tp2Val,
            color: '#10b981',
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: exitMatchesTp2
              ? `EXIT TP2 +${setup.r_multiple_2 || 3.0}R`
              : `TP2 +${setup.r_multiple_2 || 3.0}R`,
          }));
        }

        // 6. Exit Price Line
        if (exitPriceVal > 0 && isResolved && !exitMatchesTp1 && !exitMatchesTp2 && !exitMatchesStop) {
          lines.push(candleSeries.createPriceLine({
            price: exitPriceVal,
            color: '#38bdf8',
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: 'EXIT',
          }));
        }

        priceLinesRef.current = lines;

        // Candlestick Markers for Exit Point (and Entry Point if available)
        const markers: SeriesMarker<Time>[] = [];
        if (resolvedTimestamp && isResolved) {
          try {
            const resUnix = Math.floor(new Date(resolvedTimestamp).getTime() / 1000);
            const closestRes =
              findContainingCandle(displayCandles, resUnix, timeframe) ||
              displayCandles[displayCandles.length - 1];
            if (closestRes) {
              const reason = (setup.outcome_type || setup.invalidation_reason || 'resolved').toUpperCase();
              const isWin = reason.includes('TP');
              const cleanReason = reason.replace('_HIT', '').replace('_STOP', '');
              let exitPriceLabel = '';
              if (exitPriceVal > 0) {
                if (showBidAskRef.current) {
                  const { bid: exitBid, ask: exitAsk, filledSide: exitSide } = getDirectionalBidAsk(
                    setup.instrument, exitPriceVal, isLong, false, data.quote || null
                  );
                  exitPriceLabel = exitSide === 'bid'
                    ? `BID ${exitBid.toFixed(decimals)} · ASK ${exitAsk.toFixed(decimals)}`
                    : `ASK ${exitAsk.toFixed(decimals)} · BID ${exitBid.toFixed(decimals)}`;
                } else {
                  exitPriceLabel = formatPrice(exitPriceVal, decimals);
                }
              }
              markers.push({
                time: closestRes.time,
                position: isWin ? 'aboveBar' : 'belowBar',
                color: isWin ? '#10b981' : '#ef4444',
                shape: 'circle',
                text: exitPriceLabel ? `${cleanReason} · ${exitPriceLabel}` : cleanReason,
                size: 2,
              });
            }
          } catch {
            // Skip malformed marker timestamps
          }
        }

        if (markers.length > 0) {
          markers.sort((a, b) => (a.time as number) - (b.time as number));
          try {
            if (!seriesMarkersRef.current) {
              seriesMarkersRef.current = createSeriesMarkers(candleSeries, markers);
            } else {
              seriesMarkersRef.current.setMarkers(markers);
            }
          } catch (mErr) {
            console.warn('Unable to set candle markers:', mErr);
          }
        } else if (seriesMarkersRef.current) {
          try {
            seriesMarkersRef.current.setMarkers([]);
          } catch {
            // Series may already be disposed
          }
        }

        // Auto Scale to fit candles ONCE per setup + timeframe selection
        const fitKey = `${setup.id}:${setup.instrument}:${timeframe}`;
        if (lastFittedKeyRef.current !== fitKey) {
          chartRef.current?.priceScale('right').applyOptions({ autoScale: true });

          if (isResolved && (entryTimestamp || resolvedTimestamp)) {
            try {
              const entryUnix = entryTimestamp ? Math.floor(new Date(entryTimestamp).getTime() / 1000) : null;
              const exitUnix = resolvedTimestamp ? Math.floor(new Date(resolvedTimestamp).getTime() / 1000) : null;

              let minIdx = -1;
              displayCandles.forEach((c, idx) => {
                const t = c.time as number;
                if (entryUnix && Math.abs(t - entryUnix) < 86400) {
                  if (minIdx === -1 || idx < minIdx) minIdx = idx;
                }
                if (exitUnix && Math.abs(t - exitUnix) < 86400) {
                  if (minIdx === -1 || idx < minIdx) minIdx = idx;
                }
              });

              if (minIdx !== -1) {
                const pad = 15;
                chartRef.current?.timeScale().setVisibleLogicalRange({
                  from: Math.max(0, minIdx - pad),
                  to: displayCandles.length - 1,
                });
              } else {
                chartRef.current?.timeScale().fitContent();
              }
            } catch {
              chartRef.current?.timeScale().fitContent();
            }
          } else {
            chartRef.current?.timeScale().fitContent();
          }

          lastFittedKeyRef.current = fitKey;
        }

        setLoading(false);
        requestAnimationFrame(() => drawZonesRef.current());
        setTimeout(() => drawZonesRef.current(), 60);
        setTimeout(() => drawZonesRef.current(), 250);
      })
      .catch(err => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load chart data');
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [
    setup.id, setup.instrument, setup.r_multiple_1, setup.r_multiple_2,
    setup.outcome_type, setup.invalidation_reason,
    entryLow, entryHigh, entryMid, execPrice, stopVal, initialStopVal,
    exitPriceVal, tp1Val, tp2Val, timeframe, isLong, isPending, isActive,
    isRunner, isResolved, resolvedTimestamp, entryTimestamp, selectedTz,
    decimals, priceEps,
  ]);

  // 3. Dynamic Real-Time Candle Drawing (Live Signals ONLY)
  useEffect(() => {
    if (isResolved) return;
    if (!candleSeriesRef.current || !setup.current_price) return;
    const histCandles = displayCandlesRef.current;
    if (!histCandles || histCandles.length === 0) return;

    const curPrice = Number(setup.current_price);
    const lastHistTime = histCandles[histCandles.length - 1].time as number;
    const computedTime = getCurrentCandleTime(timeframe) as number;
    const candleTime = Math.max(computedTime, lastHistTime) as UTCTimestamp;

    if (!liveCandleRef.current || (liveCandleRef.current.time as number) !== (candleTime as number)) {
      const lastHist = histCandles[histCandles.length - 1];
      const useHistOpen = (candleTime as number) === lastHistTime;
      liveCandleRef.current = {
        time: candleTime,
        open: useHistOpen ? lastHist.open : curPrice,
        high: useHistOpen ? Math.max(lastHist.high, curPrice) : curPrice,
        low: useHistOpen ? Math.min(lastHist.low, curPrice) : curPrice,
        close: curPrice,
      };
    } else {
      liveCandleRef.current.high = Math.max(liveCandleRef.current.high, curPrice);
      liveCandleRef.current.low = Math.min(liveCandleRef.current.low, curPrice);
      liveCandleRef.current.close = curPrice;
    }

    try {
      candleSeriesRef.current.update(liveCandleRef.current);
    } catch (err) {
      console.warn('Failed to update live candle on chart:', err);
    }
  }, [setup.current_price, timeframe, isResolved]);

  // 4. Dynamic Real-Time Bid & Ask Price Lines (Live Signals ONLY)
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    const candleSeries = candleSeriesRef.current;

    if (bidLineRef.current) {
      try { candleSeries.removePriceLine(bidLineRef.current); } catch { /* ignored */ }
      bidLineRef.current = null;
    }
    if (askLineRef.current) {
      try { candleSeries.removePriceLine(askLineRef.current); } catch { /* ignored */ }
      askLineRef.current = null;
    }

    if (isResolved) return;

    const price = currentPrice && currentPrice > 0
      ? currentPrice
      : (serverQuote?.price && serverQuote.price > 0 ? serverQuote.price : 0);

    if (!showBidAsk || price <= 0) return;

    const { bid, ask } = getBidAskData(setup.instrument, price, serverQuote);

    try {
      bidLineRef.current = candleSeries.createPriceLine({
        price: bid,
        color: '#38bdf8',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: 'BID',
      });

      askLineRef.current = candleSeries.createPriceLine({
        price: ask,
        color: '#f43f5e',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: 'ASK',
      });
    } catch (err) {
      console.warn('Failed to draw bid/ask lines:', err);
    }

    return () => {
      if (bidLineRef.current) {
        try { candleSeries.removePriceLine(bidLineRef.current); } catch { /* ignored */ }
        bidLineRef.current = null;
      }
      if (askLineRef.current) {
        try { candleSeries.removePriceLine(askLineRef.current); } catch { /* ignored */ }
        askLineRef.current = null;
      }
    };
  }, [showBidAsk, currentPrice, serverQuote, setup.instrument, timeframe, isResolved]);

  // 4b. Refresh exit marker label when Bid/Ask toggle changes
  useEffect(() => {
    if (!isResolved || !resolvedTimestamp || !candleSeriesRef.current) return;
    const displayCandles = displayCandlesRef.current;
    if (!displayCandles || displayCandles.length === 0) return;

    try {
      const resUnix = Math.floor(new Date(resolvedTimestamp).getTime() / 1000);
      const closestRes =
        findContainingCandle(displayCandles, resUnix, timeframe) ||
        displayCandles[displayCandles.length - 1];
      if (!closestRes) return;

      const reason = (setup.outcome_type || setup.invalidation_reason || 'resolved').toUpperCase();
      const isWin = reason.includes('TP');
      const cleanReason = reason.replace('_HIT', '').replace('_STOP', '');
      let exitPriceLabel = '';
      if (exitPriceVal > 0) {
        if (showBidAsk) {
          const { bid: exitBid, ask: exitAsk, filledSide: exitSide } = getDirectionalBidAsk(
            setup.instrument, exitPriceVal, isLong, false, serverQuote
          );
          exitPriceLabel = exitSide === 'bid'
            ? `BID ${exitBid.toFixed(decimals)} · ASK ${exitAsk.toFixed(decimals)}`
            : `ASK ${exitAsk.toFixed(decimals)} · BID ${exitBid.toFixed(decimals)}`;
        } else {
          exitPriceLabel = formatPrice(exitPriceVal, decimals);
        }
      }
      const newMarkers: SeriesMarker<Time>[] = [{
        time: closestRes.time,
        position: isWin ? 'aboveBar' : 'belowBar',
        color: isWin ? '#10b981' : '#ef4444',
        shape: 'circle',
        text: exitPriceLabel ? `${cleanReason} · ${exitPriceLabel}` : cleanReason,
        size: 2,
      }];
      if (seriesMarkersRef.current) {
        try { seriesMarkersRef.current.setMarkers(newMarkers); } catch { /* ignored */ }
      }
    } catch {
      // Ignore marker refresh errors
    }
  }, [showBidAsk, serverQuote, isResolved, resolvedTimestamp, exitPriceVal, isLong, decimals, timeframe, setup.instrument, setup.outcome_type, setup.invalidation_reason]);

  // Sync canvas zone overlay on scroll & resize
  useEffect(() => {
    if (!chartRef.current) return;
    const timeScale = chartRef.current.timeScale();

    drawZones();
    timeScale.subscribeVisibleLogicalRangeChange(drawZones);

    window.addEventListener('resize', drawZones);
    let resizeObserver: ResizeObserver | null = null;
    if (chartContainerRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        drawZones();
      });
      resizeObserver.observe(chartContainerRef.current);
    }

    return () => {
      try { timeScale.unsubscribeVisibleLogicalRangeChange(drawZones); } catch { /* ignored */ }
      window.removeEventListener('resize', drawZones);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [drawZones]);

  const effectivePrice = currentPrice && currentPrice > 0
    ? currentPrice
    : (serverQuote?.price && serverQuote.price > 0 ? serverQuote.price : 0);
  const liveBidAsk = getBidAskData(setup.instrument, effectivePrice, serverQuote);

  const primaryEntryPrice = execPrice > 0 ? execPrice : (entryMid > 0 ? entryMid : (entryLow + entryHigh) / 2);
  const isBeStop = primaryEntryPrice > 0 && stopVal > 0 && Math.abs(stopVal - primaryEntryPrice) <= priceEps;

  const statusMeta = isPending
    ? { cls: 'pending', short: 'PENDING', full: 'PENDING ENTRY · AWAITING FILL' }
    : isRunner
      ? { cls: 'runner', short: 'RUNNER +2R', full: 'ACTIVE RUNNER · TP1 +2R LOGGED · TRACKING TP2' }
      : isActive
        ? { cls: 'active', short: 'ACTIVE', full: 'ACTIVE TRADE · IN POSITION' }
        : { cls: 'resolved', short: 'RESOLVED', full: 'RESOLVED TRADE · REVIEW' };

  const toolbarFocusGroupAttrs = { focusgroup: 'toolbar wrap' } as Record<string, string>;

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby={headingId}
      className={`chart-modal-dialog theme-${theme}`}
    >
      <div className="chart-modal-content">
        {/* Live region outside toolbar for screen-reader action confirmations */}
        <p role="status" className="sr-only">{liveStatusMsg}</p>

        {/* Tier 1: Primary Identity, Context & Window Controls */}
        <header className="chart-modal-header">
          <div className="header-left">
            <h2 id={headingId} className="chart-symbol">{setup.instrument}</h2>

            <span className={`bias-tag ${isLong ? 'long' : 'short'}`}>
              <IconArrowBias isLong={isLong} />
              <span>{isLong ? 'LONG' : 'SHORT'}</span>
            </span>

            <button
              type="button"
              className={`chart-trade-id-badge ${copiedTradeId ? 'is-copied' : ''}`}
              title={`Trade ID: ${setup.id} — Click to copy ${tradeTelegramId}`}
              onClick={handleCopyTradeId}
            >
              <IconCopy copied={copiedTradeId} />
              <span>{copiedTradeId ? 'COPIED' : tradeTelegramId}</span>
            </button>

            <span className={`state-status-tag ${statusMeta.cls}`} title={statusMeta.full}>
              <span className="status-dot" aria-hidden="true" />
              <span className="full-label">{statusMeta.full}</span>
              <span className="short-label">{statusMeta.short}</span>
            </span>

            <div className="context-chips" aria-label="Market context">
              <span className="ctx-chip">{(setup.market || 'futures').toUpperCase()}</span>
              <span className="ctx-chip">
                <span className="full-label">{(setup.killzone_origin || 'NY AM').toUpperCase()} SESSION</span>
                <span className="short-label">{(setup.killzone_origin || 'NY AM').toUpperCase()}</span>
              </span>
              <span className="ctx-chip feed-chip">
                <span className="live-pulse" aria-hidden="true" />
                <span className="full-label">{feedProvider || (setup.instrument?.includes('/') ? 'IC MARKETS RAW ECN' : 'FUTURES FEED')}</span>
                <span className="short-label">{feedProvider || (setup.instrument?.includes('/') ? 'IC MARKETS' : 'FUTURES')}</span>
              </span>
            </div>
          </div>

          <div className="header-right">
            <label className="tz-selector-wrapper" title="Chart display timezone (does not alter signal execution)">
              <IconGlobe />
              <span className="tz-label">TZ</span>
              <select
                aria-label="Chart timezone"
                className="tz-select"
                value={selectedTz}
                onChange={(e) => setSelectedTz(e.target.value)}
              >
                {TIMEZONE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="header-action-btn"
              aria-pressed={theme === 'dark'}
              onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              {theme === 'dark' ? <IconSun /> : <IconMoon />}
              <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>

            <button
              type="button"
              className="close-btn"
              onClick={handleRequestClose}
              title="Close Chart (ESC)"
            >
              <IconClose />
              <span>Close</span>
              <kbd className="esc-kbd">ESC</kbd>
            </button>
          </div>
        </header>

        {/* Tier 2: Accessible Chart Toolbar & Live Bid/Ask Readout */}
        <div className="chart-modal-toolbar">
          <div
            ref={toolbarRef}
            role="toolbar"
            aria-label="Chart controls"
            aria-controls={chartContainerId}
            {...toolbarFocusGroupAttrs}
            className="toolbar-left"
          >
            <div role="group" aria-label="Timeframe" className="tf-selector">
              {TIMEFRAMES.map((tf) => {
                const isEntryStandard = tf.id === defaultEntryTf;
                return (
                  <button
                    key={tf.id}
                    type="button"
                    aria-pressed={timeframe === tf.id}
                    onClick={() => setTimeframe(tf.id)}
                    title={isEntryStandard ? `${tf.title} (Setup Entry Timeframe)` : tf.title}
                  >
                    <span>{tf.label}</span>
                    {isEntryStandard && <span className="tf-star" aria-label="Entry standard">★</span>}
                  </button>
                );
              })}
            </div>

            <span role="separator" aria-orientation="vertical" className="toolbar-sep" />

            <div role="group" aria-label="Chart zoom and fit" className="zoom-toolbar">
              <button
                type="button"
                className="zoom-btn"
                aria-label="Zoom in"
                onClick={() => handleZoom(true)}
                title="Zoom In"
              >
                <IconZoomIn />
              </button>
              <button
                type="button"
                className="zoom-btn"
                aria-label="Zoom out"
                onClick={() => handleZoom(false)}
                title="Zoom Out"
              >
                <IconZoomOut />
              </button>
              <button
                type="button"
                className="reset-view-btn"
                onClick={handleFitAll}
                title="Fit all candles & levels"
              >
                <IconFitAll />
                <span>Fit All</span>
              </button>
            </div>

            <span role="separator" aria-orientation="vertical" className="toolbar-sep" />

            <button
              type="button"
              className="bid-ask-toggle-btn"
              aria-pressed={showBidAsk}
              onClick={toggleBidAsk}
              title={showBidAsk ? 'Hide Bid & Ask lines' : 'Show Bid & Ask lines on chart'}
            >
              <IconBidAsk />
              <span>Bid / Ask</span>
              <span className="toggle-pill">{showBidAsk ? 'ON' : 'OFF'}</span>
            </button>
          </div>

          <div className="toolbar-right">
            {!isResolved && showBidAsk && (
              <div className="bid-ask-ticker" aria-label="Live bid, ask, and spread">
                <span className="ticker-cell bid">
                  <span className="ticker-k">BID</span>
                  <span className="ticker-v">{liveBidAsk.bid.toFixed(liveBidAsk.decimals)}</span>
                </span>
                <span className="ticker-divider" aria-hidden="true" />
                <span className="ticker-cell ask">
                  <span className="ticker-k">ASK</span>
                  <span className="ticker-v">{liveBidAsk.ask.toFixed(liveBidAsk.decimals)}</span>
                </span>
                <span className="ticker-divider" aria-hidden="true" />
                <span className="ticker-cell spread">
                  <span className="ticker-k">SPR</span>
                  <span className="ticker-v">{liveBidAsk.spread.toFixed(liveBidAsk.decimals)} {liveBidAsk.unit}</span>
                </span>
              </div>
            )}
            <span className="chart-shortcuts-hint">
              Scroll zoom · Drag pan · ESC close
            </span>
          </div>
        </div>

        {/* Tier 3a: Trade Review Audit Strip (Resolved Closed Trades) */}
        {isResolved && (
          <div className="trade-review-audit-strip">
            <div className="audit-card entry-card">
              <div className="audit-card-title">
                <span>ENTRY</span>
                <span className="audit-card-badge">
                  {!actualEntryTimestamp
                    ? 'NOT ENTERED'
                    : computedFillMinutes !== undefined
                      ? `${computedFillMinutes}m fill`
                      : 'FILLED'}
                </span>
              </div>
              <div className="audit-card-main">
                {actualEntryTimestamp
                  ? formatPrice(execPrice > 0 ? execPrice : entryMid, decimals)
                  : '--'}
              </div>
              <div className="audit-card-sub">
                Zone {formatPrice(entryLow, decimals)} – {formatPrice(entryHigh, decimals)}
              </div>
              <div className="audit-card-time">
                {actualEntryTimestamp
                  ? `${formatTzTime(Math.floor(new Date(actualEntryTimestamp).getTime() / 1000), selectedTz, true)} ${getTimezoneBadge(selectedTz)}`
                  : 'Cancelled before entry'}
              </div>
            </div>

            <div className="audit-card stop-card">
              <div className="audit-card-title">
                <span>INITIAL STOP</span>
                <span className="audit-card-badge stop-badge">-1.00R</span>
              </div>
              <div className="audit-card-main">
                {formatPrice(initialStopVal > 0 ? initialStopVal : stopVal, decimals)}
              </div>
              <div className="audit-card-sub">
                Risk {(execPrice > 0 && initialStopVal > 0) ? Math.abs(execPrice - initialStopVal).toFixed(decimals) : '--'}
              </div>
              <div className="audit-card-time">
                {Math.abs(stopVal - initialStopVal) > priceEps ? `BE Stop: ${formatPrice(stopVal, decimals)}` : 'Initial Stop'}
              </div>
            </div>

            <div className="audit-card targets-card">
              <div className="audit-card-title">
                <span>TARGETS</span>
                <span className="audit-card-badge tp-badge">TP1 / TP2</span>
              </div>
              <div className="audit-card-main">
                <span>TP1 {formatPrice(tp1Val, decimals)}</span>
                <span className="r-pill">+{setup.r_multiple_1 || 2.0}R</span>
              </div>
              <div className="audit-card-sub">
                TP2 {tp2Val && tp2Val > 0 ? `${formatPrice(tp2Val, decimals)} (+${setup.r_multiple_2 || 3.0}R)` : 'None'}
              </div>
              <div className="audit-card-time">
                {setup.strategy_id || 'manna_snd'} · {setup.conviction_score || 85}% conviction
              </div>
            </div>

            <div className={`audit-card result-card ${outcomeR !== undefined && outcomeR > 0 ? 'is-win' : outcomeR !== undefined && outcomeR < 0 ? 'is-loss' : 'is-be'}`}>
              <div className="audit-card-title">
                <span>END RESULT</span>
                <span className={`audit-card-badge result-pill ${outcomeR !== undefined && outcomeR > 0 ? 'win' : outcomeR !== undefined && outcomeR < 0 ? 'loss' : 'be'}`}>
                  {(setup.outcome_type || setup.invalidation_reason || 'RESOLVED').toUpperCase()}
                </span>
              </div>
              <div className="audit-card-main result-val">
                {outcomeR !== undefined ? `${outcomeR > 0 ? '+' : ''}${outcomeR.toFixed(2)}R` : '--'}
                {outcomePl !== undefined && (
                  <span className="dollar-val">({outcomePl >= 0 ? '+$' : '-$'}{Math.abs(outcomePl).toFixed(2)})</span>
                )}
              </div>
              <div className="audit-card-sub">
                Exit {formatPrice(exitPriceVal, decimals)}
              </div>
              <div className="audit-card-time">
                Held {computedHeldMinutes !== undefined ? `${computedHeldMinutes}m` : '--'} · {resolvedTimestamp ? `${formatTzTime(Math.floor(new Date(resolvedTimestamp).getTime() / 1000), selectedTz, true)} ${getTimezoneBadge(selectedTz)}` : '--'}
              </div>
            </div>
          </div>
        )}

        {/* Tier 3b: Compact Scannable Telemetry Strip (Active / Pending / Runner) */}
        {!isResolved && (
          <div className="level-legend-bar" aria-label="Trade price levels">
            <div className="level-metric tf-metric">
              <span className="metric-label">VIEW</span>
              <span className="metric-value">
                {timeframe.toUpperCase()}
                {timeframe === defaultEntryTf && <span className="metric-tag">EXEC STD</span>}
              </span>
            </div>

            <div className="level-metric entry">
              <span className="metric-dot" aria-hidden="true" />
              <span className="metric-label">{isPending ? 'PENDING ZONE' : 'ENTRY ZONE'}</span>
              <span className="metric-value">{formatPrice(entryLow, decimals)} – {formatPrice(entryHigh, decimals)}</span>
            </div>

            {(actualEntryTimestamp || signalCreatedTimestamp) && (
              <div className="level-metric">
                <span className="metric-label">{actualEntryTimestamp ? 'ENTERED' : 'SENT'}</span>
                <span className="metric-value">
                  {formatTzTime(
                    Math.floor(new Date((actualEntryTimestamp || signalCreatedTimestamp)!).getTime() / 1000),
                    selectedTz,
                    false
                  )} {getTimezoneBadge(selectedTz)}
                </span>
              </div>
            )}

            <div className={`level-metric ${isBeStop ? 'be' : 'stop'}`}>
              <span className="metric-dot" aria-hidden="true" />
              <span className="metric-label">{isBeStop ? 'BE STOP' : 'STOP LOSS'}</span>
              <span className="metric-value">{formatPrice(stopVal, decimals)}</span>
            </div>

            <div className="level-metric tp">
              <span className="metric-dot" aria-hidden="true" />
              <span className="metric-label">TP1 (+{setup.r_multiple_1 || 2.0}R){isRunner ? ' ✓' : ''}</span>
              <span className="metric-value">{formatPrice(tp1Val, decimals)}</span>
            </div>

            {tp2Val && tp2Val > 0 && (
              <div className="level-metric tp">
                <span className="metric-dot" aria-hidden="true" />
                <span className="metric-label">TP2 (+{setup.r_multiple_2 || 3.0}R)</span>
                <span className="metric-value">{formatPrice(tp2Val, decimals)}</span>
              </div>
            )}

            {currentPrice > 0 && (
              <div className="level-metric live">
                <span className="metric-dot" aria-hidden="true" />
                <span className="metric-label">LIVE PRICE</span>
                <span className="metric-value">{formatPrice(currentPrice, decimals)}</span>
              </div>
            )}
          </div>
        )}

        {/* Tier 4: Compact Manna SnD Structural Context Bar */}
        {isMannaSnd && (
          <div className="manna-snd-legend-bar" aria-label="Manna SnD indicators">
            <span className="snd-badge">MANNA SND</span>
            <span className="snd-item curve">
              <span className="snd-k">1H CURVE</span>
              <strong>{curveLocation.toUpperCase()}</strong>
            </span>
            {activeDemandProx > 0 && (
              <span className="snd-item demand">
                <span className="snd-dot" aria-hidden="true" />
                <span className="snd-k">1H DEMAND</span>
                <span>{formatPrice(activeDemandProx, decimals)} – {formatPrice(activeDemandDist, decimals)}</span>
              </span>
            )}
            {activeSupplyProx > 0 && (
              <span className="snd-item supply">
                <span className="snd-dot" aria-hidden="true" />
                <span className="snd-k">1H SUPPLY</span>
                <span>{formatPrice(activeSupplyProx, decimals)} – {formatPrice(activeSupplyDist, decimals)}</span>
              </span>
            )}
            <span className="snd-item trend">
              <span className="snd-k">15M TREND</span>
              <strong>{trend15m.toUpperCase()}</strong>
            </span>
            <span className="snd-item zone">
              <span className="snd-k">15M ZONE</span>
              <strong>{formation}</strong>
              <span className="snd-range">({formatPrice(entryLow, decimals)} – {formatPrice(entryHigh, decimals)})</span>
            </span>
          </div>
        )}

        {/* Chart Canvas Viewport */}
        <div id={chartContainerId} className="chart-container-wrapper">
          {/* Non-blocking OHLC Crosshair HUD (TradingView style) */}
          {crosshairOhlc && !loading && !error && (
            <div className="chart-ohlc-hud" aria-hidden="true">
              <span className="ohlc-time">{crosshairOhlc.timeStr}</span>
              <span className="ohlc-pair">
                <span>O</span><strong className={crosshairOhlc.isUp ? 'up' : 'down'}>{crosshairOhlc.open.toFixed(decimals)}</strong>
              </span>
              <span className="ohlc-pair">
                <span>H</span><strong className={crosshairOhlc.isUp ? 'up' : 'down'}>{crosshairOhlc.high.toFixed(decimals)}</strong>
              </span>
              <span className="ohlc-pair">
                <span>L</span><strong className={crosshairOhlc.isUp ? 'up' : 'down'}>{crosshairOhlc.low.toFixed(decimals)}</strong>
              </span>
              <span className="ohlc-pair">
                <span>C</span><strong className={crosshairOhlc.isUp ? 'up' : 'down'}>{crosshairOhlc.close.toFixed(decimals)}</strong>
              </span>
            </div>
          )}

          {loading && (
            <div className="chart-overlay-loader" role="status">
              <span className="loader-spinner" aria-hidden="true" />
              <span>Loading {setup.instrument} {timeframe.toUpperCase()} candles…</span>
            </div>
          )}
          {error && (
            <div className="chart-overlay-error" role="alert">
              Unable to load live candles: {error}
            </div>
          )}
          <div ref={chartContainerRef} className="chart-canvas-container" />
          <canvas ref={overlayCanvasRef} className="zone-overlay-canvas" />
        </div>
      </div>
    </dialog>,
    document.body
  );
};
