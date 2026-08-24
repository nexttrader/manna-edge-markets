import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { createChart, ColorType, LineStyle, CrosshairMode, CandlestickSeries, type IChartApi } from 'lightweight-charts';
import type { EdgeSetup } from '../types';
import { API_BASE } from '../config';
import './SetupChartModal.css';

interface SetupChartModalProps {
  setup: EdgeSetup;
  onClose: () => void;
}

export type ChartTimeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'New York (ET - Killzones)' },
  { value: 'UTC', label: 'UTC (Universal Standard)' },
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
      hour12: false
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

function getCurrentCandleTime(timeframe: ChartTimeframe): number {
  const now = Date.now();
  const date = new Date(now);
  const minutes = date.getMinutes();
  
  if (timeframe === '1m') {
    date.setSeconds(0, 0);
  } else if (timeframe === '5m') {
    const roundedMin = Math.floor(minutes / 5) * 5;
    date.setMinutes(roundedMin, 0, 0);
  } else if (timeframe === '15m') {
    const roundedMin = Math.floor(minutes / 15) * 15;
    date.setMinutes(roundedMin, 0, 0);
  } else if (timeframe === '1h') {
    date.setMinutes(0, 0, 0);
  } else if (timeframe === '4h') {
    const hours = date.getHours();
    const roundedHours = Math.floor(hours / 4) * 4;
    date.setHours(roundedHours, 0, 0, 0);
  } else if (timeframe === '1d') {
    date.setHours(0, 0, 0, 0);
  }
  
  return Math.floor(date.getTime() / 1000);
}

const parseNum = (val: any): number => {
  if (val === undefined || val === null) return 0;
  const n = typeof val === 'number' ? val : parseFloat(String(val));
  return isNaN(n) ? 0 : n;
};

