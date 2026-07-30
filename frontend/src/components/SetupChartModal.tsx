import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { createChart, ColorType, LineStyle, CandlestickSeries, type IChartApi } from 'lightweight-charts';
import type { EdgeSetup } from '../types';
import { API_BASE } from '../config';
import './SetupChartModal.css';

interface SetupChartModalProps {
  setup: EdgeSetup;
  onClose: () => void;
}

export type ChartTimeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

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
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  const [timeframe, setTimeframe] = useState<ChartTimeframe>('15m');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  const activeDemandProx = parseNum(metadata.htf_demand_proximal || (htfType === 'demand' ? htfProximal : 0));
  const activeDemandDist = parseNum(metadata.htf_demand_distal || (htfType === 'demand' ? htfDistal : 0));
  const activeDemandTime = metadata.htf_demand_base_time || metadata.htf_curve_base_time || metadata.entry_zone_base_time;

  // 2. True 1H HTF Supply Curve Zone (Rose Red)
  const activeSupplyProx = parseNum(metadata.htf_supply_proximal || (htfType === 'supply' ? htfProximal : 0));
  const activeSupplyDist = parseNum(metadata.htf_supply_distal || (htfType === 'supply' ? htfDistal : 0));
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

  // 1. Initialize Chart Canvas ONCE on mount
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const container = chartContainerRef.current;
    container.innerHTML = '';

    const containerHeight = container.clientHeight || (window.innerHeight - 140);

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#140926' },
        textColor: '#e0d6f5',
        fontFamily: 'JetBrains Mono, monospace',
      },
      grid: {
        vertLines: { color: 'rgba(224, 86, 253, 0.05)' },
        horzLines: { color: 'rgba(224, 86, 253, 0.05)' },
      },
      width: container.clientWidth,
      height: containerHeight,
      crosshair: {
        vertLine: { color: '#e056fd', width: 1, style: LineStyle.Dashed },
        horzLine: { color: '#e056fd', width: 1, style: LineStyle.Dashed },
      },
      rightPriceScale: {
        borderColor: 'rgba(224, 86, 253, 0.2)',
        scaleMargins: { top: 0.1, bottom: 0.1 },
        autoScale: true,
      },
      timeScale: {
        borderColor: 'rgba(224, 86, 253, 0.2)',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#00e676',
      downColor: '#ff1744',
      borderUpColor: '#00e676',
      borderDownColor: '#ff1744',
      wickUpColor: '#00e676',
      wickDownColor: '#ff1744',
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

  // 2. Fetch candles and draw price lines whenever timeframe or levels update
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

    // Determine count based on timeframe for optimal scroll range
    const count = timeframe === '1m' ? 240 : timeframe === '5m' ? 180 : timeframe === '15m' ? 150 : timeframe === '1h' ? 120 : 90;

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

        // Auto Scale to fit candles and price lines
        chartRef.current?.priceScale('right').applyOptions({ autoScale: true });
        chartRef.current?.timeScale().fitContent();
        
        // Unlock vertical dragging after initial scale calculation
        setTimeout(() => {
          chartRef.current?.priceScale('right').applyOptions({ autoScale: false });
        }, 100);

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
  }, [setup.id, setup.instrument, entryLow, entryHigh, entryMid, stopVal, tp1Val, tp2Val, currentPrice, timeframe, isPending, isActive]);

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

    // 1. Draw 1H HTF Demand Curve Zone (Emerald Green, Below Price)
    if (activeDemandProx > 0 && activeDemandDist > 0) {
      const y1 = getY(activeDemandProx);
      const y2 = getY(activeDemandDist);

      if (y1 !== null && y2 !== null) {
        const topY = Math.min(y1, y2);
        const boxHeight = Math.max(3, Math.abs(y2 - y1));
        const startX = getX(activeDemandTime);
        const boxWidth = width - startX;

        ctx.save();
        ctx.fillStyle = 'rgba(0, 230, 118, 0.18)';
        ctx.strokeStyle = '#00e676';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);

        ctx.fillRect(startX, topY, boxWidth, boxHeight);
        ctx.strokeRect(startX, topY, boxWidth, boxHeight);

        ctx.fillStyle = '#00e676';
        ctx.font = 'bold 11px monospace';
        const form = metadata.htf_demand_formation ? ` (${metadata.htf_demand_formation})` : '';
        const labelStr = `🔮 1H DEMAND CURVE${form}: ${Math.min(activeDemandProx, activeDemandDist)} - ${Math.max(activeDemandProx, activeDemandDist)}`;
        ctx.fillText(labelStr, Math.max(10, startX + 10), topY + Math.min(16, boxHeight / 2 + 4));
        ctx.restore();
      }
    }

    // 2. Draw 1H HTF Supply Curve Zone (Rose Red, Above Price)
    if (activeSupplyProx > 0 && activeSupplyDist > 0) {
      const y1 = getY(activeSupplyProx);
      const y2 = getY(activeSupplyDist);

      if (y1 !== null && y2 !== null) {
        const topY = Math.min(y1, y2);
        const boxHeight = Math.max(3, Math.abs(y2 - y1));
        const startX = getX(activeSupplyTime);
        const boxWidth = width - startX;

        ctx.save();
        ctx.fillStyle = 'rgba(255, 23, 68, 0.18)';
        ctx.strokeStyle = '#ff1744';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);

        ctx.fillRect(startX, topY, boxWidth, boxHeight);
        ctx.strokeRect(startX, topY, boxWidth, boxHeight);

        ctx.fillStyle = '#ff1744';
        ctx.font = 'bold 11px monospace';
        const form = metadata.htf_supply_formation ? ` (${metadata.htf_supply_formation})` : '';
        const labelStr = `🔮 1H SUPPLY CURVE${form}: ${Math.min(activeSupplyProx, activeSupplyDist)} - ${Math.max(activeSupplyProx, activeSupplyDist)}`;
        ctx.fillText(labelStr, Math.max(10, startX + 10), topY + Math.min(16, boxHeight / 2 + 4));
        ctx.restore();
      }
    }

    // 2. Draw 15M Entry Zone Shaded Box
    if (entryLow > 0 && entryHigh > 0) {
      const y1 = getY(entryHigh);
      const y2 = getY(entryLow);

      if (y1 !== null && y2 !== null) {
        const topY = Math.min(y1, y2);
        const boxHeight = Math.max(3, Math.abs(y2 - y1));
        const startX = getX(metadata.entry_zone_base_time);
        const boxWidth = width - startX;

        ctx.save();
        ctx.fillStyle = isLong ? 'rgba(255, 171, 0, 0.22)' : 'rgba(255, 82, 82, 0.22)';
        ctx.strokeStyle = isLong ? '#ffab00' : '#ff5252';
        ctx.lineWidth = 2;

        ctx.fillRect(startX, topY, boxWidth, boxHeight);
        ctx.strokeRect(startX, topY, boxWidth, boxHeight);

        // Label inside box
        ctx.fillStyle = isLong ? '#ffab00' : '#ff5252';
        ctx.font = 'bold 11px monospace';
        const labelStr = `⚡ 15M ENTRY ZONE (${formation}: ${entryLow} - ${entryHigh})`;
        ctx.fillText(labelStr, Math.max(10, startX + 10), topY + Math.min(16, boxHeight / 2 + 4));
        ctx.restore();
      }
    }
  }, [isMannaSnd, htfProximal, htfDistal, htfType, entryLow, entryHigh, isLong, formation, metadata]);

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
      <div className="chart-modal-content animate-fade-in">
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
