import express, { Request, Response } from 'express';
import * as queries from '../db/queries';
import { queryDb } from '../db/database';
import { circuitBreaker } from '../publish-gate/circuit-breaker';
import { isMarketOpen } from '../scheduler/killzone-mapper';
import { getAllUsers, addUser, updateUserTier, updateUserPassword, updateUserFull } from '../db/user-store';

const router = express.Router();

interface TelemetryEventPayload {
  eventType: 'page_view' | 'admin_action' | 'trader_action' | 'session_heartbeat' | 'feature_click';
  userEmail: string;
  userRole: string;
  userTier: string;
  path: string;
  durationMs: number;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  refSource?: string;
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
  utmSource?: string;
  refSource?: string;
}> = {};

// 1. SILENT TELEMETRY INGESTION ENDPOINT
router.post('/telemetry', (req: Request, res: Response) => {
  try {
    const payload: TelemetryEventPayload = req.body;
    if (!payload || !payload.userEmail) {
      return res.status(400).json({ error: 'Invalid telemetry payload' });
    }

    telemetryLogs.push(payload);
    if (telemetryLogs.length > 10000) {
      telemetryLogs.shift(); // Keep last 10,000 events
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
        actionsCount: 0,
        utmSource: payload.utmSource || '',
        refSource: payload.refSource || ''
      };
    }

    const sess = userSessions[email];
    sess.currentPath = payload.path || sess.currentPath;
    sess.lastActive = payload.timestamp || new Date().toISOString();
    sess.role = payload.userRole || sess.role;
    sess.tier = payload.userTier || sess.tier;
    if (payload.utmSource) sess.utmSource = payload.utmSource;
    if (payload.refSource) sess.refSource = payload.refSource;

    if (payload.durationMs && payload.durationMs > 0) {
      const addedSec = Math.round(payload.durationMs / 1000);
      sess.totalDurationSec += addedSec;
      const pathKey = payload.path || '/';
      sess.timePerPageSec[pathKey] = (sess.timePerPageSec[pathKey] || 0) + addedSec;
    }

    if (payload.eventType === 'admin_action' || payload.eventType === 'trader_action' || payload.eventType === 'feature_click') {
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
    const allUsers = getAllUsers();
    
    // Process Active Roster (User & Admin activity)
    const roster = allUsers.map(u => {
      const sess = userSessions[u.email.toLowerCase()] || userSessions[u.email];
      const lastActiveMs = sess ? new Date(sess.lastActive).getTime() : 0;
      const diffMin = lastActiveMs > 0 ? Math.round((now - lastActiveMs) / (1000 * 60)) : 9999;
      const isOnline = diffMin <= 5;

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        tier: u.tier,
        status: u.status || 'active',
        currentPath: sess?.currentPath || '/dashboard',
        lastActive: sess?.lastActive || u.createdAt,
        isOnline,
        lastActiveAgo: isOnline ? '🟢 Live Now' : diffMin < 1440 ? `${diffMin} mins ago` : `${Math.floor(diffMin / 1440)} days ago`,
        totalDurationFormatted: sess ? `${Math.floor(sess.totalDurationSec / 60)}m ${sess.totalDurationSec % 60}s` : '0m 0s',
        timePerPageFormatted: sess ? Object.entries(sess.timePerPageSec).reduce((acc, [path, sec]) => {
          acc[path] = `${Math.floor(sec / 60)}m ${sec % 60}s`;
          return acc;
        }, {} as Record<string, string>) : {},
        actionsCount: sess?.actionsCount || 0,
        utmSource: sess?.utmSource || 'Direct / Organic',
        refSource: sess?.refSource || 'Direct'
      };
    });

    // Marketing & Revenue Analytics Calculations
    const totalTraders = allUsers.length;
    const freeTierCount = allUsers.filter(u => u.tier === 'free').length;
    const forexTierCount = allUsers.filter(u => u.tier === 'forex_only').length;
    const futuresForexTierCount = allUsers.filter(u => u.tier === 'futures_forex').length;
    
    // Revenue Estimate ($79 for Forex, $149 for Futures+Forex)
    const estimatedMRR = (forexTierCount * 79) + (futuresForexTierCount * 149);
    const arpu = totalTraders > 0 ? Number((estimatedMRR / totalTraders).toFixed(2)) : 0;
    const conversionRate = totalTraders > 0 ? Number((((forexTierCount + futuresForexTierCount) / totalTraders) * 100).toFixed(1)) : 0;

    // Traffic Attribution Breakdown
    const trafficSources: Record<string, { total: number; paid: number }> = {};
    roster.forEach(u => {
      const src = u.utmSource || 'Direct / Organic';
      if (!trafficSources[src]) trafficSources[src] = { total: 0, paid: 0 };
      trafficSources[src].total++;
      if (u.tier !== 'free') trafficSources[src].paid++;
    });

    // Page View & Heatmap Analytics
    const pageViewCounts: Record<string, number> = {};
    const featureClickCounts: Record<string, number> = {};
    telemetryLogs.forEach(l => {
      if (l.eventType === 'page_view') {
        const p = l.path || '/';
        pageViewCounts[p] = (pageViewCounts[p] || 0) + 1;
      }
      if (l.eventType === 'feature_click' && l.actionDetails?.action) {
        const feat = l.actionDetails.action.replace('feature_', '');
        featureClickCounts[feat] = (featureClickCounts[feat] || 0) + 1;
      }
    });

    // At-Risk Churn Alerts (Users registered over 7 days ago with 0 active minutes)
    const atRiskUsers = roster.filter(u => !u.isOnline && u.lastActiveAgo.includes('days') && parseInt(u.lastActiveAgo) >= 7);

    // Admin Specific Audit Trail
    const adminLogs = telemetryLogs
      .filter(l => l.userRole === 'admin' || l.userRole === 'super_admin' || l.eventType === 'admin_action')
      .slice(-100)
      .reverse();

    const cbStatus = circuitBreaker.getStatus();
    const marketOpenStatus = isMarketOpen();

    res.json({
      success: true,
      roster,
      adminLogs,
      marketing: {
        totalTraders,
        freeTierCount,
        forexTierCount,
        futuresForexTierCount,
        estimatedMRR,
        arpu,
        conversionRate,
        trafficSources,
        atRiskUsersCount: atRiskUsers.length,
        atRiskUsers: atRiskUsers.slice(0, 10)
      },
      heatmap: {
        pageViewCounts,
        featureClickCounts,
        totalEventsLogged: telemetryLogs.length
      },
      metrics: {
        totalTrackedUsers: roster.length,
        onlineCount: roster.filter(r => r.isOnline).length,
        adminCount: roster.filter(r => r.role === 'admin' || r.role === 'super_admin').length,
        totalEventsLogged: telemetryLogs.length,
        circuitBreakerStatus: cbStatus.tripped ? 'tripped' : 'ok',
        circuitBreakerFailures: cbStatus.failureCount,
        isMarketOpen: marketOpenStatus
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve super admin intelligence data', details: err.message });
  }
});

// 2B. GET SPECIFIC USER ACTIVITY TIMELINE
router.get('/users/:email/activity', (req: Request, res: Response) => {
  try {
    const email = req.params.email;
    const targetEmail = Array.isArray(email) ? email[0] : email;
    
    const userLogs = telemetryLogs
      .filter(l => l.userEmail.toLowerCase() === targetEmail.toLowerCase())
      .slice(-100)
      .reverse();

    const session = userSessions[targetEmail.toLowerCase()] || userSessions[targetEmail];

    res.json({
      success: true,
      email: targetEmail,
      session,
      logs: userLogs
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch user activity', details: err.message });
  }
});

// 2C. FULL USER ACCOUNT GOVERNANCE (Tier, Role, Status, Name)
router.put('/users/:id/full', (req: Request, res: Response) => {
  try {
    const rawId = req.params.id;
    const userId = Array.isArray(rawId) ? rawId[0] : rawId;
    const { name, tier, role, status, preferredMarket, riskLimit } = req.body || {};

    const updated = updateUserFull(userId, { name, tier, role, status, preferredMarket, riskLimit });
    if (!updated) {
      return res.status(404).json({ error: 'User account not found' });
    }

    res.json({ success: true, message: 'User updated successfully', user: updated, allUsers: getAllUsers() });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update user', details: err.message });
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
    const { visibleToAdmins, visibleToTraders } = req.body || {};

    if (visibleToAdmins !== undefined) {
      await queries.updateStrategyVisibility(strategyId, Boolean(visibleToAdmins));
    }
    if (visibleToTraders !== undefined) {
      await queries.updateStrategyTraderVisibility(strategyId, Boolean(visibleToTraders));
    }

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

router.get('/sentinel/setups', async (_req: Request, res: Response) => {
    try {
        const futuresSetups = await queryDb(`SELECT * FROM edge_setups WHERE strategy_id = 'sentinel_v2' ORDER BY created_at DESC`);
        const forexSetups = await queryDb(`SELECT * FROM forex_edge_setups WHERE strategy_id = 'sentinel_v2' ORDER BY created_at DESC`);
        const allSetups = [...futuresSetups, ...forexSetups];

        // Fetch live market prices
        const { getLiveCurrentPrice } = await import('../discovery/yahoo-provider');
        const enriched = await Promise.all(allSetups.map(async (s: any) => {
            const livePrice = await getLiveCurrentPrice(s.instrument);
            return {
                ...s,
                current_price: livePrice || s.entry_zone_mid
            };
        }));

        // Get current strategy rollout visibility settings
        const settingsRows = await queryDb<{ visible_to_admins?: number, visible_to_traders?: number }>(`SELECT visible_to_admins, visible_to_traders FROM strategy_settings WHERE id = 'sentinel_v2'`);
        const setting = settingsRows[0] || {};

        res.json({
            success: true,
            setups: enriched,
            rollout: {
                visibleToAdmins: Boolean(setting.visible_to_admins),
                visibleToTraders: Boolean(setting.visible_to_traders)
            }
        });
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to fetch Sentinel setups', details: err.message });
    }
});

router.post('/sentinel/rollout', async (req: Request, res: Response) => {
    try {
        const { visibleToAdmins, visibleToTraders } = req.body || {};
        
        if (visibleToAdmins !== undefined) {
            await queries.updateStrategyVisibility('sentinel_v2', Boolean(visibleToAdmins));
        }
        if (visibleToTraders !== undefined) {
            await queries.updateStrategyTraderVisibility('sentinel_v2', Boolean(visibleToTraders));
        }

        const settingsRows = await queryDb<{ visible_to_admins?: number, visible_to_traders?: number }>(`SELECT visible_to_admins, visible_to_traders FROM strategy_settings WHERE id = 'sentinel_v2'`);
        const setting = settingsRows[0] || {};

        res.json({
            success: true,
            rollout: {
                visibleToAdmins: Boolean(setting.visible_to_admins),
                visibleToTraders: Boolean(setting.visible_to_traders)
            }
        });
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to update Sentinel rollout settings', details: err.message });
    }
});

router.get('/sentinel/tuning', async (_req: Request, res: Response) => {
    try {
        const tuning = await queries.getStrategyTuning('sentinel_v2');
        res.json({ success: true, tuning });
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to fetch Sentinel tuning settings', details: err.message });
    }
});

router.post('/sentinel/tuning', async (req: Request, res: Response) => {
    try {
        const { superAdminMaxSignals, superAdminMinConviction, publicMaxSignals, publicMinConviction } = req.body || {};
        await queries.updateStrategyTuning(
            'sentinel_v2',
            Number(superAdminMaxSignals || 6),
            Number(superAdminMinConviction || 75.0),
            Number(publicMaxSignals || 3),
            Number(publicMinConviction || 85.0)
        );
        const updated = await queries.getStrategyTuning('sentinel_v2');
        res.json({ success: true, tuning: updated });
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to update Sentinel tuning settings', details: err.message });
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
        const adminUsers = allUsers.filter(u => u.role === 'admin' || u.role === 'super_admin');
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
