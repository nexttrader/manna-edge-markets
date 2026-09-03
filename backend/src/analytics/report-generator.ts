import { queryDb } from '../db/database';
import * as queries from '../db/queries';

export interface ReportSummary {
  periodType: 'daily' | 'weekly' | 'monthly' | 'session';
  sessionName?: string;
  periodStart: string;
  periodEnd: string;
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  tp1Hits?: number;
  tp2Hits?: number;
  winRate: number;
  totalRealizedR: number;
  avgFillTimeMin: number;
  avgHoldDurationMin: number;
  strategyBreakdown: Record<string, { trades: number; wins: number; tp1Hits?: number; tp2Hits?: number; winRate: number; totalR: number }>;
  topFocusMetrics?: { trades: number; wins: number; losses: number; winRate: number; totalR: number };
  plainEnglishSummary: string;
}

export async function generateReportMetrics(
  periodType: 'daily' | 'weekly' | 'monthly' | 'session',
  customStart?: string,
  customEnd?: string,
  sessionName?: string
): Promise<ReportSummary> {
  const now = new Date();
  let periodStartIso: string;
  let periodEndIso: string = customEnd || now.toISOString();

  if (customStart) {
    periodStartIso = customStart;
  } else if (periodType === 'daily' || periodType === 'session') {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    periodStartIso = yesterday.toISOString();
  } else if (periodType === 'weekly') {
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    periodStartIso = lastWeek.toISOString();
  } else {
    const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    periodStartIso = lastMonth.toISOString();
  }

  const outcomesRaw = await queryDb(`
    SELECT * FROM outcomes 
    WHERE created_at >= ? AND created_at <= ?
    ORDER BY created_at DESC
  `, [periodStartIso, periodEndIso]);

  let wins = 0;
  let losses = 0;
  let breakevens = 0;
  let tp1Hits = 0;
  let tp2Hits = 0;
  let totalRealizedR = 0;
  let totalFillMs = 0;
  let fillCount = 0;
  let totalHoldMs = 0;
  let holdCount = 0;
  let topFocusTrades = 0;
  let topFocusWins = 0;
  let topFocusLosses = 0;
  let topFocusR = 0;

  const stratStats: Record<string, { trades: number; wins: number; tp1Hits?: number; tp2Hits?: number; winRate: number; totalR: number }> = {
    sentinel_v2: { trades: 0, wins: 0, tp1Hits: 0, tp2Hits: 0, winRate: 0, totalR: 0 },
    manna_snd: { trades: 0, wins: 0, tp1Hits: 0, tp2Hits: 0, winRate: 0, totalR: 0 }
  };

  let processedTrades = 0;

  for (const o of outcomesRaw) {
    let setup = await queries.getSetupById(o.setup_id, o.setup_market || 'futures');
    if (!setup) {
      setup = await queries.getSetupById(o.setup_id, o.setup_market === 'forex' ? 'futures' : 'forex');
    }

    // Filter by session if periodType === 'session' and sessionName is provided and not 'all'
    if (periodType === 'session' && sessionName && sessionName !== 'all') {
      const setupKz = (setup?.killzone_origin || (o as any).killzone_origin || '').toLowerCase().replace(/^kz_/, '');
      const targetKz = sessionName.toLowerCase().replace(/^kz_/, '');
      if (setupKz !== targetKz) {
        continue;
      }
    }

    processedTrades++;
    const rawKey = (o.strategy_id || setup?.strategy_id || 'sentinel_v2').toLowerCase();
    const stratKey = rawKey === 'manna_snd' ? 'manna_snd' : 'sentinel_v2';

    if (!stratStats[stratKey]) {
      stratStats[stratKey] = { trades: 0, wins: 0, tp1Hits: 0, tp2Hits: 0, winRate: 0, totalR: 0 };
    }

    let rVal = 0;
    const typeStr = String(o.outcome_type || '').toLowerCase();

    if (typeStr.includes('tp2')) {
      wins++;
      tp2Hits++;
      rVal = setup?.r_multiple_2 || 3.0;
      stratStats[stratKey].wins++;
      stratStats[stratKey].tp2Hits = (stratStats[stratKey].tp2Hits || 0) + 1;
    } else if (typeStr.includes('tp1') || typeStr.includes('tp')) {
      wins++;
      tp1Hits++;
      rVal = setup?.r_multiple_1 || 2.0;
      stratStats[stratKey].wins++;
      stratStats[stratKey].tp1Hits = (stratStats[stratKey].tp1Hits || 0) + 1;
    } else if (typeStr.includes('sl') || typeStr.includes('stop')) {
      losses++;
      rVal = -1.0;
    } else if (typeStr.includes('be') || typeStr.includes('breakeven')) {
      breakevens++;
      rVal = 0.0;
    } else if (o.realized_pl !== undefined && o.realized_pl !== null) {
      rVal = Math.max(-1.0, o.realized_pl);
      if (rVal > 0) { wins++; stratStats[stratKey].wins++; }
      else if (rVal < 0) { losses++; }
      else { breakevens++; }
    }

    totalRealizedR += rVal;
    stratStats[stratKey].trades++;
    stratStats[stratKey].totalR += rVal;

    // Track Decision Matrix #1 Focus Selection Efficacy
    let metaObj: any = {};
    try {
      metaObj = typeof setup?.metadata === 'string' ? JSON.parse(setup.metadata) : (setup?.metadata || {});
    } catch {}
    const isTopFocus = metaObj.is_best_trade_at_entry === true || metaObj.entry_matrix_rank === 1;
    if (isTopFocus) {
      topFocusTrades++;
      topFocusR += rVal;
      if (rVal > 0) topFocusWins++;
      else if (rVal < 0) topFocusLosses++;
    }

    if (setup?.created_at && setup?.entry_triggered_at) {
      const fillDiff = new Date(setup.entry_triggered_at).getTime() - new Date(setup.created_at).getTime();
      if (fillDiff > 0) {
        totalFillMs += fillDiff;
        fillCount++;
      }
    }

    if (setup?.entry_triggered_at && setup?.resolved_at) {
      const holdDiff = new Date(setup.resolved_at).getTime() - new Date(setup.entry_triggered_at).getTime();
      if (holdDiff > 0) {
        totalHoldMs += holdDiff;
        holdCount++;
      }
    }
  }

  const totalTrades = processedTrades;
  const winRate = totalTrades > 0 ? Number(((wins / totalTrades) * 100).toFixed(1)) : 0;
  const avgFillTimeMin = fillCount > 0 ? Number((totalFillMs / fillCount / 60000).toFixed(1)) : 0;
  const avgHoldDurationMin = holdCount > 0 ? Number((totalHoldMs / holdCount / 60000).toFixed(1)) : 0;

  Object.keys(stratStats).forEach(k => {
    if (stratStats[k].trades > 0) {
      stratStats[k].winRate = Number(((stratStats[k].wins / stratStats[k].trades) * 100).toFixed(1));
      stratStats[k].totalR = Number(stratStats[k].totalR.toFixed(2));
    }
  });

  let periodLabel = periodType === 'daily' ? 'Daily' : periodType === 'weekly' ? 'Weekly' : periodType === 'monthly' ? 'Monthly' : 'Session';
  if (periodType === 'session' && sessionName && sessionName !== 'all') {
    const sMap: Record<string, string> = { asia: 'Asia', london: 'London', ny_am: 'NY AM', ny_pm: 'NY PM' };
    const niceSession = sMap[sessionName.toLowerCase()] || sessionName.toUpperCase();
    periodLabel = `${niceSession} Session`;
  }

  const plainEnglishSummary = totalTrades > 0
    ? `During this ${periodLabel.toLowerCase()} period, we had ${totalTrades} finished trades (${wins} Wins [${tp1Hits}x TP1 (+2R), ${tp2Hits}x TP2 (+3R)], ${losses} Losses [-1R each], ${breakevens} Risk-Free Breakevens). Overall win rate was ${winRate}% with a total profit of ${totalRealizedR >= 0 ? '+' : ''}${totalRealizedR.toFixed(2)}R!`
    : `No trades were completed during this ${periodLabel.toLowerCase()} tracking period.`;

  return {
    periodType,
    sessionName,
    periodStart: periodStartIso,
    periodEnd: periodEndIso,
    totalTrades,
    wins,
    losses,
    breakevens,
    tp1Hits,
    tp2Hits,
    winRate,
    totalRealizedR: Number(totalRealizedR.toFixed(2)),
    avgFillTimeMin,
    avgHoldDurationMin,
    strategyBreakdown: stratStats,
    topFocusMetrics: {
      trades: topFocusTrades,
      wins: topFocusWins,
      losses: topFocusLosses,
      winRate: topFocusTrades > 0 ? Number(((topFocusWins / topFocusTrades) * 100).toFixed(1)) : 0,
      totalR: Number(topFocusR.toFixed(2))
    },
    plainEnglishSummary
  };
}

