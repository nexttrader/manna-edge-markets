import express, { Request, Response } from 'express';
import { newsEngine } from '../news/news-engine';

const router = express.Router();

// GET /api/news/events — Get upcoming high-impact economic news releases
router.get('/events', (_req: Request, res: Response) => {
  try {
    const events = newsEngine.getUpcomingHighImpactEvents(1440); // Next 24 hours
    const nearest = events[0] || null;
    const isImminent = nearest ? (new Date(nearest.eventTime).getTime() - Date.now()) <= 30 * 60000 : false;

    res.json({
      events,
      nearestEvent: nearest,
      isImminentWarning: isImminent,
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch news events', details: String(error) });
  }
});

export default router;
