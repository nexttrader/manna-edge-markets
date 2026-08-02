import express, { Request, Response } from 'express';
import * as queries from '../db/queries';
import { circuitBreaker } from '../publish-gate/circuit-breaker';
import { isMarketOpen } from '../scheduler/killzone-mapper';

const router = express.Router();

interface TelemetryEventPayload {
  eventType: 'page_view' | 'admin_action' | 'trader_action' | 'session_heartbeat';
  userEmail: string;
  userRole: string;
  userTier: string;
  path: string;
  durationMs: number;
  actionDetails?: {
    action: string;
    instrument?: string;
    targetId?: string;
    extra?: any;
  };
  timestamp: string;
}

// In-Memory Telemetry Database Store
const telemetryLogs: TelemetryEventPayload[] = [];
const userSessions: Record<string, {
  email: string;
  role: string;
  tier: string;
  currentPath: string;
  lastActive: string;
  totalDurationSec: number;
  timePerPageSec: Record<string, number>;
  actionsCount: number;
}> = {};

// 1. SILENT TELEMETRY INGESTION ENDPOINT
router.post('/telemetry', (req: Request, res: Response) => {
  try {
    const payload: TelemetryEventPayload = req.body;
    if (!payload || !payload.userEmail) {
      return res.status(400).json({ error: 'Invalid telemetry payload' });
    }

    telemetryLogs.push(payload);
    if (telemetryLogs.length > 5000) {
      telemetryLogs.shift(); // Keep last 5,000 events
    }

    const email = payload.userEmail;
    if (!userSessions[email]) {
      userSessions[email] = {
        email,
        role: payload.userRole || 'trader',
        tier: payload.userTier || 'free',
        currentPath: payload.path || '/',
        lastActive: payload.timestamp || new Date().toISOString(),
        totalDurationSec: 0,
        timePerPageSec: {},
        actionsCount: 0
      };
    }

    const sess = userSessions[email];
    sess.currentPath = payload.path || sess.currentPath;
    sess.lastActive = payload.timestamp || new Date().toISOString();
    sess.role = payload.userRole || sess.role;
    sess.tier = payload.userTier || sess.tier;

    if (payload.durationMs && payload.durationMs > 0) {
      const addedSec = Math.round(payload.durationMs / 1000);
      sess.totalDurationSec += addedSec;
      const pathKey = payload.path || '/';
      sess.timePerPageSec[pathKey] = (sess.timePerPageSec[pathKey] || 0) + addedSec;
    }

    if (payload.eventType === 'admin_action' || payload.eventType === 'trader_action') {
      sess.actionsCount++;
    }

    res.json({ success: true, recorded: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to ingest telemetry' });
  }
});

// 2. SUPER ADMIN DASHBOARD INTELLIGENCE DATA ENDPOINT
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const now = Date.now();
    
    // Process Active Roster (User & Admin activity)
    const roster = Object.values(userSessions).map(sess => {
      const lastActiveMs = new Date(sess.lastActive).getTime();
      const diffMin = Math.round((now - lastActiveMs) / (1000 * 60));
      const isOnline = diffMin <= 5;

      return {
        email: sess.email,
        role: sess.role,
        tier: sess.tier,
        currentPath: sess.currentPath,
        lastActive: sess.lastActive,
        isOnline,
        lastActiveAgo: isOnline ? '🟢 Live Now' : `${diffMin} mins ago`,
        totalDurationFormatted: `${Math.floor(sess.totalDurationSec / 60)}m ${sess.totalDurationSec % 60}s`,
        timePerPageFormatted: Object.entries(sess.timePerPageSec).reduce((acc, [path, sec]) => {
          acc[path] = `${Math.floor(sec / 60)}m ${sec % 60}s`;
          return acc;
        }, {} as Record<string, string>),
        actionsCount: sess.actionsCount
      };
    });

    // Admin Specific Audit Trail
    const adminLogs = telemetryLogs
      .filter(l => l.userRole === 'admin' || l.userRole === 'super_admin' || l.eventType === 'admin_action')
      .slice(-100)
      .reverse();

    // Trader Engagement Heatmap Data
    const traderActions = telemetryLogs.filter(l => l.eventType === 'trader_action');
    const pageViews = telemetryLogs.filter(l => l.eventType === 'page_view');

    // System Telemetry
    const cbStatus = circuitBreaker.getStatus();
    const marketOpenStatus = isMarketOpen();

    res.json({
      success: true,
      roster,
      adminLogs,
      metrics: {
        totalTrackedUsers: roster.length,
        onlineCount: roster.filter(r => r.isOnline).length,
        adminCount: roster.filter(r => r.role === 'admin' || r.role === 'super_admin').length,
        totalEventsLogged: telemetryLogs.length,
        totalTraderActions: traderActions.length,
        circuitBreakerStatus: cbStatus.tripped ? 'tripped' : 'ok',
        circuitBreakerFailures: cbStatus.failureCount,
        isMarketOpen: marketOpenStatus
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve super admin intelligence data', details: err.message });
  }
});

export default router;
