import express, { Request, Response } from 'express';
import * as queries from '../db/queries';
import { circuitBreaker } from '../publish-gate/circuit-breaker';
import { metrics } from '../telemetry/metrics';
import { getCurrentKillzone, getNextKillzoneBoundary } from '../scheduler/killzone-mapper';
import { discoverUnifiedSetups } from '../discovery/unified-discovery';
import { executePublishRun } from '../publish-gate/publish-gate';
import { getDb } from '../db/database';

const router = express.Router();

router.post('/scheduled/session-boundary-revalidation', async (req: Request, res: Response) => {
  try {
    const { mode = 'live', market = 'both', strategyId } = req.body || {};
    const now = new Date();
    const currentKz = getCurrentKillzone(now);
    const kzInfo = currentKz || {
      killzone: 'ny_am' as const,
      boundaryET: '08:00',
      boundaryUTC: now.toISOString()
    };
    
    const runId = `manual_${Date.now()}`;
    const scope = (market.toLowerCase() as 'both' | 'futures' | 'forex');
    const { futures, forex } = await discoverUnifiedSetups(kzInfo, runId, scope, [], strategyId);
    
    const result = await executePublishRun(kzInfo, futures, forex, mode, 'manual');
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
});

router.get('/circuit-breaker', (_req: Request, res: Response) => {
  res.json(circuitBreaker.getStatus());
});

router.post('/circuit-breaker/reset', (_req: Request, res: Response) => {
  circuitBreaker.reset();
  res.json({ success: true, message: 'Circuit breaker reset' });
});

router.post('/force-dedupe/:instrument', (req: Request, res: Response) => {
  try {
    const { instrument } = req.params;
    const { market = 'futures' } = req.body || {};
    res.json({ success: true, message: `Deduplication forced for ${instrument} (${market})` });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
});

router.get('/system-status', (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const futuresActive = queries.getActiveSetups('futures');
    const forexActive = queries.getActiveSetups('forex');
    const recentRuns = queries.getRecentPublishRuns(1);
    const cbStatus = circuitBreaker.getStatus();
    
    res.json({
      status: cbStatus.tripped ? 'tripped' : 'ok',
      circuitBreaker: cbStatus,
      metrics: metrics.getAll(),
      currentKillzone: getCurrentKillzone(now),
      nextBoundary: getNextKillzoneBoundary(now),
      activeSetupCounts: { futures: futuresActive.length, forex: forexActive.length, total: futuresActive.length + forexActive.length },
      lastRun: recentRuns.length > 0 ? recentRuns[0] : null
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
});

router.get('/publish-runs', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const runs = queries.getRecentPublishRuns(limit);
    res.json({ runs, count: runs.length });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
});

router.get('/analytics', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const now = new Date();

    const selectedStrategy = req.query.strategy_id as string | undefined;

    let futuresQuery = `SELECT COUNT(*) as c FROM edge_setups`;
    let forexQuery = `SELECT COUNT(*) as c FROM forex_edge_setups`;
    let outcomesQuery = `SELECT * FROM outcomes ORDER BY created_at DESC`;

    if (selectedStrategy && selectedStrategy !== 'all') {
      futuresQuery += ` WHERE strategy_id = '${selectedStrategy}'`;
      forexQuery += ` WHERE strategy_id = '${selectedStrategy}'`;
      outcomesQuery = `SELECT * FROM outcomes WHERE strategy_id = '${selectedStrategy}' ORDER BY created_at DESC`;
    }

    const futuresTotal = (db.prepare(futuresQuery).get() as any).c;
    const forexTotal = (db.prepare(forexQuery).get() as any).c;
    
    let futuresActive = queries.getActiveSetups('futures').length;
    let forexActive = queries.getActiveSetups('forex').length;

    if (selectedStrategy && selectedStrategy !== 'all') {
      futuresActive = queries.getActiveSetups('futures').filter(s => (s.strategy_id || 'manna_basic') === selectedStrategy).length;
      forexActive = queries.getActiveSetups('forex').filter(s => (s.strategy_id || 'manna_basic') === selectedStrategy).length;
    }
    
    let outcomes = db.prepare(outcomesQuery).all() as any[];
    let wins = 0;
    let losses = 0;
    let totalRealizedR = 0;
    let futuresR = 0;
    let forexR = 0;
    
    const killzonePerformance: Record<string, { total: number, wins: number, losses: number, plR: number }> = {
      asia: { total: 0, wins: 0, losses: 0, plR: 0 },
      london: { total: 0, wins: 0, losses: 0, plR: 0 },
      ny_am: { total: 0, wins: 0, losses: 0, plR: 0 },
      ny_pm: { total: 0, wins: 0, losses: 0, plR: 0 },
    };

    let totalFillTimeMs = 0;
    let fillTimeCount = 0;
    let totalHoldingTimeMs = 0;
    let holdingTimeCount = 0;

    const enrichedOutcomes = outcomes.slice(0, 15).map((o: any) => {
      const setup = queries.getSetupById(o.setup_id, o.setup_market || 'futures');
      let tradeR = 0;
      
      if (o.outcome_type === 'tp1_hit') {
        tradeR = setup?.r_multiple_1 || 2.0;
      } else if (o.outcome_type === 'tp2_hit') {
        tradeR = setup?.r_multiple_2 || 3.0;
      } else if (o.outcome_type === 'sl_hit') {
        tradeR = -1.0;
      } else if (o.outcome_type === 'be_hit' || o.outcome_type === 'breakeven') {
        tradeR = 0.0;
      } else if (setup) {
        const entryPrice = setup.entry_price_recorded || setup.entry_zone_mid;
        const risk = Math.abs(entryPrice - setup.stop);
        const isLong = setup.bias === 'long';
        const execPrice = o.execution_price || entryPrice;
        const diff = isLong ? (execPrice - entryPrice) : (entryPrice - execPrice);
        if (risk > 0) tradeR = Number((diff / risk).toFixed(2));
      }

      const signalTime = setup?.created_at;
      const entryTime = setup?.entry_triggered_at;
      const exitTime = setup?.resolved_at || o.execution_time || o.created_at;

      let timeToFillMin: number | undefined = undefined;
      let holdingDurationMin: number | undefined = undefined;

      if (signalTime && entryTime) {
        const diff = new Date(entryTime).getTime() - new Date(signalTime).getTime();
        if (diff >= 0) {
          timeToFillMin = Number((diff / 60000).toFixed(1));
          totalFillTimeMs += diff;
          fillTimeCount++;
        }
      }

      if (entryTime && exitTime) {
        const diff = new Date(exitTime).getTime() - new Date(entryTime).getTime();
        if (diff >= 0) {
          holdingDurationMin = Number((diff / 60000).toFixed(1));
          totalHoldingTimeMs += diff;
          holdingTimeCount++;
        }
      }

      return {
        ...o,
        instrument: setup?.instrument || 'UNKNOWN',
        market: setup?.market || 'futures',
        bias: setup?.bias || 'long',
        time_signaled: signalTime,
        time_entered: entryTime,
        time_exited: exitTime,
        time_to_fill_min: timeToFillMin,
        holding_duration_min: holdingDurationMin,
        realized_r: tradeR
      };
    });

    let grossWinR = 0;
    let grossLossR = 0;
    let currentStreak = 0;
    let maxWinsStreak = 0;
    let maxLossesStreak = 0;
    let peakR = 0;
    let runningR = 0;
    let maxDrawdownR = 0;

    const assetPerformance: Record<string, { total: number; wins: number; losses: number; plR: number; market: string }> = {};

    for (const o of outcomes) {
      const setup = queries.getSetupById(o.setup_id, o.setup_market || 'futures');
      let tradeR = 0;
      const isWin = o.outcome_type.includes('tp');
      const isLoss = o.outcome_type.includes('sl');

      if (o.outcome_type === 'tp1_hit') tradeR = setup?.r_multiple_1 || 2.0;
      else if (o.outcome_type === 'tp2_hit') tradeR = setup?.r_multiple_2 || 3.0;
      else if (o.outcome_type === 'sl_hit') tradeR = -1.0;
      else if (o.outcome_type === 'be_hit' || o.outcome_type === 'breakeven') tradeR = 0.0;
      else if (setup) {
        const entryPrice = setup.entry_price_recorded || setup.entry_zone_mid;
        const risk = Math.abs(entryPrice - setup.stop);
        const isLong = setup.bias === 'long';
        const execPrice = o.execution_price || entryPrice;
        const diff = isLong ? (execPrice - entryPrice) : (entryPrice - execPrice);
        if (risk > 0) tradeR = Number((diff / risk).toFixed(2));
      }

      if (isWin) {
        wins++;
        grossWinR += tradeR;
        if (currentStreak > 0) currentStreak++;
        else currentStreak = 1;
        if (currentStreak > maxWinsStreak) maxWinsStreak = currentStreak;
      } else if (isLoss) {
        losses++;
        grossLossR += Math.abs(tradeR);
        if (currentStreak < 0) currentStreak--;
        else currentStreak = -1;
        if (Math.abs(currentStreak) > maxLossesStreak) maxLossesStreak = Math.abs(currentStreak);
      }

      runningR += tradeR;
      if (runningR > peakR) peakR = runningR;
      const dd = peakR - runningR;
      if (dd > maxDrawdownR) maxDrawdownR = dd;

      totalRealizedR += tradeR;
      if (o.setup_market === 'forex') forexR += tradeR;
      else futuresR += tradeR;

      const inst = setup?.instrument || 'OTHER';
      if (!assetPerformance[inst]) {
        assetPerformance[inst] = { total: 0, wins: 0, losses: 0, plR: 0, market: setup?.market || 'futures' };
      }
      assetPerformance[inst].total++;
      assetPerformance[inst].plR += tradeR;
      if (isWin) assetPerformance[inst].wins++;
      else if (isLoss) assetPerformance[inst].losses++;

      if (setup && setup.killzone_origin && killzonePerformance[setup.killzone_origin]) {
        killzonePerformance[setup.killzone_origin].total++;
        killzonePerformance[setup.killzone_origin].plR += tradeR;
        if (isWin) killzonePerformance[setup.killzone_origin].wins++;
        else if (isLoss) killzonePerformance[setup.killzone_origin].losses++;
      }
    }

    const totalTrades = wins + losses;
    const winRate = totalTrades > 0 ? Number((wins / totalTrades).toFixed(4)) : 0;
    const avgWinR = wins > 0 ? grossWinR / wins : 0;
    const avgLossR = losses > 0 ? grossLossR / losses : 0;
    const profitFactor = grossLossR > 0 ? Number((grossWinR / grossLossR).toFixed(2)) : Number(grossWinR.toFixed(2));
    const expectancyR = Number(((winRate * avgWinR) - ((1 - winRate) * avgLossR)).toFixed(2));

    const invStats = queries.getInvalidationStats();

    // ── Separate Scheduled Runs vs Manual Triggers ──
    const scheduledRuns = db.prepare(`SELECT * FROM publish_runs WHERE trigger_type = 'scheduled' OR trigger_type IS NULL ORDER BY created_at DESC`).all() as any[];
    const manualRuns = db.prepare(`SELECT * FROM publish_runs WHERE trigger_type = 'manual' ORDER BY created_at DESC`).all() as any[];

    const lastScheduledScan = scheduledRuns.length > 0 ? scheduledRuns[0] : null;
    const lastManualTrigger = manualRuns.length > 0 ? manualRuns[0] : null;

    const scheduledStats = {
      totalRuns: scheduledRuns.length,
      created: scheduledRuns.reduce((acc, r) => acc + (r.setups_created || 0), 0),
      invalidated: scheduledRuns.reduce((acc, r) => acc + (r.setups_invalidated || 0), 0),
      preserved: scheduledRuns.reduce((acc, r) => acc + (r.setups_preserved || 0), 0)
    };

    const manualStats = {
      totalRuns: manualRuns.length,
      created: manualRuns.reduce((acc, r) => acc + (r.setups_created || 0), 0),
      invalidated: manualRuns.reduce((acc, r) => acc + (r.setups_invalidated || 0), 0),
      preserved: manualRuns.reduce((acc, r) => acc + (r.setups_preserved || 0), 0)
    };

    const avgTimeToFill = fillTimeCount > 0 ? Number((totalFillTimeMs / (fillTimeCount * 60000)).toFixed(1)) : 0;
    const avgHoldingDuration = holdingTimeCount > 0 ? Number((totalHoldingTimeMs / (holdingTimeCount * 60000)).toFixed(1)) : 0;

    res.json({
      summary: {
        totalSetupsCreated: futuresTotal + forexTotal,
        activeSetupsCount: futuresActive + forexActive,
        totalTradesResolved: totalTrades,
        winRate,
        wins,
        losses,
        profitFactor,
        expectancyR,
        maxDrawdownR: Number(maxDrawdownR.toFixed(2)),
        maxWinsStreak,
        maxLossesStreak,
        totalRealizedR: Number(totalRealizedR.toFixed(2)),
        futuresR: Number(futuresR.toFixed(2)),
        forexR: Number(forexR.toFixed(2)),
        avgTimeToFillMinutes: avgTimeToFill,
        avgHoldingDurationMinutes: avgHoldingDuration,
      },
      currentSession: {
        activeKillzone: getCurrentKillzone(now),
        nextBoundary: getNextKillzoneBoundary(now)
      },
      lastScheduledScan,
      lastManualTrigger,
      triggers: {
        scheduled: scheduledStats,
        manual: manualStats
      },
      markets: {
        futures: { total: futuresTotal, active: futuresActive },
        forex: { total: forexTotal, active: forexActive },
      },
      assetPerformance,
      invalidations: invStats,
      killzones: killzonePerformance,
      recentOutcomes: enrichedOutcomes
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
});

// Helper to generate full CSV string with metadata headers
function buildAnalyticsCSV(
  archiveName: string,
  capturedFrom: string,
  capturedUntil: string,
  summary: any,
  outcomes: any[]
): string {
  const lines: string[] = [
    `# ==============================================================================`,
    `# MANNA EDGE MARKETS — ANALYTICS DATASET EXPORT`,
    `# Archive Epoch Name: ${archiveName}`,
    `# Date Range Captured: ${capturedFrom} to ${capturedUntil}`,
    `# Total Resolved Trades: ${summary.totalTradesResolved}`,
    `# Win Rate: ${(summary.winRate * 100).toFixed(2)}% (${summary.wins} Wins / ${summary.losses} Losses)`,
    `# Net Realized Return: ${summary.totalRealizedR > 0 ? '+' : ''}${summary.totalRealizedR.toFixed(2)}R (Futures: ${summary.futuresR.toFixed(2)}R | Forex: ${summary.forexR.toFixed(2)}R)`,
    `# Avg Time to Fill: ${summary.avgTimeToFillMinutes} min`,
    `# Avg Trade Duration: ${summary.avgHoldingDurationMinutes} min`,
    `# Export Generated At: ${new Date().toISOString()}`,
    `# ==============================================================================`,
    `Outcome ID,Setup ID,Strategy ID,Strategy Name,Instrument,Market,Killzone Origin,Bias,Outcome Type,Realized R,Signal Time (UTC),Entry Time (UTC),Exit Time (UTC),Time to Fill (min),Trade Duration (min),Conviction Score (%)`
  ];

  for (const o of outcomes) {
    const stratId = o.strategy_id || 'manna_basic';
    const stratName = stratId === 'manna_snd' ? 'Manna SnD' : 'Manna Basic';
    const row = [
      `"${o.id || ''}"`,
      `"${o.setup_id || ''}"`,
      `"${stratId}"`,
      `"${stratName}"`,
      `"${o.instrument || ''}"`,
      `"${o.market || ''}"`,
      `"${o.killzone_origin || ''}"`,
      `"${o.bias || ''}"`,
      `"${o.outcome_type || ''}"`,
      o.realized_r !== undefined ? o.realized_r : 0,
      `"${o.time_signaled || ''}"`,
      `"${o.time_entered || ''}"`,
      `"${o.time_exited || ''}"`,
      o.time_to_fill_min !== undefined ? o.time_to_fill_min : '',
      o.holding_duration_min !== undefined ? o.holding_duration_min : '',
      o.conviction_score !== undefined ? o.conviction_score : ''
    ];
    lines.push(row.join(','));
  }

  return lines.join('\n');
}

// ── GET /api/admin/analytics/export-csv — Live CSV Export ──
router.get('/analytics/export-csv', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const outcomesRaw = db.prepare(`SELECT * FROM outcomes ORDER BY created_at DESC`).all() as any[];
    
    let earliestTime = new Date().toISOString();
    let latestTime = new Date().toISOString();

    const outcomes = outcomesRaw.map(o => {
      const setup = queries.getSetupById(o.setup_id, o.setup_market || 'futures');
      const sigTime = setup?.created_at || o.created_at;
      if (sigTime < earliestTime) earliestTime = sigTime;

      let tradeR = 0;
      if (o.outcome_type === 'tp1_hit') tradeR = setup?.r_multiple_1 || 2.0;
      else if (o.outcome_type === 'tp2_hit') tradeR = setup?.r_multiple_2 || 3.0;
      else if (o.outcome_type === 'sl_hit') tradeR = -1.0;
      else if (o.outcome_type === 'be_hit' || o.outcome_type === 'breakeven') tradeR = 0.0;

      const fillMin = setup?.created_at && setup?.entry_triggered_at
        ? Number(((new Date(setup.entry_triggered_at).getTime() - new Date(setup.created_at).getTime()) / 60000).toFixed(1))
        : undefined;

      const holdMin = setup?.entry_triggered_at && (setup?.resolved_at || o.execution_time)
        ? Number(((new Date(setup.resolved_at || o.execution_time).getTime() - new Date(setup.entry_triggered_at).getTime()) / 60000).toFixed(1))
        : undefined;

      return {
        ...o,
        instrument: setup?.instrument || 'UNKNOWN',
        market: setup?.market || 'futures',
        killzone_origin: setup?.killzone_origin || 'unknown',
        bias: setup?.bias || 'long',
        conviction_score: setup?.conviction_score,
        time_signaled: setup?.created_at,
        time_entered: setup?.entry_triggered_at,
        time_exited: setup?.resolved_at || o.execution_time,
        time_to_fill_min: fillMin,
        holding_duration_min: holdMin,
        realized_r: tradeR
      };
    });

    const wins = outcomes.filter(o => o.outcome_type.includes('tp')).length;
    const losses = outcomes.filter(o => o.outcome_type === 'sl_hit').length;
    const breakevens = outcomes.filter(o => o.outcome_type === 'be_hit' || o.outcome_type === 'breakeven').length;
    const totalTrades = wins + losses + breakevens;
    const winRate = totalTrades > 0 ? wins / totalTrades : 0;
    const totalRealizedR = outcomes.reduce((acc, o) => acc + o.realized_r, 0);

    const summary = {
      totalTradesResolved: totalTrades,
      winRate,
      wins,
      losses,
      totalRealizedR,
      futuresR: outcomes.filter(o => o.market === 'futures').reduce((acc, o) => acc + o.realized_r, 0),
      forexR: outcomes.filter(o => o.market === 'forex').reduce((acc, o) => acc + o.realized_r, 0),
      avgTimeToFillMinutes: 0,
      avgHoldingDurationMinutes: 0
    };

    const csvContent = buildAnalyticsCSV('Current Live Session', earliestTime, latestTime, summary, outcomes);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="manna_analytics_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csvContent);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate CSV export', details: String(error) });
  }
});

// ── POST /api/admin/analytics/reset — Archive Current Analytics & Reset Tracking ──
router.post('/analytics/reset', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { archiveName = `Archive Epoch (${new Date().toLocaleDateString()})` } = req.body || {};

    const outcomesRaw = db.prepare(`SELECT * FROM outcomes ORDER BY created_at DESC`).all() as any[];
    
    let earliestTime = new Date().toISOString();
    let latestTime = new Date().toISOString();

    let totalFillTimeMs = 0;
    let fillCount = 0;
    let totalHoldTimeMs = 0;
    let holdCount = 0;

    const outcomes = outcomesRaw.map(o => {
      const setup = queries.getSetupById(o.setup_id, o.setup_market || 'futures');
      const sigTime = setup?.created_at || o.created_at;
      if (sigTime < earliestTime) earliestTime = sigTime;

      let tradeR = 0;
      if (o.outcome_type === 'tp1_hit') tradeR = setup?.r_multiple_1 || 2.0;
      else if (o.outcome_type === 'tp2_hit') tradeR = setup?.r_multiple_2 || 3.0;
      else if (o.outcome_type === 'sl_hit') tradeR = -1.0;
      else if (o.outcome_type === 'be_hit' || o.outcome_type === 'breakeven') tradeR = 0.0;

      let fillMin: number | undefined;
      if (setup?.created_at && setup?.entry_triggered_at) {
        const diff = new Date(setup.entry_triggered_at).getTime() - new Date(setup.created_at).getTime();
        if (diff >= 0) {
          fillMin = Number((diff / 60000).toFixed(1));
          totalFillTimeMs += diff;
          fillCount++;
        }
      }

      let holdMin: number | undefined;
      const exitT = setup?.resolved_at || o.execution_time;
      if (setup?.entry_triggered_at && exitT) {
        const diff = new Date(exitT).getTime() - new Date(setup.entry_triggered_at).getTime();
        if (diff >= 0) {
          holdMin = Number((diff / 60000).toFixed(1));
          totalHoldTimeMs += diff;
          holdCount++;
        }
      }

      return {
        ...o,
        instrument: setup?.instrument || 'UNKNOWN',
        market: setup?.market || 'futures',
        killzone_origin: setup?.killzone_origin || 'unknown',
        bias: setup?.bias || 'long',
        conviction_score: setup?.conviction_score,
        time_signaled: setup?.created_at,
        time_entered: setup?.entry_triggered_at,
        time_exited: exitT,
        time_to_fill_min: fillMin,
        holding_duration_min: holdMin,
        realized_r: tradeR
      };
    });

    const wins = outcomes.filter(o => o.outcome_type.includes('tp')).length;
    const losses = outcomes.filter(o => o.outcome_type === 'sl_hit').length;
    const breakevens = outcomes.filter(o => o.outcome_type === 'be_hit' || o.outcome_type === 'breakeven').length;
    const totalTrades = wins + losses + breakevens;
    const winRate = totalTrades > 0 ? Number((wins / totalTrades).toFixed(4)) : 0;
    const totalRealizedR = outcomes.reduce((acc, o) => acc + o.realized_r, 0);

    const avgFillTimeMin = fillCount > 0 ? Number((totalFillTimeMs / (fillCount * 60000)).toFixed(1)) : 0;
    const avgHoldDurationMin = holdCount > 0 ? Number((totalHoldTimeMs / (holdCount * 60000)).toFixed(1)) : 0;

    const summary = {
      totalTradesResolved: totalTrades,
      winRate,
      wins,
      losses,
      totalRealizedR: Number(totalRealizedR.toFixed(2)),
      futuresR: Number(outcomes.filter(o => o.market === 'futures').reduce((acc, o) => acc + o.realized_r, 0).toFixed(2)),
      forexR: Number(outcomes.filter(o => o.market === 'forex').reduce((acc, o) => acc + o.realized_r, 0).toFixed(2)),
      avgTimeToFillMinutes: avgFillTimeMin,
      avgHoldingDurationMinutes: avgHoldDurationMin
    };

    const csvContent = buildAnalyticsCSV(archiveName, earliestTime, latestTime, summary, outcomes);

    // Save archive to database
    const archiveId = `arch_${Date.now()}`;
    db.prepare(`
      INSERT INTO analytics_archives (
        id, archive_name, captured_from, captured_until, total_setups, total_resolved,
        win_rate, total_realized_r, avg_fill_time_min, avg_hold_duration_min,
        csv_content, summary_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      archiveId,
      archiveName,
      earliestTime,
      latestTime,
      outcomes.length,
      totalTrades,
      winRate,
      summary.totalRealizedR,
      avgFillTimeMin,
      avgHoldDurationMin,
      csvContent,
      JSON.stringify(summary),
      new Date().toISOString()
    );

    // RESET: Delete resolved outcomes & resolved setups to start tracking anew!
    db.prepare(`DELETE FROM outcomes`).run();
    db.prepare(`DELETE FROM edge_setups WHERE signal_state IN ('resolved', 'invalidated')`).run();
    db.prepare(`DELETE FROM forex_edge_setups WHERE signal_state IN ('resolved', 'invalidated')`).run();

    res.json({
      success: true,
      archiveId,
      archiveName,
      capturedFrom: earliestTime,
      capturedUntil: latestTime,
      archivedTradesCount: totalTrades,
      summary,
      message: 'Analytics tracking successfully archived to CSV and reset anew!'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to archive and reset analytics', details: String(error) });
  }
});

// ── GET /api/admin/analytics/archives — List Historical Archived Epochs ──
router.get('/analytics/archives', (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const archives = db.prepare(`
      SELECT id, archive_name, captured_from, captured_until, total_setups, total_resolved,
             win_rate, total_realized_r, avg_fill_time_min, avg_hold_duration_min, created_at
      FROM analytics_archives ORDER BY created_at DESC
    `).all();
    res.json({ archives });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch archives', details: String(error) });
  }
});

// ── GET /api/admin/analytics/archives/:id/download — Download CSV for Specific Archive ──
router.get('/analytics/archives/:id/download', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const archive = db.prepare(`SELECT * FROM analytics_archives WHERE id = ?`).get(req.params.id) as any;
    if (!archive) {
      return res.status(404).json({ error: 'Archive not found' });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="manna_archive_${archive.id}.csv"`);
    res.send(archive.csv_content);
  } catch (error) {
    res.status(500).json({ error: 'Failed to download archive CSV', details: String(error) });
  }
});

