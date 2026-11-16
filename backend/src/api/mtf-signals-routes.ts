import express, { Request, Response } from 'express';
import { getMtfStyleSignals, SwingPairMode, TradingStyleMode } from '../discovery/mtf-style-signals';

const router = express.Router();

/**
 * GET /api/mtf-signals?style=scalp|swing&swingMode=d1_h4|h4_h1
 * Isolated Multi-Timeframe desk endpoint — never mutates existing H1+15M Intraday tables or discovery runs.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const rawStyle = String(req.query.style || 'scalp').toLowerCase().trim();
    const style: TradingStyleMode = rawStyle === 'swing' ? 'swing' : 'scalp';

    const rawSwing = String(req.query.swingMode || 'd1_h4').toLowerCase().trim();
    const swingMode: SwingPairMode = rawSwing === 'h4_h1' ? 'h4_h1' : 'd1_h4';

    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';

    const snapshot = await getMtfStyleSignals(style, swingMode, forceRefresh);
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

export default router;
