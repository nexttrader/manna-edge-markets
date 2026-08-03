import express, { Request, Response } from 'express';
import * as queries from '../db/queries';
import { queryDb } from '../db/database';
import { circuitBreaker } from '../publish-gate/circuit-breaker';
import { isMarketOpen } from '../scheduler/killzone-mapper';
import { getAllUsers, addUser, updateUserTier, updateUserPassword } from '../db/user-store';

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

// 3. SUPER ADMIN CREATES USERS & ADMINS
router.post('/users', (req: Request, res: Response) => {
  try {
    const { name, email, role = 'trader', tier = 'futures_forex' } = req.body || {};
    if (!name || !email) {
      return res.status(400).json({ error: 'Display Name and Email are required' });
    }

    const newUser = addUser({
      name,
      email,
      role: role === 'admin' ? 'admin' : 'trader',
      tier
    });

    res.json({ success: true, user: newUser, allUsers: getAllUsers() });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create user/admin account', details: err.message });
  }
});

router.put('/users/:id/password', (req: Request, res: Response) => {
  try {
    const rawId = req.params.id;
    const userId = Array.isArray(rawId) ? rawId[0] : rawId;
    const { newPassword } = req.body || {};

    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters long' });
    }

    const result = updateUserPassword(userId, newPassword, 'super_admin');
    if (!result.success) {
      return res.status(403).json({ error: result.error || 'Failed to update password' });
    }

    res.json({ success: true, message: 'Password updated successfully by Super Admin', allUsers: getAllUsers() });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update password', details: err.message });
  }
});

// 4. SUPER ADMIN STRATEGY VISIBILITY & DELETION ENDPOINTS
router.get('/strategies/status', async (_req: Request, res: Response) => {
  try {
    const strategies = await queries.getStrategySettings('super_admin');
    res.json({ success: true, strategies });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch strategies', details: err.message });
  }
});

router.post('/strategies/:id/visibility', async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id;
    const strategyId = Array.isArray(rawId) ? rawId[0] : rawId;
    const { visibleToAdmins } = req.body || {};

    await queries.updateStrategyVisibility(strategyId, Boolean(visibleToAdmins));
    const updated = await queries.getStrategySettings('super_admin');
    res.json({ success: true, strategies: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update strategy visibility', details: err.message });
  }
});

router.get('/sentinel/analytics', async (_req: Request, res: Response) => {
    try {
        // Query all setups with strategy_id = 'sentinel_v2' across both tables
        const futuresSetups = await queryDb(`SELECT * FROM edge_setups WHERE strategy_id = 'sentinel_v2'`);
        const forexSetups = await queryDb(`SELECT * FROM forex_edge_setups WHERE strategy_id = 'sentinel_v2'`);
        const allSetups = [...futuresSetups, ...forexSetups];
        
        const totalSignals = allSetups.length;
        const activeSignals = allSetups.filter((s: any) => s.signal_state === 'active' || s.signal_state === 'awaiting_entry').length;
        const resolvedSignals = allSetups.filter((s: any) => s.signal_state === 'resolved').length;
        const invalidatedSignals = allSetups.filter((s: any) => s.signal_state === 'invalidated').length;
        
        // Outcomes
        const outcomes = await queryDb(`SELECT * FROM outcomes WHERE strategy_id = 'sentinel_v2'`);
        const wins = outcomes.filter((o: any) => o.outcome_type === 'tp1_hit' || o.outcome_type === 'tp2_hit');
        const losses = outcomes.filter((o: any) => o.outcome_type === 'sl_hit');
        const winRate = (wins.length + losses.length) > 0 ? ((wins.length / (wins.length + losses.length)) * 100).toFixed(1) : '0.0';
        const totalRealizedR = outcomes.reduce((sum: number, o: any) => sum + (o.realized_pl || 0), 0);
        
        // POI type distribution from metadata
        const poiTypes: Record<string, number> = { FVG: 0, OC: 0, REVERSAL: 0, CONSOLIDATION: 0 };
        let cyclePriorityCount = 0;
        for (const s of allSetups) {
            try {
                const meta = JSON.parse((s as any).metadata || '{}');
                if (meta.poi_type && poiTypes[meta.poi_type] !== undefined) poiTypes[meta.poi_type]++;
                if (meta.cycle_priority) cyclePriorityCount++;
            } catch {}
        }
        
        res.json({
            success: true,
            analytics: {
                totalSignals, activeSignals, resolvedSignals, invalidatedSignals,
                winRate: Number(winRate), totalRealizedR: Number(totalRealizedR.toFixed(2)),
                poiTypeDistribution: poiTypes,
                cyclePriorityCount,
                cyclePriorityRate: totalSignals > 0 ? Number(((cyclePriorityCount / totalSignals) * 100).toFixed(1)) : 0,
                totalWins: wins.length, totalLosses: losses.length
            }
        });
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to fetch Sentinel analytics', details: err.message });
    }
});

router.post('/sentinel/scan', async (_req: Request, res: Response) => {
    try {
        const { getCurrentKillzone } = await import('../scheduler/killzone-mapper');
        const { discoverUnifiedSetups } = await import('../discovery/unified-discovery');
        const { executePublishRun } = await import('../publish-gate/publish-gate');
        
        const now = new Date();
        const kzInfo = getCurrentKillzone(now);
        const runId = `sentinel_manual_${Date.now()}`;
        const { futures, forex } = await discoverUnifiedSetups(kzInfo, runId, 'both', [], 'sentinel_v2');
        const result = await executePublishRun(kzInfo, futures, forex, 'live', 'manual');
        res.json({ success: true, result, runId });
    } catch (err: any) {
        res.status(500).json({ error: 'Sentinel manual scan failed', details: err.message });
    }
});

router.get('/strategies/:id/admin-access', async (req: Request, res: Response) => {
    try {
        const rawId = req.params.id;
        const strategyId = Array.isArray(rawId) ? rawId[0] : rawId;
        const allUsers = getAllUsers();
        const adminUsers = allUsers.filter(u => u.role === 'admin');
        const allowedEmails = await queries.getAdminStrategyAccess(strategyId);
        
        const roster = adminUsers.map(u => ({
            email: u.email,
            name: u.name,
            role: u.role,
            tier: u.tier,
            granted: allowedEmails.includes(u.email.toLowerCase())
        }));

        res.json({ success: true, strategyId, allowedEmails, roster });
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to fetch admin strategy access', details: err.message });
    }
});

router.post('/strategies/:id/admin-access', async (req: Request, res: Response) => {
    try {
        const rawId = req.params.id;
        const strategyId = Array.isArray(rawId) ? rawId[0] : rawId;
        const { allowedEmails } = req.body || {};
        
        if (!Array.isArray(allowedEmails)) {
            return res.status(400).json({ error: 'allowedEmails must be an array of email strings' });
        }

        await queries.setAdminStrategyAccess(strategyId, allowedEmails);
        const updatedAllowed = await queries.getAdminStrategyAccess(strategyId);
        
        res.json({ success: true, strategyId, allowedEmails: updatedAllowed });
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to update admin strategy access', details: err.message });
    }
});

router.delete('/strategies/:id', async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id;
    const strategyId = Array.isArray(rawId) ? rawId[0] : rawId;

    await queries.deleteStrategy(strategyId);
    const updated = await queries.getStrategySettings('super_admin');
    res.json({ success: true, message: `Strategy ${strategyId} deleted permanently`, strategies: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete strategy', details: err.message });
  }
});

export default router;
