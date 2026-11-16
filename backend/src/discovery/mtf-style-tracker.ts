import { queryDb } from '../db/database';
import type { MtfStyleSetup } from './mtf-style-signals';

export interface StyleComparisonRow {
  style: 'SCALP' | 'INTRADAY' | 'SWING';
  label: string;
  timeframes: string;
  totalSetups: number;
  awaitingEntry: number;
  activeSetups: number;
  resolvedSetups: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number;
  totalRealizedR: number;
  expectancyR: number;
  avgConviction: number;
  futuresCount: number;
  forexCount: number;
}

export interface TrackedMtfSetupRow {
  id: string;
  trading_style: 'SCALP' | 'SWING';
  context_tf: string;
  entry_tf: string;
  instrument: string;
  market: string;
  bias: string;
  entry_zone_low: number;
  entry_zone_high: number;
  entry_zone_mid: number;
  stop: number;
  tp1: number;
  tp2: number;
  conviction_score: number;
  liquidity_score: number;
  killzone_origin: string;
  signal_state: string;
  realized_r: number;
  last_price: number;
  filled_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

let tableEnsured = false;

export async function ensureMtfTrackerTable(): Promise<void> {
  if (tableEnsured) return;
  await queryDb(`
    CREATE TABLE IF NOT EXISTS mtf_style_setups (
      id TEXT PRIMARY KEY,
      signature TEXT UNIQUE,
      trading_style TEXT NOT NULL,
      context_tf TEXT NOT NULL,
      entry_tf TEXT NOT NULL,
      instrument TEXT NOT NULL,
      market TEXT NOT NULL,
      bias TEXT NOT NULL,
      entry_zone_low REAL NOT NULL,
      entry_zone_high REAL NOT NULL,
      entry_zone_mid REAL NOT NULL,
      stop REAL NOT NULL,
      tp1 REAL NOT NULL,
      tp2 REAL NOT NULL,
      conviction_score REAL NOT NULL,
      liquidity_score REAL NOT NULL,
      killzone_origin TEXT,
      signal_state TEXT NOT NULL,
      realized_r REAL DEFAULT 0,
      last_price REAL DEFAULT 0,
      filled_at TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  tableEnsured = true;
}

function buildSignature(setup: MtfStyleSetup): string {
  const dayBucket = new Date().toISOString().slice(0, 10);
  const roundedMid = Number(setup.entry_zone_mid).toFixed(setup.market === 'forex' ? 4 : 1);
  return `${dayBucket}:${setup.trading_style}:${setup.context_tf}_${setup.entry_tf}:${setup.instrument}:${setup.bias}:${roundedMid}`;
}

function evaluatePriceState(
  row: {
    bias: string;
    signal_state: string;
    entry_zone_low: number;
    entry_zone_high: number;
    stop: number;
    tp1: number;
    tp2: number;
    filled_at: string | null;
    resolved_at: string | null;
    realized_r: number;
  },
  livePrice: number,
  nowIso: string
): { signal_state: string; realized_r: number; filled_at: string | null; resolved_at: string | null } {
  if (!livePrice || !Number.isFinite(livePrice)) {
    return {
      signal_state: row.signal_state,
      realized_r: row.realized_r,
      filled_at: row.filled_at,
      resolved_at: row.resolved_at
    };
  }

  // Already resolved — preserve final outcome
  if (['tp1_hit', 'tp2_hit', 'stopped', 'expired'].includes(row.signal_state)) {
    return {
      signal_state: row.signal_state,
      realized_r: row.realized_r,
      filled_at: row.filled_at,
      resolved_at: row.resolved_at
    };
  }

  const isLong = String(row.bias).toLowerCase() === 'long';
  let state = row.signal_state;
  let realizedR = row.realized_r || 0;
  let filledAt = row.filled_at;
  let resolvedAt = row.resolved_at;

  const inZone = livePrice >= Math.min(row.entry_zone_low, row.entry_zone_high) &&
                 livePrice <= Math.max(row.entry_zone_low, row.entry_zone_high);

  if (state === 'awaiting_entry' && inZone) {
    state = 'active';
    filledAt = filledAt || nowIso;
  }

  if (state === 'active') {
    if (isLong) {
      if (livePrice >= row.tp2) {
        state = 'tp2_hit';
        realizedR = 3.0;
        resolvedAt = nowIso;
      } else if (livePrice >= row.tp1) {
        state = 'tp1_hit';
        realizedR = 2.0;
        resolvedAt = nowIso;
      } else if (livePrice <= row.stop) {
        state = 'stopped';
        realizedR = -1.0;
        resolvedAt = nowIso;
      }
    } else {
      if (livePrice <= row.tp2) {
        state = 'tp2_hit';
        realizedR = 3.0;
        resolvedAt = nowIso;
      } else if (livePrice <= row.tp1) {
        state = 'tp1_hit';
        realizedR = 2.0;
        resolvedAt = nowIso;
      } else if (livePrice >= row.stop) {
        state = 'stopped';
        realizedR = -1.0;
        resolvedAt = nowIso;
      }
    }
  }

  return { signal_state: state, realized_r: realizedR, filled_at: filledAt, resolved_at: resolvedAt };
}

/**
 * Persists newly generated Scalping & Swing setups and updates open setups against live prices.
 * Completely isolated in `mtf_style_setups` — never touches Intraday `edge_setups` / `outcomes`.
 */
export async function recordAndSyncMtfSetups(setups: MtfStyleSetup[]): Promise<void> {
  if (!setups.length) return;
  try {
    await ensureMtfTrackerTable();
    const nowIso = new Date().toISOString();
    const priceByInstrument = new Map<string, number>();

    for (const s of setups) {
      if (s.current_price > 0) {
        priceByInstrument.set(s.instrument, s.current_price);
      }

      const signature = buildSignature(s);
      const existing = await queryDb<TrackedMtfSetupRow>(
        `SELECT * FROM mtf_style_setups WHERE signature = ?`,
        [signature]
      );

      if (existing.length === 0) {
        const initialFilledAt = s.signal_state === 'active' ? nowIso : null;
        await queryDb(
          `INSERT INTO mtf_style_setups (
            id, signature, trading_style, context_tf, entry_tf, instrument, market, bias,
            entry_zone_low, entry_zone_high, entry_zone_mid, stop, tp1, tp2,
            conviction_score, liquidity_score, killzone_origin, signal_state,
            realized_r, last_price, filled_at, resolved_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            s.id,
            signature,
            s.trading_style,
            s.context_tf,
            s.entry_tf,
            s.instrument,
            s.market,
            s.bias,
            s.entry_zone_low,
            s.entry_zone_high,
            s.entry_zone_mid,
            s.stop,
            s.tp1,
            s.tp2,
            s.conviction_score,
            s.liquidity_score,
            s.killzone_origin,
            s.signal_state,
            0,
            s.current_price,
            initialFilledAt,
            null,
            s.created_at || nowIso,
            nowIso
          ]
        );
      } else {
        const row = existing[0];
        const evaluated = evaluatePriceState(row, s.current_price, nowIso);
        await queryDb(
          `UPDATE mtf_style_setups
           SET signal_state = ?, realized_r = ?, last_price = ?, filled_at = ?, resolved_at = ?, updated_at = ?
           WHERE id = ?`,
          [
            evaluated.signal_state,
            evaluated.realized_r,
            s.current_price,
            evaluated.filled_at,
            evaluated.resolved_at,
            nowIso,
            row.id
          ]
        );
      }
    }

    // Also update any older open MTF setups whose instrument appeared in this refresh
    const openRows = await queryDb<TrackedMtfSetupRow>(
      `SELECT * FROM mtf_style_setups WHERE signal_state IN ('awaiting_entry', 'active')`
    );
    for (const row of openRows) {
      const livePrice = priceByInstrument.get(row.instrument);
      if (!livePrice) continue;
      const evaluated = evaluatePriceState(row, livePrice, nowIso);
      if (evaluated.signal_state !== row.signal_state || livePrice !== row.last_price) {
        await queryDb(
          `UPDATE mtf_style_setups
           SET signal_state = ?, realized_r = ?, last_price = ?, filled_at = ?, resolved_at = ?, updated_at = ?
           WHERE id = ?`,
          [
            evaluated.signal_state,
            evaluated.realized_r,
            livePrice,
            evaluated.filled_at,
            evaluated.resolved_at,
            nowIso,
            row.id
          ]
        );
      }
    }
  } catch (err) {
    console.warn('[MTF-TRACKER] Failed to sync MTF setups:', (err as any)?.message);
  }
}

