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
  winRate: number;
  totalRealizedR: number;
  avgFillTimeMin: number;
  avgHoldDurationMin: number;
  strategyBreakdown: {
    manna_basic: { trades: number; wins: number; winRate: number; totalR: number };
    manna_snd: { trades: number; wins: number; winRate: number; totalR: number };
  };
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
  let totalRealizedR = 0;
  let totalFillMs = 0;
  let fillCount = 0;
  let totalHoldMs = 0;
  let holdCount = 0;

  const stratStats = {
    manna_basic: { trades: 0, wins: 0, winRate: 0, totalR: 0 },
    manna_snd: { trades: 0, wins: 0, winRate: 0, totalR: 0 }
  };

  let processedTrades = 0;

  for (const o of outcomesRaw) {
    const setup = await queries.getSetupById(o.setup_id, o.setup_market || 'futures');

    // Filter by session if periodType === 'session' and sessionName is provided and not 'all'
    if (periodType === 'session' && sessionName && sessionName !== 'all') {
      const setupKz = (setup?.killzone_origin || o.killzone_origin || '').toLowerCase();
      const targetKz = sessionName.toLowerCase();
      if (setupKz !== targetKz) {
        continue;
      }
    }

    processedTrades++;
    const stratKey = (o.strategy_id || setup?.strategy_id || 'manna_basic').toLowerCase() === 'manna_snd' ? 'manna_snd' : 'manna_basic';

    let rVal = 0;
    const typeStr = String(o.outcome_type || '').toLowerCase();

    if (typeStr.includes('tp2')) {
      wins++;
      rVal = setup?.r_multiple_2 || 3.0;
      stratStats[stratKey].wins++;
    } else if (typeStr.includes('tp1') || typeStr.includes('tp')) {
      wins++;
      rVal = setup?.r_multiple_1 || 2.0;
      stratStats[stratKey].wins++;
    } else if (typeStr.includes('sl') || typeStr.includes('stop')) {
      losses++;
      rVal = -1.0;
    } else if (typeStr.includes('be') || typeStr.includes('breakeven')) {
      breakevens++;
      rVal = 0.0;
    }

    totalRealizedR += rVal;
    stratStats[stratKey].trades++;
    stratStats[stratKey].totalR += rVal;

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

  if (stratStats.manna_basic.trades > 0) {
    stratStats.manna_basic.winRate = Number(((stratStats.manna_basic.wins / stratStats.manna_basic.trades) * 100).toFixed(1));
    stratStats.manna_basic.totalR = Number(stratStats.manna_basic.totalR.toFixed(2));
  }
  if (stratStats.manna_snd.trades > 0) {
    stratStats.manna_snd.winRate = Number(((stratStats.manna_snd.wins / stratStats.manna_snd.trades) * 100).toFixed(1));
    stratStats.manna_snd.totalR = Number(stratStats.manna_snd.totalR.toFixed(2));
  }

  let periodLabel = periodType === 'daily' ? 'Daily' : periodType === 'weekly' ? 'Weekly' : periodType === 'monthly' ? 'Monthly' : 'Session';
  if (periodType === 'session' && sessionName && sessionName !== 'all') {
    const sMap: Record<string, string> = { asia: 'Asia', london: 'London', ny_am: 'NY AM', ny_pm: 'NY PM' };
    const niceSession = sMap[sessionName.toLowerCase()] || sessionName.toUpperCase();
    periodLabel = `${niceSession} Session`;
  }

  const plainEnglishSummary = totalTrades > 0
    ? `During this ${periodLabel.toLowerCase()} period, we had ${totalTrades} finished trades (${wins} Wins, ${losses} Losses, ${breakevens} Risk-Free Breakevens). Overall win rate was ${winRate}% with a total profit of ${totalRealizedR >= 0 ? '+' : ''}${totalRealizedR.toFixed(2)}R!`
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
    winRate,
    totalRealizedR: Number(totalRealizedR.toFixed(2)),
    avgFillTimeMin,
    avgHoldDurationMin,
    strategyBreakdown: stratStats,
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

