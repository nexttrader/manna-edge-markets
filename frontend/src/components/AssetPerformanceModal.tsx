import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getTodayPlainDateStr } from '../data/macroCalendarDates';
import {
  getEffectiveRealizedR,
  getETTradingDayAndSession,
  getTradeMarketCategory,
  type ExitProfile,
} from '../utils/rAccounting';
import './AssetPerformanceModal.css';

export interface AssetPerfOutcomeLike {
  id: string;
  setup_id?: string;
  instrument?: string;
  market?: string;
  setup_market?: string;
  strategy_id?: string;
  trading_style?: string;
  outcome_type?: string;
  invalidation_reason?: string;
  was_runner?: boolean | number;
  realized_r?: number;
  realized_pl?: number;
  entry_price?: number;
  entry_price_recorded?: number;
  entry_price_executed?: number;
  entry_zone_mid?: number;
  initial_stop?: number;
  stop?: number;
  r_multiple_1?: number;
  r_multiple_2?: number;
  time_exited?: string;
  execution_time?: string;
  created_at?: string;
}

interface AssetPerformanceModalProps {
  outcomes: AssetPerfOutcomeLike[];
  includeFees: boolean;
  exitProfile: ExitProfile;
  riskPerR: number;
  styleLabel: string;
  marketLabel: string;
  onClose: () => void;
}

interface AssetStats {
  instrument: string;
  market: 'forex' | 'futures';
  trades: number;
  wins: number;
  losses: number;
  bes: number;
  winRate: number;
  netR: number;
  avgR: number;
}

type WindowDays = 7 | 30;
type ViewMode = 'compare' | 'all';

function getTodayETPlainDateStr(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return getTodayPlainDateStr();
  }
}

function shiftPlainDate(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const shifted = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
  const yy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function formatShortPlainDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const safeNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return safeNoon.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  });
}

