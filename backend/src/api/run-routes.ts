import express, { Request, Response } from 'express';
import * as queries from '../db/queries';

const router = express.Router();

router.get('/publish-runs', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const runs = await queries.getRecentPublishRuns(limit);
    res.json({ runs });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
});

router.get('/publish-runs/:runId', async (req: Request, res: Response) => {
  try {
    const runId = Array.isArray(req.params.runId) ? req.params.runId[0] : req.params.runId;
    const run = await queries.getPublishRun(runId);
    
    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }
    
    let parsedSummary = run.summary_json;
    if (run.summary_json && typeof run.summary_json === 'string') {
      try {
        parsedSummary = JSON.parse(run.summary_json);
      } catch (e) {
        // Keep original if parsing fails
      }
    }
    
    const setups = await queries.getSetupsByRun(runId);
    
    res.json({ run: { ...run, summary_json: parsedSummary }, setups });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
