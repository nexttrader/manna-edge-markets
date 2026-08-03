import express, { Request, Response } from 'express';
import { publishEvents } from '../publish-gate/publish-gate';

const router = express.Router();

router.get('/events', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const sendEvent = (type: string, payload: any) => {
    res.write(`data: ${JSON.stringify({ type, payload, timestamp: new Date().toISOString() })}\n\n`);
  };

  const handleRunComplete = (payload: any) => sendEvent('run_complete', payload);
  const handleSetupCreated = (payload: any) => sendEvent('setup_created', payload);
  const handleSetupInvalidated = (payload: any) => sendEvent('setup_invalidated', payload);
  const handleSetupEntered = (payload: any) => sendEvent('setup_entered', payload);
  const handleSetupResolved = (payload: any) => sendEvent('setup_resolved', payload);
  const handleCircuitBreaker = (payload: any) => sendEvent('circuit_breaker', payload);
  const handleReportPublished = (payload: any) => sendEvent('performance_report_published', payload);
  const handleReportRecalled = (payload: any) => sendEvent('performance_report_recalled', payload);

  publishEvents.on('run_complete', handleRunComplete);
  publishEvents.on('setup_created', handleSetupCreated);
  publishEvents.on('setup_invalidated', handleSetupInvalidated);
  publishEvents.on('setup_entered', handleSetupEntered);
  publishEvents.on('setup_resolved', handleSetupResolved);
  publishEvents.on('circuit_breaker', handleCircuitBreaker);
  publishEvents.on('performance_report_published', handleReportPublished);
  publishEvents.on('performance_report_recalled', handleReportRecalled);

  const keepAlive = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 30000);

  req.on('close', () => {
    publishEvents.off('run_complete', handleRunComplete);
    publishEvents.off('setup_created', handleSetupCreated);
    publishEvents.off('setup_invalidated', handleSetupInvalidated);
    publishEvents.off('setup_entered', handleSetupEntered);
    publishEvents.off('setup_resolved', handleSetupResolved);
    publishEvents.off('circuit_breaker', handleCircuitBreaker);
    publishEvents.off('performance_report_published', handleReportPublished);
    publishEvents.off('performance_report_recalled', handleReportRecalled);
    clearInterval(keepAlive);
  });
});

export default router;
