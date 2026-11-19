import express, { Request, Response } from 'express';
import * as queries from '../db/queries';
import { queryDb } from '../db/database';
import { getCurrentKillzone, getNextKillzoneBoundary } from '../scheduler/killzone-mapper';
import { earlyScanService } from '../scheduler/early-scan-service';
import { getLiveCurrentPrice, getLiveCandles, getLiveQuoteDetails, prefetchLiveQuotes } from '../discovery/yahoo-provider';
import { calculateAssetMatrix } from '../analytics/decision-matrix';
import { outcomeDetector } from '../outcomes/outcome-detector';
import { getIBKRGatewayStatus } from '../discovery/ib-provider';
import { isCtraderConnected } from '../discovery/ctrader-provider';
import { findUserByEmail } from '../db/user-store';

const router = express.Router();

async function getIbkrPriceInfo(instrument: string): Promise<{ ibkrPrice: number | null, isIbkrFresh: boolean }> {
  if (instrument.includes('/')) {
    return { ibkrPrice: null, isIbkrFresh: false };
  }
  try {
    const rows = await queryDb('SELECT price, updated_at FROM instrument_prices WHERE instrument = ?', [instrument]);
    if (rows && rows.length > 0) {
      const price = Number(rows[0].price);
      const updatedAt = new Date(rows[0].updated_at).getTime();
      const isFresh = (Date.now() - updatedAt) < 30 * 1000;
      return { ibkrPrice: price, isIbkrFresh: isFresh };
    }
  } catch (err) {
    // ignore
  }
  return { ibkrPrice: null, isIbkrFresh: false };
}

async function prefetchIbkrPriceInfoMap(
  instruments: string[]
): Promise<Map<string, { ibkrPrice: number | null; isIbkrFresh: boolean }>> {
  const map = new Map<string, { ibkrPrice: number | null; isIbkrFresh: boolean }>();
  const uniqueFutures = Array.from(new Set(instruments.filter((i) => i && !i.includes('/'))));
  if (uniqueFutures.length === 0) return map;
  await Promise.all(
    uniqueFutures.map(async (inst) => {
      map.set(inst, await getIbkrPriceInfo(inst));
    })
  );
  return map;
}

function isStrategyVisible(rawStrategyId: string | undefined, hiddenIds: string[]): boolean {
  const sId = (rawStrategyId || 'sentinel_v2').trim().toLowerCase();
  const normalized = (sId === 'sentinel_v2' || sId === 'sentinel' || sId === 'manna_basic' || sId === 'sentinel_v1' || sId === 'manna_elite' || sId === 'manna_elite_v1_2')
    ? 'sentinel_v2'
    : sId;
  return !hiddenIds.includes(normalized) && !hiddenIds.includes(sId);
}

router.get('/system/maintenance', async (_req: Request, res: Response) => {
  try {
    const maintenance = await queries.getMaintenanceState();
    res.json(maintenance);
  } catch (error: any) {
    res.status(500).json({ enabled: false, message: 'Maintenance check failed', estimatedReturnTime: 'Asia Session Today' });
  }
});

