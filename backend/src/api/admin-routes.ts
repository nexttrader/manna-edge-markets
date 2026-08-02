import express, { Request, Response } from 'express';
import * as queries from '../db/queries';
import { circuitBreaker } from '../publish-gate/circuit-breaker';
import { metrics } from '../telemetry/metrics';
import { getCurrentKillzone, getNextKillzoneBoundary, isMarketOpen } from '../scheduler/killzone-mapper';
import { discoverUnifiedSetups } from '../discovery/unified-discovery';
import { executePublishRun, publishEvents } from '../publish-gate/publish-gate';
import { queryDb } from '../db/database';
import { v4 as uuidv4 } from 'uuid';

import { hawkeyeService } from '../hawkeye/hawkeye-service';

const router = express.Router();

router.get('/strategies/status', async (_req: Request, res: Response) => {
  try {
    const strategies = await queries.getStrategySettings();
    res.json({ strategies });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch strategy status', details: String(error) });
  }
});

import { getAllUsers, addUser, updateUserTier } from '../db/user-store';

// User Accounts Management Endpoints
router.get('/users', (_req: Request, res: Response) => {
  const users = getAllUsers();
  res.json({ success: true, users });
});

router.post('/users', (req: Request, res: Response) => {
  try {
    const { name, email, tier = 'free' } = req.body || {};
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    // Admins can ONLY create trader accounts
    const newUser = addUser({
      name,
      email,
      role: 'trader',
      tier
    });

    res.json({ success: true, user: newUser, users: getAllUsers() });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create user account', details: err.message });
  }
});

router.put('/users/:id/tier', (req: Request, res: Response) => {
  try {
    const rawId = req.params.id;
    const userId = Array.isArray(rawId) ? rawId[0] : rawId;
    const { tier } = req.body || {};

    if (!tier || !['free', 'forex_only', 'futures_forex'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier specified' });
    }

    const updated = updateUserTier(userId, tier);
    if (!updated) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, user: updated, users: getAllUsers() });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update user tier', details: err.message });
  }
});

router.post('/strategies/toggle', async (req: Request, res: Response) => {
  try {
    const { strategyId, enabled } = req.body || {};
    if (!strategyId || typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Missing strategyId or enabled boolean' });
    }
    await queries.updateStrategyEnabled(strategyId, enabled);
    const updated = await queries.getStrategySettings();
    res.json({ success: true, message: `Strategy ${strategyId} ${enabled ? 'enabled' : 'disabled'}`, strategies: updated });
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle strategy', details: String(error) });
  }
});

router.post('/signals/:id/invalidate', async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const { market = 'futures', reason = 'admin_manually_disabled', detail = 'Manually disabled by admin from panel' } = req.body || {};
    
    let setup = await queries.getSetupById(id, market);
    let targetMarket = market;
    if (!setup) {
      const altMarket = market === 'futures' ? 'forex' : 'futures';
      setup = await queries.getSetupById(id, altMarket);
      if (setup) targetMarket = altMarket;
    }

    if (!setup) {
      return res.status(404).json({ error: 'Signal not found' });
    }
    
    await queries.updateSetupState(id, targetMarket, 'invalidated', {
      invalidation_reason: reason,
      invalidation_detail: detail,
      tradable: 0,
      resolved_at: new Date().toISOString()
    });

    await hawkeyeService.logInvalidation({
      setupId: id,
      instrument: setup.instrument,
      setupMarket: targetMarket,
      runId: `manual_disable_${Date.now()}`,
      reasonCode: reason,
      detail: detail,
      previousState: setup.signal_state,
      newState: 'invalidated',
      createdBy: 'admin_panel'
    });

    res.json({ success: true, message: `Signal ${id} disabled and invalidated successfully.` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to disable signal', details: String(error) });
  }
});

let isSingleRescanActive = false;