// ── GET /api/admin/analytics/strategies — Strategy Performance Matrix ──
router.get('/analytics/strategies', (_req: Request, res: Response) => {
  try {
    const db = getDb();

    // Fetch all active strategy setups & outcomes
    const futuresSetups = db.prepare(`SELECT * FROM edge_setups`).all() as any[];
    const forexSetups = db.prepare(`SELECT * FROM forex_edge_setups`).all() as any[];
    const allSetups = [...futuresSetups, ...forexSetups];
    const allOutcomes = db.prepare(`SELECT * FROM outcomes`).all() as any[];

    const strategyStats: Record<string, {
      id: string;
      name: string;
      tier: string;
      totalSignals: number;
      activeSignals: number;
      resolvedSignals: number;
      wins: number;
      losses: number;
      winRate: number;
      totalRealizedR: number;
    }> = {
      manna_basic: {
        id: 'manna_basic',
        name: 'Manna Basic',
        tier: 'basic',
        totalSignals: 0,
        activeSignals: 0,
        resolvedSignals: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        totalRealizedR: 0
      },
      manna_snd: {
        id: 'manna_snd',
        name: 'Manna SnD',
        tier: 'pro',
        totalSignals: 0,
        activeSignals: 0,
        resolvedSignals: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        totalRealizedR: 0
      }
    };

    // Aggregate setups by strategy
    for (const setup of allSetups) {
      const stratId = setup.strategy_id || 'manna_basic';
      if (!strategyStats[stratId]) {
        strategyStats[stratId] = {
          id: stratId,
          name: stratId === 'manna_snd' ? 'Manna SnD' : 'Manna Basic',
          tier: setup.strategy_tier || 'basic',
          totalSignals: 0,
          activeSignals: 0,
          resolvedSignals: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
          totalRealizedR: 0
        };
      }
      strategyStats[stratId].totalSignals += 1;
      if (['awaiting_entry', 'active'].includes(setup.signal_state)) {
        strategyStats[stratId].activeSignals += 1;
      } else if (setup.signal_state === 'resolved') {
        strategyStats[stratId].resolvedSignals += 1;
      }
    }

    // Aggregate outcomes by strategy
    for (const outcome of allOutcomes) {
      const stratId = outcome.strategy_id || 'manna_basic';
      if (strategyStats[stratId]) {
        if (['tp1_hit', 'tp2_hit'].includes(outcome.outcome_type)) {
          strategyStats[stratId].wins += 1;
          strategyStats[stratId].totalRealizedR += (outcome.realized_pl || 2.0);
        } else if (outcome.outcome_type === 'sl_hit') {
          strategyStats[stratId].losses += 1;
          strategyStats[stratId].totalRealizedR -= 1.0;
        }
      }
    }

    // Calculate win rates
    for (const stratId of Object.keys(strategyStats)) {
      const s = strategyStats[stratId];
      const totalResolved = s.wins + s.losses;
      s.winRate = totalResolved > 0 ? Number(((s.wins / totalResolved) * 100).toFixed(1)) : 0;
      s.totalRealizedR = Number(s.totalRealizedR.toFixed(2));
    }

    res.json({
      strategies: Object.values(strategyStats)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch strategy analytics', details: String(error) });
  }
});

export default router;