function formatR(val: number): string {
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}R`;
}

function formatUsd(rVal: number, riskPerR: number): string {
  const usd = rVal * riskPerR;
  const sign = usd > 0 ? '+$' : usd < 0 ? '-$' : '$';
  return `${sign}${Math.abs(usd).toFixed(0)}`;
}

function getToneClass(val: number): string {
  if (val > 0.01) return 'is-positive';
  if (val < -0.01) return 'is-negative';
  return 'is-neutral';
}

export function AssetPerformanceModal({
  outcomes,
  includeFees,
  exitProfile,
  riskPerR,
  styleLabel,
  marketLabel,
  onClose,
}: AssetPerformanceModalProps) {
  const [windowDays, setWindowDays] = useState<WindowDays>(30);
  const [viewMode, setViewMode] = useState<ViewMode>('compare');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  const headingId = useId();
  const topCaptionId = useId();
  const worstCaptionId = useId();
  const allCaptionId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Open native modal <dialog> in the top layer, handle native close, and polyfill light-dismiss where closedBy is absent (e.g. Safari)
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

    let removeFallback: (() => void) | undefined;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      let pressedOutside = false;
      const isOutside = (e: PointerEvent) => {
        const r = dialog.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      const onPointerDown = (e: PointerEvent) => {
        pressedOutside = isOutside(e);
      };
      const onPointerUp = (e: PointerEvent) => {
        if (pressedOutside && isOutside(e)) {
          dialog.close();
        }
        pressedOutside = false;
      };
      dialog.addEventListener('pointerdown', onPointerDown);
      dialog.addEventListener('pointerup', onPointerUp);
      removeFallback = () => {
        dialog.removeEventListener('pointerdown', onPointerDown);
        dialog.removeEventListener('pointerup', onPointerUp);
      };
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
      removeFallback?.();
      if (dialog.open) {
        dialog.close();
      }
    };
  }, []);

  const todayETStr = useMemo(() => getTodayETPlainDateStr(), []);
  const cutoffDateStr = useMemo(
    () => shiftPlainDate(todayETStr, -(windowDays - 1)),
    [todayETStr, windowDays]
  );

  const {
    allSorted,
    topAssets,
    worstAssets,
    totalTrades,
    totalNetR,
    profitableCount,
    losingCount,
    maxAbsR,
    hasMixedSigns,
  } = useMemo(() => {
    const map = new Map<string, {
      instrument: string;
      market: 'forex' | 'futures';
      trades: number;
      wins: number;
      losses: number;
      bes: number;
      netR: number;
    }>();

    let tradesSum = 0;
    let netRSum = 0;

    for (const o of outcomes) {
      const timeToUse = o.time_exited || o.execution_time || o.created_at;
      if (!timeToUse) continue;

      const { tradingDay, isWeekend } = getETTradingDayAndSession(timeToUse);
      if (!tradingDay || isWeekend) continue;
      if (tradingDay < cutoffDateStr) continue;

      const instrument = (o.instrument || 'UNKNOWN').trim();
      const market = getTradeMarketCategory(o);
      const r = getEffectiveRealizedR(o, includeFees, exitProfile);
      const ot = String(o.outcome_type || o.invalidation_reason || '').toLowerCase();
      const isWin = ot.includes('tp') || (ot.includes('be') && Boolean(o.was_runner));
      const isLoss = ot.includes('sl') || ot.includes('stop');

      let entry = map.get(instrument);
      if (!entry) {
        entry = {
          instrument,
          market,
          trades: 0,
          wins: 0,
          losses: 0,
          bes: 0,
          netR: 0,
        };
        map.set(instrument, entry);
      }

      entry.trades += 1;
      entry.netR += r;
      if (isWin) {
        entry.wins += 1;
      } else if (isLoss) {
        entry.losses += 1;
      } else {
        entry.bes += 1;
      }

      tradesSum += 1;
      netRSum += r;
    }

    const stats: AssetStats[] = Array.from(map.values()).map((a) => {
      const decided = a.wins + a.losses;
      const winRate = decided > 0 ? (a.wins / decided) * 100 : 0;
      const netR = Number(a.netR.toFixed(2));
      const avgR = a.trades > 0 ? Number((netR / a.trades).toFixed(2)) : 0;
      return {
        instrument: a.instrument,
        market: a.market,
        trades: a.trades,
        wins: a.wins,
        losses: a.losses,
        bes: a.bes,
        netR,
        winRate: Number(winRate.toFixed(1)),
        avgR,
      };
    });

    stats.sort((a, b) => {
      if (Math.abs(b.netR - a.netR) > 0.005) return b.netR - a.netR;
      if (Math.abs(b.winRate - a.winRate) > 0.05) return b.winRate - a.winRate;
      if (b.trades !== a.trades) return b.trades - a.trades;
      return a.instrument.localeCompare(b.instrument);
    });

    const positives = stats.filter((a) => a.netR > 0.01);
    const negatives = stats.filter((a) => a.netR < -0.01);
    const mixed = positives.length > 0 && negatives.length > 0;

    let top: AssetStats[] = [];
    let worst: AssetStats[] = [];

    if (stats.length === 1) {
      if (stats[0].netR >= 0) top = [stats[0]];
      else worst = [stats[0]];
    } else if (mixed) {
      top = positives.slice(0, 5);
      worst = [...negatives].sort((a, b) => a.netR - b.netR || a.winRate - b.winRate).slice(0, 5);
    } else if (stats.length >= 2) {
      const topCount = Math.min(5, Math.ceil(stats.length / 2));
      top = stats.slice(0, topCount);
      worst = [...stats.slice(topCount)].reverse().slice(0, 5);
    }

    const absMax = Math.max(1, ...stats.map((a) => Math.abs(a.netR)));

    return {
      allSorted: stats,
      topAssets: top,
      worstAssets: worst,
      totalTrades: tradesSum,
      totalNetR: Number(netRSum.toFixed(2)),
      profitableCount: positives.length,
      losingCount: negatives.length,
      maxAbsR: absMax,
      hasMixedSigns: mixed,
    };
  }, [outcomes, cutoffDateStr, includeFees, exitProfile]);

  const bestAsset = allSorted[0] ?? null;
  const worstAsset = allSorted.length > 0 ? allSorted[allSorted.length - 1] : null;
  const spreadR = bestAsset && worstAsset && allSorted.length > 1
    ? Number((bestAsset.netR - worstAsset.netR).toFixed(2))
    : null;

  const renderAssetTable = (
    rows: AssetStats[],
    captionId: string,
    captionText: string,
    variant: 'top' | 'worst' | 'all',
    emptyMessage: string
  ) => {
    if (rows.length === 0) {
      return (
        <div className="asset-perf-empty-panel">
          {emptyMessage}
        </div>
      );
    }

    return (
      <div
        tabIndex={0}
        role="region"
        aria-labelledby={captionId}
        className="asset-perf-table-wrapper"
      >
        <table className={`asset-perf-table variant-${variant}`}>
          <caption id={captionId} className="sr-only">
            {captionText}
          </caption>
          <thead>
            <tr>
              <th scope="col">Asset</th>
              <th scope="col" className="num">W-L</th>
              <th scope="col" className="num">Win %</th>
              <th scope="col" className="num">Net R</th>
              <th scope="col" className="num">Net USD</th>
              <th scope="col" className="num">Avg R</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const barPct = Math.min(100, Math.max(6, (Math.abs(row.netR) / maxAbsR) * 100));
              const rankNum =
                variant === 'worst' && allSorted.length > 0
                  ? allSorted.findIndex((a) => a.instrument === row.instrument) + 1
                  : idx + 1;

              return (
                <tr key={row.instrument}>
                  <th scope="row" className="asset-row-header">
                    <div className="asset-name-cell">
                      <span className={`asset-rank-badge ${variant === 'top' ? 'rank-top' : variant === 'worst' ? 'rank-worst' : ''}`}>
                        #{rankNum}
                      </span>
                      <span className="asset-symbol">{row.instrument}</span>
                      <span className={`asset-mkt-pill ${row.market}`}>
                        {row.market === 'forex' ? 'FX' : 'FUT'}
                      </span>
                    </div>
                    <div className="asset-bar-track" aria-hidden="true">
                      <div
                        className={`asset-bar-fill ${getToneClass(row.netR)}`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </th>
                  <td className="num">
                    <span className="wl-record">
                      <span className="wl-w">{row.wins}W</span>
                      <span className="wl-sep">-</span>
                      <span className="wl-l">{row.losses}L</span>
                      {row.bes > 0 && <span className="wl-be">-{row.bes}BE</span>}
                    </span>
                    <span className="wl-total"> ({row.trades})</span>
                  </td>
                  <td className="num">{row.winRate.toFixed(0)}%</td>
                  <td className={`num strong ${getToneClass(row.netR)}`}>
                    {formatR(row.netR)}
                  </td>
                  <td className={`num ${getToneClass(row.netR)}`}>
                    {formatUsd(row.netR, riskPerR)}
                  </td>
                  <td className={`num ${getToneClass(row.avgR)}`}>
                    {formatR(row.avgR)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby={headingId}
      className="asset-perf-dialog font-mono"
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      <div className="asset-perf-shell">
        {/* Header */}
        <header className="asset-perf-header">
          <div className="asset-perf-title-block">
            <div className="asset-perf-title-row">
              <span aria-hidden="true" className="asset-perf-icon">📊</span>
              <h2 id={headingId} className="asset-perf-title">
                Top vs Worst Performing Assets
              </h2>
            </div>
            <div className="asset-perf-context-pills">
              <span className="context-pill">
                Window: <strong>{formatShortPlainDate(cutoffDateStr)} – {formatShortPlainDate(todayETStr)}</strong>
              </span>
              <span className="context-pill">{styleLabel}</span>
              <span className="context-pill">{marketLabel}</span>
              <span className="context-pill">
                {exitProfile === '80_20' ? '80/20 Scale' : exitProfile === 'all_2r' ? 'All @ 2R' : 'All @ 3R'}
              </span>
              <span className={`context-pill ${includeFees ? 'is-fees-on' : ''}`}>
                {includeFees ? 'Net of Fees' : 'Gross R'}
              </span>
              <span className="context-pill">${riskPerR}/R</span>
            </div>
          </div>

          <button
            type="button"
            className="asset-perf-close-btn"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close Top vs Worst Performing Assets dialog"
          >
            ✕
          </button>
        </header>

        {/* Controls Bar */}
        <div className="asset-perf-toolbar">
          <div className="asset-perf-segmented" role="group" aria-label="Lookback period">
            <button
              type="button"
              autoFocus
              className={`asset-seg-btn ${windowDays === 30 ? 'active' : ''}`}
              aria-pressed={windowDays === 30}
              onClick={() => setWindowDays(30)}
            >
              Last 30 Days
            </button>
            <button
              type="button"
              className={`asset-seg-btn ${windowDays === 7 ? 'active' : ''}`}
              aria-pressed={windowDays === 7}
              onClick={() => setWindowDays(7)}
            >
              Last 7 Days
            </button>
          </div>

          <div className="asset-perf-segmented" role="group" aria-label="View layout">
            <button
              type="button"
              className={`asset-seg-btn ${viewMode === 'compare' ? 'active' : ''}`}
              aria-pressed={viewMode === 'compare'}
              onClick={() => setViewMode('compare')}
            >
              Top vs Worst
            </button>
            <button
              type="button"
              className={`asset-seg-btn ${viewMode === 'all' ? 'active' : ''}`}
              aria-pressed={viewMode === 'all'}
              onClick={() => setViewMode('all')}
            >
              All Assets ({allSorted.length})
            </button>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="asset-perf-summary-grid">
          <div className="asset-kpi-card">
            <span className="asset-kpi-label">{windowDays}D NET P&amp;L</span>
            <strong className={`asset-kpi-value ${getToneClass(totalNetR)}`}>
              {formatR(totalNetR)}
            </strong>
            <span className="asset-kpi-sub">
              {formatUsd(totalNetR, riskPerR)} · {totalTrades} trades across {allSorted.length} assets
            </span>
          </div>

          <div className="asset-kpi-card is-top-card">
            <span className="asset-kpi-label">TOP PERFORMER</span>
            {bestAsset ? (
              <>
                <strong className={`asset-kpi-value ${getToneClass(bestAsset.netR)}`}>
                  {bestAsset.instrument} · {formatR(bestAsset.netR)}
                </strong>
                <span className="asset-kpi-sub">
                  {formatUsd(bestAsset.netR, riskPerR)} · {bestAsset.winRate.toFixed(0)}% WR ({bestAsset.wins}W-{bestAsset.losses}L)
                </span>
              </>
            ) : (
              <span className="asset-kpi-sub">No trades in window</span>
            )}
          </div>

          <div className="asset-kpi-card is-worst-card">
            <span className="asset-kpi-label">WORST PERFORMER</span>
            {worstAsset ? (
              <>
                <strong className={`asset-kpi-value ${getToneClass(worstAsset.netR)}`}>
                  {worstAsset.instrument} · {formatR(worstAsset.netR)}
                </strong>
                <span className="asset-kpi-sub">
                  {formatUsd(worstAsset.netR, riskPerR)} · {worstAsset.winRate.toFixed(0)}% WR ({worstAsset.wins}W-{worstAsset.losses}L)
                </span>
              </>
            ) : (
              <span className="asset-kpi-sub">No trades in window</span>
            )}
          </div>

          <div className="asset-kpi-card">
            <span className="asset-kpi-label">SPREAD &amp; BREADTH</span>
            <strong className="asset-kpi-value">
              {spreadR !== null ? `${spreadR.toFixed(2)}R Gap` : '--'}
            </strong>
            <span className="asset-kpi-sub">
              {profitableCount} positive · {losingCount} negative
            </span>
          </div>
        </div>

        {/* Main Content */}
        <div className="asset-perf-body">
          {allSorted.length === 0 ? (
            <div className="asset-perf-empty-state">
              <p className="empty-title">No concluded trades found in the last {windowDays} days</p>
              <p className="empty-desc">
                Try switching to <strong>Last 30 Days</strong>, or adjust the calendar&apos;s style ({styleLabel}) or market ({marketLabel}) filters.
              </p>
            </div>
          ) : viewMode === 'compare' ? (
            <div className="asset-perf-compare-grid">
              <section className="asset-perf-panel panel-top">
                <div className="asset-panel-header">
                  <div className="asset-panel-title-wrap">
                    <span className="panel-dot dot-green" aria-hidden="true" />
                    <h3>
                      {hasMixedSigns
                        ? `Top Performing (${topAssets.length})`
                        : allSorted[0].netR >= 0
                        ? `Top Leaders (${topAssets.length})`
                        : `Flattest / Least Drawdown (${topAssets.length})`}
                    </h3>
                  </div>
                  <span className="asset-panel-hint">Ranked highest Net R</span>
                </div>
                {renderAssetTable(
                  topAssets,
                  topCaptionId,
                  `Top performing assets over the last ${windowDays} days`,
                  'top',
                  `No positive-R assets in the last ${windowDays} days.`
                )}
              </section>

              <section className="asset-perf-panel panel-worst">
                <div className="asset-panel-header">
                  <div className="asset-panel-title-wrap">
                    <span className="panel-dot dot-red" aria-hidden="true" />
                    <h3>
                      {hasMixedSigns
                        ? `Worst Performing (${worstAssets.length})`
                        : allSorted[0].netR >= 0
                        ? `Lagging / Lowest R (${worstAssets.length})`
                        : `Worst Performing (${worstAssets.length})`}
                    </h3>
                  </div>
                  <span className="asset-panel-hint">Ranked lowest Net R</span>
                </div>
                {renderAssetTable(
                  worstAssets,
                  worstCaptionId,
                  `Worst performing assets over the last ${windowDays} days`,
                  'worst',
                  allSorted.length === 1
                    ? 'Only 1 asset traded in this window.'
                    : `No negative-R assets in the last ${windowDays} days.`
                )}
              </section>
            </div>
          ) : (
            <section className="asset-perf-panel panel-all">
              <div className="asset-panel-header">
                <div className="asset-panel-title-wrap">
                  <span className="panel-dot dot-gold" aria-hidden="true" />
                  <h3>All Traded Assets — Last {windowDays} Days ({allSorted.length})</h3>
                </div>
                <span className="asset-panel-hint">Best to worst by Net R</span>
              </div>
              {renderAssetTable(
                allSorted,
                allCaptionId,
                `All traded assets ranked by Net R over the last ${windowDays} days`,
                'all',
                'No traded assets in window.'
              )}
            </section>
          )}
        </div>
      </div>
    </dialog>,
    document.body
  );
}
