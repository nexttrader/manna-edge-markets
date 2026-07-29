import express, { Request, Response } from 'express';
import * as queries from '../db/queries';
import { getCurrentKillzone } from '../scheduler/killzone-mapper';
import { getLiveCurrentPrice, getLiveCandles } from '../discovery/yahoo-provider';

const router = express.Router();

router.get('/accelerate/active-setups', async (req: Request, res: Response) => {
  try {
    const market = (req.query.market as string) || 'all';
    let rawSetups;
    if (market === 'all') {
      rawSetups = queries.getAllActiveSetups();
    } else {
      rawSetups = queries.getActiveSetups(market);
    }

    // Auto-replenish if active setups in DB drop below 3
    if (rawSetups.length < 3) {
      setTimeout(async () => {
        try {
          const { discoverUnifiedSetups } = await import('../discovery/unified-discovery');
          const { executePublishRun } = await import('../publish-gate/publish-gate');
          const now = new Date();
          const kzInfo = getCurrentKillzone(now);
          const runId = `auto_replenish_${Date.now()}`;
          const { futures, forex } = await discoverUnifiedSetups(kzInfo, runId, 'both');
          await executePublishRun(kzInfo, futures, forex, 'live', 'manual');
        } catch {}
      }, 50);
    }

    const enrichedSetups = await Promise.all(
      rawSetups.map(async (setup: any) => {
        const currentPrice = await getLiveCurrentPrice(setup.instrument);
        const entryPrice = setup.entry_price_recorded || setup.entry_zone_mid;
        const risk = Math.abs(entryPrice - setup.stop);
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

        const isBreakeven = (unrealizedR !== undefined && unrealizedR >= 1.0) || setup.invalidation_reason === 'tp1_hit';

        return {
          ...setup,
          current_price: currentPrice,
          unrealized_pl: unrealizedPL,
          unrealizedR: unrealizedR,
          distance_to_entry_r: distanceToEntryR,
          is_breakeven: isBreakeven
        };
      })
    );

    const kz = getCurrentKillzone(new Date());
    
    res.json({
      setups: enrichedSetups.sort((a: any, b: any) => (b.conviction_score || 0) - (a.conviction_score || 0)),
      count: enrichedSetups.length,
      killzone: kz?.killzone || 'unknown',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
});

router.get('/accelerate/past-setups', (req: Request, res: Response) => {
  try {
    const market = (req.query.market as string) || 'all';
    const limit = parseInt(req.query.limit as string) || 50;
    let setups;
    if (market === 'all') {
      setups = queries.getAllPastSetups(limit);
    } else {
      setups = queries.getPastSetups(market, limit);
    }
    
    res.json({ setups, count: setups.length });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
});

router.get('/setups/:id', (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const market = (req.query.market as string) || 'futures';
    
    const setup = queries.getSetupById(id, market);
    if (!setup) {
      return res.status(404).json({ error: 'Setup not found' });
    }
    
    const history = queries.getSetupHistory(id, market);
    const outcomes = queries.getOutcomesBySetup(id);
    
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

export default router;
