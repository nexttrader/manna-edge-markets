import express, { Request, Response } from 'express';
import { getMtfStyleSignals, SwingPairMode, TradingStyleMode } from '../discovery/mtf-style-signals';
import { getAllMtfRunners, getMtfCalendarOutcomes } from '../discovery/mtf-style-tracker';
import * as queries from '../db/queries';

const router = express.Router();

/**
 * GET /api/mtf-signals?style=scalp|swing&swingMode=d1_h4|h4_h1&role=...
 * Isolated Multi-Timeframe desk endpoint — never mutates existing H1+15M Intraday tables or discovery runs.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const rawStyle = String(req.query.style || 'scalp').toLowerCase().trim();
    const style: TradingStyleMode = rawStyle === 'swing' ? 'swing' : 'scalp';

    const rawSwing = String(req.query.swingMode || 'd1_h4').toLowerCase().trim();
    const swingMode: SwingPairMode = rawSwing === 'h4_h1' ? 'h4_h1' : 'd1_h4';

    const role = String(req.query.role || req.headers['x-user-role'] || 'trader').toLowerCase().trim();
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';

    const snapshot = await getMtfStyleSignals(style, swingMode, forceRefresh);

    if (role !== 'super_admin') {
      const disabledAssets = await queries.getDisabledDisplayAssets();
      if (disabledAssets.length > 0) {
        return res.json({
          success: true,
          ...snapshot,
          setups: snapshot.setups.filter(s => !disabledAssets.includes(s.instrument)),
          runnerSetups: snapshot.runnerSetups.filter(s => !disabledAssets.includes(s.instrument)),
          pastSetups: snapshot.pastSetups.filter(s => !disabledAssets.includes(s.instrument)),
        });
      }
    }

    return res.json({
      success: true,
      ...snapshot
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to compute Multi-Timeframe signal desk'
    });
  }
});

/**
 * GET /api/mtf-signals/preview
 * Lightweight showcase endpoint for HomePage tabs (top Scalping & Swing setups).
 */
router.get('/preview', async (_req: Request, res: Response) => {
  try {
    const [scalp, swing] = await Promise.all([
      getMtfStyleSignals('scalp', 'd1_h4', false),
      getMtfStyleSignals('swing', 'd1_h4', false)
    ]);

    return res.json({
      success: true,
      scalp: scalp.setups[0] || null,
      swing: swing.setups[0] || null,
      generatedAt: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to load MTF preview'
    });
  }
});

/**
 * GET /api/mtf-signals/outcomes
 * Returns resolved/runner Scalping & Swing trades formatted for the Session Performance Calendar.
 */
router.get('/outcomes', async (_req: Request, res: Response) => {
  try {
    const outcomes = await getMtfCalendarOutcomes();
    return res.json({
      success: true,
      outcomes,
      count: outcomes.length,
      generatedAt: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to load MTF calendar outcomes'
    });
  }
});

/**
 * GET /api/mtf-signals/runners?role=...
 * Returns all active TP1-banked runner positions across Scalping and Swing desks.
 */
router.get('/runners', async (req: Request, res: Response) => {
  try {
    const role = String(req.query.role || req.headers['x-user-role'] || 'trader').toLowerCase().trim();
    let setups = await getAllMtfRunners();

    if (role !== 'super_admin') {
      const disabledAssets = await queries.getDisabledDisplayAssets();
      if (disabledAssets.length > 0) {
        setups = setups.filter(s => !disabledAssets.includes(s.instrument));
      }
    }

    return res.json({
      success: true,
      setups,
      count: setups.length,
      generatedAt: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to load MTF active runners'
    });
  }
});

export default router;