export const SetupChartModal: React.FC<SetupChartModalProps> = ({ setup, onClose }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<any>(null);
  const priceLinesRef = useRef<any[]>([]);
  const lastFittedTimeframeRef = useRef<string | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const liveCandleRef = useRef<any>(null);

  const [timeframe, setTimeframe] = useState<ChartTimeframe>('15m');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Timezone & Theme state with persistent localStorage
  const [selectedTz, setSelectedTz] = useState<string>(() => {
    return localStorage.getItem('manna_chart_timezone') || 'America/New_York';
  });
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('manna_chart_theme') as 'dark' | 'light') || 'dark';
  });

  const isLong = (setup.bias || 'long').toLowerCase() === 'long';

  const levels = (setup.levels || {}) as any;

  // Robust level extraction with fallbacks for all property naming variants
  const entryLow = parseNum(setup.entry_zone_low ?? (setup as any).entry_low ?? levels.entryMin ?? levels.entry_low);
  const entryHigh = parseNum(setup.entry_zone_high ?? (setup as any).entry_high ?? levels.entryMax ?? levels.entry_high);
  const entryMid = parseNum(setup.entry_zone_mid ?? (setup as any).entry_mid ?? (setup as any).entry_price ?? levels.entryMid) || (entryLow && entryHigh ? (entryLow + entryHigh) / 2 : 0);
  const stopVal = parseNum(setup.stop ?? (setup as any).stop_loss ?? levels.stopLoss ?? levels.stop);
  const tp1Val = parseNum(setup.tp1 ?? (setup as any).target1 ?? levels.takeProfit1 ?? levels.tp1);
  const tp2Val = (setup.tp2 || (setup as any).target2 || levels.takeProfit2 || levels.tp2)
    ? parseNum(setup.tp2 ?? (setup as any).target2 ?? levels.takeProfit2 ?? levels.tp2)
    : undefined;
  const currentPrice = parseNum(setup.current_price);

  const isPending = setup.signal_state === 'awaiting_entry';
  const isActive = setup.signal_state === 'active';
  const isResolved = setup.signal_state === 'resolved' || setup.signal_state === 'invalidated';

  const entryTimestamp = setup.entry_triggered_at || setup.entryAt || (isActive || isResolved ? setup.validatedAt || setup.created_at : undefined);
  const resolvedTimestamp = setup.resolved_at;
  const execPrice = parseNum(setup.entry_price_recorded ?? setup.entry_price_executed ?? entryMid);

  const isMannaSnd = setup.strategy_id === 'manna_snd';

  let metadata: any = {};
  try {
    if (typeof setup.metadata === 'string') {
      metadata = JSON.parse(setup.metadata);
    } else if (setup.metadata) {
      metadata = setup.metadata;
    }
  } catch {}

  const htfProximal = parseNum(metadata.htf_curve_proximal);
  const htfDistal = parseNum(metadata.htf_curve_distal);
  const htfType = (metadata.htf_curve_type || (isLong ? 'demand' : 'supply')).toLowerCase();
  const curveLocation = metadata.curveLocation || (isLong ? 'low' : 'high');
  const trend15m = metadata.trend15m || 'up';
  const formation = metadata.formation || metadata.entry_zone_formation || (isLong ? 'Rally-Base-Rally' : 'Drop-Base-Drop');

  // 1. True 1H HTF Demand Curve Zone (Emerald Green)
  const activeDemandProx = parseNum(metadata.htf_demand_proximal || (htfType === 'demand' ? htfProximal : (entryLow ? entryLow * 0.995 : 0)));
  const activeDemandDist = parseNum(metadata.htf_demand_distal || (htfType === 'demand' ? htfDistal : (activeDemandProx ? activeDemandProx * 0.997 : 0)));
  const activeDemandTime = metadata.htf_demand_base_time || metadata.htf_curve_base_time || metadata.entry_zone_base_time;

  // 2. True 1H HTF Supply Curve Zone (Rose Red)
  const activeSupplyProx = parseNum(metadata.htf_supply_proximal || (htfType === 'supply' ? htfProximal : (entryHigh ? entryHigh * 1.005 : 0)));
  const activeSupplyDist = parseNum(metadata.htf_supply_distal || (htfType === 'supply' ? htfDistal : (activeSupplyProx ? activeSupplyProx * 1.003 : 0)));
  const activeSupplyTime = metadata.htf_supply_base_time || metadata.htf_curve_base_time || metadata.entry_zone_base_time;

  // Zoom control helpers
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

  // Keydown listener for Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const levelsRef = useRef<number[]>([]);
  levelsRef.current = [
    entryLow, entryHigh, entryMid, stopVal, tp1Val, tp2Val,
    activeDemandProx, activeDemandDist, activeSupplyProx, activeSupplyDist
  ].filter((p): p is number => typeof p === 'number' && p > 0);

  // 1. Initialize Chart Canvas ONCE on mount
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const container = chartContainerRef.current;
    container.innerHTML = '';

    const containerHeight = container.clientHeight || (window.innerHeight - 140);
    const isLight = theme === 'light';
    const targetTz = getEffectiveTimezone(selectedTz);

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: isLight ? '#ffffff' : '#090314' },
        textColor: isLight ? '#0f172a' : '#e056fd',
        fontSize: 12,
        fontFamily: "'JetBrains Mono', monospace",
      },
      grid: {
        vertLines: { color: isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(224, 86, 253, 0.06)' },
        horzLines: { color: isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(224, 86, 253, 0.06)' },
      },
      width: container.clientWidth,
      height: containerHeight,
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: isLight ? '#6366f1' : '#e056fd',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: isLight ? '#6366f1' : '#e056fd',
        },
        horzLine: {
          color: isLight ? '#6366f1' : '#e056fd',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: isLight ? '#6366f1' : '#e056fd',
        },
      },
      rightPriceScale: {
        borderColor: isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(224, 86, 253, 0.2)',
        scaleMargins: { top: 0.1, bottom: 0.1 },
        autoScale: true,
      },
      timeScale: {
        borderColor: isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(224, 86, 253, 0.2)',
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: any, tickMarkType: number, locale: string) => {
          try {
            const d = new Date((time as number) * 1000);
            if (tickMarkType < 3) {
              return d.toLocaleDateString(locale || 'en-US', { timeZone: targetTz, month: 'short', day: 'numeric' });
            }
            return d.toLocaleTimeString(locale || 'en-US', { timeZone: targetTz, hour: '2-digit', minute: '2-digit', hour12: false });
          } catch {
            return '';
          }
        }
      },
      localization: {
        timeFormatter: (time: number) => {
          try {
            const d = new Date((time as number) * 1000);
            return d.toLocaleString('en-US', {
              timeZone: targetTz,
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            });
          } catch {
            return new Date((time as number) * 1000).toISOString();
          }
        }
      }
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: isLight ? '#00b060' : '#00e676',
      downColor: isLight ? '#ef4444' : '#ff1744',
      borderUpColor: isLight ? '#00b060' : '#00e676',
      borderDownColor: isLight ? '#ef4444' : '#ff1744',
      wickUpColor: isLight ? '#00b060' : '#00e676',
      wickDownColor: isLight ? '#ef4444' : '#ff1744',
      autoscaleInfoProvider: (original: any) => {
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

        return {
          priceRange: {
            minValue: min,
            maxValue: max,
          },
        };
      },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, []);


  // Dynamically update theme options on existing chart canvas
  useEffect(() => {
    localStorage.setItem('manna_chart_theme', theme);
    if (!chartRef.current) return;

    const isLight = theme === 'light';
    chartRef.current.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: isLight ? '#ffffff' : '#090314' },
        textColor: isLight ? '#0f172a' : '#e056fd',
      },
      grid: {
        vertLines: { color: isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(224, 86, 253, 0.06)' },
        horzLines: { color: isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(224, 86, 253, 0.06)' },
      },
      crosshair: {
        vertLine: {
          color: isLight ? '#6366f1' : '#e056fd',
          labelBackgroundColor: isLight ? '#6366f1' : '#e056fd',
        },
        horzLine: {
          color: isLight ? '#6366f1' : '#e056fd',
          labelBackgroundColor: isLight ? '#6366f1' : '#e056fd',
        },
      },
      rightPriceScale: {
        borderColor: isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(224, 86, 253, 0.2)',
      },
      timeScale: {
        borderColor: isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(224, 86, 253, 0.2)',
      },
    });

    if (candleSeriesRef.current) {
      candleSeriesRef.current.applyOptions({
        upColor: isLight ? '#00b060' : '#00e676',
        downColor: isLight ? '#ef4444' : '#ff1744',
        borderUpColor: isLight ? '#00b060' : '#00e676',
        borderDownColor: isLight ? '#ef4444' : '#ff1744',
        wickUpColor: isLight ? '#00b060' : '#00e676',
        wickDownColor: isLight ? '#ef4444' : '#ff1744',
      });
    }
  }, [theme]);

  // Dynamically update timezone formatting on existing chart canvas
  useEffect(() => {
    localStorage.setItem('manna_chart_timezone', selectedTz);
    if (!chartRef.current) return;

    const targetTz = getEffectiveTimezone(selectedTz);
    chartRef.current.applyOptions({
      timeScale: {
        tickMarkFormatter: (time: any, tickMarkType: number, locale: string) => {
          try {
            const d = new Date((time as number) * 1000);
            if (tickMarkType < 3) {
              return d.toLocaleDateString(locale || 'en-US', { timeZone: targetTz, month: 'short', day: 'numeric' });
            }
            return d.toLocaleTimeString(locale || 'en-US', { timeZone: targetTz, hour: '2-digit', minute: '2-digit', hour12: false });
          } catch {
            return '';
          }
        }
      },
      localization: {
        timeFormatter: (time: number) => {
          try {
            const d = new Date((time as number) * 1000);
            return d.toLocaleString('en-US', {
              timeZone: targetTz,
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            });
          } catch {
            return new Date((time as number) * 1000).toISOString();
          }
        }
      }
    });
  }, [selectedTz]);

  // 2. Fetch candles and draw price lines whenever timeframe, timezone, or levels update
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    const candleSeries = candleSeriesRef.current;

    // Clear previous price lines
    priceLinesRef.current.forEach(line => {
      try { candleSeries.removePriceLine(line); } catch {}
    });
    priceLinesRef.current = [];

    // Determine count based on timeframe for deep historical chart scrolling
    const count = timeframe === '1m' ? 1000 : timeframe === '5m' ? 1000 : timeframe === '15m' ? 800 : timeframe === '1h' ? 720 : timeframe === '4h' ? 500 : 365;

    // Fetch candles from backend
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

        const formattedCandles = data.candles.map((c: any) => ({
          time: Math.floor(new Date(c.timestamp).getTime() / 1000) as any,
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
        }));

        candleSeries.setData(formattedCandles);

        // Superimpose Target & Stop Levels for ALL trades (awaiting_entry, active, resolved)
        const lines: any[] = [];
        const statusPrefix = isPending ? '⏳ PENDING ' : isActive ? '🔥 ACTIVE ' : '';

        if (entryHigh > 0) {
          lines.push(candleSeries.createPriceLine({
            price: entryHigh,
            color: '#ffb703',
            lineWidth: 1,
            lineStyle: isPending ? LineStyle.Dotted : LineStyle.Solid,
            axisLabelVisible: true,
            title: `${statusPrefix}ENTRY HIGH (${entryHigh})`,
          }));
        }

        if (entryLow > 0) {
          lines.push(candleSeries.createPriceLine({
            price: entryLow,
            color: '#ffb703',
            lineWidth: 1,
            lineStyle: isPending ? LineStyle.Dotted : LineStyle.Solid,
            axisLabelVisible: true,
            title: `${statusPrefix}ENTRY LOW (${entryLow})`,
          }));
        }

        if (entryMid > 0) {
          lines.push(candleSeries.createPriceLine({
            price: entryMid,
            color: '#fb8500',
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: `🎯 ${statusPrefix}ENTRY MID (${entryMid})`,
          }));
        }

        if (stopVal > 0) {
          lines.push(candleSeries.createPriceLine({
            price: stopVal,
            color: '#ff1744',
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: `🛑 ${statusPrefix}STOP LOSS (${stopVal})`,
          }));
        }

        if (tp1Val > 0) {
          lines.push(candleSeries.createPriceLine({
            price: tp1Val,
            color: '#00e676',
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: `🟢 ${statusPrefix}TP1 TARGET (+${setup.r_multiple_1 || 2.0}R)`,
          }));
        }

        if (tp2Val && tp2Val > 0) {
          lines.push(candleSeries.createPriceLine({
            price: tp2Val,
            color: '#00e676',
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: `🟢 ${statusPrefix}TP2 TARGET (+${setup.r_multiple_2 || 3.0}R)`,
          }));
        }

        priceLinesRef.current = lines;

        // Superimpose Candlestick Markers for Entry and Exit
        const markers: any[] = [];
        const tzBadge = getTimezoneBadge(selectedTz);

        if (entryTimestamp) {
          try {
            const entryTimeMs = new Date(entryTimestamp).getTime();
            const entryUnix = Math.floor(entryTimeMs / 1000);
            let closestCandle = formattedCandles[0];
            let minDiff = Infinity;
            for (const c of formattedCandles) {
              const diff = Math.abs((c.time as number) - entryUnix);
              if (diff < minDiff) {
                minDiff = diff;
                closestCandle = c;
              }
            }
            if (closestCandle) {
              const entryTimeStr = formatTzTime(entryUnix, selectedTz);
              markers.push({
                time: closestCandle.time,
                position: isLong ? 'belowBar' : 'aboveBar',
                color: '#00e5ff',
                shape: isLong ? 'arrowUp' : 'arrowDown',
                text: `⚡ ENTRY @ ${entryTimeStr} ${tzBadge} (${execPrice > 0 ? execPrice : 'Zone'})`,
                size: 2,
              });
            }
          } catch {}
        }

        if (resolvedTimestamp) {
          try {
            const resTimeMs = new Date(resolvedTimestamp).getTime();
            const resUnix = Math.floor(resTimeMs / 1000);
            let closestRes = formattedCandles[0];
            let minDiff = Infinity;
            for (const c of formattedCandles) {
              const diff = Math.abs((c.time as number) - resUnix);
              if (diff < minDiff) {
                minDiff = diff;
                closestRes = c;
              }
            }
            if (closestRes) {
              const resTimeStr = formatTzTime(resUnix, selectedTz);
              const reason = (setup.invalidation_reason || 'resolved').toUpperCase();
              const isWin = reason.includes('TP');
              markers.push({
                time: closestRes.time,
                position: isWin ? 'aboveBar' : 'belowBar',
                color: isWin ? '#00e676' : '#ff1744',
                shape: 'circle',
                text: `🏁 ${reason} @ ${resTimeStr} ${tzBadge}`,
                size: 2,
              });
            }
          } catch {}
        }

        if (markers.length > 0) {
          markers.sort((a, b) => (a.time as number) - (b.time as number));
          try {
            candleSeries.setMarkers(markers);
          } catch (mErr) {
            console.warn('Unable to set candle markers:', mErr);
          }
        }

        // Auto Scale to fit candles ONCE per timeframe selection
        if (lastFittedTimeframeRef.current !== timeframe) {
          chartRef.current?.priceScale('right').applyOptions({ autoScale: true });
          chartRef.current?.timeScale().fitContent();
          lastFittedTimeframeRef.current = timeframe;
        }

        setLoading(false);
      })
      .catch(err => {
        if (!isMounted) return;
        setError(err.message || 'Failed to load chart data');
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [setup.id, setup.instrument, entryLow, entryHigh, entryMid, stopVal, tp1Val, tp2Val, timeframe, isPending, isActive, selectedTz]);

  // 3. Dynamic Real-Time Candle Drawing
  useEffect(() => {
    if (!candleSeriesRef.current || !setup.current_price) return;

    const currentPrice = Number(setup.current_price);
    const candleTime = getCurrentCandleTime(timeframe);

    // If we don't have a live candle yet, or if the time rolled over, initialize it.
    if (!liveCandleRef.current || liveCandleRef.current.time !== candleTime) {
      liveCandleRef.current = {
        time: candleTime,
        open: currentPrice,
        high: currentPrice,
        low: currentPrice,
        close: currentPrice
      };
    } else {
      // Update the current candle values based on the new price tick
      liveCandleRef.current.high = Math.max(liveCandleRef.current.high, currentPrice);
      liveCandleRef.current.low = Math.min(liveCandleRef.current.low, currentPrice);
      liveCandleRef.current.close = currentPrice;
    }

    try {
      candleSeriesRef.current.update(liveCandleRef.current);
    } catch (err) {
      console.warn('Failed to update live candle on chart:', err);
    }
  }, [setup.current_price, timeframe]);

  const drawZones = useCallback(() => {
    if (!chartRef.current || !candleSeriesRef.current || !overlayCanvasRef.current || !chartContainerRef.current) return;
    const canvas = overlayCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const container = chartContainerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width <= 0 || height <= 0) return;

    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    if (!isMannaSnd) return;

    const series = candleSeriesRef.current;
    const timeScale = chartRef.current.timeScale();
    const isLight = theme === 'light';
    const tzBadge = getTimezoneBadge(selectedTz);

    const getY = (price: number) => {
      if (!price || price <= 0) return null;
      return series.priceToCoordinate(price);
    };

    const getX = (timeStr?: string) => {
      if (!timeStr) return 0;
      try {
        const unixTime = Math.floor(new Date(timeStr).getTime() / 1000);
        const coord = timeScale.timeToCoordinate(unixTime as any);
        return coord !== null && coord > 0 ? coord : 0;
      } catch {
        return 0;
      }
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
        const boxWidth = width - startX;

        ctx.save();
        ctx.fillStyle = isLight ? 'rgba(0, 176, 96, 0.15)' : 'rgba(0, 230, 118, 0.18)';
        ctx.strokeStyle = isLight ? '#00a355' : '#00e676';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);

        ctx.fillRect(startX, topY, boxWidth, boxHeight);
        ctx.strokeRect(startX, topY, boxWidth, boxHeight);

        ctx.fillStyle = isLight ? '#008544' : '#00e676';
        ctx.font = 'bold 11px monospace';
        const form = metadata.htf_demand_formation ? ` (${metadata.htf_demand_formation})` : '';
        const labelStr = `🔮 1H DEMAND CURVE${form}: ${Math.min(activeDemandProx, activeDemandDist)} - ${Math.max(activeDemandProx, activeDemandDist)}`;
        ctx.fillText(labelStr, Math.max(10, startX + 10), topY + Math.min(14, boxHeight / 2 + 4));
        ctx.restore();
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
        const boxWidth = width - startX;

        ctx.save();
        ctx.fillStyle = isLight ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 23, 68, 0.18)';
        ctx.strokeStyle = isLight ? '#dc2626' : '#ff1744';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);

        ctx.fillRect(startX, topY, boxWidth, boxHeight);
        ctx.strokeRect(startX, topY, boxWidth, boxHeight);

        ctx.fillStyle = isLight ? '#b91c1c' : '#ff1744';
        ctx.font = 'bold 11px monospace';
        const form = metadata.htf_supply_formation ? ` (${metadata.htf_supply_formation})` : '';
        const labelStr = `🔮 1H SUPPLY CURVE${form}: ${Math.min(activeSupplyProx, activeSupplyDist)} - ${Math.max(activeSupplyProx, activeSupplyDist)}`;
        ctx.fillText(labelStr, Math.max(10, startX + 10), topY + Math.min(14, boxHeight / 2 + 4));
        ctx.restore();
      }
    }

    // 2. Draw 15M Entry Zone Shaded Box (Starts on Zone Base Candle Timestamp)
    if (entryLow > 0 && entryHigh > 0) {
      const y1 = getY(entryHigh);
      const y2 = getY(entryLow);

      if (y1 !== null && y2 !== null) {
        const topY = Math.min(y1, y2);
        const boxHeight = Math.max(3, Math.abs(y2 - y1));
        const zoneBaseTime = metadata.entry_zone_base_time || setup.created_at || (setup as any).createdAt;
        const startX = getX(zoneBaseTime);
        const boxWidth = width - startX;

        ctx.save();
        ctx.fillStyle = isLong
          ? (isLight ? 'rgba(217, 119, 6, 0.18)' : 'rgba(255, 171, 0, 0.22)')
          : (isLight ? 'rgba(220, 38, 38, 0.18)' : 'rgba(255, 82, 82, 0.22)');
        ctx.strokeStyle = isLong ? (isLight ? '#d97706' : '#ffab00') : (isLight ? '#dc2626' : '#ff5252');
        ctx.lineWidth = 2;

        ctx.fillRect(startX, topY, boxWidth, boxHeight);
        ctx.strokeRect(startX, topY, boxWidth, boxHeight);

        // Label inside box
        ctx.fillStyle = isLong ? (isLight ? '#92400e' : '#ffab00') : (isLight ? '#991b1b' : '#ff5252');
        ctx.font = 'bold 11px monospace';
        const labelStr = `⚡ 15M ENTRY ZONE (${formation}: ${entryLow} - ${entryHigh})`;
        ctx.fillText(labelStr, Math.max(10, startX + 10), topY + Math.min(16, boxHeight / 2 + 4));
        ctx.restore();
      }
    }

    // 3. Draw Vertical Entry Timestamp Marker Line & Floating Banner Flag
    if (entryTimestamp) {
      try {
        const entryUnix = Math.floor(new Date(entryTimestamp).getTime() / 1000);
        const entryX = timeScale.timeToCoordinate(entryUnix as any);

        if (entryX !== null && entryX > 0 && entryX < width) {
          ctx.save();
          ctx.strokeStyle = isLight ? '#0284c7' : '#00e5ff';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 4]);

          ctx.beginPath();
          ctx.moveTo(entryX, 0);
          ctx.lineTo(entryX, height);
          ctx.stroke();

          const entryTimeStr = formatTzTime(entryUnix, selectedTz, true) + ` ${tzBadge}`;
          const labelText = `⚡ EXACT ENTRY FILL @ ${entryTimeStr} (${execPrice > 0 ? execPrice : 'Zone'})`;
          ctx.font = 'bold 11px monospace';
          const textWidth = ctx.measureText(labelText).width;

          const badgeX = Math.max(10, Math.min(width - textWidth - 20, entryX - textWidth / 2));
          const badgeY = 28;

          ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(9, 3, 20, 0.9)';
          ctx.strokeStyle = isLight ? '#0284c7' : '#00e5ff';
          ctx.lineWidth = 1;
          ctx.setLineDash([]);

          ctx.fillRect(badgeX - 6, badgeY - 14, textWidth + 12, 20);
          ctx.strokeRect(badgeX - 6, badgeY - 14, textWidth + 12, 20);

          ctx.fillStyle = isLight ? '#0369a1' : '#00e5ff';
          ctx.fillText(labelText, badgeX, badgeY);
          ctx.restore();
        }
      } catch {}
    }

    // 4. Draw Vertical Resolved Timestamp Marker Line & Exit Banner Flag
    if (resolvedTimestamp) {
      try {
        const resUnix = Math.floor(new Date(resolvedTimestamp).getTime() / 1000);
        const resX = timeScale.timeToCoordinate(resUnix as any);

        if (resX !== null && resX > 0 && resX < width) {
          const reason = (setup.invalidation_reason || 'resolved').toUpperCase();
          const isWin = reason.includes('TP');
          const flagColor = isWin ? (isLight ? '#059669' : '#00e676') : (isLight ? '#dc2626' : '#ff1744');

          ctx.save();
          ctx.strokeStyle = flagColor;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 4]);

          ctx.beginPath();
          ctx.moveTo(resX, 0);
          ctx.lineTo(resX, height);
          ctx.stroke();

          const resTimeStr = formatTzTime(resUnix, selectedTz) + ` ${tzBadge}`;
          const labelText = `🏁 TRADE EXIT (${reason}) @ ${resTimeStr}`;
          ctx.font = 'bold 11px monospace';
          const textWidth = ctx.measureText(labelText).width;

          const badgeX = Math.max(10, Math.min(width - textWidth - 20, resX - textWidth / 2));
          const badgeY = 54;

          ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(9, 3, 20, 0.9)';
          ctx.strokeStyle = flagColor;
          ctx.lineWidth = 1;
          ctx.setLineDash([]);

          ctx.fillRect(badgeX - 6, badgeY - 14, textWidth + 12, 20);
          ctx.strokeRect(badgeX - 6, badgeY - 14, textWidth + 12, 20);

          ctx.fillStyle = flagColor;
          ctx.fillText(labelText, badgeX, badgeY);
          ctx.restore();
        }
      } catch {}
    }
  }, [isMannaSnd, htfProximal, htfDistal, htfType, entryLow, entryHigh, isLong, formation, metadata, entryTimestamp, resolvedTimestamp, execPrice, theme, selectedTz]);

  // Sync canvas zone overlay on scroll & resize
  useEffect(() => {
    if (!chartRef.current) return;
    const timeScale = chartRef.current.timeScale();
    
    drawZones();
    timeScale.subscribeVisibleLogicalRangeChange(drawZones);

    window.addEventListener('resize', drawZones);
    return () => {
      try { timeScale.unsubscribeVisibleLogicalRangeChange(drawZones); } catch {}
      window.removeEventListener('resize', drawZones);
    };
  }, [drawZones]);

  return createPortal(
    <div className="chart-modal-backdrop font-sans">
      <div className={`chart-modal-content animate-fade-in theme-${theme}`}>
        {/* Fullscreen Header */}
        <div className="chart-modal-header">
          <div className="header-left">
            <h2 className="chart-symbol font-mono">{setup.instrument}</h2>
            <span className={`bias-tag ${isLong ? 'long' : 'short'}`}>
              {isLong ? '⬆ LONG' : '⬇ SHORT'}
            </span>

            {/* Status Badge */}
            {isPending && (
              <span className="state-status-tag pending font-mono">
                ⏳ PENDING ENTRY (NOT ENTERED YET)
              </span>
            )}
            {isActive && (
              <span className="state-status-tag active font-mono">
                🔥 ACTIVE TRADE (IN POSITION)
              </span>
            )}
            {isResolved && (
              <span className="state-status-tag resolved font-mono">
                🏁 RESOLVED TRADE
              </span>
            )}

            <span className="market-tag font-mono">{(setup.market || 'futures').toUpperCase()}</span>
            <span className="kz-tag font-mono">{(setup.killzone_origin || 'NY AM').toUpperCase()} SESSION</span>
          </div>

          <div className="header-right">
            {/* Timezone Selector Dropdown */}
            <div className="tz-selector-wrapper font-mono">
              <span className="tz-label">🌐 TZ:</span>
              <select
                className="tz-select"
                value={selectedTz}
                onChange={(e) => setSelectedTz(e.target.value)}
                title="Change Chart Timezone (Display only — does not affect signals or feeds)"
              >
                {TIMEZONE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Light / Dark Mode Toggle Button */}
            <button
              type="button"
              className={`theme-toggle-btn font-mono ${theme}`}
              onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
            </button>

            {/* Zoom & Scroll Toolbar */}
            <div className="zoom-toolbar font-mono">
              <button className="zoom-btn" onClick={() => handleZoom(true)} title="Zoom In">🔍 +</button>
              <button className="zoom-btn" onClick={() => handleZoom(false)} title="Zoom Out">🔍 -</button>
              <button className="reset-view-btn font-mono" onClick={() => {
                chartRef.current?.priceScale('right').applyOptions({ autoScale: true });
                chartRef.current?.timeScale().fitContent();
                setTimeout(() => {
                  chartRef.current?.priceScale('right').applyOptions({ autoScale: false });
                }, 100);
              }} title="Reset View & Scale">
                🔄 Fit All
              </button>
            </div>

            {/* Multi-Timeframe Selector */}
            <div className="tf-selector font-mono">
              <button className={timeframe === '1m' ? 'active' : ''} onClick={() => setTimeframe('1m')} title="1 Minute Scalp">1M</button>
              <button className={timeframe === '5m' ? 'active' : ''} onClick={() => setTimeframe('5m')} title="5 Minute Precision">5M</button>
              <button className={timeframe === '15m' ? 'active' : ''} onClick={() => setTimeframe('15m')} title="15 Minute Execution (Entry Logic)">15M ★</button>
              <button className={timeframe === '1h' ? 'active' : ''} onClick={() => setTimeframe('1h')} title="1 Hour Market Structure">1H</button>
              <button className={timeframe === '4h' ? 'active' : ''} onClick={() => setTimeframe('4h')} title="4 Hour Trend Context">4H</button>
              <button className={timeframe === '1d' ? 'active' : ''} onClick={() => setTimeframe('1d')} title="Daily Macro View">1D</button>
            </div>

            <button className="close-btn font-mono" onClick={onClose}>
              ✕ CLOSE (ESC)
            </button>
          </div>
        </div>


        {/* Level Legend Bar */}
        <div className="level-legend-bar font-mono">
          <span className="legend-item tf-tag">
            ⏱️ VIEW TIMEFRAME: <strong>{timeframe.toUpperCase()}</strong> {timeframe === '15m' ? '(Entry Execution Standard)' : ''}
          </span>
          <span className="legend-item entry">
            🟡 {isPending ? 'Pending Entry:' : 'Entry Zone:'} {entryLow} – {entryHigh}
          </span>
          <span className="legend-item stop">🛑 Stop Loss: {stopVal}</span>
          <span className="legend-item tp">🎯 Target 1: {tp1Val} (+{setup.r_multiple_1 || 2.0}R)</span>
          {tp2Val && tp2Val > 0 && <span className="legend-item tp">🎯 Target 2: {tp2Val} (+{setup.r_multiple_2 || 3.0}R)</span>}
          {currentPrice > 0 && <span className="legend-item live">🌐 Live Price: {currentPrice}</span>}
        </div>

        {/* MANNA SND Specific Visual Indicator Overlay Bar */}
        {isMannaSnd && (
          <div className="manna-snd-legend-bar font-mono">
            <span className="snd-badge">🟡 MANNA SND INDICATORS</span>
            <span className="snd-item curve">
              🔮 1H Curve Location: <strong>{curveLocation.toUpperCase()}</strong>
            </span>
            {activeDemandProx > 0 && (
              <span className="snd-item demand">
                🟢 1H Demand Curve: {activeDemandProx} – {activeDemandDist}
              </span>
            )}
            {activeSupplyProx > 0 && (
              <span className="snd-item supply">
                🔴 1H Supply Curve: {activeSupplyProx} – {activeSupplyDist}
              </span>
            )}
            <span className="snd-item trend">
              📈 15M Trend: <strong>{trend15m.toUpperCase()}</strong>
            </span>
            <span className="snd-item zone">
              ⚡ 15M Entry Zone: <strong>{formation}</strong> ({entryLow} – {entryHigh})
            </span>
          </div>
        )}

        {/* Fullscreen Chart Container */}
        <div className="chart-container-wrapper">
          {loading && <div className="chart-overlay-loader">Loading TradingView {timeframe.toUpperCase()} Live Candles & Levels...</div>}
          {error && <div className="chart-overlay-error">Unable to load live candles: {error}</div>}
          <div ref={chartContainerRef} className="chart-canvas-container" />
          <canvas ref={overlayCanvasRef} className="zone-overlay-canvas" />
        </div>
      </div>
    </div>,
    document.body
  );
};
