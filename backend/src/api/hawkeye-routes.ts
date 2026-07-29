import express, { Request, Response } from 'express';
import { hawkeyeService } from '../hawkeye/hawkeye-service';

const router = express.Router();

router.get('/recent-invalidations', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const invalidations = hawkeyeService.getRecentInvalidations(limit);
    res.json({ invalidations });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
});

router.get('/setup/:id/history', (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const market = (req.query.market as string) || 'futures';
    const history = hawkeyeService.getSetupHistory(id, market);
    res.json({ history });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
});

router.get('/run/:runId/summary', (req: Request, res: Response) => {
  try {
    const runId = Array.isArray(req.params.runId) ? req.params.runId[0] : req.params.runId;
    const summary = hawkeyeService.getRunSummary(runId);
    res.json({ summary });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
});

router.get('/stats', (_req: Request, res: Response) => {
  try {
    const stats = hawkeyeService.getStats();
    res.json({ stats });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
