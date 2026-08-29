import express, { Request, Response } from 'express';
import * as queries from '../db/queries';
import { queryDb } from '../db/database';
import { circuitBreaker } from '../publish-gate/circuit-breaker';
import { isMarketOpen } from '../scheduler/killzone-mapper';
import { getAllUsers, addUser, updateUserTier, updateUserPassword, updateUserFull } from '../db/user-store';
import { outcomeDetector } from '../outcomes/outcome-detector';

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

    const emailKey = payload.userEmail.toLowerCase().trim();
    if (!userSessions[emailKey]) {
      userSessions[emailKey] = {
        email: emailKey,
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

    const sess = userSessions[emailKey];
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
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const now = Date.now();
    const allUsers = await getAllUsers();
    
    // Auto-touch requestor session if headers provided
    const reqEmail = (req.headers['x-user-email'] || req.headers['x-email'] || req.query.email || 'chadwinsolomon@gmail.com').toString().toLowerCase().trim();
    if (reqEmail) {
      if (!userSessions[reqEmail]) {
        userSessions[reqEmail] = {
          email: reqEmail,
          role: reqEmail.includes('super') || reqEmail === 'chadwinsolomon@gmail.com' ? 'super_admin' : 'admin',
          tier: 'futures_forex',
          currentPath: '/dashboard',
          lastActive: new Date().toISOString(),
          totalDurationSec: 60,
          timePerPageSec: { '/dashboard': 60 },
          actionsCount: 1
        };
      } else {
        userSessions[reqEmail].lastActive = new Date().toISOString();
      }
    }

    // Process Active Roster (User & Admin activity)
    const roster = allUsers.map(u => {
      const emailKey = u.email.toLowerCase().trim();
      const sess = userSessions[emailKey];
      
      let lastActiveMs = 0;
      if (sess?.lastActive) {
        lastActiveMs = new Date(sess.lastActive).getTime();
      } else if (u.lastActive && !u.lastActive.includes('Pending First Login')) {
        lastActiveMs = new Date(u.lastActive).getTime();
      } else if (u.createdAt) {
        lastActiveMs = new Date(u.createdAt).getTime();
      }

      const isValidDate = lastActiveMs > 0 && !isNaN(lastActiveMs);
      const diffMin = isValidDate ? Math.max(0, Math.round((now - lastActiveMs) / (1000 * 60))) : null;
      const isOnline = sess ? (diffMin !== null && diffMin <= 5) : false;

      let lastActiveAgo = 'Offline (Pending First Login)';
      if (isOnline) {
        lastActiveAgo = '🟢 Live Now';
      } else if (sess && diffMin !== null) {
        if (diffMin < 1) {
          lastActiveAgo = 'Just now';
        } else if (diffMin < 60) {
          lastActiveAgo = `${diffMin} mins ago`;
        } else if (diffMin < 1440) {
          const hours = Math.floor(diffMin / 60);
          lastActiveAgo = `${hours} hour${hours > 1 ? 's' : ''} ago`;
        } else {
          const days = Math.floor(diffMin / 1440);
          lastActiveAgo = `${days} day${days > 1 ? 's' : ''} ago`;
        }
      } else if (u.lastActive && !u.lastActive.includes('Pending First Login') && isValidDate && diffMin !== null) {
        if (diffMin < 60) {
          lastActiveAgo = `${diffMin} mins ago`;
        } else if (diffMin < 1440) {
          const hours = Math.floor(diffMin / 60);
          lastActiveAgo = `${hours} hour${hours > 1 ? 's' : ''} ago`;
        } else {
          const days = Math.floor(diffMin / 1440);
          lastActiveAgo = `${days} day${days > 1 ? 's' : ''} ago`;
        }
      }

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        tier: u.tier,
        status: u.status || 'active',
        currentPath: sess?.currentPath || '/dashboard',
        lastActive: sess?.lastActive || u.lastActive || u.createdAt,
        isOnline,
        lastActiveAgo,
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
router.put('/users/:id/full', async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id;
    const userId = Array.isArray(rawId) ? rawId[0] : rawId;
    const { name, tier, role, status, preferredMarket, riskLimit } = req.body || {};

    const updated = await updateUserFull(userId, { name, tier, role, status, preferredMarket, riskLimit });
    if (!updated) {
      return res.status(404).json({ error: 'User account not found' });
    }

    res.json({ success: true, message: 'User updated successfully', user: updated, allUsers: await getAllUsers() });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update user', details: err.message });
  }
});

// 3. SUPER ADMIN CREATES USERS & ADMINS
router.post('/users', async (req: Request, res: Response) => {
  try {
    const { name, email, role = 'trader', tier = 'futures_forex' } = req.body || {};
    if (!name || !email) {
      return res.status(400).json({ error: 'Display Name and Email are required' });
    }

    const newUser = await addUser({
      name,
      email,
      role: role === 'admin' ? 'admin' : 'trader',
      tier
    });

    res.json({ success: true, user: newUser, allUsers: await getAllUsers() });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create user/admin account', details: err.message });
  }
});

router.put('/users/:id/password', async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id;
    const userId = Array.isArray(rawId) ? rawId[0] : rawId;
    const { newPassword } = req.body || {};

    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters long' });
    }

    const result = await updateUserPassword(userId, newPassword, 'super_admin');
    if (!result.success) {
      return res.status(403).json({ error: result.error || 'Failed to update password' });
    }

    res.json({ success: true, message: 'Password updated successfully by Super Admin', allUsers: await getAllUsers() });
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
    const { enabled, visibleToAdmins, visibleToTraders } = req.body || {};

    if (enabled !== undefined) {
      await queries.updateStrategyEnabled(strategyId, Boolean(enabled));
      // If a strategy is disabled, retroactively invalidate open setups for that strategy
      if (!enabled) {
        await queryDb(`UPDATE edge_setups SET signal_state = 'invalidated', tradable = 0, invalidation_reason = 'strategy_disabled', resolved_at = CURRENT_TIMESTAMP WHERE strategy_id = ? AND signal_state IN ('active', 'awaiting_entry')`, [strategyId]);
        await queryDb(`UPDATE forex_edge_setups SET signal_state = 'invalidated', tradable = 0, invalidation_reason = 'strategy_disabled', resolved_at = CURRENT_TIMESTAMP WHERE strategy_id = ? AND signal_state IN ('active', 'awaiting_entry')`, [strategyId]);
      }
    }
    if (visibleToAdmins !== undefined) {
      await queries.updateStrategyVisibility(strategyId, Boolean(visibleToAdmins));
    }
    if (visibleToTraders !== undefined) {
      await queries.updateStrategyTraderVisibility(strategyId, Boolean(visibleToTraders));
    }

    const updated = await queries.getStrategySettings('super_admin');
    res.json({ success: true, strategies: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update strategy settings', details: err.message });
  }
});

router.post('/strategies/:id/toggle', async (req: Request, res: Response) => {
  try {
    const rawId = req.params.id;
    const strategyId = Array.isArray(rawId) ? rawId[0] : rawId;
    const { enabled } = req.body || {};

    await queries.updateStrategyEnabled(strategyId, Boolean(enabled));

    if (!enabled) {
      await queryDb(`UPDATE edge_setups SET signal_state = 'invalidated', tradable = 0, invalidation_reason = 'strategy_disabled', resolved_at = CURRENT_TIMESTAMP WHERE strategy_id = ? AND signal_state IN ('active', 'awaiting_entry')`, [strategyId]);
      await queryDb(`UPDATE forex_edge_setups SET signal_state = 'invalidated', tradable = 0, invalidation_reason = 'strategy_disabled', resolved_at = CURRENT_TIMESTAMP WHERE strategy_id = ? AND signal_state IN ('active', 'awaiting_entry')`, [strategyId]);
    }

    const updated = await queries.getStrategySettings('super_admin');
    res.json({ success: true, strategies: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to toggle strategy engine', details: err.message });
  }
});

router.get('/sentinel/analytics', async (_req: Request, res: Response) => {
    try {
        await outcomeDetector.evaluateAllSetups(true);

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
        
        // Cap losses strictly at -1.0R (a stop loss is 1R loss, not more than 1R)
        const totalRealizedR = outcomes.reduce((sum: number, o: any) => {
          let r = o.realized_pl || 0;
          if (o.outcome_type === 'sl_hit' || r < 0) {
            r = -1.0;
          }
          return sum + r;
        }, 0);
        
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
        await outcomeDetector.evaluateAllSetups(true);

        const futuresSetups = await queryDb(`SELECT * FROM edge_setups WHERE strategy_id = 'sentinel_v2' AND signal_state IN ('awaiting_entry', 'active', 'runner') ORDER BY created_at DESC`);
        const forexSetups = await queryDb(`SELECT * FROM forex_edge_setups WHERE strategy_id = 'sentinel_v2' AND signal_state IN ('awaiting_entry', 'active', 'runner') ORDER BY created_at DESC`);
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
            Number(superAdminMaxSignals !== undefined ? superAdminMaxSignals : 6),
            Number(superAdminMinConviction !== undefined ? superAdminMinConviction : 70.0),
            Number(publicMaxSignals !== undefined ? publicMaxSignals : 6),
            Number(publicMinConviction !== undefined ? publicMinConviction : 70.0)
        );
        const updated = await queries.getStrategyTuning('sentinel_v2');
        res.json({ success: true, tuning: updated });
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to update Sentinel tuning settings', details: err.message });
    }
});

router.post('/sentinel/scan', async (_req: Request, res: Response) => {
    try {
        const { getCurrentKillzone, isForexMarketOpen, isFuturesMarketOpen } = await import('../scheduler/killzone-mapper');
        const { discoverUnifiedSetups } = await import('../discovery/unified-discovery');
        const { executePublishRun } = await import('../publish-gate/publish-gate');
        
        const now = new Date();
        if (process.env.NODE_ENV !== 'test') {
            const isForexOpen = isForexMarketOpen(now);
            const isFuturesOpen = isFuturesMarketOpen(now);
            if (!isForexOpen && !isFuturesOpen) {
                return res.status(400).json({ error: 'Cannot scan: Both Forex and Futures markets are currently closed.' });
            } else if (!isForexOpen) {
                return res.status(400).json({ error: 'Cannot scan: The Forex market is currently closed.' });
            } else if (!isFuturesOpen) {
                return res.status(400).json({ error: 'Cannot scan: The Futures market is currently closed.' });
            }
        }

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
        const allUsers = await getAllUsers();
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

// ── 4B. ASSET DISPLAY & TRACKING GOVERNANCE ENDPOINTS ─────────────────────────

router.get('/assets', async (_req: Request, res: Response) => {
  try {
    await outcomeDetector.evaluateAllSetups(true);
    const assetSettings = await queries.getAssetSettings();
    const futuresSetups = await queryDb<any>(`SELECT * FROM edge_setups`);
    const forexSetups = await queryDb<any>(`SELECT * FROM forex_edge_setups`);
    const allSetups = [...futuresSetups, ...forexSetups];
    const outcomes = await queryDb<any>(`SELECT * FROM outcomes`);
    const setupMap = new Map<string, any>();
    allSetups.forEach(s => setupMap.set(s.id, s));

    const assetStatsMap: Record<string, {
      totalSetups: number;
      activeSetups: number;
      resolvedSetups: number;
      invalidatedSetups: number;
      totalTrades: number;
      wins: number;
      losses: number;
      breakevens: number;
      totalRealizedR: number;
      winRate: number;
      lastSignalAt: string | null;
    }> = {};

    for (const a of assetSettings) {
      assetStatsMap[a.symbol] = {
        totalSetups: 0,
        activeSetups: 0,
        resolvedSetups: 0,
        invalidatedSetups: 0,
        totalTrades: 0,
        wins: 0,
        losses: 0,
        breakevens: 0,
        totalRealizedR: 0,
        winRate: 0,
        lastSignalAt: null
      };
    }

    for (const s of allSetups) {
      const sym = s.instrument;
      if (!assetStatsMap[sym]) {
        assetStatsMap[sym] = {
          totalSetups: 0, activeSetups: 0, resolvedSetups: 0, invalidatedSetups: 0,
          totalTrades: 0, wins: 0, losses: 0, breakevens: 0, totalRealizedR: 0, winRate: 0, lastSignalAt: null
        };
      }
      const st = assetStatsMap[sym];
      st.totalSetups++;
      if (['awaiting_entry', 'active', 'runner'].includes(s.signal_state)) st.activeSetups++;
      else if (s.signal_state === 'resolved') st.resolvedSetups++;
      else if (s.signal_state === 'invalidated') st.invalidatedSetups++;

      if (s.created_at) {
        if (!st.lastSignalAt || new Date(s.created_at).getTime() > new Date(st.lastSignalAt).getTime()) {
          st.lastSignalAt = s.created_at;
        }
      }
    }

    for (const o of outcomes) {
      const parent = setupMap.get(o.setup_id);
      const sym = o.instrument || parent?.instrument;
      if (!sym || !assetStatsMap[sym]) continue;
      const st = assetStatsMap[sym];
      st.totalTrades++;
      const typeStr = String(o.outcome_type || '').toLowerCase();
      let rVal = 0;
      if (typeStr.includes('tp2')) {
        st.wins++;
        rVal = parent?.r_multiple_2 || 3.0;
      } else if (typeStr.includes('tp1') || typeStr.includes('tp')) {
        st.wins++;
        rVal = parent?.r_multiple_1 || 2.0;
      } else if (typeStr.includes('sl') || typeStr.includes('stop')) {
        st.losses++;
        rVal = -1.0;
      } else if (typeStr.includes('be') || typeStr.includes('breakeven')) {
        st.breakevens++;
        rVal = 0.0;
      } else if (o.realized_pl !== undefined && o.realized_pl !== null) {
        rVal = Math.max(-1.0, o.realized_pl);
        if (rVal > 0) st.wins++;
        else if (rVal < 0) st.losses++;
        else st.breakevens++;
      }
      st.totalRealizedR += rVal;
    }

    const assets = assetSettings.map(a => {
      const st = assetStatsMap[a.symbol] || {
        totalSetups: 0, activeSetups: 0, resolvedSetups: 0, invalidatedSetups: 0,
        totalTrades: 0, wins: 0, losses: 0, breakevens: 0, totalRealizedR: 0, winRate: 0, lastSignalAt: null
      };
      const totalResolved = st.wins + st.losses;
      const winRate = totalResolved > 0 ? Number(((st.wins / totalResolved) * 100).toFixed(1)) : 0;
      return {
        ...a,
        stats: {
          ...st,
          winRate,
          totalRealizedR: Number(st.totalRealizedR.toFixed(2))
        }
      };
    });

    const displayedCount = assets.filter(a => a.display_enabled).length;
    const hiddenCount = assets.filter(a => !a.display_enabled).length;

    res.json({
      success: true,
      assets,
      summary: {
        totalAssets: assets.length,
        displayedCount,
        hiddenCount,
        allTrackingActive: true
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch asset controls', details: err.message });
  }
});

router.put('/assets/toggle-display', async (req: Request, res: Response) => {
  try {
    const { symbol, display_enabled } = req.body || {};
    if (!symbol || typeof symbol !== 'string') {
      return res.status(400).json({ error: 'Body must contain { symbol: string, display_enabled: boolean }' });
    }
    if (typeof display_enabled !== 'boolean') {
      return res.status(400).json({ error: 'Body must contain { display_enabled: boolean }' });
    }
    const cleanSym = decodeURIComponent(symbol).trim();
    const updated = await queries.setAssetDisplay(cleanSym, display_enabled);
    res.json({ success: true, symbol: cleanSym, display_enabled, assets: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update asset display setting', details: err.message });
  }
});

router.put('/assets/:symbol(*)/toggle-display', async (req: Request, res: Response) => {
  try {
    const rawSym = req.params.symbol;
    const symbol = decodeURIComponent(Array.isArray(rawSym) ? rawSym[0] : rawSym);
    const { display_enabled } = req.body;
    if (typeof display_enabled !== 'boolean') {
      return res.status(400).json({ error: 'Body must contain { display_enabled: boolean }' });
    }
    const updated = await queries.setAssetDisplay(symbol, display_enabled);
    res.json({ success: true, symbol, display_enabled, assets: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update asset display setting', details: err.message });
  }
});

router.put('/assets/:symbol/toggle-display', async (req: Request, res: Response) => {
  try {
    const rawSym = req.params.symbol;
    const symbol = decodeURIComponent(Array.isArray(rawSym) ? rawSym[0] : rawSym);
    const { display_enabled } = req.body;
    if (typeof display_enabled !== 'boolean') {
      return res.status(400).json({ error: 'Body must contain { display_enabled: boolean }' });
    }
    const updated = await queries.setAssetDisplay(symbol, display_enabled);
    res.json({ success: true, symbol, display_enabled, assets: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update asset display setting', details: err.message });
  }
});

router.post('/assets/bulk-toggle', async (req: Request, res: Response) => {
  try {
    const { market, symbols, display_enabled } = req.body;
    if (typeof display_enabled !== 'boolean') {
      return res.status(400).json({ error: 'Body must contain { display_enabled: boolean }' });
    }
    const updated = await queries.bulkSetAssetDisplay({ market, symbols }, display_enabled);
    res.json({ success: true, assets: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to bulk update asset display settings', details: err.message });
  }
});

router.post('/assets', async (req: Request, res: Response) => {
  try {
    const { symbol, market = 'futures', name } = req.body || {};
    if (!symbol || typeof symbol !== 'string') {
      return res.status(400).json({ error: 'Symbol is required' });
    }
    const updated = await queries.registerCustomAsset(symbol, market, name || symbol);
    res.json({ success: true, assets: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to register custom asset', details: err.message });
  }
});

// 5. STRATEGY SUCCESS COMPARISON & LLM DATA EXPORTER ENDPOINTS

async function calculateStrategyComparisonData(filters?: {
  timeframe?: string;
  market?: string;
  session?: string;
  strategyId?: string;
  assetVisibility?: string;
  instrument?: string;
}) {
  await outcomeDetector.evaluateAllSetups(true);

  const registeredStrategies = await queries.getStrategySettings('super_admin');
  const disabledAssets = await queries.getDisabledDisplayAssets();
  const futuresSetups = await queryDb<any>(`SELECT * FROM edge_setups`);
  const forexSetups = await queryDb<any>(`SELECT * FROM forex_edge_setups`);
  const allSetups = [...futuresSetups, ...forexSetups];
  const outcomes = await queryDb<any>(`SELECT * FROM outcomes ORDER BY created_at DESC`);

  // Apply time filter
  const now = Date.now();
  let minTimeMs = 0;
  if (filters?.timeframe === '24h') minTimeMs = now - 24 * 60 * 60 * 1000;
  else if (filters?.timeframe === '7d') minTimeMs = now - 7 * 24 * 60 * 60 * 1000;
  else if (filters?.timeframe === '30d') minTimeMs = now - 30 * 24 * 60 * 60 * 1000;

  // Base filter (time, market, session, strategy, instrument)
  const baseFilter = (s: any) => {
    if (minTimeMs > 0 && new Date(s.created_at).getTime() < minTimeMs) return false;
    if (filters?.market && filters.market !== 'both' && s.market !== filters.market) return false;
    if (filters?.session && filters.session !== 'all') {
      const kz = (s.killzone_origin || '').toLowerCase().replace(/^kz_/, '');
      const targetKz = filters.session.toLowerCase().replace(/^kz_/, '');
      if (kz !== targetKz) return false;
    }
    if (filters?.strategyId && filters.strategyId !== 'all') {
      const sid = s.strategy_id || 'sentinel_v2';
      if (sid !== filters.strategyId) return false;
    }
    if (filters?.instrument && filters.instrument !== 'all') {
      if (s.instrument !== filters.instrument) return false;
    }
    return true;
  };

  // Scope filter (includes or excludes turned-off assets)
  const filterSetups = (s: any) => {
    if (!baseFilter(s)) return false;
    if (filters?.assetVisibility === 'displayed_only' && disabledAssets.includes(s.instrument)) return false;
    if (filters?.assetVisibility === 'hidden_only' && !disabledAssets.includes(s.instrument)) return false;
    return true;
  };

  const filteredSetups = allSetups.filter(filterSetups);
  const setupMap = new Map<string, any>();
  allSetups.forEach(s => setupMap.set(s.id, s));

  // Compute comparative side-by-side totals (Displayed vs Hidden)
  let displayedTrades = 0, displayedWins = 0, displayedR = 0;
  let hiddenTrades = 0, hiddenWins = 0, hiddenR = 0;

  for (const o of outcomes) {
    if (minTimeMs > 0 && new Date(o.created_at).getTime() < minTimeMs) continue;
    const parentSetup = setupMap.get(o.setup_id);
    if (!parentSetup || !baseFilter(parentSetup)) continue;

    const isDisplayed = !disabledAssets.includes(parentSetup.instrument);
    const typeStr = String(o.outcome_type || '').toLowerCase();
    let isWin = false;
    let rVal = 0;
    if (typeStr.includes('tp2')) { isWin = true; rVal = parentSetup?.r_multiple_2 || 3.0; }
    else if (typeStr.includes('tp1') || typeStr.includes('tp')) { isWin = true; rVal = parentSetup?.r_multiple_1 || 2.0; }
    else if (typeStr.includes('sl') || typeStr.includes('stop')) { rVal = -1.0; }
    else if (typeStr.includes('be') || typeStr.includes('breakeven')) { rVal = 0.0; }
    else if (o.realized_pl !== undefined && o.realized_pl !== null) {
      rVal = Math.max(-1.0, o.realized_pl);
      if (rVal > 0) isWin = true;
    }

    if (isDisplayed) {
      displayedTrades++;
      if (isWin) displayedWins++;
      displayedR += rVal;
    } else {
      hiddenTrades++;
      if (isWin) hiddenWins++;
      hiddenR += rVal;
    }
  }

  const displayedSummary = {
    totalTrades: displayedTrades,
    wins: displayedWins,
    winRate: displayedTrades > 0 ? Number(((displayedWins / displayedTrades) * 100).toFixed(1)) : 0,
    totalR: Number(displayedR.toFixed(2)),
    expectancyR: displayedTrades > 0 ? Number((displayedR / displayedTrades).toFixed(2)) : 0
  };

  const hiddenSummary = {
    totalTrades: hiddenTrades,
    wins: hiddenWins,
    winRate: hiddenTrades > 0 ? Number(((hiddenWins / hiddenTrades) * 100).toFixed(1)) : 0,
    totalR: Number(hiddenR.toFixed(2)),
    expectancyR: hiddenTrades > 0 ? Number((hiddenR / hiddenTrades).toFixed(2)) : 0
  };

  const filteredOutcomes = outcomes.filter(o => {
    if (minTimeMs > 0 && new Date(o.created_at).getTime() < minTimeMs) return false;
    const parentSetup = setupMap.get(o.setup_id);
    if (parentSetup && !filterSetups(parentSetup)) return false;
    if (filters?.strategyId && filters.strategyId !== 'all') {
      const sid = o.strategy_id || parentSetup?.strategy_id || 'sentinel_v2';
      if (sid !== filters.strategyId) return false;
    }
    return true;
  });

  // Unique list of strategies from registered + existing setups/outcomes
  const stratMap = new Map<string, string>();
  registeredStrategies.forEach(s => stratMap.set(s.id, s.name));
  allSetups.forEach(s => {
    const id = s.strategy_id || 'sentinel_v2';
    if (!stratMap.has(id)) {
      stratMap.set(id, id === 'manna_snd' ? 'Manna SnD' : (id === 'sentinel_v2' || id === 'manna_elite' || id === 'manna_elite_v1_2') ? 'Manna Elite v1.2' : id);
    }
  });

  // Calculate detailed stats per strategy
  const strategyStats: Record<string, any> = {};

  stratMap.forEach((name, id) => {
    strategyStats[id] = {
      strategyId: id,
      strategyName: name,
      totalSignals: 0,
      activeSignals: 0,
      resolvedSignals: 0,
      invalidatedSignals: 0,
      totalTrades: 0,
      wins: 0,
      losses: 0,
      breakevens: 0,
      tp1Hits: 0,
      tp2Hits: 0,
      winRate: 0,
      totalRealizedR: 0,
      expectancyR: 0,
      profitFactor: 0,
      winningRSum: 0,
      losingRSum: 0,
      avgFillDurationMin: 0,
      avgHoldDurationMin: 0,
      marketBreakdown: {
        futures: { totalTrades: 0, wins: 0, losses: 0, winRate: 0, totalR: 0 },
        forex: { totalTrades: 0, wins: 0, losses: 0, winRate: 0, totalR: 0 }
      },
      sessionBreakdown: {
        london: { totalTrades: 0, wins: 0, winRate: 0, totalR: 0 },
        ny_am: { totalTrades: 0, wins: 0, winRate: 0, totalR: 0 },
        ny_pm: { totalTrades: 0, wins: 0, winRate: 0, totalR: 0 },
        asia: { totalTrades: 0, wins: 0, winRate: 0, totalR: 0 }
      },
      convictionDistribution: {
        totalScore: 0,
        count: 0,
        avgConviction: 0,
        highTier: { count: 0, wins: 0, winRate: 0 },
        medTier: { count: 0, wins: 0, winRate: 0 }
      },
      poiTypeDistribution: { FVG: 0, OC: 0, REVERSAL: 0, CONSOLIDATION: 0, OTHER: 0 },
      fillTimeTracker: { totalMs: 0, count: 0 },
      holdTimeTracker: { totalMs: 0, count: 0 }
    };
  });

  // Process setups
  for (const s of filteredSetups) {
    const stratId = s.strategy_id || 'sentinel_v2';
    if (!strategyStats[stratId]) {
      strategyStats[stratId] = {
        strategyId: stratId,
        strategyName: stratId,
        totalSignals: 0, activeSignals: 0, resolvedSignals: 0, invalidatedSignals: 0,
        totalTrades: 0, wins: 0, losses: 0, breakevens: 0, tp1Hits: 0, tp2Hits: 0, winRate: 0,
        totalRealizedR: 0, expectancyR: 0, profitFactor: 0, winningRSum: 0, losingRSum: 0,
        avgFillDurationMin: 0, avgHoldDurationMin: 0,
        marketBreakdown: { futures: { totalTrades: 0, wins: 0, losses: 0, winRate: 0, totalR: 0 }, forex: { totalTrades: 0, wins: 0, losses: 0, winRate: 0, totalR: 0 } },
        sessionBreakdown: { london: { totalTrades: 0, wins: 0, winRate: 0, totalR: 0 }, ny_am: { totalTrades: 0, wins: 0, winRate: 0, totalR: 0 }, ny_pm: { totalTrades: 0, wins: 0, winRate: 0, totalR: 0 }, asia: { totalTrades: 0, wins: 0, winRate: 0, totalR: 0 } },
        convictionDistribution: { totalScore: 0, count: 0, avgConviction: 0, highTier: { count: 0, wins: 0, winRate: 0 }, medTier: { count: 0, wins: 0, winRate: 0 } },
        poiTypeDistribution: { FVG: 0, OC: 0, REVERSAL: 0, CONSOLIDATION: 0, OTHER: 0 },
        fillTimeTracker: { totalMs: 0, count: 0 }, holdTimeTracker: { totalMs: 0, count: 0 }
      };
    }

    const st = strategyStats[stratId];
    st.totalSignals++;
    if (['awaiting_entry', 'active', 'runner'].includes(s.signal_state)) st.activeSignals++;
    else if (s.signal_state === 'resolved') st.resolvedSignals++;
    else if (s.signal_state === 'invalidated') st.invalidatedSignals++;

    if (s.conviction_score !== undefined && s.conviction_score !== null) {
      st.convictionDistribution.totalScore += Number(s.conviction_score);
      st.convictionDistribution.count++;
      if (s.conviction_score >= 85) st.convictionDistribution.highTier.count++;
      else st.convictionDistribution.medTier.count++;
    }

    try {
      const meta = JSON.parse(s.metadata || '{}');
      const poi = (meta.poi_type || 'OTHER').toUpperCase();
      if (st.poiTypeDistribution[poi] !== undefined) st.poiTypeDistribution[poi]++;
      else st.poiTypeDistribution.OTHER++;
    } catch {
      st.poiTypeDistribution.OTHER++;
    }

    if (s.created_at && s.entry_triggered_at) {
      const fillDiff = new Date(s.entry_triggered_at).getTime() - new Date(s.created_at).getTime();
      if (fillDiff > 0) {
        st.fillTimeTracker.totalMs += fillDiff;
        st.fillTimeTracker.count++;
      }
    }

    if (s.entry_triggered_at && s.resolved_at) {
      const holdDiff = new Date(s.resolved_at).getTime() - new Date(s.entry_triggered_at).getTime();
      if (holdDiff > 0) {
        st.holdTimeTracker.totalMs += holdDiff;
        st.holdTimeTracker.count++;
      }
    }
  }

  const tradeLogs: any[] = [];

  for (const o of filteredOutcomes) {
    const setup = setupMap.get(o.setup_id);
    const stratId = o.strategy_id || setup?.strategy_id || 'sentinel_v2';
    const st = strategyStats[stratId];
    if (!st) continue;

    st.totalTrades++;
    const typeStr = String(o.outcome_type || '').toLowerCase();
    const marketKey = (o.setup_market || setup?.market || 'futures').toLowerCase();
    const isFutures = marketKey === 'futures';
    const kzKey = (setup?.killzone_origin || 'london').toLowerCase().replace(/^kz_/, '');

    let rVal = 0;
    let isWin = false;
    let isLoss = false;
    let isBE = false;

    if (typeStr.includes('tp2')) {
      isWin = true;
      st.wins++;
      st.tp2Hits++;
      rVal = setup?.r_multiple_2 || 3.0;
    } else if (typeStr.includes('tp1') || typeStr.includes('tp')) {
      isWin = true;
      st.wins++;
      st.tp1Hits++;
      rVal = setup?.r_multiple_1 || 2.0;
    } else if (typeStr.includes('sl') || typeStr.includes('stop')) {
      isLoss = true;
      st.losses++;
      rVal = -1.0;
    } else if (typeStr.includes('be') || typeStr.includes('breakeven')) {
      isBE = true;
      st.breakevens++;
      rVal = 0.0;
    } else if (o.realized_pl !== undefined && o.realized_pl !== null) {
      rVal = Math.max(-1.0, o.realized_pl);
      if (rVal > 0) { isWin = true; st.wins++; }
      else if (rVal < 0) { isLoss = true; st.losses++; }
      else { isBE = true; st.breakevens++; }
    }

    st.totalRealizedR += rVal;
    if (rVal > 0) st.winningRSum += rVal;
    else if (rVal < 0) st.losingRSum += Math.abs(rVal);

    if (setup?.conviction_score !== undefined) {
      if (setup.conviction_score >= 85 && isWin) st.convictionDistribution.highTier.wins++;
      else if (setup.conviction_score < 85 && isWin) st.convictionDistribution.medTier.wins++;
    }

    const mkt = isFutures ? st.marketBreakdown.futures : st.marketBreakdown.forex;
    mkt.totalTrades++;
    if (isWin) mkt.wins++;
    else if (isLoss) mkt.losses++;
    mkt.totalR += rVal;

    if (st.sessionBreakdown[kzKey]) {
      const sess = st.sessionBreakdown[kzKey];
      sess.totalTrades++;
      if (isWin) sess.wins++;
      sess.totalR += rVal;
    }

    tradeLogs.push({
      outcomeId: o.id,
      setupId: o.setup_id,
      strategyId: stratId,
      strategyName: st.strategyName,
      instrument: o.instrument || setup?.instrument || 'N/A',
      market: isFutures ? 'Futures' : 'Forex',
      bias: setup?.bias || 'N/A',
      killzone: setup?.killzone_origin || 'N/A',
      convictionScore: setup?.conviction_score || 0,
      poiType: (() => {
        try { return JSON.parse(setup?.metadata || '{}').poi_type || 'N/A'; } catch { return 'N/A'; }
      })(),
      entryPrice: setup?.entry_zone_mid || 0,
      stopLoss: setup?.stop || 0,
      tp1: setup?.tp1 || 0,
      tp2: setup?.tp2 || 0,
      outcomeType: o.outcome_type || 'N/A',
      realizedR: Number(rVal.toFixed(2)),
      createdAt: o.created_at || setup?.created_at || new Date().toISOString()
    });
  }

  const strategyList: any[] = [];

  Object.values(strategyStats).forEach((st: any) => {
    if (st.totalTrades > 0) {
      st.winRate = Number(((st.wins / st.totalTrades) * 100).toFixed(1));
      st.expectancyR = Number((st.totalRealizedR / st.totalTrades).toFixed(2));
      st.profitFactor = st.losingRSum > 0 ? Number((st.winningRSum / st.losingRSum).toFixed(2)) : (st.totalRealizedR > 0 ? 99.9 : 0);
    } else {
      st.winRate = 0;
      st.expectancyR = 0;
      st.profitFactor = 0;
    }

    st.totalRealizedR = Number(st.totalRealizedR.toFixed(2));

    st.avgFillDurationMin = st.fillTimeTracker.count > 0 ? Number((st.fillTimeTracker.totalMs / st.fillTimeTracker.count / 60000).toFixed(1)) : 0;
    st.avgHoldDurationMin = st.holdTimeTracker.count > 0 ? Number((st.holdTimeTracker.totalMs / st.holdTimeTracker.count / 60000).toFixed(1)) : 0;

    if (st.convictionDistribution.count > 0) {
      st.convictionDistribution.avgConviction = Number((st.convictionDistribution.totalScore / st.convictionDistribution.count).toFixed(1));
    }

    if (st.convictionDistribution.highTier.count > 0) {
      st.convictionDistribution.highTier.winRate = Number(((st.convictionDistribution.highTier.wins / st.convictionDistribution.highTier.count) * 100).toFixed(1));
    }
    if (st.convictionDistribution.medTier.count > 0) {
      st.convictionDistribution.medTier.winRate = Number(((st.convictionDistribution.medTier.wins / st.convictionDistribution.medTier.count) * 100).toFixed(1));
    }

    ['futures', 'forex'].forEach(m => {
      const mb = st.marketBreakdown[m];
      if (mb.totalTrades > 0) {
        mb.winRate = Number(((mb.wins / mb.totalTrades) * 100).toFixed(1));
        mb.totalR = Number(mb.totalR.toFixed(2));
      }
    });

    Object.keys(st.sessionBreakdown).forEach(s => {
      const sb = st.sessionBreakdown[s];
      if (sb.totalTrades > 0) {
        sb.winRate = Number(((sb.wins / sb.totalTrades) * 100).toFixed(1));
        sb.totalR = Number(sb.totalR.toFixed(2));
      }
    });

    strategyList.push(st);
  });

  let bestWinRateStrategy = strategyList[0];
  let bestExpectancyStrategy = strategyList[0];
  let totalCombinedR = 0;
  let totalCombinedTrades = 0;

  strategyList.forEach(s => {
    if (s.winRate > (bestWinRateStrategy?.winRate || 0)) bestWinRateStrategy = s;
    if (s.expectancyR > (bestExpectancyStrategy?.expectancyR || 0)) bestExpectancyStrategy = s;
    totalCombinedR += s.totalRealizedR;
    totalCombinedTrades += s.totalTrades;
  });

  return {
    timestamp: new Date().toISOString(),
    filters: filters || { timeframe: 'all', market: 'both', session: 'all' },
    summary: {
      totalStrategiesTracked: strategyList.length,
      totalCombinedTrades,
      totalCombinedR: Number(totalCombinedR.toFixed(2)),
      bestWinRateStrategy: bestWinRateStrategy ? { id: bestWinRateStrategy.strategyId, name: bestWinRateStrategy.strategyName, winRate: bestWinRateStrategy.winRate } : null,
      bestExpectancyStrategy: bestExpectancyStrategy ? { id: bestExpectancyStrategy.strategyId, name: bestExpectancyStrategy.strategyName, expectancyR: bestExpectancyStrategy.expectancyR } : null,
      assetScopeComparison: {
        currentScope: filters?.assetVisibility || 'all',
        displayedAssets: displayedSummary,
        hiddenAssets: hiddenSummary,
        allAssets: {
          totalTrades: displayedTrades + hiddenTrades,
          wins: displayedWins + hiddenWins,
          winRate: (displayedTrades + hiddenTrades) > 0 ? Number((((displayedWins + hiddenWins) / (displayedTrades + hiddenTrades)) * 100).toFixed(1)) : 0,
          totalR: Number((displayedR + hiddenR).toFixed(2)),
          expectancyR: (displayedTrades + hiddenTrades) > 0 ? Number(((displayedR + hiddenR) / (displayedTrades + hiddenTrades)).toFixed(2)) : 0
        }
      }
    },
    strategies: strategyList,
    tradeLogs
  };
}

router.get('/strategy-analytics/comparison', async (req: Request, res: Response) => {
  try {
    const timeframe = (req.query.timeframe || 'all').toString();
    const market = (req.query.market || 'both').toString();
    const session = (req.query.session || 'all').toString();
    const strategyId = (req.query.strategy_id || 'all').toString();
    const assetVisibility = (req.query.asset_visibility || req.query.asset_scope || 'all').toString();
    const instrument = (req.query.instrument || 'all').toString();

    const data = await calculateStrategyComparisonData({ timeframe, market, session, strategyId, assetVisibility, instrument });
    res.json({ success: true, ...data });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to compute strategy comparison data', details: err.message });
  }
});

router.get('/strategy-analytics/export', async (req: Request, res: Response) => {
  try {
    const format = (req.query.format || 'markdown').toString().toLowerCase();
    const timeframe = (req.query.timeframe || 'all').toString();
    const market = (req.query.market || 'both').toString();
    const session = (req.query.session || 'all').toString();
    const strategyId = (req.query.strategy_id || 'all').toString();
    const assetVisibility = (req.query.asset_visibility || req.query.asset_scope || 'all').toString();
    const instrument = (req.query.instrument || 'all').toString();

    const dataset = await calculateStrategyComparisonData({ timeframe, market, session, strategyId, assetVisibility, instrument });

    if (format === 'json') {
      const exportJson = {
        metadata: {
          export_name: "MANNA_EDGE_STRATEGY_PERFORMANCE_DATASET",
          generated_at: dataset.timestamp,
          system_version: "2.0_SENTINEL_PRO",
          filter_applied: dataset.filters
        },
        summary: dataset.summary,
        strategies: dataset.strategies,
        trade_logs: dataset.tradeLogs,
        llm_prompt_templates: getLlmPromptTemplates(dataset)
      };
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="llm_strategy_analysis_${Date.now()}.json"`);
      return res.send(JSON.stringify(exportJson, null, 2));
    }

    if (format === 'csv') {
      let csv = 'OutcomeID,SetupID,StrategyID,StrategyName,Instrument,Market,Bias,Killzone,ConvictionScore,PoiType,EntryPrice,StopLoss,TP1,TP2,OutcomeType,RealizedR,CreatedAt\n';
      dataset.tradeLogs.forEach((t: any) => {
        csv += `"${t.outcomeId}","${t.setupId}","${t.strategyId}","${t.strategyName}","${t.instrument}","${t.market}","${t.bias}","${t.killzone}",${t.convictionScore},"${t.poiType}",${t.entryPrice},${t.stopLoss},${t.tp1},${t.tp2},"${t.outcomeType}",${t.realizedR},"${t.createdAt}"\n`;
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="strategy_trade_logs_${Date.now()}.csv"`);
      return res.send(csv);
    }

    let md = `# 🤖 MANNA EDGE — SYSTEMIC STRATEGY PERFORMANCE & TRADE LOG DATASET
> **Generated:** ${dataset.timestamp}  
> **System:** Manna Edge Markets 2.0 Super Admin Intelligence Engine  
> **Filters Applied:** Timeframe: \`${dataset.filters.timeframe}\` | Market: \`${dataset.filters.market}\` | Session: \`${dataset.filters.session}\` | Target Strategy: \`${dataset.filters.strategyId}\`

---

## 📊 EXECUTIVE STRATEGY COMPARISON SUMMARY

| Strategy Name | Strategy ID | Win Rate % | Total Trades | Total Realized R | Expectancy (Avg R) | Profit Factor | Futures Win Rate | Forex Win Rate | Avg Fill (Min) | Avg Hold (Min) |
|---|---|---|---|---|---|---|---|---|---|---|
`;

    dataset.strategies.forEach((s: any) => {
      md += `| **${s.strategyName}** | \`${s.strategyId}\` | **${s.winRate}%** | ${s.totalTrades} | **${s.totalRealizedR}R** | **${s.expectancyR}R** | ${s.profitFactor} | ${s.marketBreakdown.futures.winRate}% (${s.marketBreakdown.futures.totalR}R) | ${s.marketBreakdown.forex.winRate}% (${s.marketBreakdown.forex.totalR}R) | ${s.avgFillDurationMin}m | ${s.avgHoldDurationMin}m |\n`;
    });

    md += `
---

## 🎯 IN-DEPTH STRATEGY PROFILES

`;

    dataset.strategies.forEach((s: any) => {
      md += `### 🟢 Strategy: ${s.strategyName} (\`${s.strategyId}\`)
- **Signal Volume:** ${s.totalSignals} Total Signals (${s.activeSignals} Active, ${s.resolvedSignals} Resolved, ${s.invalidatedSignals} Invalidated)
- **Trade Outcome Breakdown:** ${s.wins} Wins (${s.tp1Hits} TP1 Hits, ${s.tp2Hits} TP2 Hits) | ${s.losses} Losses | ${s.breakevens} Breakevens
- **Conviction Metrics:** Avg Conviction Score: \`${s.convictionDistribution.avgConviction}\` | High Tier (>=85) Win Rate: **${s.convictionDistribution.highTier.winRate}%** | Medium Tier (<85) Win Rate: **${s.convictionDistribution.medTier.winRate}%**
- **Session Breakdown:**
  - **London Killzone:** ${s.sessionBreakdown.london.totalTrades} Trades | Win Rate: **${s.sessionBreakdown.london.winRate}%** | Realized: **${s.sessionBreakdown.london.totalR}R**
  - **NY AM Killzone:** ${s.sessionBreakdown.ny_am.totalTrades} Trades | Win Rate: **${s.sessionBreakdown.ny_am.winRate}%** | Realized: **${s.sessionBreakdown.ny_am.totalR}R**
  - **NY PM Killzone:** ${s.sessionBreakdown.ny_pm.totalTrades} Trades | Win Rate: **${s.sessionBreakdown.ny_pm.winRate}%** | Realized: **${s.sessionBreakdown.ny_pm.totalR}R**
  - **Asian Session:** ${s.sessionBreakdown.asia.totalTrades} Trades | Win Rate: **${s.sessionBreakdown.asia.winRate}%** | Realized: **${s.sessionBreakdown.asia.totalR}R**
- **POI Type Distribution:** FVG: \`${s.poiTypeDistribution.FVG}\` | Order Block (OC): \`${s.poiTypeDistribution.OC}\` | Reversal: \`${s.poiTypeDistribution.REVERSAL}\` | Consolidation: \`${s.poiTypeDistribution.CONSOLIDATION}\`

`;
    });

    md += `
---

## 📋 GRANULAR TRADE LOG DATASET (${dataset.tradeLogs.length} Records)

\`\`\`json
${JSON.stringify(dataset.tradeLogs, null, 2)}
\`\`\`

---

## 🧠 PRE-FORMULATED LLM ANALYSIS PROMPTS
*Copy and paste any of the prompt templates below directly into ChatGPT, Claude, Gemini, or DeepSeek along with this document to perform deep AI strategy diagnostics:*

### 1. ⚔️ Strategy Edge & Comparative Advantage Audit
\`\`\`markdown
You are a quantitative trading strategy auditor. Analyze the attached dataset containing strategy performance metrics and trade logs from Manna Edge Markets 2.0.
1. Compare the mathematical edge between the strategies. Which strategy demonstrates superior risk-adjusted expectancy and why?
2. Identify specific market regimes or POI types where the win rate drops below expected baselines.
3. Provide 3 actionable recommendations to optimize overall system profitability based strictly on empirical trade log evidence.
\`\`\`

### 2. ⏳ Session & Market Regime Sensitivity Analysis
\`\`\`markdown
Analyze the killzone session performance (London vs NY AM vs NY PM vs Asian) and market type (Futures vs Forex) across all strategies in this dataset.
1. Which session provides the highest win rate and expectancy R for each strategy?
2. Are there sessions where trades consistently hit Stop Losses or take too long to fill?
3. Should certain killzone sessions be filtered out or restricted for specific asset classes?
\`\`\`

### 3. 🎯 Risk/Reward & R-Multiple Parameter Optimization
\`\`\`markdown
Review the trade outcomes and R-multiple distributions (TP1 vs TP2 vs Stop Losses) in this strategy dataset.
1. Evaluate whether the TP1 and TP2 targets are mathematically optimal or if trailing stops/scale-out points would yield higher expectancy.
2. Analyze the impact of conviction scores on win rate. Does filtering setups to conviction score >= 85 increase net expectancy without sacrificing trade volume?
\`\`\`

### 4. 🔍 Anomalous Drawdown & Loss Diagnostic
\`\`\`markdown
Focus on all losing trades (SL_HIT) in the trade log table.
1. What patterns, instruments, or POI types account for the highest cluster of losses?
2. Is there evidence of false breakouts during low-liquidity market transitions?
3. Propose a rule-based invalidation filter to eliminate high-risk losing trades before entry.
\`\`\`
`;

    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename="llm_strategy_analysis_${Date.now()}.md"`);
    return res.send(md);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to export strategy dataset', details: err.message });
  }
});

function getLlmPromptTemplates(dataset: any) {
  return [
    {
      id: "edge_audit",
      name: "Strategy Edge & Comparative Advantage Audit",
      prompt: `You are a quantitative trading strategy auditor. Analyze the attached dataset containing strategy performance metrics and trade logs from Manna Edge Markets 2.0.\n1. Compare the mathematical edge between the strategies. Which strategy demonstrates superior risk-adjusted expectancy and why?\n2. Identify specific market regimes or POI types where the win rate drops below expected baselines.\n3. Provide 3 actionable recommendations to optimize overall system profitability based strictly on empirical trade log evidence.`
    },
    {
      id: "session_regime",
      name: "Session & Market Regime Sensitivity Analysis",
      prompt: `Analyze the killzone session performance (London vs NY AM vs NY PM vs Asian) and market type (Futures vs Forex) across all strategies in this dataset.\n1. Which session provides the highest win rate and expectancy R for each strategy?\n2. Are there sessions where trades consistently hit Stop Losses or take too long to fill?\n3. Should certain killzone sessions be filtered out or restricted for specific asset classes?`
    },
    {
      id: "r_multiple_optimization",
      name: "Risk/Reward & R-Multiple Parameter Optimization",
      prompt: `Review the trade outcomes and R-multiple distributions (TP1 vs TP2 vs Stop Losses) in this strategy dataset.\n1. Evaluate whether the TP1 and TP2 targets are mathematically optimal or if trailing stops/scale-out points would yield higher expectancy.\n2. Analyze the impact of conviction scores on win rate. Does filtering setups to conviction score >= 85 increase net expectancy without sacrificing trade volume?`
    },
    {
      id: "drawdown_diagnostic",
      name: "Anomalous Drawdown & Loss Diagnostic",
      prompt: `Focus on all losing trades (SL_HIT) in the trade log table.\n1. What patterns, instruments, or POI types account for the highest cluster of losses?\n2. Is there evidence of false breakouts during low-liquidity market transitions?\n3. Propose a rule-based invalidation filter to eliminate high-risk losing trades before entry.`
    }
  ];
}

// ── Notification Feature Toggles (Super Admin Only) ──────────────────────────

/**
 * GET /api/super-admin/notification-settings
 * Returns all Telegram notification toggles and registered markets.
 */
router.get('/notification-settings', async (_req: Request, res: Response) => {
  try {
    const [settings, markets] = await Promise.all([
      queries.getNotificationSettings(),
      queries.getRegisteredMarkets()
    ]);
    res.json({ settings, markets });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch notification settings', details: error?.message || String(error) });
  }
});

/**
 * PUT /api/super-admin/notification-settings/:key
 * Toggle a single Telegram notification feature on or off.
 * Body: { enabled: boolean }
 */
router.put('/notification-settings/:key', async (req: Request, res: Response) => {
  try {
    const key = req.params.key as string;
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Body must contain { enabled: boolean }' });
    }
    await queries.setNotificationSetting(key, enabled);
    const [settings, markets] = await Promise.all([
      queries.getNotificationSettings(),
      queries.getRegisteredMarkets()
    ]);
    res.json({ success: true, settings, markets });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update notification setting', details: error?.message || String(error) });
  }
});

/**
 * POST /api/super-admin/notification-settings/bulk
 * Bulk toggle notification features by market, category, or specific keys.
 * Body: { market?: string, category?: string, keys?: string[], enabled: boolean }
 */
router.post('/notification-settings/bulk', async (req: Request, res: Response) => {
  try {
    const { market, category, keys, enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Body must contain { enabled: boolean }' });
    }
    const settings = await queries.bulkSetNotificationSettings({ market, category, keys }, enabled);
    const markets = await queries.getRegisteredMarkets();
    res.json({ success: true, settings, markets });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to bulk update notification settings', details: error?.message || String(error) });
  }
});

/**
 * POST /api/super-admin/notification-settings/markets
 * Register a new market dynamically with dedicated stream toggles.
 * Body: { market: string, label?: string }
 */
router.post('/notification-settings/markets', async (req: Request, res: Response) => {
  try {
    const { market, label } = req.body;
    if (!market || typeof market !== 'string') {
      return res.status(400).json({ error: 'Body must contain a valid market string (e.g. crypto)' });
    }
    const result = await queries.registerMarket(market, label);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to register market', details: error?.message || String(error) });
  }
});

/**
 * DELETE /api/super-admin/notification-settings/markets/:market
 * Remove a custom registered market.
 */
router.delete('/notification-settings/markets/:market', async (req: Request, res: Response) => {
  try {
    const market = req.params.market as string;
    const result = await queries.deleteRegisteredMarket(market);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to remove market', details: error?.message || String(error) });
  }
});

export default router;