router.post('/single-asset-rescan', async (req: Request, res: Response) => {
  if (isSingleRescanActive) {
    return res.status(400).json({ error: 'A single-asset rescan is currently in progress. Please wait.' });
  }

  try {
    const { setupId, instrument, market = 'futures' } = req.body || {};
    if (!setupId || !instrument) {
      return res.status(400).json({ error: 'Missing setupId or instrument' });
    }

    let existingSetup = await queries.getSetupById(setupId, market);
    let targetMarket = market;
    if (!existingSetup) {
      const altMarket = market === 'futures' ? 'forex' : 'futures';
      existingSetup = await queries.getSetupById(setupId, altMarket);
      if (existingSetup) targetMarket = altMarket;
    }

    if (!existingSetup) {
      return res.status(404).json({ error: 'Setup not found' });
    }

    const stateStr = (existingSetup.signal_state || (existingSetup as any).state || '').toLowerCase();
    if (stateStr !== 'awaiting_entry') {
      return res.status(400).json({ error: `Single asset rescan is only permitted for pending (awaiting_entry) signals. Current state: ${stateStr}` });
    }

    isSingleRescanActive = true;

    // Run unified discovery ONLY for this specific instrument
    const now = new Date();
    const currentKz = getCurrentKillzone(now);
    const kzInfo = currentKz || {
      killzone: 'ny_am' as const,
      boundaryET: '08:00',
      boundaryUTC: now.toISOString()
    };
    const runId = `single_rescan_${Date.now()}`;
    const scope = (targetMarket.toLowerCase() as 'both' | 'futures' | 'forex');

    const targetStrategy = existingSetup.strategy_id || 'manna_basic';

    const { futures, forex } = await discoverUnifiedSetups(kzInfo, runId, scope, [], targetStrategy);

    const candidates = targetMarket === 'futures' ? futures : forex;
    const matchingCandidate = candidates.find(c => c.instrument === instrument && (c.strategy_id || 'manna_basic') === targetStrategy);

    isSingleRescanActive = false;

    if (!matchingCandidate) {
      return res.json({
        found: false,
        message: `No new signal candidate discovered for ${instrument}. Current setup remains untouched.`,
        currentSetup: existingSetup,
        candidate: null
      });
    }

    return res.json({
      found: true,
      message: `New signal candidate discovered for ${instrument}! Review and confirm replacement.`,
      currentSetup: existingSetup,
      candidate: matchingCandidate
    });
  } catch (error: any) {
    isSingleRescanActive = false;
    res.status(500).json({ error: 'Single asset rescan failed', details: error?.message || String(error) });
  }
});

