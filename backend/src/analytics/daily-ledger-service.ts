import { queryDb } from '../db/database';
import { getETTradingDayAndSession, isWeekendTrade } from '../scheduler/killzone-mapper';
import { isMockSetup } from '../publish-gate/revalidation';
import { computeBlendedRealizedR } from './r-accounting';

export type LedgerMarketFilter = 'all' | 'futures' | 'forex';
export type LedgerStyleFilter = 'all' | 'intraday' | 'scalp' | 'swing';
export type LedgerStatusCategory =
  | 'won'
  | 'lost'
  | 'breakeven'
  | 'superseded'
  | 'invalidated'
  | 'live'
  | 'pending';

export interface DailyLedgerTrade {
  id: string;
  tradeId: string;
  sourceTable: 'edge_setups' | 'forex_edge_setups' | 'mtf_style_setups';
  instrument: string;
  market: 'futures' | 'forex';
  tradingStyle: 'INTRADAY' | 'SCALP' | 'SWING';
  strategyId: string;
  strategyName: string;
  bias: 'long' | 'short';
  killzoneOrigin: string;
  tradingDay: string;
  createdAt: string;
  filledAt: string | null;
  resolvedAt: string | null;
  entryZoneLow: number;
  entryZoneHigh: number;
  entryZoneMid: number;
  entryPrice: number | null;
  stop: number;
  tp1: number;
  tp2: number | null;
  rMultiple1: number;
  rMultiple2: number;
  signalState: string;
  statusCategory: LedgerStatusCategory;
  outcomeType: string | null;
  outcomeLabel: string;
  realizedR: number | null;
  superseded: boolean;
  supersededBy: string | null;
  supersededByTradeId: string | null;
  supersededByInstrument: string | null;
  invalidationReason: string | null;
  invalidationDetail: string | null;
  convictionScore: number | null;
  zoneTimeframe: string | null;
  nested5mUpgrade: boolean;
  wasRunner: boolean;
  executionPrice: number | null;
  durationMin: number | null;
  notes: string | null;
}

export interface DailyLedgerStyleBreakdown {
  total: number;
  resolved: number;
  wins: number;
  losses: number;
  breakevens: number;
  superseded: number;
  realizedR: number;
}

export interface DailyLedgerSummary {
  tradingDay: string;
  totalPublished: number;
  resolvedTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  supersededCount: number;
  invalidatedCount: number;
  liveCount: number;
  pendingCount: number;
  winRate: number;
  totalRealizedR: number;
  avgRealizedR: number;
  profitFactor: number | null;
  supersededBreakdown: Record<string, number>;
  invalidationBreakdown: Record<string, number>;
  byStyle: Record<'INTRADAY' | 'SCALP' | 'SWING', DailyLedgerStyleBreakdown>;
}

export interface RecordWallPublication {
  tradingDay: string;
  status: 'published' | 'unpublished' | 'not_published';
  title: string | null;
  adminNotes: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
}