router.get('/accelerate/active-setups', async (req: Request, res: Response) => {
  try {
    const role = (req.query.role as string) || 'trader';
    const email = (req.query.email as string) || (req.query.userEmail as string) || '';

    if (!email) {
      return res.status(401).json({ success: false, error: 'Authentication required. Please sign in to view live signals.', setups: [] });
    }

    if (role !== 'admin' && role !== 'super_admin') {
      const userProfile = await findUserByEmail(email);
      if (userProfile) {
        const isTrialExpired = userProfile.isTrial && (
          userProfile.trialExpired || 
          (userProfile.trialExpiresAt && new Date(userProfile.trialExpiresAt).getTime() <= Date.now())
        );
        if (userProfile.status === 'expired' || isTrialExpired) {
          return res.status(403).json({
            success: false,
            trialExpired: true,
            error: 'Your 14-day free trial has concluded. Please fill out an access request to continue.',
            setups: []
          });
        }
      }
    }

    const maintenance = await queries.getMaintenanceState();
    if (maintenance.enabled && role !== 'admin' && role !== 'super_admin') {
      return res.json({
        success: true,
        maintenanceMode: true,
        maintenanceMessage: maintenance.message,
        estimatedReturnTime: maintenance.estimatedReturnTime,
        setups: []
      });
    }

    outcomeDetector.triggerBackgroundEvaluation();
    const market = (req.query.market as string) || 'all';
    const [initialRawSetups, allOutcomes, hiddenIds, disabledAssets] = await Promise.all([
      market === 'all' ? queries.getAllActiveSetups() : queries.getActiveSetups(market),
      queryDb(`SELECT setup_id FROM outcomes`),
      queries.getHiddenStrategyIdsForRole(role, email),
      queries.getDisabledDisplayAssets()
    ]);

    const resolvedIds = new Set(allOutcomes.map((o: any) => String(o.setup_id)));
    const assetVisibility = (req.query.asset_visibility || req.query.asset_filter || 'all').toString();

    let rawSetups = initialRawSetups;
    if (role === 'super_admin') {
      rawSetups = rawSetups.filter(s => !resolvedIds.has(String(s.id)));
      if (assetVisibility === 'displayed_only') {
        rawSetups = rawSetups.filter(s => !disabledAssets.includes(s.instrument));
      } else if (assetVisibility === 'hidden_only') {
        rawSetups = rawSetups.filter(s => disabledAssets.includes(s.instrument));
      }
    } else {
      rawSetups = rawSetups.filter(s => isStrategyVisible(s.strategy_id, hiddenIds) && !resolvedIds.has(String(s.id)) && !disabledAssets.includes(s.instrument));
    }

    const uniqueInstruments = Array.from(new Set(rawSetups.map((s: any) => s.instrument).filter(Boolean)));
    const uniqueStrategies = Array.from(new Set(rawSetups.map((s: any) => s.strategy_id || 'sentinel_v2')));
    const halvedFloorMap = new Map<string, boolean>();

    const [, ibkrMap] = await Promise.all([
      prefetchLiveQuotes(uniqueInstruments),
      prefetchIbkrPriceInfoMap(uniqueInstruments),
      Promise.all(
        uniqueStrategies.map(async (stratId) => {
          halvedFloorMap.set(stratId, await queries.isHalvedFloorTp1BeEnabled(stratId));
        })
      )
    ]);

    const enrichedSetups = await Promise.all(
      rawSetups.map(async (setup: any) => {
        const isAssetDisplayEnabled = !disabledAssets.includes(setup.instrument);
        const currentPrice = await getLiveCurrentPrice(setup.instrument);
        const { ibkrPrice, isIbkrFresh } = ibkrMap.get(setup.instrument) || { ibkrPrice: null, isIbkrFresh: false };
        const entryPrice = setup.entry_price_recorded || setup.entry_zone_mid;
        let initialStop = setup.initial_stop;

        // If initial_stop is missing or equal to entry (e.g. when stop moved to BE), infer original risk from TP1 / R1
        if (!initialStop || Math.abs(entryPrice - initialStop) < 0.000001) {
          const tpDist = Math.abs((setup.tp1 || 0) - entryPrice);
          const inferredRisk = (setup.r_multiple_1 && setup.r_multiple_1 > 0) ? (tpDist / setup.r_multiple_1) : (tpDist / 2.0);
          initialStop = setup.bias === 'long' ? (entryPrice - inferredRisk) : (entryPrice + inferredRisk);
        }

        const risk = Math.abs(entryPrice - initialStop);
        let unrealizedR: number | undefined = undefined;
        let unrealizedPL: number | undefined = undefined;
        let distanceToEntryR: number | undefined = undefined;

        if (risk > 0) {
          if (currentPrice >= setup.entry_zone_low && currentPrice <= setup.entry_zone_high) {
            distanceToEntryR = 0;
          } else {
            const distPrice = Math.abs(currentPrice - entryPrice);
            distanceToEntryR = Number((distPrice / risk).toFixed(2));
          }
        }

        if (setup.signal_state === 'active') {
          const isLong = setup.bias === 'long';
          const diff = isLong ? (currentPrice - entryPrice) : (entryPrice - currentPrice);

          unrealizedPL = Number(diff.toFixed(5));
          if (risk > 0) {
            unrealizedR = Number((diff / risk).toFixed(2));
          }
        }

        const stratKey = setup.strategy_id || 'sentinel_v2';
        const isTp1BeOnly = halvedFloorMap.get(stratKey) ?? false;
        const beThreshold = setup.strategy_id === 'sentinel_v2' ? 1.5 : 1.0;
        const isEarlyBeEligible = !isTp1BeOnly && (unrealizedR !== undefined && unrealizedR >= beThreshold);

        const isBreakeven = Boolean(
          setup.is_breakeven === 1 ||
          setup.is_breakeven === true ||
          setup.invalidation_reason === 'tp1_hit' ||
          isEarlyBeEligible
        );

        if (isBreakeven && !setup.is_breakeven && setup.signal_state === 'active') {
          setup.is_breakeven = 1;
          if (!setup.initial_stop) {
            setup.initial_stop = setup.stop;
          }
          setup.stop = entryPrice;
          const tbl = (setup.market || '').toLowerCase() === 'forex' ? 'forex_edge_setups' : 'edge_setups';
          queryDb(`UPDATE ${tbl} SET is_breakeven = 1, stop = ?, initial_stop = COALESCE(initial_stop, ?) WHERE id = ?`, [entryPrice, setup.stop, setup.id]).catch(() => {});
        }

        return {
          ...setup,
          current_price: currentPrice,
          ibkr_price: ibkrPrice,
          is_ibkr_fresh: isIbkrFresh,
          unrealized_pl: unrealizedPL,
          unrealizedR: unrealizedR,
          distance_to_entry_r: distanceToEntryR,
          is_breakeven: isBreakeven ? 1 : 0,
          halved_floor_tp1_be: isTp1BeOnly ? 1 : 0,
          asset_display_enabled: isAssetDisplayEnabled
        };
      })
    );

    const finalSetups = enrichedSetups
      .filter((s: any) => {
        const targetR1 = s.r_multiple_1 || 2.0;
        if (s.unrealizedR !== undefined) {
          if (s.unrealizedR >= targetR1 || s.unrealizedR <= -1.0) {
            return false; // Exclude cards that reached 2R (TP1) or -1R (SL)
          }
        }
        return true;
      })
      .map((setup: any) => {
        let metaObj: any = {};
        try { metaObj = typeof setup.metadata === 'string' ? JSON.parse(setup.metadata) : (setup.metadata || {}); } catch {}

      const oppSetup = enrichedSetups.find((other: any) => {
        if (other.id === setup.id) return false;
        const sInst = (setup.instrument || '').toUpperCase();
        const oInst = (other.instrument || '').toUpperCase();
        const sameInst = sInst === oInst;

        const indices = ['ES', 'NQ', 'YM', 'RTY'];
        const positiveDollar = ['EUR/USD', 'GBP/USD', 'AUD/USD', 'NZD/USD'];
        const inverseDollar = ['USD/JPY', 'USD/CAD', 'USD/CHF'];
        const allDollar = [...positiveDollar, ...inverseDollar];

        const sameGroup = (
          (indices.includes(sInst) && indices.includes(oInst)) ||
          (allDollar.includes(sInst) && allDollar.includes(oInst))
        );
        if (!sameInst && !sameGroup) return false;

        const otherStrat = other.strategy_id || 'sentinel_v2';
        const myStrat = setup.strategy_id || 'sentinel_v2';
        if (otherStrat === myStrat) return false;

        const getNorm = (inst: string, bias: string) => {
          const b = (bias || 'long').toLowerCase();
          if (inverseDollar.includes(inst)) return b === 'short' ? 'long' : 'short';
          return b;
        };

        return getNorm(sInst, setup.bias) !== getNorm(oInst, other.bias);
      });

      let opposingStrategyWarning: string | null = null;
      if (oppSetup) {
        const oppStratName = oppSetup.strategy_id === 'manna_snd' ? 'MANNA SND' : 'MANNA ELITE V1.2';
        opposingStrategyWarning = `⚠️ STRATEGY DIVERGENCE: ${oppStratName} currently has an opposing ${oppSetup.bias.toUpperCase()} setup on ${oppSetup.instrument}.`;
      }

      return {
        ...setup,
        opposing_strategy_warning: opposingStrategyWarning,
        correlation_note: metaObj.correlation_note || null,
        correlation_penalty_applied: metaObj.correlation_penalty_applied || false
      };
    });

    const filteredActiveSetups = finalSetups.filter((setup: any) => {
      if (setup.signal_state !== 'active' || !setup.current_price || !setup.stop) return true;
      const isLong = (setup.bias || 'long').toLowerCase() === 'long';
      const entryPrice = setup.entry_price_recorded || setup.entry_zone_mid;
      const initialStop = setup.initial_stop || setup.stop;
      const risk = Math.abs(entryPrice - initialStop);
      const tp2 = setup.tp2 || (isLong ? (entryPrice + risk * 3.0) : (entryPrice - risk * 3.0));

      if (isLong) {
        if (setup.current_price >= tp2) return false;
        if (setup.is_breakeven && setup.current_price <= setup.stop) return false;
        if (setup.current_price <= initialStop) return false;
      } else {
        if (setup.current_price <= tp2) return false;
        if (setup.is_breakeven && setup.current_price >= setup.stop) return false;
        if (setup.current_price >= initialStop) return false;
      }
      return true;
    });

    const kz = getCurrentKillzone(new Date());
    
    res.json({
      setups: filteredActiveSetups.sort((a: any, b: any) => (b.conviction_score || 0) - (a.conviction_score || 0)),
      count: filteredActiveSetups.length,
      killzone: kz?.killzone || 'unknown',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
});

router.get('/accelerate/runner-setups', async (req: Request, res: Response) => {
  try {
    const role = (req.query.role as string) || 'trader';
    const email = (req.query.email as string) || (req.query.userEmail as string) || '';
    
    if (!email) {
      return res.status(401).json({ success: false, error: 'Authentication required. Please sign in to view live signals.', setups: [] });
    }

    let [rawSetups, hiddenIds, disabledAssets] = await Promise.all([
      queries.getSetupsByState('runner'),
      queries.getHiddenStrategyIdsForRole(role, email),
      queries.getDisabledDisplayAssets()
    ]);

    // Auto-resolve any runners older than 5 days
    const nowMs = Date.now();
    const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
    const activeRunners: any[] = [];

    for (const setup of rawSetups) {
      let runnerStart = (setup as any).entryAt || setup.entry_triggered_at || setup.created_at;
      try {
        const meta = typeof setup.metadata === 'string' ? JSON.parse(setup.metadata) : setup.metadata;
        if (meta?.runner_started_at) runnerStart = meta.runner_started_at;
      } catch {}

      const startMs = runnerStart ? new Date(runnerStart).getTime() : 0;
      const isExpired = startMs > 0 && (nowMs - startMs) >= FIVE_DAYS_MS;

      if (isExpired) {
        await queries.updateSetupState(setup.id, setup.market || 'futures', 'resolved', {
          tradable: 0,
          resolved_at: new Date().toISOString(),
          invalidation_reason: 'runner_closed_5d'
        });
      } else {
        activeRunners.push(setup);
      }
    }

    rawSetups = activeRunners;

    if (role !== 'super_admin') {
      rawSetups = rawSetups.filter(s => isStrategyVisible(s.strategy_id, hiddenIds) && !disabledAssets.includes(s.instrument));
    } else {
      rawSetups = rawSetups.filter(s => isStrategyVisible(s.strategy_id, hiddenIds));
    }

    const uniqueInstruments = Array.from(new Set(rawSetups.map((s: any) => s.instrument).filter(Boolean)));
    const [, ibkrMap] = await Promise.all([
      prefetchLiveQuotes(uniqueInstruments),
      prefetchIbkrPriceInfoMap(uniqueInstruments)
    ]);

    const enrichedSetups = await Promise.all(
      rawSetups.map(async (setup: any) => {
        const currentPrice = await getLiveCurrentPrice(setup.instrument);
        const { ibkrPrice, isIbkrFresh } = ibkrMap.get(setup.instrument) || { ibkrPrice: null, isIbkrFresh: false };
        const entryPrice = setup.entry_price_recorded || setup.entry_zone_mid;
        let initialStop = setup.initial_stop || setup.stop;
        const risk = Math.abs(entryPrice - initialStop);

        const isLong = setup.bias === 'long';
        const diff = isLong ? (currentPrice - entryPrice) : (entryPrice - currentPrice);
        const unrealizedPL = Number(diff.toFixed(5));
        const unrealizedR = risk > 0 ? Number((diff / risk).toFixed(2)) : 2.0;

        const decimals = setup.market === 'forex' ? 5 : 2;
        const tp2 = setup.tp2 || Number((isLong ? (entryPrice + risk * 3.0) : (entryPrice - risk * 3.0)).toFixed(decimals));

        return {
          ...setup,
          tp2,
          current_price: currentPrice,
          ibkr_price: ibkrPrice,
          is_ibkr_fresh: isIbkrFresh,
          unrealized_pl: unrealizedPL,
          unrealizedR: unrealizedR,
          is_breakeven: 1,
          asset_display_enabled: !disabledAssets.includes(setup.instrument)
        };
      })
    );

    res.json({
      setups: enrichedSetups,
      count: enrichedSetups.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
});

router.get('/accelerate/past-setups', async (req: Request, res: Response) => {
  try {
    const market = (req.query.market as string) || 'all';
    const role = (req.query.role as string) || 'trader';
    const email = (req.query.email as string) || (req.query.userEmail as string) || '';
    const limit = parseInt(req.query.limit as string) || 50;
    let setups;
    if (market === 'all') {
      setups = await queries.getAllPastSetups(limit);
    } else {
      setups = await queries.getPastSetups(market, limit);
    }
    
    const hiddenIds = await queries.getHiddenStrategyIdsForRole(role, email);
    const disabledAssets = await queries.getDisabledDisplayAssets();
    if (role !== 'super_admin') {
      setups = setups.filter(s => isStrategyVisible(s.strategy_id, hiddenIds) && !disabledAssets.includes(s.instrument));
    } else {
      setups = setups.filter(s => isStrategyVisible(s.strategy_id, hiddenIds));
    }
    
    res.json({ setups, count: setups.length });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
});

router.get('/setups/:id', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const market = (req.query.market as string) || 'futures';
    
    const setup = await queries.getSetupById(id, market);
    if (!setup) {
      return res.status(404).json({ error: 'Setup not found' });
    }
    
    const history = await queries.getSetupHistory(id, market);
    const outcomes = await queries.getOutcomesBySetup(id);
    
    res.json({ setup, history, outcomes });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
});

router.get('/candles/:instrument', async (req: Request, res: Response) => {
  try {
    const rawParam = Array.isArray(req.params.instrument) ? req.params.instrument[0] : req.params.instrument;
    const instrument = decodeURIComponent(rawParam);
    const timeframe = (req.query.timeframe as any) || '15m';
    const count = parseInt(req.query.count as string) || 150;
    const candles = await getLiveCandles(instrument, timeframe, count);
    const quote = await getLiveQuoteDetails(instrument).catch(() => null);
    const isForex = instrument.includes('/');
    const isCt = isForex && isCtraderConnected();
    const provider = isForex ? (isCt ? 'IC MARKETS RAW ECN' : 'TWELVE DATA') : 'FUTURES';
    res.json({ instrument, timeframe, candles, quote, provider, isCtrader: isCt });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch candles', details: error instanceof Error ? error.message : String(error) });
  }
});

router.get('/accelerate/decision-matrix', async (req: Request, res: Response) => {
  try {
    const market = (req.query.market as string) || 'all';
    const role = (req.query.role as string) || 'trader';
    const email = (req.query.email as string) || (req.query.userEmail as string) || '';
    
    let [rawSetups, hiddenIds, disabledAssets] = await Promise.all([
      market === 'all' ? queries.getAllActiveSetups() : queries.getActiveSetups(market),
      queries.getHiddenStrategyIdsForRole(role, email),
      queries.getDisabledDisplayAssets()
    ]);

    if (role !== 'super_admin') {
      rawSetups = rawSetups.filter(s => isStrategyVisible(s.strategy_id, hiddenIds) && !disabledAssets.includes(s.instrument));
    } else {
      rawSetups = rawSetups.filter(s => isStrategyVisible(s.strategy_id, hiddenIds));
    }

    const uniqueInstruments = Array.from(new Set(rawSetups.map((s: any) => s.instrument).filter(Boolean)));
    const [, ibkrMap] = await Promise.all([
      prefetchLiveQuotes(uniqueInstruments),
      prefetchIbkrPriceInfoMap(uniqueInstruments)
    ]);

    const priceMap: Record<string, number> = {};
    const enrichedSetups = await Promise.all(
      rawSetups.map(async (setup: any) => {
        const currentPrice = await getLiveCurrentPrice(setup.instrument);
        const { ibkrPrice, isIbkrFresh } = ibkrMap.get(setup.instrument) || { ibkrPrice: null, isIbkrFresh: false };
        if (currentPrice) {
          priceMap[setup.instrument] = currentPrice;
        }
        return {
          ...setup,
          current_price: currentPrice,
          ibkr_price: ibkrPrice,
          is_ibkr_fresh: isIbkrFresh
        };
      })
    );

    const matrixItems = calculateAssetMatrix(enrichedSetups, priceMap);
    const topFocus = matrixItems.length > 0 ? matrixItems[0] : null;

    res.json({
      matrix: matrixItems,
      topFocus,
      count: matrixItems.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
});

router.get('/diagnostics/ibkr', (req: Request, res: Response) => {
  try {
    res.json(getIBKRGatewayStatus());
  } catch (error: any) {
    res.status(500).json({ error: error.message || String(error) });
  }
});

router.get('/scan-status', async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const currentKz = getCurrentKillzone(now);
    const nextBoundary = getNextKillzoneBoundary(now);
    
    // Fetch last completed publish runs from DB
    const recentRuns = await queries.getRecentPublishRuns(10);
    const lastRun = recentRuns.find((r: any) => r.run_state !== 'running' && r.run_state !== 'failed') || (recentRuns.length > 0 ? recentRuns[0] : null);
    const lastScheduledRun = recentRuns.find((r: any) => (r.trigger_type === 'scheduled' || !r.trigger_type) && r.run_state !== 'running') || null;
    const lastManualRun = recentRuns.find((r: any) => r.trigger_type === 'manual' && r.run_state !== 'running') || null;

    // Dynamic pre-news scan status
    const earlyStatus = earlyScanService.getStatus(now);

    res.json({
      success: true,
      serverTime: now.toISOString(),
      currentKillzone: currentKz,
      nextBoundary,
      lastRun: lastRun ? {
        id: lastRun.id,
        run_timestamp: lastRun.run_timestamp,
        created_at: lastRun.created_at,
        killzone: lastRun.killzone,
        market: lastRun.market,
        trigger_type: lastRun.trigger_type || 'scheduled',
        run_mode: lastRun.run_mode,
        run_state: lastRun.run_state,
        setups_created: lastRun.setups_created || 0,
        setups_invalidated: lastRun.setups_invalidated || 0,
        setups_preserved: lastRun.setups_preserved || 0
      } : null,
      lastScheduledRun: lastScheduledRun ? {
        id: lastScheduledRun.id,
        run_timestamp: lastScheduledRun.run_timestamp,
        created_at: lastScheduledRun.created_at,
        killzone: lastScheduledRun.killzone,
        market: lastScheduledRun.market,
        trigger_type: 'scheduled',
        setups_created: lastScheduledRun.setups_created || 0
      } : null,
      lastManualRun: lastManualRun ? {
        id: lastManualRun.id,
        run_timestamp: lastManualRun.run_timestamp,
        created_at: lastManualRun.created_at,
        killzone: lastManualRun.killzone,
        market: lastManualRun.market,
        trigger_type: 'manual',
        setups_created: lastManualRun.setups_created || 0
      } : null,
      earlyScan: {
        hasEarlyScanToday: earlyStatus.hasEarlyScanToday,
        isEarlyScanNeeded: earlyStatus.isEarlyScanNeeded,
        hasCompletedToday: earlyStatus.hasCompletedToday,
        scanHour: earlyStatus.scanHour,
        scanMinute: earlyStatus.scanMinute,
        earlyScanTimeET: earlyStatus.earlyScanTimeET,
        isStandardTimeScan: earlyStatus.isStandardTimeScan
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || String(error) });
  }
});

// ============================================================================
// PUBLIC / CLIENT VERIFIED RECORD WALL ROUTES
// ============================================================================

router.get('/record-wall', async (req: Request, res: Response) => {
  try {
    const { getPublicRecordWall } = await import('../analytics/daily-ledger-service');
    const day = req.query.day ? String(req.query.day) : undefined;
    const market = (req.query.market ? String(req.query.market) : 'all') as 'all' | 'futures' | 'forex';
    const style = (req.query.style ? String(req.query.style) : 'all') as 'all' | 'intraday' | 'scalp' | 'swing';
    const status = req.query.status ? String(req.query.status) : 'all';

    const wall = await getPublicRecordWall({ day, market, style, status });
    return res.json({ success: true, ...wall });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || String(error) });
  }
});

router.get('/record-wall/:day/export', async (req: Request, res: Response) => {
  try {
    const day = String(req.params.day || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return res.status(400).json({ success: false, error: 'Valid YYYY-MM-DD day parameter is required' });
    }
    const { getPublicRecordWallDay, formatDailyLedgerCsv } = await import('../analytics/daily-ledger-service');
    const market = (req.query.market ? String(req.query.market) : 'all') as 'all' | 'futures' | 'forex';
    const style = (req.query.style ? String(req.query.style) : 'all') as 'all' | 'intraday' | 'scalp' | 'swing';
    const status = req.query.status ? String(req.query.status) : 'all';

    const result = await getPublicRecordWallDay(day, { market, style, status });
    if (!result.enabled || !result.published || !result.ledger) {
      return res.status(404).json({ success: false, error: 'Published record wall day not found or disabled' });
    }

    const csv = formatDailyLedgerCsv(result.ledger);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="manna-verified-record-${day}.csv"`);
    return res.send(csv);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || String(error) });
  }
});

router.get('/record-wall/:day', async (req: Request, res: Response) => {
  try {
    const day = String(req.params.day || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return res.status(400).json({ success: false, error: 'Valid YYYY-MM-DD day parameter is required' });
    }
    const { getPublicRecordWallDay } = await import('../analytics/daily-ledger-service');
    const market = (req.query.market ? String(req.query.market) : 'all') as 'all' | 'futures' | 'forex';
    const style = (req.query.style ? String(req.query.style) : 'all') as 'all' | 'intraday' | 'scalp' | 'swing';
    const status = req.query.status ? String(req.query.status) : 'all';

    const result = await getPublicRecordWallDay(day, { market, style, status });
    if (!result.enabled || !result.published || !result.ledger) {
      return res.status(404).json({ success: false, error: 'Published record wall day not found or disabled' });
    }

    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || String(error) });
  }
});

export default router;
