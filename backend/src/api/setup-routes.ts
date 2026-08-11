import express, { Request, Response } from 'express';
import * as queries from '../db/queries';
import { queryDb } from '../db/database';
import { getCurrentKillzone } from '../scheduler/killzone-mapper';
import { getLiveCurrentPrice, getLiveCandles } from '../discovery/yahoo-provider';
import { calculateAssetMatrix } from '../analytics/decision-matrix';
import { outcomeDetector } from '../outcomes/outcome-detector';

const router = express.Router();

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

    await outcomeDetector.evaluateAllSetups(true);
    const market = (req.query.market as string) || 'all';
    let rawSetups;
    if (market === 'all') {
      rawSetups = await queries.getAllActiveSetups();
    } else {
      rawSetups = await queries.getActiveSetups(market);
    }

    const allOutcomes = await queryDb(`SELECT setup_id FROM outcomes`);
    const resolvedIds = new Set(allOutcomes.map((o: any) => String(o.setup_id)));

    const hiddenIds = await queries.getHiddenStrategyIdsForRole(role, email);
    rawSetups = rawSetups.filter(s => !hiddenIds.includes(s.strategy_id || 'sentinel_v2') && !resolvedIds.has(String(s.id)));



    const enrichedSetups = await Promise.all(
      rawSetups.map(async (setup: any) => {
        const currentPrice = await getLiveCurrentPrice(setup.instrument);
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

        const isBreakeven = Boolean(
          setup.is_breakeven === 1 ||
          setup.is_breakeven === true ||
          setup.invalidation_reason === 'tp1_hit' ||
          (unrealizedR !== undefined && unrealizedR >= 1.0)
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
          unrealized_pl: unrealizedPL,
          unrealizedR: unrealizedR,
          distance_to_entry_r: distanceToEntryR,
          is_breakeven: isBreakeven ? 1 : 0
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
        const sameInst = other.instrument === setup.instrument;
        const sameGroup = (
          (['ES', 'NQ', 'YM'].includes(setup.instrument.toUpperCase()) && ['ES', 'NQ', 'YM'].includes(other.instrument.toUpperCase())) ||
          (['EUR/USD', 'GBP/USD', 'AUD/USD', 'USD/JPY'].includes(setup.instrument.toUpperCase()) && ['EUR/USD', 'GBP/USD', 'AUD/USD', 'USD/JPY'].includes(other.instrument.toUpperCase()))
        );
        if (!sameInst && !sameGroup) return false;

        const otherStrat = other.strategy_id || 'sentinel_v2';
        const myStrat = setup.strategy_id || 'sentinel_v2';
        return other.bias !== setup.bias && otherStrat !== myStrat;
      });

      let opposingStrategyWarning: string | null = null;
      if (oppSetup) {
        const oppStratName = oppSetup.strategy_id === 'manna_snd' ? 'MANNA SND' : 'MANNA ELITE V1';
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

    let rawSetups = await queries.getSetupsByState('runner');
    const hiddenIds = await queries.getHiddenStrategyIdsForRole(role, email);
    rawSetups = rawSetups.filter(s => !hiddenIds.includes(s.strategy_id || 'sentinel_v2'));

    const enrichedSetups = await Promise.all(
      rawSetups.map(async (setup: any) => {
        const currentPrice = await getLiveCurrentPrice(setup.instrument);
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
          unrealized_pl: unrealizedPL,
          unrealizedR: unrealizedR,
          is_breakeven: 1
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
    setups = setups.filter(s => !hiddenIds.includes(s.strategy_id || 'sentinel_v2'));
    
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
    res.json({ instrument, timeframe, candles });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch candles', details: error instanceof Error ? error.message : String(error) });
  }
});

router.get('/accelerate/decision-matrix', async (req: Request, res: Response) => {
  try {
    const market = (req.query.market as string) || 'all';
    const role = (req.query.role as string) || 'trader';
    const email = (req.query.email as string) || (req.query.userEmail as string) || '';
    
    let rawSetups;
    if (market === 'all') {
      rawSetups = await queries.getAllActiveSetups();
    } else {
      rawSetups = await queries.getActiveSetups(market);
    }

    const hiddenIds = await queries.getHiddenStrategyIdsForRole(role, email);
    rawSetups = rawSetups.filter(s => !hiddenIds.includes(s.strategy_id || 'sentinel_v2'));

    const priceMap: Record<string, number> = {};
    const enrichedSetups = await Promise.all(
      rawSetups.map(async (setup: any) => {
        const currentPrice = await getLiveCurrentPrice(setup.instrument);
        if (currentPrice) {
          priceMap[setup.instrument] = currentPrice;
        }
        return {
          ...setup,
          current_price: currentPrice
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

export default router;
