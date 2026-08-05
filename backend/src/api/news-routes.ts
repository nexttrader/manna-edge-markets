import express, { Request, Response } from 'express';
import { newsEngine } from '../news/news-engine';

const router = express.Router();

// GET /api/news/events — Get upcoming high-impact economic news releases
router.get('/events', (_req: Request, res: Response) => {
  try {
    const status = newsEngine.getCalendarStatus();
    const events = newsEngine.getUpcomingHighImpactEvents(1440); // Next 24 hours
    const nearest = events[0] || null;
    const isImminent = nearest ? (new Date(nearest.eventTime).getTime() - Date.now()) <= 30 * 60000 : false;

    res.json({
      isLive: status.isLive,
      notice: !status.isLive ? 'Economic calendar feed is currently offline or unreachable. Please check ForexFactory (forexfactory.com/calendar) for live high-impact releases.' : null,
      activeSource: status.activeSource,
      lastError: status.lastError,
      events,
      nearestEvent: nearest,
      isImminentWarning: isImminent,
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch news events', details: String(error) });
  }
});

// GET /api/news/calendar — Full Live Economic Calendar feed with filters
router.get('/calendar', (req: Request, res: Response) => {
  try {
    const status = newsEngine.getCalendarStatus();
    const currency = (req.query.currency as string || 'all').toUpperCase();
    const impact = (req.query.impact as string || 'all').toLowerCase();

    let all = newsEngine.getAllEvents();

    if (currency !== 'ALL') {
      all = all.filter(e => e.currency === currency || e.country === currency);
    }
    if (impact !== 'all') {
      all = all.filter(e => e.impact === impact);
    }

    res.json({
      isLive: status.isLive,
      notice: !status.isLive ? 'Live Economic Calendar stream is currently unavailable. Please check ForexFactory.com for today\'s scheduled economic events.' : null,
      activeSource: status.activeSource,
      lastError: status.lastError,
      total: all.length,
      events: all,
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch economic calendar', details: String(error) });
  }
});

// POST /api/news/refresh — Force manual refresh from live APIs
router.post('/refresh', async (_req: Request, res: Response) => {
  try {
    await newsEngine.refreshLiveEvents();
    const status = newsEngine.getCalendarStatus();
    res.json({ success: true, isLive: status.isLive, count: newsEngine.getAllEvents().length, status });
  } catch (error) {
    res.status(500).json({ error: 'Failed to refresh economic news', details: String(error) });
  }
});

export default router;