export async function autoGenerateSessionPerformanceReports(targetSession: string = 'asia'): Promise<void> {
  try {
    const now = new Date();

    // 1. Session Report
    const sessionMetrics = await generateReportMetrics('session', undefined, undefined, targetSession);
    const sessionId = `report_session_${targetSession.toLowerCase()}_${Date.now()}`;
    await queryDb(`
      INSERT INTO performance_reports (
        id, period_type, period_start, period_end, summary_json,
        admin_notes, status, created_at
      ) VALUES (?, 'session', ?, ?, ?, '', 'draft_pending_approval', ?)
    `, [sessionId, sessionMetrics.periodStart, sessionMetrics.periodEnd, JSON.stringify(sessionMetrics), now.toISOString()]);
    console.log(`📊 Auto-generated ${targetSession.toUpperCase()} Session Performance Report draft (${sessionId}) for Admin Approval Queue`);

    if (targetSession.toLowerCase() === 'asia') {
      // 2. Daily Report
      const dailyMetrics = await generateReportMetrics('daily');
      const dailyId = `report_daily_${Date.now()}`;
      await queryDb(`
        INSERT INTO performance_reports (
          id, period_type, period_start, period_end, summary_json,
          admin_notes, status, created_at
        ) VALUES (?, 'daily', ?, ?, ?, '', 'draft_pending_approval', ?)
      `, [dailyId, dailyMetrics.periodStart, dailyMetrics.periodEnd, JSON.stringify(dailyMetrics), now.toISOString()]);
      console.log(`📊 Auto-generated Daily Performance Report draft (${dailyId}) for Admin Approval Queue`);

      // 3. Weekly Report (if Sunday)
      if (now.getDay() === 0) {
        const weeklyMetrics = await generateReportMetrics('weekly');
        const weeklyId = `report_weekly_${Date.now()}`;
        await queryDb(`
          INSERT INTO performance_reports (
            id, period_type, period_start, period_end, summary_json,
            admin_notes, status, created_at
          ) VALUES (?, 'weekly', ?, ?, ?, '', 'draft_pending_approval', ?)
        `, [weeklyId, weeklyMetrics.periodStart, weeklyMetrics.periodEnd, JSON.stringify(weeklyMetrics), now.toISOString()]);
        console.log(`📊 Auto-generated Weekly Performance Report draft (${weeklyId}) for Admin Approval Queue`);
      }

      // 4. Monthly Report (if 1st of month)
      if (now.getDate() === 1) {
        const monthlyMetrics = await generateReportMetrics('monthly');
        const monthlyId = `report_monthly_${Date.now()}`;
        await queryDb(`
          INSERT INTO performance_reports (
            id, period_type, period_start, period_end, summary_json,
            admin_notes, status, created_at
          ) VALUES (?, 'monthly', ?, ?, ?, '', 'draft_pending_approval', ?)
        `, [monthlyId, monthlyMetrics.periodStart, monthlyMetrics.periodEnd, JSON.stringify(monthlyMetrics), now.toISOString()]);
        console.log(`📊 Auto-generated Monthly Performance Report draft (${monthlyId}) for Admin Approval Queue`);
      }
    }
  } catch (error) {
    console.error('Error auto-generating Performance Reports:', error);
  }
}

export const autoGenerateAsiaPerformanceReports = autoGenerateSessionPerformanceReports;

