import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { initializeDatabase } from './db/database';
import * as queries from './db/queries';
import { startScheduler, stopScheduler } from './scheduler/scheduler';
import { getCurrentKillzone, getNextKillzoneBoundary } from './scheduler/killzone-mapper';
import { discoverUnifiedSetups } from './discovery/unified-discovery';
import { executePublishRun } from './publish-gate/publish-gate';
import { lifecycleSync } from './lifecycle/lifecycle-sync';
import { outcomeDetector } from './outcomes/outcome-detector';
import { createLogger } from './telemetry/logger';

import setupRoutes from './api/setup-routes';
import adminRoutes from './api/admin-routes';
import hawkeyeRoutes from './api/hawkeye-routes';
import runRoutes from './api/run-routes';
import eventsRouter from './api/events';
import newsRoutes from './api/news-routes';

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
app.use('/api/admin', runRoutes);
app.use('/api/hawkeye', hawkeyeRoutes);
app.use('/api/news', newsRoutes);
app.use('/api', eventsRouter);

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

// Error handling
app.use((err: any, req: any, res: Response, _next: NextFunction) => {
    logger.error({ err, reqId: req.id }, 'Unhandled error');
    res.status(500).json({ error: 'Internal server error', reqId: req.id });
});

async function runStartupDiscoveryIfEmpty() {
    try {
        const activeSetups = await queries.getAllActiveSetups();
        const activeCount = activeSetups.length;
        const sndCount = activeSetups.filter(s => s.strategy_id === 'manna_snd').length;

        if (activeCount < 5 || sndCount === 0) {
            logger.info({ activeCount, sndCount }, '⚡ Active setups low or Manna SnD has 0 setups. Running immediate discovery scan...');
            const now = new Date();
            const kzInfo = getCurrentKillzone(now);
            const runId = `startup_run_${Date.now()}`;
            const { futures, forex } = await discoverUnifiedSetups(kzInfo, runId, 'both');
            const result = await executePublishRun(kzInfo, futures, forex, 'live', 'manual');
            logger.info({ result }, '🚀 Initial startup discovery run completed successfully.');
        } else {
            logger.info({ activeCount, sndCount }, '🟢 Existing active setups found in database for all strategies.');
        }
    } catch (err) {
        logger.error({ err }, '⚠️ Startup discovery run failed');
    }
}

async function startServer() {
    try {
        logger.info('Initializing database...');
        await initializeDatabase();

        logger.info('Starting lifecycle sync...');
        lifecycleSync.start(15000);

        logger.info('Starting outcome detector...');
        outcomeDetector.start(15000);

        logger.info('Starting scheduler with Killzone Boundary & Midpoint triggers...');
        startScheduler(
            // 1. Killzone Start Handler
            async (kzInfo) => {
                logger.info({ killzone: kzInfo.killzone }, 'Killzone start boundary triggered');
                try {
                    const runId = `run_${Date.now()}`;
                    const { futures, forex } = await discoverUnifiedSetups(kzInfo, runId, 'both');
                    const result = await executePublishRun(kzInfo, futures, forex, 'live', 'scheduled');
                    logger.info({ result }, 'Killzone boundary publish run completed');
                } catch (err) {
                    logger.error({ err }, 'Killzone boundary handler failed');
                }
            },
            // 2. Killzone Midpoint Booster Handler
            async (kzInfo) => {
                logger.info({ killzone: kzInfo.killzone }, 'Killzone midpoint boundary triggered');
                try {
                    const activeSetups = await queries.getAllActiveSetups();
                    if (activeSetups.length < 5) {
                        const activeInstruments = activeSetups.map((s: any) => s.instrument).filter(Boolean);
                        logger.info({
                            activeCount: activeSetups.length,
                            excludedInstruments: activeInstruments
                        }, '🔍 Killzone midpoint active setups < 5. Running targeted scan for un-represented symbols.');

                        const runId = `mid_run_${Date.now()}`;
                        const { futures, forex } = await discoverUnifiedSetups(kzInfo, runId, 'both', activeInstruments);
                        const result = await executePublishRun(kzInfo, futures, forex, 'live', 'scheduled');
                        logger.info({ result }, 'Mid-killzone booster publish run completed');
                    } else {
                        logger.info({ activeCount: activeSetups.length }, 'Killzone midpoint active setups >= 5. No booster scan required.');
                    }
                } catch (err) {
                    logger.error({ err }, 'Killzone midpoint handler failed');
                }
            }
        );

        // Run automatic initial discovery scan on boot if DB is empty
        await runStartupDiscoveryIfEmpty();

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
        const shutdown = (signal: string) => {
            logger.info({ signal }, 'Shutting down gracefully...');
            lifecycleSync.stop();
            outcomeDetector.stop();
            stopScheduler();
            process.exit(0);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

    } catch (error) {
        logger.error({ err: error }, 'Failed to start server');
        process.exit(1);
    }
}

startServer();

export default app;
