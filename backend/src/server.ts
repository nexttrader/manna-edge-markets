import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { initializeDatabase } from './db/database';
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

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err: any, req: any, res: Response, _next: NextFunction) => {
    logger.error({ err, reqId: req.id }, 'Unhandled error');
    res.status(500).json({ error: 'Internal server error', reqId: req.id });
});

async function startServer() {
    try {
        logger.info('Initializing database...');
        initializeDatabase();

        logger.info('Starting lifecycle sync...');
        lifecycleSync.start(15000);

        logger.info('Starting outcome detector...');
        outcomeDetector.start(15000);

        logger.info('Starting scheduler...');
        startScheduler(async (kzInfo) => {
            logger.info({ killzone: kzInfo.killzone }, 'Killzone boundary triggered');
            try {
                const runId = `run_${Date.now()}`;
                const { futures, forex } = await discoverUnifiedSetups(kzInfo, runId, 'both');
                const result = await executePublishRun(kzInfo, futures, forex, 'live', 'scheduled');
                logger.info({ result }, 'Publish run completed');
            } catch (err) {
                logger.error({ err }, 'Killzone boundary handler failed');
            }
        });

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
