import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { initializeDatabase } from './db/database';
import { saveSignalsSnapshot } from './db/signal-snapshot-restore';
import * as queries from './db/queries';
import { startScheduler, stopScheduler } from './scheduler/scheduler';
import { getCurrentKillzone, getNextKillzoneBoundary, isForexMarketOpen, isFuturesMarketOpen } from './scheduler/killzone-mapper';
import { discoverUnifiedSetups } from './discovery/unified-discovery';
import { executePublishRun } from './publish-gate/publish-gate';
import { lifecycleSync } from './lifecycle/lifecycle-sync';
import { outcomeDetector } from './outcomes/outcome-detector';
import { startAutomatedHealthDiagnostics } from './diagnostics/health-checker';
import { createLogger } from './telemetry/logger';
import { startIBPriceStreaming } from './discovery/ib-provider';

import { processKillzoneMidpointScan } from './scheduler/midpoint-scanner';
import setupRoutes from './api/setup-routes';
import adminRoutes from './api/admin-routes';
import superAdminRoutes from './api/super-admin-routes';
import hawkeyeRoutes from './api/hawkeye-routes';
import runRoutes from './api/run-routes';
import eventsRouter from './api/events';
import newsRoutes from './api/news-routes';
import supportRoutes from './api/support-routes';
import userManagementRoutes from './api/user-management-routes';
import { startSubscriptionScheduler } from './scheduler/subscription-cron';

const logger = createLogger('server');
const app = express();
const PORT = process.env.PORT || 4001;

// Middleware
app.use(cors());
app.use(express.json());
app.use((req: any, _res: Response, next: NextFunction) => {
    req.id = uuidv4();
    next();
});

// Routes
app.use('/api', setupRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/admin/system', userManagementRoutes);
app.use('/api/admin', runRoutes);
app.use('/api/hawkeye', hawkeyeRoutes);
app.use('/api/news', newsRoutes);
app.use('/api', eventsRouter);
app.use('/api/support', supportRoutes);

// Health check with DB status check for UptimeRobot keep-alive
app.get('/api/health', async (_req: Request, res: Response) => {
    try {
        const activeSetups = await queries.getAllActiveSetups();
        res.json({
            status: 'ok',
            database: 'connected',
            activeSetupsCount: activeSetups.length,
            timestamp: new Date().toISOString()
        });
    } catch (err: any) {
        res.json({
            status: 'ok',
            database: 'degraded',
            error: err.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Serve compiled frontend assets if present across local or production deployment paths
const possibleDistPaths = [
    path.resolve(process.cwd(), 'frontend/dist'),
    path.resolve(process.cwd(), 'dist'),
    path.resolve(__dirname, '../../frontend/dist'),
    path.resolve(__dirname, '../../../frontend/dist')
];
const frontendDistPath = possibleDistPaths.find(p => fs.existsSync(p) && fs.existsSync(path.join(p, 'index.html')));

if (frontendDistPath) {
    logger.info({ frontendDistPath }, '🟢 Serving static frontend dist assets & SPA fallback route.');
    app.use(express.static(frontendDistPath));
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
        if (req.path.startsWith('/api')) return next();
        res.sendFile(path.join(frontendDistPath, 'index.html'));
    });
}

// Error handling
app.use((err: any, req: any, res: Response, _next: NextFunction) => {
    logger.error({ err, reqId: req.id }, 'Unhandled error');
    res.status(500).json({ error: 'Internal server error', reqId: req.id });
});

async function startServer() {
    try {
        logger.info('Initializing database...');
        await initializeDatabase();

        logger.info('Starting IBKR price streaming daemon (if enabled)...');
        try {
            startIBPriceStreaming();
        } catch (err: any) {
            logger.error({ err: err.message }, 'Failed to start IBKR price streaming daemon');
        }

        logger.info('Starting lifecycle sync...');
        lifecycleSync.start(15000);

        logger.info('Starting outcome detector...');
        outcomeDetector.start(15000);

        logger.info('Starting automated 15-minute system health diagnostic checker...');
        startAutomatedHealthDiagnostics();

        logger.info('Starting automated user subscription & trial expiry scheduler...');
        startSubscriptionScheduler();

        logger.info('Starting scheduler with Killzone Boundary & Midpoint triggers...');
        startScheduler(
            // 1. Killzone Start Handler
            async (kzInfo) => {
                logger.info({ killzone: kzInfo.killzone }, 'Killzone start boundary triggered');
                try {
                    const now = new Date();
                    const isForexOpen = isForexMarketOpen(now);
                    const isFuturesOpen = isFuturesMarketOpen(now);
                    
                    let scope: 'both' | 'futures' | 'forex' | null = 'both';
                    if (!isForexOpen && !isFuturesOpen) {
                        scope = null;
                    } else if (isForexOpen && !isFuturesOpen) {
                        scope = 'forex';
                    } else if (!isForexOpen && isFuturesOpen) {
                        scope = 'futures';
                    }
                    
                    if (!scope) {
                        logger.info('Skipping Killzone boundary scan: Both Forex and Futures markets are closed.');
                        return;
                    }

                    const runId = `run_${Date.now()}`;
                    const { futures, forex } = await discoverUnifiedSetups(kzInfo, runId, scope);
                    const result = await executePublishRun(kzInfo, futures, forex, 'live', 'scheduled');
                    logger.info({ result, scope }, 'Killzone boundary publish run completed');
                } catch (err) {
                    logger.error({ err }, 'Killzone boundary handler failed');
                }
            },
            // 2. Killzone Midpoint Booster Handler
            async (kzInfo) => {
                logger.info({ killzone: kzInfo.killzone }, 'Killzone midpoint boundary triggered');
                try {
                    await processKillzoneMidpointScan(kzInfo, 'live');
                } catch (err) {
                    logger.error({ err }, 'Killzone midpoint handler failed');
                }
            }
        );

        // Server boot starts cleanly. Automatic startup scan removed to ensure active setups are preserved.
        app.listen(Number(PORT), '0.0.0.0', () => {
            const now = new Date();
            const currentKz = getCurrentKillzone(now);
            const nextBoundary = getNextKillzoneBoundary(now);
            logger.info({
                port: PORT,
                currentKillzone: currentKz?.killzone || 'unknown',
                nextBoundary: nextBoundary?.killzone || 'unknown',
            }, `🚀 Killzone Discovery Engine running on port ${PORT}`);
        });

        // Graceful shutdown
        const shutdown = async (signal: string) => {
            logger.info({ signal }, 'Shutting down gracefully...');
            try {
                const activeSetups = await queries.getAllActiveSetups();
                await saveSignalsSnapshot(activeSetups);
                logger.info('Active signals snapshotted successfully during shutdown.');
            } catch (err: any) {
                logger.warn({ err: err.message }, 'Failed to save active signals snapshot on shutdown');
            }
            lifecycleSync.stop();
            outcomeDetector.stop();
            stopScheduler();
            process.exit(0);
        };

        process.on('SIGTERM', () => { shutdown('SIGTERM'); });
        process.on('SIGINT', () => { shutdown('SIGINT'); });

    } catch (error) {
        logger.error({ err: error }, 'Failed to start server');
        process.exit(1);
    }
}

startServer();

export default app;