export async function getTradingStyleComparisonReport(): Promise<{
  generatedAt: string;
  styles: StyleComparisonRow[];
  recentMtfSetups: TrackedMtfSetupRow[];
}> {
  await ensureMtfTrackerTable();

  const mtfRows = await queryDb<TrackedMtfSetupRow>(
    `SELECT * FROM mtf_style_setups ORDER BY created_at DESC LIMIT 500`
  );

  const buildMtfStats = (
    style: 'SCALP' | 'SWING',
    label: string,
    timeframes: string
  ): StyleComparisonRow => {
    const rows = mtfRows.filter((r) => r.trading_style === style);
    const awaitingEntry = rows.filter((r) => r.signal_state === 'awaiting_entry').length;
    const activeSetups = rows.filter((r) => r.signal_state === 'active').length;
    const wins = rows.filter((r) => r.signal_state === 'tp1_hit' || r.signal_state === 'tp2_hit').length;
    const losses = rows.filter((r) => r.signal_state === 'stopped').length;
    const breakevens = rows.filter((r) => r.signal_state === 'expired').length;
    const resolvedSetups = wins + losses + breakevens;
    const winRate = wins + losses > 0 ? Number(((wins / (wins + losses)) * 100).toFixed(1)) : 0;
    const totalRealizedR = Number(rows.reduce((sum, r) => sum + (Number(r.realized_r) || 0), 0).toFixed(2));
    const expectancyR = resolvedSetups > 0 ? Number((totalRealizedR / resolvedSetups).toFixed(2)) : 0;
    const avgConviction = rows.length > 0
      ? Number((rows.reduce((sum, r) => sum + (Number(r.conviction_score) || 0), 0) / rows.length).toFixed(1))
      : 0;

    return {
      style,
      label,
      timeframes,
      totalSetups: rows.length,
      awaitingEntry,
      activeSetups,
      resolvedSetups,
      wins,
      losses,
      breakevens,
      winRate,
      totalRealizedR,
      expectancyR,
      avgConviction,
      futuresCount: rows.filter((r) => r.market === 'futures').length,
      forexCount: rows.filter((r) => r.market === 'forex').length
    };
  };

  // Intraday stats from existing edge_setups + forex_edge_setups + outcomes (read-only)
  const [futuresSetups, forexSetups, outcomes] = await Promise.all([
    queryDb<any>(`SELECT id, signal_state, conviction_score FROM edge_setups WHERE superseded = 0`),
    queryDb<any>(`SELECT id, signal_state, conviction_score FROM forex_edge_setups WHERE superseded = 0`),
    queryDb<any>(`SELECT outcome_type, realized_pl FROM outcomes`)
  ]);

  const allIntraday = [...futuresSetups, ...forexSetups];
  const intraWins = outcomes.filter((o: any) => o.outcome_type === 'tp1_hit' || o.outcome_type === 'tp2_hit').length;
  const intraLosses = outcomes.filter((o: any) => o.outcome_type === 'stop_hit').length;
  const intraBe = outcomes.filter((o: any) => o.outcome_type === 'breakeven_hit').length;
  const intraResolved = intraWins + intraLosses + intraBe;
  const intraWinRate = intraWins + intraLosses > 0 ? Number(((intraWins / (intraWins + intraLosses)) * 100).toFixed(1)) : 0;
  const intraTotalR = Number(outcomes.reduce((sum: number, o: any) => sum + (Number(o.realized_pl ?? 0) || 0), 0).toFixed(2));
  const intraExpectancy = intraResolved > 0 ? Number((intraTotalR / intraResolved).toFixed(2)) : 0;
  const intraAvgConv = allIntraday.length > 0
    ? Number((allIntraday.reduce((sum: number, s: any) => sum + (Number(s.conviction_score) || 0), 0) / allIntraday.length).toFixed(1))
    : 0;

  const intradayRow: StyleComparisonRow = {
    style: 'INTRADAY',
    label: 'Intraday (Core Engine)',
    timeframes: '1H · 15M',
    totalSetups: allIntraday.length,
    awaitingEntry: allIntraday.filter((s: any) => s.signal_state === 'awaiting_entry').length,
    activeSetups: allIntraday.filter((s: any) => s.signal_state === 'active').length,
    resolvedSetups: intraResolved,
    wins: intraWins,
    losses: intraLosses,
    breakevens: intraBe,
    winRate: intraWinRate,
    totalRealizedR: intraTotalR,
    expectancyR: intraExpectancy,
    avgConviction: intraAvgConv,
    futuresCount: futuresSetups.length,
    forexCount: forexSetups.length
  };

  return {
    generatedAt: new Date().toISOString(),
    styles: [
      buildMtfStats('SCALP', 'Scalping Desk', '15M · 5M'),
      intradayRow,
      buildMtfStats('SWING', 'Swing Desk', 'D1 · 4H / 4H · 1H')
    ],
    recentMtfSetups: mtfRows.slice(0, 40)
  };
}
