import crypto from 'crypto';
import express, { NextFunction, Request, Response } from 'express';
import { queryDb } from '../db/database';
import {
  buildEdgeFinderSnapshot,
  canRoleAccessConfluenceAnalytics,
  canRoleAccessEdgeFinder,
  EconomyCode,
  getConfluenceAnalyticsRollout,
  getEdgeFinderRollout,
  updateConfluenceAnalyticsRollout,
  updateEdgeFinderRollout,
  updateMacroEconomy
} from '../edge-finder/edge-finder-service';
import {
  backfillHistoricalSignalConfluence,
  getConfluencePerformanceReport
} from '../edge-finder/confluence-analytics';

const router = express.Router();
const VALID_ECONOMIES = new Set<EconomyCode>(['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD']);

export function resolveRequestRole(req: Request): string {
  const raw =
    req.headers['x-user-role'] ||
    req.headers['x-role'] ||
    (req as any).user?.role ||
    req.query.role ||
    req.query.user_role ||
    '';
  return String(raw).toLowerCase().trim();
}

export function resolveRequestEmail(req: Request): string {
  const raw =
    req.headers['x-user-email'] ||
    req.headers['x-email'] ||
    (req as any).user?.email ||
    req.query.email ||
    '';
  return String(raw).toLowerCase().trim();
}

