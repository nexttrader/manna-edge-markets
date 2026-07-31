import * as queries from '../db/queries';
import { InvalidationAudit, PublishRun, Outcome } from '../discovery/types';
import { createLogger } from '../telemetry/logger';

const logger = createLogger('HawkeyeService');

export const hawkeyeService = {
  async logInvalidation(params: {
    setupId: string,
    instrument?: string,
    setupMarket: string,
    runId: string,
    reasonCode: string,
    detail: string,
    previousState: string,
    newState: string,
    createdBy: string
  }): Promise<void> {
    const audit: InvalidationAudit = {
      id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      setup_id: params.setupId,
      instrument: params.instrument,
      setup_market: params.setupMarket,
      run_id: params.runId,
      timestamp: new Date().toISOString(),
      reason_code: params.reasonCode,
      detail: params.detail,
      previous_state: params.previousState,
      new_state: params.newState,
      created_by: params.createdBy
    };
    
    await queries.insertInvalidationAudit(audit);
    logger.info({ setupId: params.setupId, reason: params.reasonCode }, 'Logged invalidation');
  },

  async getRecentInvalidations(limit: number = 50): Promise<InvalidationAudit[]> {
    return await queries.getRecentInvalidations(limit);
  },

  async getSetupHistory(setupId: string, market: string): Promise<InvalidationAudit[]> {
    return await queries.getSetupHistory(setupId, market);
  },

  async getRunSummary(runId: string): Promise<{ run: PublishRun | undefined, invalidations: InvalidationAudit[], outcomes: Outcome[] }> {
    const run = await queries.getPublishRun(runId);
    const invalidations = await queries.getInvalidationsByRun(runId);
    const outcomes = await queries.getOutcomesByRun(runId);
    return { run: run || undefined, invalidations, outcomes };
  },

  async getStats(): Promise<{ total: number, byReason: Record<string, number>, last24h: number }> {
    return await queries.getInvalidationStats();
  }
};