export interface RecordWallGlobalConfig {
  enabled: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface DailyLedgerResponse {
  tradingDay: string;
  filters: {
    market: LedgerMarketFilter;
    style: LedgerStyleFilter;
    status: string;
  };
  summary: DailyLedgerSummary;
  trades: DailyLedgerTrade[];
  publication: RecordWallPublication;
  wallConfig: RecordWallGlobalConfig;
}

export interface DailyLedgerDayIndexItem {
  tradingDay: string;
  totalPublished: number;
  resolvedTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  supersededCount: number;
  invalidatedCount: number;
  liveCount: number;
  pendingCount: number;
  winRate: number;
  totalRealizedR: number;
  publicationStatus: 'published' | 'unpublished' | 'not_published';
  publishedAt: string | null;
  title: string | null;
}

let tablesEnsured = false;

export async function ensureDailyRecordWallTable(): Promise<void> {
  if (tablesEnsured) return;

  await queryDb(`
    CREATE TABLE IF NOT EXISTS daily_record_wall_publications (
      trading_day TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'published',
      title TEXT,
      admin_notes TEXT,
      summary_json TEXT NOT NULL,
      snapshot_csv TEXT,
      published_by TEXT,
      published_at TEXT,
      updated_at TEXT NOT NULL
    )
  `);

  await queryDb(`
    CREATE TABLE IF NOT EXISTS daily_record_wall_config (
      id TEXT PRIMARY KEY DEFAULT 'global',
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT,
      updated_at TEXT NOT NULL
    )
  `);

  await queryDb(
    `INSERT INTO daily_record_wall_config (id, enabled, updated_at)
     VALUES ('global', 1, ?)
     ON CONFLICT (id) DO NOTHING`,
    [new Date().toISOString()]
  );

  tablesEnsured = true;
}

/** Reset internal ensured flag (used by tests after pointing to a temp DB) */
export function resetDailyRecordWallCache(): void {
  tablesEnsured = false;
}

export function formatLedgerTradeId(id: string | undefined | null, instrument: string | undefined | null): string {
  if (!id) return '#SND-0001';
  const sym = String(instrument || '').replace(/\//g, '').toUpperCase();
  const rawId = String(id).replace(/^test_/, '');
  if (rawId.startsWith('ef_')) {
    const parts = rawId.split('_');
    const hash = (parts[parts.length - 1] || '0000').toUpperCase();
    return `#EF-${sym}-${hash}`;
  }
  const parts = rawId.split('-');
  const suffix = parts.length > 1
    ? parts[0].substring(0, 4).toUpperCase()
    : rawId.substring(Math.max(0, rawId.length - 4)).toUpperCase();
  return `#${sym}-${suffix}`;
}

function parseMetadata(raw: any): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

function safeNum(v: any, fallback: number | null = null): number | null {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function formatStrategyName(strategyId: string, meta: Record<string, any>): string {
  if (meta?.strategy_name && typeof meta.strategy_name === 'string') {
    return meta.strategy_name;
  }
  switch (strategyId) {
    case 'manna_snd':
      return 'Manna SnD';
    case 'sentinel_v2':
      return 'Manna Elite';
    case 'manna_snd_scalp':
      return 'Manna SnD Scalp';
    case 'manna_snd_swing':
    case 'manna_snd_swing_short':
    case 'manna_snd_swing_medium':
      return 'Manna SnD Swing';
    default:
      return strategyId ? strategyId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Manna SnD';
  }
}

function deriveTradingStyle(
  sourceTable: DailyLedgerTrade['sourceTable'],
  row: any,
  meta: Record<string, any>
): 'INTRADAY' | 'SCALP' | 'SWING' {
  const rawStyle = String(row.trading_style || meta.trading_style || '').toUpperCase();
  if (rawStyle === 'SCALP') return 'SCALP';
  if (rawStyle === 'SWING') return 'SWING';
  if (sourceTable === 'mtf_style_setups') {
    return String(row.context_tf || '').toLowerCase() === '15m' ? 'SCALP' : 'SWING';
  }
  return 'INTRADAY';
}

function formatOutcomeLabel(params: {
  statusCategory: LedgerStatusCategory;
  outcomeType: string | null;
  realizedR: number | null;
  invalidationReason: string | null;
  supersededByTradeId: string | null;
  wasRunner: boolean;
  signalState: string;
}): string {
  const {
    statusCategory,
    outcomeType,
    realizedR,
    invalidationReason,
    supersededByTradeId,
    wasRunner,
    signalState,
  } = params;

  const rStr = realizedR !== null ? `${realizedR >= 0 ? '+' : ''}${realizedR.toFixed(2)}R` : null;

  if (statusCategory === 'superseded') {
    return supersededByTradeId ? `Superseded -> ${supersededByTradeId}` : 'Superseded';
  }
  if (statusCategory === 'won') {
    const ot = String(outcomeType || '').toLowerCase();
    if (ot.includes('tp2')) return `TP2 Hit (${rStr || '+2.20R'})`;
    if (ot.includes('tp1')) return `TP1 Hit (${rStr || '+1.60R'})`;
    if (wasRunner && ot.includes('be')) return `Runner @ BE (${rStr || '+1.60R'})`;
    return rStr ? `Won (${rStr})` : 'Won';
  }
  if (statusCategory === 'lost') {
    return rStr ? `SL Hit (${rStr})` : 'SL Hit (-1.00R)';
  }
  if (statusCategory === 'breakeven') {
    return `Break-Even (${rStr || '0.00R'})`;
  }
  if (statusCategory === 'invalidated') {
    const reason = String(invalidationReason || '').toLowerCase();
    if (reason === 'target_reached_pre_entry') return 'Invalidated (Pre-Entry TP1)';
    if (reason === 'stop_violated_pre_entry') return 'Invalidated (Pre-Entry SL)';
    if (reason === 'weekend_market_closed') return 'Invalidated (Weekend Close)';
    if (reason === 'expired_session' || reason === 'stale_setup') return 'Expired';
    return reason ? `Invalidated (${reason.replace(/_/g, ' ')})` : 'Invalidated';
  }
  if (statusCategory === 'live') {
    return signalState === 'runner' ? 'Runner Active (BE Protected)' : 'Live In Trade';
  }
  return 'Awaiting Entry';
}

function classifyTradeStatus(params: {
  row: any;
  outcomeRow: any | undefined;
  supersededByTradeId: string | null;
}): {
  statusCategory: LedgerStatusCategory;
  outcomeType: string | null;
  outcomeLabel: string;
  realizedR: number | null;
  superseded: boolean;
  wasRunner: boolean;
  executionPrice: number | null;
  durationMin: number | null;
  notes: string | null;
} {
  const { row, outcomeRow, supersededByTradeId } = params;
  const state = String(row.signal_state || '').toLowerCase();
  const invReason = row.invalidation_reason ? String(row.invalidation_reason) : null;
  const invReasonLower = invReason ? invReason.toLowerCase() : '';
  const isSupersededFlag =
    Number(row.superseded) === 1 ||
    state === 'superseded' ||
    invReasonLower === 'superseded';

  const rawOutcomeType: string | null = outcomeRow?.outcome_type || row.outcome_type || null;
  const outcomeTypeLower = rawOutcomeType ? String(rawOutcomeType).toLowerCase() : '';
  const wasRunner = Boolean(outcomeRow?.was_runner) || state === 'runner';
  const r1 = safeNum(row.r_multiple_1, 2.0) ?? 2.0;
  const r2 = safeNum(row.r_multiple_2, 3.0) ?? 3.0;
  const fallbackR = outcomeRow?.realized_pl ?? row.realized_r;
  const executionPrice = safeNum(outcomeRow?.execution_price ?? row.execution_price, null);
  const durationMin = safeNum(outcomeRow?.duration_min, null);
  const notes = outcomeRow?.notes ? String(outcomeRow.notes) : (row.invalidation_detail ? String(row.invalidation_detail) : null);

  if (isSupersededFlag) {
    return {
      statusCategory: 'superseded',
      outcomeType: 'superseded',
      outcomeLabel: formatOutcomeLabel({
        statusCategory: 'superseded',
        outcomeType: 'superseded',
        realizedR: null,
        invalidationReason: invReason,
        supersededByTradeId,
        wasRunner,
        signalState: state,
      }),
      realizedR: null,
      superseded: true,
      wasRunner: false,
      executionPrice,
      durationMin,
      notes,
    };
  }

  const hasResolvedOutcome = Boolean(rawOutcomeType) || state === 'resolved';
  if (hasResolvedOutcome) {
    const computedR = computeBlendedRealizedR({
      outcomeType: rawOutcomeType,
      invalidationReason: invReason,
      rMultiple1: r1,
      rMultiple2: r2,
      wasRunner,
      fallbackR: safeNum(fallbackR, 0) ?? 0,
    });
    const realizedR = Number(computedR.toFixed(2));

    let statusCategory: LedgerStatusCategory = 'breakeven';
    if (outcomeTypeLower.includes('tp')) {
      statusCategory = 'won';
    } else if (outcomeTypeLower.includes('sl') || outcomeTypeLower.includes('stop')) {
      statusCategory = 'lost';
    } else if (outcomeTypeLower.includes('be') || outcomeTypeLower.includes('breakeven')) {
      statusCategory = wasRunner || realizedR > 0 ? 'won' : 'breakeven';
    } else if (realizedR > 0) {
      statusCategory = 'won';
    } else if (realizedR < 0) {
      statusCategory = 'lost';
    }

    return {
      statusCategory,
      outcomeType: rawOutcomeType || state,
      outcomeLabel: formatOutcomeLabel({
        statusCategory,
        outcomeType: rawOutcomeType,
        realizedR,
        invalidationReason: invReason,
        supersededByTradeId: null,
        wasRunner,
        signalState: state,
      }),
      realizedR,
      superseded: false,
      wasRunner,
      executionPrice,
      durationMin,
      notes,
    };
  }

  if (state === 'invalidated') {
    return {
      statusCategory: 'invalidated',
      outcomeType: invReason || 'invalidated',
      outcomeLabel: formatOutcomeLabel({
        statusCategory: 'invalidated',
        outcomeType: invReason,
        realizedR: null,
        invalidationReason: invReason,
        supersededByTradeId: null,
        wasRunner: false,
        signalState: state,
      }),
      realizedR: null,
      superseded: false,
      wasRunner: false,
      executionPrice,
      durationMin,
      notes,
    };
  }

  if (state === 'active' || state === 'runner') {
    return {
      statusCategory: 'live',
      outcomeType: state,
      outcomeLabel: formatOutcomeLabel({
        statusCategory: 'live',
        outcomeType: state,
        realizedR: null,
        invalidationReason: null,
        supersededByTradeId: null,
        wasRunner: state === 'runner',
        signalState: state,
      }),
      realizedR: null,
      superseded: false,
      wasRunner: state === 'runner',
      executionPrice,
      durationMin,
      notes,
    };
  }

  return {
    statusCategory: 'pending',
    outcomeType: state || 'awaiting_entry',
    outcomeLabel: formatOutcomeLabel({
      statusCategory: 'pending',
      outcomeType: state,
      realizedR: null,
      invalidationReason: null,
      supersededByTradeId: null,
      wasRunner: false,
      signalState: state,
    }),
    realizedR: null,
    superseded: false,
    wasRunner: false,
    executionPrice,
    durationMin,
    notes,
  };
}

async function queryOptionalTable(sql: string, params: any[] = []): Promise<any[]> {
  try {
    return await queryDb<any>(sql, params);
  } catch {
    return [];
  }
}

async function loadAllNormalizedTrades(): Promise<DailyLedgerTrade[]> {
  const [futuresRows, forexRows, mtfRows, outcomeRows] = await Promise.all([
    queryOptionalTable(`SELECT * FROM edge_setups ORDER BY created_at DESC`),
    queryOptionalTable(`SELECT * FROM forex_edge_setups ORDER BY created_at DESC`),
    queryOptionalTable(`SELECT * FROM mtf_style_setups ORDER BY created_at DESC`),
    queryOptionalTable(
      `SELECT * FROM outcomes ORDER BY COALESCE(execution_time, created_at) ASC`
    ),
  ]);

  const outcomeBySetupId = new Map<string, any>();
  for (const o of outcomeRows) {
    if (o?.setup_id) {
      outcomeBySetupId.set(String(o.setup_id), o);
    }
  }

  const rawCombined: Array<{ sourceTable: DailyLedgerTrade['sourceTable']; row: any; defaultMarket: 'futures' | 'forex' }> = [
    ...futuresRows.map((row) => ({ sourceTable: 'edge_setups' as const, row, defaultMarket: 'futures' as const })),
    ...forexRows.map((row) => ({ sourceTable: 'forex_edge_setups' as const, row, defaultMarket: 'forex' as const })),
    ...mtfRows.map((row) => ({ sourceTable: 'mtf_style_setups' as const, row, defaultMarket: (String(row.instrument || '').includes('/') ? 'forex' : 'futures') as 'futures' | 'forex' })),
  ];

  // Index all rows by id first so superseded_by resolves to human-readable Trade IDs
  const byId = new Map<string, { id: string; tradeId: string; instrument: string }>();
  for (const { row } of rawCombined) {
    if (!row?.id) continue;
    byId.set(String(row.id), {
      id: String(row.id),
      tradeId: formatLedgerTradeId(row.id, row.instrument),
      instrument: String(row.instrument || ''),
    });
  }

  const trades: DailyLedgerTrade[] = [];

  for (const { sourceTable, row, defaultMarket } of rawCombined) {
    if (!row?.id || !row?.instrument) continue;
    if (isMockSetup(row)) continue;
    if (isWeekendTrade(row)) continue;

    const createdAt = String(row.created_at || row.killzone_origin_at || '');
    const tdInfo = getETTradingDayAndSession(createdAt);
    const tradingDay = tdInfo?.tradingDay || createdAt.slice(0, 10);
    if (!tradingDay || !/^\d{4}-\d{2}-\d{2}$/.test(tradingDay)) continue;

    const meta = parseMetadata(row.metadata);
    const market: 'futures' | 'forex' =
      String(row.market || defaultMarket).toLowerCase() === 'forex' ? 'forex' : 'futures';
    const strategyId = String(row.strategy_id || 'manna_snd');
    const tradingStyle = deriveTradingStyle(sourceTable, row, meta);

    const supersededById = row.superseded_by ? String(row.superseded_by) : null;
    const supersededTarget = supersededById ? byId.get(supersededById) : undefined;

    const outcomeRow = outcomeBySetupId.get(String(row.id));
    const classified = classifyTradeStatus({
      row,
      outcomeRow,
      supersededByTradeId: supersededTarget?.tradeId || null,
    });

    const resolvedAtRaw = outcomeRow?.execution_time || row.resolved_at || null;
    const filledAtRaw = row.entry_triggered_at || row.filled_at || null;
    const entryPrice = safeNum(row.entry_price_executed ?? row.entry_price_recorded, null);
    const zoneTf = meta.zone_timeframe || meta.ltf || row.entry_tf || null;

    trades.push({
      id: String(row.id),
      tradeId: formatLedgerTradeId(row.id, row.instrument),
      sourceTable,
      instrument: String(row.instrument),
      market,
      tradingStyle,
      strategyId,
      strategyName: formatStrategyName(strategyId, meta),
      bias: String(row.bias || 'long').toLowerCase() === 'short' ? 'short' : 'long',
      killzoneOrigin: String(row.killzone_origin || ''),
      tradingDay,
      createdAt,
      filledAt: filledAtRaw ? String(filledAtRaw) : null,
      resolvedAt: resolvedAtRaw ? String(resolvedAtRaw) : null,
      entryZoneLow: Number(row.entry_zone_low ?? 0),
      entryZoneHigh: Number(row.entry_zone_high ?? 0),
      entryZoneMid: Number(row.entry_zone_mid ?? 0),
      entryPrice,
      stop: Number(row.stop ?? 0),
      tp1: Number(row.tp1 ?? 0),
      tp2: safeNum(row.tp2, null),
      rMultiple1: safeNum(row.r_multiple_1, 2.0) ?? 2.0,
      rMultiple2: safeNum(row.r_multiple_2, 3.0) ?? 3.0,
      signalState: String(row.signal_state || ''),
      statusCategory: classified.statusCategory,
      outcomeType: classified.outcomeType,
      outcomeLabel: classified.outcomeLabel,
      realizedR: classified.realizedR,
      superseded: classified.superseded,
      supersededBy: supersededById,
      supersededByTradeId: supersededTarget?.tradeId || null,
      supersededByInstrument: supersededTarget?.instrument || null,
      invalidationReason: row.invalidation_reason ? String(row.invalidation_reason) : null,
      invalidationDetail: row.invalidation_detail ? String(row.invalidation_detail) : null,
      convictionScore: safeNum(row.conviction_score, null),
      zoneTimeframe: zoneTf ? String(zoneTf).toUpperCase() : null,
      nested5mUpgrade: Boolean(meta.nested_5m_upgrade),
      wasRunner: classified.wasRunner,
      executionPrice: classified.executionPrice,
      durationMin: classified.durationMin,
      notes: classified.notes,
    });
  }

  trades.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return trades;
}

export function summarizeLedgerTrades(tradingDay: string, trades: DailyLedgerTrade[]): DailyLedgerSummary {
  let wins = 0;
  let losses = 0;
  let breakevens = 0;
  let supersededCount = 0;
  let invalidatedCount = 0;
  let liveCount = 0;
  let pendingCount = 0;
  let totalRealizedR = 0;
  let grossWinR = 0;
  let grossLossR = 0;

  const supersededBreakdown: Record<string, number> = {};
  const invalidationBreakdown: Record<string, number> = {};
  const byStyle: Record<'INTRADAY' | 'SCALP' | 'SWING', DailyLedgerStyleBreakdown> = {
    INTRADAY: { total: 0, resolved: 0, wins: 0, losses: 0, breakevens: 0, superseded: 0, realizedR: 0 },
    SCALP: { total: 0, resolved: 0, wins: 0, losses: 0, breakevens: 0, superseded: 0, realizedR: 0 },
    SWING: { total: 0, resolved: 0, wins: 0, losses: 0, breakevens: 0, superseded: 0, realizedR: 0 },
  };

  for (const t of trades) {
    const sb = byStyle[t.tradingStyle];
    sb.total++;

    if (t.statusCategory === 'won') {
      wins++;
      sb.resolved++;
      sb.wins++;
      const r = t.realizedR ?? 0;
      totalRealizedR += r;
      sb.realizedR += r;
      if (r > 0) grossWinR += r;
    } else if (t.statusCategory === 'lost') {
      losses++;
      sb.resolved++;
      sb.losses++;
      const r = t.realizedR ?? -1;
      totalRealizedR += r;
      sb.realizedR += r;
      if (r < 0) grossLossR += Math.abs(r);
    } else if (t.statusCategory === 'breakeven') {
      breakevens++;
      sb.resolved++;
      sb.breakevens++;
      const r = t.realizedR ?? 0;
      totalRealizedR += r;
      sb.realizedR += r;
    } else if (t.statusCategory === 'superseded') {
      supersededCount++;
      sb.superseded++;
      const key = t.supersededBy ? 'replaced_by_newer_zone' : (t.invalidationDetail || 'superseded');
      supersededBreakdown[key] = (supersededBreakdown[key] || 0) + 1;
    } else if (t.statusCategory === 'invalidated') {
      invalidatedCount++;
      const key = t.invalidationReason || 'invalidated';
      invalidationBreakdown[key] = (invalidationBreakdown[key] || 0) + 1;
    } else if (t.statusCategory === 'live') {
      liveCount++;
    } else {
      pendingCount++;
    }
  }

  for (const k of ['INTRADAY', 'SCALP', 'SWING'] as const) {
    byStyle[k].realizedR = Number(byStyle[k].realizedR.toFixed(2));
  }

  const resolvedTrades = wins + losses + breakevens;
  const decidedTrades = wins + losses;
  const winRate = decidedTrades > 0 ? Number(((wins / decidedTrades) * 100).toFixed(1)) : 0;
  const roundedTotalR = Number(totalRealizedR.toFixed(2));
  const avgRealizedR = resolvedTrades > 0 ? Number((roundedTotalR / resolvedTrades).toFixed(2)) : 0;
  const profitFactor =
    grossLossR > 0 ? Number((grossWinR / grossLossR).toFixed(2)) : grossWinR > 0 ? null : 0;

  return {
    tradingDay,
    totalPublished: trades.length,
    resolvedTrades,
    wins,
    losses,
    breakevens,
    supersededCount,
    invalidatedCount,
    liveCount,
    pendingCount,
    winRate,
    totalRealizedR: roundedTotalR,
    avgRealizedR,
    profitFactor,
    supersededBreakdown,
    invalidationBreakdown,
    byStyle,
  };
}

function applyLedgerFilters(
  trades: DailyLedgerTrade[],
  filters?: { market?: LedgerMarketFilter; style?: LedgerStyleFilter; status?: string; search?: string }
): DailyLedgerTrade[] {
  const market = filters?.market || 'all';
  const style = filters?.style || 'all';
  const status = (filters?.status || 'all').toLowerCase();
  const q = (filters?.search || '').trim().toLowerCase();

  return trades.filter((t) => {
    if (market !== 'all' && t.market !== market) return false;
    if (style !== 'all' && t.tradingStyle.toLowerCase() !== style) return false;
    if (status !== 'all' && t.statusCategory !== status) return false;
    if (q) {
      const hay = `${t.instrument} ${t.tradeId} ${t.strategyName} ${t.outcomeLabel} ${t.supersededByTradeId || ''} ${t.invalidationReason || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export async function getRecordWallGlobalConfig(): Promise<RecordWallGlobalConfig> {
  await ensureDailyRecordWallTable();
  const rows = await queryDb<any>(`SELECT * FROM daily_record_wall_config WHERE id = 'global'`);
  if (!rows.length) {
    return { enabled: true, updatedBy: null, updatedAt: null };
  }
  const r = rows[0];
  return {
    enabled: Number(r.enabled) !== 0,
    updatedBy: r.updated_by ? String(r.updated_by) : null,
    updatedAt: r.updated_at ? String(r.updated_at) : null,
  };
}

export async function setRecordWallGlobalConfig(
  enabled: boolean,
  adminEmail: string
): Promise<RecordWallGlobalConfig> {
  await ensureDailyRecordWallTable();
  const nowIso = new Date().toISOString();
  await queryDb(
    `INSERT INTO daily_record_wall_config (id, enabled, updated_by, updated_at)
     VALUES ('global', ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    [enabled ? 1 : 0, adminEmail, nowIso]
  );
  return { enabled, updatedBy: adminEmail, updatedAt: nowIso };
}

async function getPublicationsMap(): Promise<Map<string, RecordWallPublication>> {
  await ensureDailyRecordWallTable();
  const rows = await queryOptionalTable(
    `SELECT trading_day, status, title, admin_notes, published_by, published_at, updated_at FROM daily_record_wall_publications`
  );
  const map = new Map<string, RecordWallPublication>();
  for (const r of rows) {
    map.set(String(r.trading_day), {
      tradingDay: String(r.trading_day),
      status: r.status === 'published' ? 'published' : 'unpublished',
      title: r.title ? String(r.title) : null,
      adminNotes: r.admin_notes ? String(r.admin_notes) : null,
      publishedBy: r.published_by ? String(r.published_by) : null,
      publishedAt: r.published_at ? String(r.published_at) : null,
      updatedAt: r.updated_at ? String(r.updated_at) : null,
    });
  }
  return map;
}

export async function getDailyLedgerDays(limit: number = 90): Promise<{
  days: DailyLedgerDayIndexItem[];
  wallConfig: RecordWallGlobalConfig;
}> {
  const [allTrades, pubs, wallConfig] = await Promise.all([
    loadAllNormalizedTrades(),
    getPublicationsMap(),
    getRecordWallGlobalConfig(),
  ]);

  const byDay = new Map<string, DailyLedgerTrade[]>();
  for (const t of allTrades) {
    const bucket = byDay.get(t.tradingDay);
    if (bucket) bucket.push(t);
    else byDay.set(t.tradingDay, [t]);
  }

  // Ensure published days with 0 trades (if manually archived) still stay visible
  for (const day of pubs.keys()) {
    if (!byDay.has(day)) byDay.set(day, []);
  }

  const days: DailyLedgerDayIndexItem[] = Array.from(byDay.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, Math.max(1, limit))
    .map(([tradingDay, trades]) => {
      const summary = summarizeLedgerTrades(tradingDay, trades);
      const pub = pubs.get(tradingDay);
      return {
        tradingDay,
        totalPublished: summary.totalPublished,
        resolvedTrades: summary.resolvedTrades,
        wins: summary.wins,
        losses: summary.losses,
        breakevens: summary.breakevens,
        supersededCount: summary.supersededCount,
        invalidatedCount: summary.invalidatedCount,
        liveCount: summary.liveCount,
        pendingCount: summary.pendingCount,
        winRate: summary.winRate,
        totalRealizedR: summary.totalRealizedR,
        publicationStatus: pub ? pub.status : 'not_published',
        publishedAt: pub?.publishedAt || null,
        title: pub?.title || null,
      };
    });

  return { days, wallConfig };
}

export async function getDailyTradeLedger(params: {
  day?: string;
  market?: LedgerMarketFilter;
  style?: LedgerStyleFilter;
  status?: string;
  search?: string;
}): Promise<DailyLedgerResponse> {
  const market: LedgerMarketFilter = params.market || 'all';
  const style: LedgerStyleFilter = params.style || 'all';
  const status = params.status || 'all';

  const [allTrades, pubs, wallConfig] = await Promise.all([
    loadAllNormalizedTrades(),
    getPublicationsMap(),
    getRecordWallGlobalConfig(),
  ]);

  let targetDay = params.day;
  if (!targetDay) {
    targetDay = allTrades[0]?.tradingDay || getETTradingDayAndSession(new Date())?.tradingDay || new Date().toISOString().slice(0, 10);
  }

  const dayTrades = allTrades.filter((t) => t.tradingDay === targetDay);
  const filteredTrades = applyLedgerFilters(dayTrades, {
    market,
    style,
    status,
    search: params.search,
  });

  const summary = summarizeLedgerTrades(targetDay, filteredTrades);
  const publication: RecordWallPublication = pubs.get(targetDay) || {
    tradingDay: targetDay,
    status: 'not_published',
    title: null,
    adminNotes: null,
    publishedBy: null,
    publishedAt: null,
    updatedAt: null,
  };

  return {
    tradingDay: targetDay,
    filters: { market, style, status },
    summary,
    trades: filteredTrades,
    publication,
    wallConfig,
  };
}

function escapeCsvCell(value: any, guardFormula: boolean = true): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  const sanitized = guardFormula && /^[=+@\t\r]/.test(str) ? `'${str}` : str;
  if (/[",\n\r]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

export function formatDailyLedgerCsv(ledger: DailyLedgerResponse): string {
  const headers = [
    'TradingDay_ET',
    'TradeID',
    'SetupID',
    'Instrument',
    'Market',
    'Style',
    'Strategy',
    'ZoneTF',
    'Nested5mUpgrade',
    'Bias',
    'Session',
    'StatusCategory',
    'Outcome',
    'RealizedR',
    'Superseded',
    'SupersededByTradeID',
    'SupersededBySetupID',
    'InvalidationReason',
    'EntryZoneLow',
    'EntryZoneHigh',
    'EntryZoneMid',
    'ExecutedEntry',
    'StopLoss',
    'TP1',
    'TP2',
    'R_TP1',
    'R_TP2',
    'ConvictionScore',
    'CreatedAt_UTC',
    'FilledAt_UTC',
    'ResolvedAt_UTC',
    'Notes',
  ];

  const rows = ledger.trades.map((t) => [
    escapeCsvCell(t.tradingDay),
    escapeCsvCell(t.tradeId),
    escapeCsvCell(t.id),
    escapeCsvCell(t.instrument),
    escapeCsvCell(t.market),
    escapeCsvCell(t.tradingStyle),
    escapeCsvCell(t.strategyName),
    escapeCsvCell(t.zoneTimeframe || ''),
    escapeCsvCell(t.nested5mUpgrade ? 'YES' : 'NO'),
    escapeCsvCell(t.bias.toUpperCase()),
    escapeCsvCell(t.killzoneOrigin),
    escapeCsvCell(t.statusCategory.toUpperCase()),
    escapeCsvCell(t.outcomeLabel),
    escapeCsvCell(t.realizedR !== null ? t.realizedR.toFixed(2) : '', false),
    escapeCsvCell(t.superseded ? 'YES' : 'NO'),
    escapeCsvCell(t.supersededByTradeId || ''),
    escapeCsvCell(t.supersededBy || ''),
    escapeCsvCell(t.invalidationReason || ''),
    escapeCsvCell(t.entryZoneLow, false),
    escapeCsvCell(t.entryZoneHigh, false),
    escapeCsvCell(t.entryZoneMid, false),
    escapeCsvCell(t.entryPrice ?? '', false),
    escapeCsvCell(t.stop, false),
    escapeCsvCell(t.tp1, false),
    escapeCsvCell(t.tp2 ?? '', false),
    escapeCsvCell(t.rMultiple1, false),
    escapeCsvCell(t.rMultiple2, false),
    escapeCsvCell(t.convictionScore ?? '', false),
    escapeCsvCell(t.createdAt),
    escapeCsvCell(t.filledAt || ''),
    escapeCsvCell(t.resolvedAt || ''),
    escapeCsvCell(t.notes || ''),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export async function publishDayToRecordWall(params: {
  day: string;
  adminEmail: string;
  title?: string;
  adminNotes?: string;
}): Promise<{ publication: RecordWallPublication; summary: DailyLedgerSummary }> {
  await ensureDailyRecordWallTable();
  const ledger = await getDailyTradeLedger({ day: params.day });
  const csv = formatDailyLedgerCsv(ledger);
  const nowIso = new Date().toISOString();
  const title = params.title?.trim() || `Verified Daily Record — ${params.day}`;
  const adminNotes = params.adminNotes?.trim() || null;

  await queryDb(
    `INSERT INTO daily_record_wall_publications
      (trading_day, status, title, admin_notes, summary_json, snapshot_csv, published_by, published_at, updated_at)
     VALUES (?, 'published', ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (trading_day) DO UPDATE SET
      status = 'published',
      title = excluded.title,
      admin_notes = excluded.admin_notes,
      summary_json = excluded.summary_json,
      snapshot_csv = excluded.snapshot_csv,
      published_by = excluded.published_by,
      published_at = excluded.published_at,
      updated_at = excluded.updated_at`,
    [
      params.day,
      title,
      adminNotes,
      JSON.stringify(ledger.summary),
      csv,
      params.adminEmail,
      nowIso,
      nowIso,
    ]
  );

  return {
    publication: {
      tradingDay: params.day,
      status: 'published',
      title,
      adminNotes,
      publishedBy: params.adminEmail,
      publishedAt: nowIso,
      updatedAt: nowIso,
    },
    summary: ledger.summary,
  };
}

export async function unpublishDayFromRecordWall(
  day: string,
  adminEmail: string
): Promise<RecordWallPublication> {
  await ensureDailyRecordWallTable();
  const nowIso = new Date().toISOString();
  await queryDb(
    `UPDATE daily_record_wall_publications
     SET status = 'unpublished', updated_at = ?
     WHERE trading_day = ?`,
    [nowIso, day]
  );

  return {
    tradingDay: day,
    status: 'unpublished',
    title: null,
    adminNotes: null,
    publishedBy: adminEmail,
    publishedAt: null,
    updatedAt: nowIso,
  };
}

export async function getPublicRecordWall(filters?: {
  day?: string;
  market?: LedgerMarketFilter;
  style?: LedgerStyleFilter;
  status?: string;
}) {
  await ensureDailyRecordWallTable();
  const [wallConfig, pubs, allTrades] = await Promise.all([
    getRecordWallGlobalConfig(),
    getPublicationsMap(),
    loadAllNormalizedTrades(),
  ]);

  const publishedEntries = Array.from(pubs.values())
    .filter((p) => p.status === 'published')
    .sort((a, b) => b.tradingDay.localeCompare(a.tradingDay));

  if (!wallConfig.enabled || publishedEntries.length === 0) {
    return {
      enabled: wallConfig.enabled,
      publishedDayCount: publishedEntries.length,
      days: [],
      overallStats: {
        daysPublished: publishedEntries.length,
        totalPublished: 0,
        resolvedTrades: 0,
        wins: 0,
        losses: 0,
        breakevens: 0,
        supersededCount: 0,
        invalidatedCount: 0,
        winRate: 0,
        totalRealizedR: 0,
      },
      selectedDay: null,
      ledger: null as DailyLedgerResponse | null,
    };
  }

  const tradesByDay = new Map<string, DailyLedgerTrade[]>();
  for (const t of allTrades) {
    const list = tradesByDay.get(t.tradingDay);
    if (list) list.push(t);
    else tradesByDay.set(t.tradingDay, [t]);
  }

  let overallPublished = 0;
  let overallResolved = 0;
  let overallWins = 0;
  let overallLosses = 0;
  let overallBreakevens = 0;
  let overallSuperseded = 0;
  let overallInvalidated = 0;
  let overallRealizedR = 0;

  const days = publishedEntries.map((pub) => {
    const rawTrades = tradesByDay.get(pub.tradingDay) || [];
    const filteredForStats = applyLedgerFilters(rawTrades, {
      market: filters?.market || 'all',
      style: filters?.style || 'all',
    });
    const summary = summarizeLedgerTrades(pub.tradingDay, filteredForStats);
    overallPublished += summary.totalPublished;
    overallResolved += summary.resolvedTrades;
    overallWins += summary.wins;
    overallLosses += summary.losses;
    overallBreakevens += summary.breakevens;
    overallSuperseded += summary.supersededCount;
    overallInvalidated += summary.invalidatedCount;
    overallRealizedR += summary.totalRealizedR;

    return {
      ...pub,
      summary,
    };
  });

  const selectedDay =
    filters?.day && publishedEntries.some((p) => p.tradingDay === filters.day)
      ? filters.day
      : publishedEntries[0].tradingDay;

  const selectedRawTrades = tradesByDay.get(selectedDay) || [];
  const filteredDayTrades = applyLedgerFilters(selectedRawTrades, {
    market: filters?.market || 'all',
    style: filters?.style || 'all',
    status: filters?.status || 'all',
  });
  const selectedPub = pubs.get(selectedDay)!;

  const ledger: DailyLedgerResponse = {
    tradingDay: selectedDay,
    filters: {
      market: filters?.market || 'all',
      style: filters?.style || 'all',
      status: filters?.status || 'all',
    },
    summary: summarizeLedgerTrades(selectedDay, filteredDayTrades),
    trades: filteredDayTrades,
    publication: selectedPub,
    wallConfig,
  };

  const decided = overallWins + overallLosses;
  return {
    enabled: true,
    publishedDayCount: publishedEntries.length,
    days,
    overallStats: {
      daysPublished: publishedEntries.length,
      totalPublished: overallPublished,
      resolvedTrades: overallResolved,
      wins: overallWins,
      losses: overallLosses,
      breakevens: overallBreakevens,
      supersededCount: overallSuperseded,
      invalidatedCount: overallInvalidated,
      winRate: decided > 0 ? Number(((overallWins / decided) * 100).toFixed(1)) : 0,
      totalRealizedR: Number(overallRealizedR.toFixed(2)),
    },
    selectedDay,
    ledger,
  };
}

export async function getPublicRecordWallDay(
  day: string,
  filters?: { market?: LedgerMarketFilter; style?: LedgerStyleFilter; status?: string }
): Promise<{ enabled: boolean; published: boolean; ledger: DailyLedgerResponse | null }> {
  const [wallConfig, pubs] = await Promise.all([
    getRecordWallGlobalConfig(),
    getPublicationsMap(),
  ]);
  const pub = pubs.get(day);
  if (!wallConfig.enabled || !pub || pub.status !== 'published') {
    return {
      enabled: wallConfig.enabled,
      published: Boolean(pub && pub.status === 'published'),
      ledger: null,
    };
  }
  const ledger = await getDailyTradeLedger({
    day,
    market: filters?.market || 'all',
    style: filters?.style || 'all',
    status: filters?.status || 'all',
  });
  return { enabled: true, published: true, ledger };
}