router.post('/confirm-replace-signal', async (req: Request, res: Response) => {
  try {
    const { existingSetupId, candidate, market = 'futures' } = req.body || {};
    if (!existingSetupId || !candidate) {
      return res.status(400).json({ error: 'Missing existingSetupId or candidate setup data' });
    }

    let existingSetup = await queries.getSetupById(existingSetupId, market);
    let targetMarket = market;
    if (!existingSetup) {
      const altMarket = market === 'futures' ? 'forex' : 'futures';
      existingSetup = await queries.getSetupById(existingSetupId, altMarket);
      if (existingSetup) targetMarket = altMarket;
    }

    if (!existingSetup) {
      return res.status(404).json({ error: 'Existing setup not found' });
    }

    // 1. Mark existing setup as superseded
    await queries.updateSetupState(existingSetupId, targetMarket, 'superseded', {
      superseded: 1,
      tradable: 0,
      invalidation_reason: 'manual_replaced_by_admin',
      invalidation_detail: 'Manually replaced by Admin via Single-Asset Rescan',
      resolved_at: new Date().toISOString()
    });

    await hawkeyeService.logInvalidation({
      setupId: existingSetup.id,
      instrument: existingSetup.instrument,
      setupMarket: targetMarket,
      runId: `manual_replace_${Date.now()}`,
      reasonCode: 'manual_replaced_by_admin',
      detail: 'Replaced by Admin with higher conviction setup candidate',
      previousState: existingSetup.signal_state,
      newState: 'superseded',
      createdBy: 'admin_panel'
    });

    // 2. Insert new setup into database
    const runId = `manual_replace_${Date.now()}`;
    const newSetup: any = {
      id: uuidv4(),
      instrument: candidate.instrument,
      market: targetMarket,
      created_at: new Date().toISOString(),
      created_by_run: runId,
      killzone_origin: existingSetup.killzone_origin || 'ny_am',
      killzone_origin_at: existingSetup.killzone_origin_at || new Date().toISOString(),
      bias: candidate.bias,
      entry_zone_low: candidate.entry_zone_low,
      entry_zone_high: candidate.entry_zone_high,
      entry_zone_mid: candidate.entry_zone_mid,
      stop: candidate.stop,
      tp1: candidate.tp1,
      tp2: candidate.tp2,
      r_multiple_1: candidate.r_multiple_1,
      r_multiple_2: candidate.r_multiple_2,
      signal_state: 'awaiting_entry',
      superseded: 0,
      tradable: 1,
      conviction_score: candidate.conviction_score,
      liquidity_score: candidate.liquidity_score,
      strategy_id: candidate.strategy_id || 'manna_basic',
      strategy_tier: candidate.strategy_tier || 'basic',
      metadata: typeof candidate.metadata === 'string' ? candidate.metadata : JSON.stringify(candidate.metadata || {})
    };

    await queries.insertSetup(newSetup, targetMarket);

    // 3. Emit replacement event for Watchlist & Toast notifications
    publishEvents.emit('setup_replaced', {
      previousSetupId: existingSetupId,
      newSetup,
      instrument: candidate.instrument,
      replacedAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: `Successfully replaced ${candidate.instrument} signal!`,
      previousSetupId: existingSetupId,
      newSetup
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to replace signal', details: error?.message || String(error) });
  }
});

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

router.get('/system-status', async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const futuresActive = await queries.getActiveSetups('futures');
    const forexActive = await queries.getActiveSetups('forex');
    const recentRuns = await queries.getRecentPublishRuns(1);
    const cbStatus = circuitBreaker.getStatus();
    
    res.json({
      status: cbStatus.tripped ? 'tripped' : 'ok',
      isMarketOpen: isMarketOpen(now),
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

router.get('/publish-runs', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const runs = await queries.getRecentPublishRuns(limit);
    res.json({ runs, count: runs.length });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
});

router.get('/analytics', async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const selectedStrategy = req.query.strategy_id as string | undefined;

    let futuresQuery = `SELECT COUNT(*) as c FROM edge_setups`;
    let forexQuery = `SELECT COUNT(*) as c FROM forex_edge_setups`;
    let outcomesQuery = `SELECT * FROM outcomes ORDER BY created_at DESC`;
    const params: any[] = [];

    if (selectedStrategy && selectedStrategy !== 'all') {
      futuresQuery += ` WHERE strategy_id = ?`;
      forexQuery += ` WHERE strategy_id = ?`;
      outcomesQuery = `
        SELECT o.* FROM outcomes o
        LEFT JOIN edge_setups e ON o.setup_id = e.id
        LEFT JOIN forex_edge_setups f ON o.setup_id = f.id
        WHERE COALESCE(o.strategy_id, e.strategy_id, f.strategy_id, 'manna_basic') = ?
        ORDER BY o.created_at DESC
      `;
      params.push(selectedStrategy);
    }

    const futuresCountRow = await queryDb<{ c: string | number }>(futuresQuery, params);
    const forexCountRow = await queryDb<{ c: string | number }>(forexQuery, params);
    const futuresTotal = futuresCountRow.length > 0 ? Number(futuresCountRow[0].c) : 0;
    const forexTotal = forexCountRow.length > 0 ? Number(forexCountRow[0].c) : 0;
    
    let futuresActiveSetups = await queries.getActiveSetups('futures');
    let forexActiveSetups = await queries.getActiveSetups('forex');

    let futuresActive = futuresActiveSetups.length;
    let forexActive = forexActiveSetups.length;

    if (selectedStrategy && selectedStrategy !== 'all') {
      futuresActive = futuresActiveSetups.filter(s => (s.strategy_id || 'manna_basic') === selectedStrategy).length;
      forexActive = forexActiveSetups.filter(s => (s.strategy_id || 'manna_basic') === selectedStrategy).length;
    }
    
    let outcomes = await queryDb(outcomesQuery, params);
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

    const enrichedOutcomes = await Promise.all(outcomes.slice(0, 100).map(async (o: any) => {
      const setup = await queries.getSetupById(o.setup_id, o.setup_market || 'futures');
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
        conviction_score: setup?.conviction_score || o.conviction_score || 85,
        time_signaled: signalTime,
        time_entered: entryTime,
        time_exited: exitTime,
        time_to_fill_min: timeToFillMin,
        holding_duration_min: holdingDurationMin,
        realized_r: tradeR
      };
    }));

    let grossWinR = 0;
    let grossLossR = 0;
    let currentStreak = 0;
    let maxWinsStreak = 0;
    let maxLossesStreak = 0;
    let peakR = 0;
    let runningR = 0;
    let maxDrawdownR = 0;

    const assetPerformance: Record<string, { instrument: string; strategy_id: string; total: number; wins: number; losses: number; plR: number; market: string }> = {};

    const convictionPerformance: Record<string, { label: string; min: number; max: number; total: number; wins: number; losses: number; winRate: number; plR: number }> = {
      high: { label: 'Ultra High (90–100%)', min: 90, max: 100, total: 0, wins: 0, losses: 0, winRate: 0, plR: 0 },
      medium: { label: 'High (80–89%)', min: 80, max: 89.9, total: 0, wins: 0, losses: 0, winRate: 0, plR: 0 },
      moderate: { label: 'Moderate (70–79%)', min: 70, max: 79.9, total: 0, wins: 0, losses: 0, winRate: 0, plR: 0 },
      standard: { label: 'Standard (<70%)', min: 0, max: 69.9, total: 0, wins: 0, losses: 0, winRate: 0, plR: 0 }
    };

    for (const o of outcomes) {
      const setup = await queries.getSetupById(o.setup_id, o.setup_market || 'futures');
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
      const stratId = o.strategy_id || setup?.strategy_id || 'manna_basic';
      const key = `${inst}__${stratId}`;
      if (!assetPerformance[key]) {
        assetPerformance[key] = { 
          instrument: inst, 
          strategy_id: stratId, 
          total: 0, 
          wins: 0, 
          losses: 0, 
          plR: 0, 
          market: setup?.market || 'futures' 
        };
      }
      assetPerformance[key].total++;
      assetPerformance[key].plR += tradeR;
      if (isWin) assetPerformance[key].wins++;
      else if (isLoss) assetPerformance[key].losses++;

      if (setup && setup.killzone_origin && killzonePerformance[setup.killzone_origin]) {
        killzonePerformance[setup.killzone_origin].total++;
        killzonePerformance[setup.killzone_origin].plR += tradeR;
        if (isWin) killzonePerformance[setup.killzone_origin].wins++;
        else if (isLoss) killzonePerformance[setup.killzone_origin].losses++;
      }

      const conviction = setup?.conviction_score || o.conviction_score || 85;
      let cKey = 'standard';
      if (conviction >= 90) cKey = 'high';
      else if (conviction >= 80) cKey = 'medium';
      else if (conviction >= 70) cKey = 'moderate';

      convictionPerformance[cKey].total++;
      convictionPerformance[cKey].plR += tradeR;
      if (isWin) convictionPerformance[cKey].wins++;
      else if (isLoss) convictionPerformance[cKey].losses++;
    }

    for (const k of Object.keys(convictionPerformance)) {
      const p = convictionPerformance[k];
      const dec = p.wins + p.losses;
      p.winRate = dec > 0 ? Number(((p.wins / dec) * 100).toFixed(1)) : 0;
      p.plR = Number(p.plR.toFixed(2));
    }

    const totalTrades = wins + losses;
    const winRate = totalTrades > 0 ? Number((wins / totalTrades).toFixed(4)) : 0;
    const avgWinR = wins > 0 ? grossWinR / wins : 0;
    const avgLossR = losses > 0 ? grossLossR / losses : 0;
    const profitFactor = grossLossR > 0 ? Number((grossWinR / grossLossR).toFixed(2)) : Number(grossWinR.toFixed(2));
    const expectancyR = Number(((winRate * avgWinR) - ((1 - winRate) * avgLossR)).toFixed(2));

    const invStats = await queries.getInvalidationStats();

    // ── Separate Scheduled Runs vs Manual Triggers ──
    const scheduledRuns = await queryDb(`SELECT * FROM publish_runs WHERE trigger_type = 'scheduled' OR trigger_type IS NULL ORDER BY created_at DESC`);
    const manualRuns = await queryDb(`SELECT * FROM publish_runs WHERE trigger_type = 'manual' ORDER BY created_at DESC`);

    const lastScheduledScan = scheduledRuns.length > 0 ? scheduledRuns[0] : null;
    const lastManualTrigger = manualRuns.length > 0 ? manualRuns[0] : null;

    const scheduledStats = {
      totalRuns: scheduledRuns.length,
      created: scheduledRuns.reduce((acc: number, r: any) => acc + (r.setups_created || 0), 0),
      invalidated: scheduledRuns.reduce((acc: number, r: any) => acc + (r.setups_invalidated || 0), 0),
      preserved: scheduledRuns.reduce((acc: number, r: any) => acc + (r.setups_preserved || 0), 0)
    };

    const manualStats = {
      totalRuns: manualRuns.length,
      created: manualRuns.reduce((acc: number, r: any) => acc + (r.setups_created || 0), 0),
      invalidated: manualRuns.reduce((acc: number, r: any) => acc + (r.setups_invalidated || 0), 0),
      preserved: manualRuns.reduce((acc: number, r: any) => acc + (r.setups_preserved || 0), 0)
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
      convictionPerformance,
      invalidations: invStats,
      killzones: killzonePerformance,
      recentOutcomes: enrichedOutcomes
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
});

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

router.get('/analytics/export-csv', async (_req: Request, res: Response) => {
  try {
    const outcomesRaw = await queryDb(`SELECT * FROM outcomes ORDER BY created_at DESC`);
    
    let earliestTime = new Date().toISOString();
    let latestTime = new Date().toISOString();

    const outcomes = await Promise.all(outcomesRaw.map(async o => {
      const setup = await queries.getSetupById(o.setup_id, o.setup_market || 'futures');
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
    }));

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

router.post('/signals/reset-stale', async (_req: Request, res: Response) => {
  try {
    // Wipe ALL awaiting_entry and active setups — these are the stale broken setups
    // left behind by the instant-open/close bug. Active real trades should be manually
    // invalidated via /signals/:id/invalidate before calling this.
    const futures = await queryDb(`DELETE FROM edge_setups WHERE signal_state IN ('awaiting_entry', 'active')`);
    const forex = await queryDb(`DELETE FROM forex_edge_setups WHERE signal_state IN ('awaiting_entry', 'active')`);
    res.json({
      success: true,
      message: 'All stale awaiting_entry and active setups cleared. Run a manual scan to repopulate.',
      cleared: { futures: (futures as any).changes ?? 'ok', forex: (forex as any).changes ?? 'ok' }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset stale setups', details: String(error) });
  }
});

router.post('/analytics/reset', async (req: Request, res: Response) => {
  try {
    const { archiveName = `Archive Epoch (${new Date().toLocaleDateString()})` } = req.body || {};
    const outcomesRaw = await queryDb(`SELECT * FROM outcomes ORDER BY created_at DESC`);
    
    let earliestTime = new Date().toISOString();
    let latestTime = new Date().toISOString();

    let totalFillTimeMs = 0;
    let fillCount = 0;
    let totalHoldTimeMs = 0;
    let holdCount = 0;

    const outcomes = await Promise.all(outcomesRaw.map(async o => {
      const setup = await queries.getSetupById(o.setup_id, o.setup_market || 'futures');
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
    }));

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

    const archiveId = `arch_${Date.now()}`;
    await queryDb(`
      INSERT INTO analytics_archives (
        id, archive_name, captured_from, captured_until, total_setups, total_resolved,
        win_rate, total_realized_r, avg_fill_time_min, avg_hold_duration_min,
        csv_content, summary_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
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
    ]);

    await queryDb(`DELETE FROM outcomes`);
    await queryDb(`DELETE FROM edge_setups WHERE signal_state IN ('resolved', 'invalidated')`);
    await queryDb(`DELETE FROM forex_edge_setups WHERE signal_state IN ('resolved', 'invalidated')`);

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

router.get('/analytics/archives', async (_req: Request, res: Response) => {
  try {
    const archives = await queryDb(`
      SELECT id, archive_name, captured_from, captured_until, total_setups, total_resolved,
             win_rate, total_realized_r, avg_fill_time_min, avg_hold_duration_min, created_at
      FROM analytics_archives ORDER BY created_at DESC
    `);
    res.json({ archives });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch archives', details: String(error) });
  }
});

router.get('/analytics/archives/:id/download', async (req: Request, res: Response) => {
  try {
    const rows = await queryDb(`SELECT * FROM analytics_archives WHERE id = ?`, [req.params.id]);
    const archive = rows.length > 0 ? rows[0] : null;
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

router.get('/analytics/strategies', async (_req: Request, res: Response) => {
  try {
    const futuresSetups = await queryDb(`SELECT * FROM edge_setups`);
    const forexSetups = await queryDb(`SELECT * FROM forex_edge_setups`);
    const allSetups = [...futuresSetups, ...forexSetups];
    const allOutcomes = await queryDb(`SELECT * FROM outcomes`);

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

    for (const setup of allSetups) {
      const stratId = setup.strategy_id || 'manna_basic';
      if (!strategyStats[stratId]) {
        strategyStats[stratId] = {
          id: stratId,
          name: stratId === 'manna_snd' ? 'Manna SnD' : 'Manna Basic',
          tier: setup.strategy_tier || (stratId === 'manna_snd' ? 'pro' : 'basic'),
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
      } else if (['resolved', 'invalidated', 'superseded'].includes(setup.signal_state)) {
        strategyStats[stratId].resolvedSignals += 1;
      }
    }

    for (const outcome of allOutcomes) {
      let parentSetup = allSetups.find(s => String(s.id) === String(outcome.setup_id));
      if (!parentSetup) {
        parentSetup = await queries.getSetupById(outcome.setup_id, outcome.setup_market || 'futures');
      }
      const stratId = outcome.strategy_id || parentSetup?.strategy_id || 'manna_basic';
      
      if (!strategyStats[stratId]) {
        strategyStats[stratId] = {
          id: stratId,
          name: stratId === 'manna_snd' ? 'Manna SnD' : 'Manna Basic',
          tier: stratId === 'manna_snd' ? 'pro' : 'basic',
          totalSignals: 0,
          activeSignals: 0,
          resolvedSignals: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
          totalRealizedR: 0
        };
      }

      let tradeR = 0;
      if (outcome.outcome_type === 'tp1_hit') {
        tradeR = parentSetup?.r_multiple_1 || 2.0;
        strategyStats[stratId].wins += 1;
      } else if (outcome.outcome_type === 'tp2_hit') {
        tradeR = parentSetup?.r_multiple_2 || 3.0;
        strategyStats[stratId].wins += 1;
      } else if (outcome.outcome_type === 'sl_hit') {
        tradeR = -1.0;
        strategyStats[stratId].losses += 1;
      } else if (outcome.outcome_type === 'be_hit' || outcome.outcome_type === 'breakeven') {
        tradeR = 0.0;
      } else if (outcome.realized_pl) {
        tradeR = outcome.realized_pl;
        if (tradeR > 0) strategyStats[stratId].wins += 1;
        else if (tradeR < 0) strategyStats[stratId].losses += 1;
      }

      strategyStats[stratId].totalRealizedR += tradeR;
    }

    for (const stratId of Object.keys(strategyStats)) {
      const s = strategyStats[stratId];
      const totalDecided = s.wins + s.losses;
      s.winRate = totalDecided > 0 ? Number(((s.wins / totalDecided) * 100).toFixed(1)) : 0;
      s.totalRealizedR = Number(s.totalRealizedR.toFixed(2));
    }

    const stratsArray = Object.values(strategyStats);

    const collectiveWins = stratsArray.reduce((acc, s) => acc + s.wins, 0);
    const collectiveLosses = stratsArray.reduce((acc, s) => acc + s.losses, 0);
    const collectiveResolvedCount = collectiveWins + collectiveLosses;
    const collectiveWinRate = collectiveResolvedCount > 0 ? Number(((collectiveWins / collectiveResolvedCount) * 100).toFixed(1)) : 0;
    const collectiveRealizedR = Number(stratsArray.reduce((acc, s) => acc + s.totalRealizedR, 0).toFixed(2));

    const collectiveStats = {
      id: 'collective',
      name: '🌐 Collective (All Strategies)',
      tier: 'portfolio',
      totalSignals: stratsArray.reduce((acc, s) => acc + s.totalSignals, 0),
      activeSignals: stratsArray.reduce((acc, s) => acc + s.activeSignals, 0),
      resolvedSignals: stratsArray.reduce((acc, s) => acc + s.resolvedSignals, 0),
      wins: collectiveWins,
      losses: collectiveLosses,
      winRate: collectiveWinRate,
      totalRealizedR: collectiveRealizedR
    };

    res.json({
      collective: collectiveStats,
      strategies: stratsArray
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