async function recordRolloutAuditLog(adminEmail: string, adminRole: string, action: string, details: unknown): Promise<void> {
  try {
    await queryDb(
      `INSERT INTO admin_audit_logs (id, admin_email, admin_role, action, target_user_id, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        adminEmail || 'super_admin@mannaedge.local',
        adminRole || 'super_admin',
        action,
        'edge_finder_module',
        JSON.stringify(details),
        new Date().toISOString()
      ]
    );
  } catch {
    // Non-fatal if audit log schema differs on older DB instances
  }
}

function requireSuperAdminHeader(req: Request, res: Response, next: NextFunction) {
  const role = resolveRequestRole(req);
  if (role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: Only Super Admin can manage Manna EdgeFinder Pro governance.'
    });
  }
  return next();
}

async function requireEdgeFinderAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const role = resolveRequestRole(req);
    const rollout = await getEdgeFinderRollout();
    if (!canRoleAccessEdgeFinder(role, rollout)) {
      return res.status(403).json({
        success: false,
        error: 'Manna EdgeFinder Pro is currently locked for your account tier.',
        visibleToAdmins: rollout.visibleToAdmins,
        visibleToTraders: rollout.visibleToTraders
      });
    }
    return next();
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

// Public-to-authenticated-app status check so nav bars & route guards know toggle state
router.get('/access-status', async (req: Request, res: Response) => {
  try {
    const role = resolveRequestRole(req);
    const rollout = await getEdgeFinderRollout();
    const canAccess = canRoleAccessEdgeFinder(role, rollout);
    return res.json({
      success: true,
      canAccess,
      effectiveRole: role || 'guest',
      visibleToAdmins: rollout.visibleToAdmins,
      visibleToTraders: rollout.visibleToTraders,
      rollout
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/rollout', requireSuperAdminHeader, async (_req: Request, res: Response) => {
  try {
    const rollout = await getEdgeFinderRollout();
    return res.json({ success: true, rollout });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/rollout', requireSuperAdminHeader, async (req: Request, res: Response) => {
  try {
    const { visibleToAdmins, visibleToTraders } = req.body || {};
    if (visibleToAdmins !== undefined && typeof visibleToAdmins !== 'boolean') {
      return res.status(400).json({ success: false, error: '`visibleToAdmins` must be a boolean.' });
    }
    if (visibleToTraders !== undefined && typeof visibleToTraders !== 'boolean') {
      return res.status(400).json({ success: false, error: '`visibleToTraders` must be a boolean.' });
    }

    const email = resolveRequestEmail(req) || 'super_admin';
    const rollout = await updateEdgeFinderRollout(
      { visibleToAdmins, visibleToTraders },
      email
    );
    await recordRolloutAuditLog(email, 'super_admin', 'UPDATE_EDGE_FINDER_ROLLOUT', rollout);
    return res.json({ success: true, rollout });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/snapshot', requireEdgeFinderAccess, async (req: Request, res: Response) => {
  try {
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const snapshot = await buildEdgeFinderSnapshot(forceRefresh);
    return res.json({ success: true, ...snapshot });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/refresh', requireEdgeFinderAccess, async (_req: Request, res: Response) => {
  try {
    const snapshot = await buildEdgeFinderSnapshot(true);
    return res.json({ success: true, ...snapshot });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/asset/*', requireEdgeFinderAccess, async (req: Request, res: Response) => {
  try {
    const rawSymbol = decodeURIComponent((req.params as Record<string, string>)[0] || '').trim().toUpperCase();
    const normalizedDash = rawSymbol.includes('-') && !rawSymbol.includes('/') ? rawSymbol.replace('-', '/') : rawSymbol;
    const snapshot = await buildEdgeFinderSnapshot(false);
    const scorecard = snapshot.scorecards.find(
      (s) => s.instrument.toUpperCase() === rawSymbol || s.instrument.toUpperCase() === normalizedDash
    );
    if (!scorecard) {
      return res.status(404).json({ success: false, error: `Asset scorecard not found for ${rawSymbol}` });
    }
    return res.json({
      success: true,
      scorecard,
      economies: snapshot.economies,
      rollout: snapshot.rollout,
      generatedAt: snapshot.generatedAt
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/macro/:currency', requireSuperAdminHeader, async (req: Request, res: Response) => {
  try {
    const currency = String(req.params.currency || '').toUpperCase().trim() as EconomyCode;
    if (!VALID_ECONOMIES.has(currency)) {
      return res.status(400).json({ success: false, error: `Unsupported economy code: ${currency}` });
    }

    const email = resolveRequestEmail(req) || 'super_admin';
    await updateMacroEconomy(currency, req.body || {});
    await recordRolloutAuditLog(email, 'super_admin', `UPDATE_EDGE_FINDER_MACRO_${currency}`, req.body || {});
    const snapshot = await buildEdgeFinderSnapshot(true);
    return res.json({ success: true, ...snapshot });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── Signal Card Confluence Performance & Mathematical Proof Analytics ────────

async function requireConfluenceAnalyticsAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const role = resolveRequestRole(req);
    const rollout = await getConfluenceAnalyticsRollout();
    if (!canRoleAccessConfluenceAnalytics(role, rollout)) {
      return res.status(403).json({
        success: false,
        error: 'EdgeFinder Signal Confluence Performance Tracker is currently disabled for your tier.',
        visibleToAdmins: rollout.visibleToAdmins,
        visibleToTraders: rollout.visibleToTraders
      });
    }
    return next();
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

router.get('/confluence-analytics/access-status', async (req: Request, res: Response) => {
  try {
    const role = resolveRequestRole(req);
    const rollout = await getConfluenceAnalyticsRollout();
    const canAccess = canRoleAccessConfluenceAnalytics(role, rollout);
    return res.json({
      success: true,
      canAccess,
      effectiveRole: role || 'guest',
      visibleToAdmins: rollout.visibleToAdmins,
      visibleToTraders: rollout.visibleToTraders,
      rollout
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/confluence-analytics/rollout', requireSuperAdminHeader, async (_req: Request, res: Response) => {
  try {
    const rollout = await getConfluenceAnalyticsRollout();
    return res.json({ success: true, rollout });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/confluence-analytics/rollout', requireSuperAdminHeader, async (req: Request, res: Response) => {
  try {
    const { visibleToAdmins, visibleToTraders } = req.body || {};
    if (visibleToAdmins !== undefined && typeof visibleToAdmins !== 'boolean') {
      return res.status(400).json({ success: false, error: '`visibleToAdmins` must be a boolean.' });
    }
    if (visibleToTraders !== undefined && typeof visibleToTraders !== 'boolean') {
      return res.status(400).json({ success: false, error: '`visibleToTraders` must be a boolean.' });
    }
    const email = resolveRequestEmail(req) || 'super_admin';
    const rollout = await updateConfluenceAnalyticsRollout({ visibleToAdmins, visibleToTraders }, email);
    await recordRolloutAuditLog(email, 'super_admin', 'UPDATE_CONFLUENCE_ANALYTICS_ROLLOUT', rollout);
    return res.json({ success: true, rollout });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/confluence-analytics/report', requireConfluenceAnalyticsAccess, async (req: Request, res: Response) => {
  try {
    const period = req.query.period ? String(req.query.period) : 'november_2026';
    const month = req.query.month ? String(req.query.month) : undefined;
    const style = req.query.style ? String(req.query.style) : 'all';
    const market = req.query.market ? String(req.query.market) : 'all';
    const strategyId = req.query.strategy_id ? String(req.query.strategy_id) : 'all';
    const autoBackfill = req.query.auto_backfill !== '0' && req.query.auto_backfill !== 'false';

    const report = await getConfluencePerformanceReport({
      period,
      month,
      style,
      market,
      strategyId,
      autoBackfill
    });
    return res.json({ success: true, report });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/confluence-analytics/backfill', requireConfluenceAnalyticsAccess, async (req: Request, res: Response) => {
  try {
    const period = req.body?.period ? String(req.body.period) : 'november_2026';
    const month = req.body?.month ? String(req.body.month) : undefined;
    const forceRecompute = Boolean(req.body?.forceRecompute);
    const backfillResult = await backfillHistoricalSignalConfluence({
      period,
      month,
      forceRecompute
    });
    const report = await getConfluencePerformanceReport({
      period,
      month,
      style: req.body?.style ? String(req.body.style) : 'all',
      market: req.body?.market ? String(req.body.market) : 'all',
      strategyId: req.body?.strategyId ? String(req.body.strategyId) : 'all',
      autoBackfill: false
    });
    return res.json({ success: true, backfillResult, report });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/confluence-analytics/export-csv', requireConfluenceAnalyticsAccess, async (req: Request, res: Response) => {
  try {
    const period = req.query.period ? String(req.query.period) : 'november_2026';
    const month = req.query.month ? String(req.query.month) : undefined;
    const style = req.query.style ? String(req.query.style) : 'all';
    const market = req.query.market ? String(req.query.market) : 'all';
    const strategyId = req.query.strategy_id ? String(req.query.strategy_id) : 'all';

    const report = await getConfluencePerformanceReport({
      period,
      month,
      style,
      market,
      strategyId,
      autoBackfill: true
    });

    const escapeCsv = (val: unknown): string => {
      const str = String(val ?? '');
      if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
      return str;
    };

    const headers = [
      'setup_id', 'created_at', 'instrument', 'market', 'trading_style', 'strategy_id', 'bias',
      'category_key', 'badge_text', 'agrees_with_edgefinder', 'scalp_score', 'intraday_score',
      'swing_score', 'total_score', 'bias_label', 'signal_state', 'outcome_type', 'realized_r',
      'provenance'
    ];
    const lines = [headers.join(',')];
    for (const row of report.signals) {
      lines.push(
        [
          row.setupId, row.createdAt, row.instrument, row.market, row.tradingStyle, row.strategyId,
          row.bias, row.categoryKey, row.badgeText, row.agreesWithEdgeFinder ? 'YES' : 'NO',
          row.scalpScore, row.intradayScore, row.swingScore, row.totalScore, row.biasLabel,
          row.signalState, row.outcomeType || '', row.realizedR ?? '', row.provenance
        ]
          .map(escapeCsv)
          .join(',')
      );
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="edgefinder_confluence_${report.filters.period}.csv"`);
    return res.send(lines.join('\n'));
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
