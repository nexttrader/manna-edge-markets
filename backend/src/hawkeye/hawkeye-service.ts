import * as queries from '../db/queries';
import { InvalidationAudit, PublishRun, Outcome } from '../discovery/types';
import { createLogger } from '../telemetry/logger';

const logger = createLogger('HawkeyeService');

export const hawkeyeService = {
  logInvalidation(params: {
    setupId: string,
    instrument?: string,
    setupMarket: string,
    runId: string,
    reasonCode: string,
    detail: string,
    previousState: string,
    newState: string,
    createdBy: string
  }): void {
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
    
    queries.insertInvalidationAudit(audit);
    logger.info({ setupId: params.setupId, reason: params.reasonCode }, 'Logged invalidation');
  },

  getRecentInvalidations(limit: number = 50): InvalidationAudit[] {
    return queries.getRecentInvalidations(limit);
  },

  getSetupHistory(setupId: string, market: string): InvalidationAudit[] {
    return queries.getSetupHistory(setupId, market);
  },

  getRunSummary(runId: string): { run: PublishRun | undefined, invalidations: InvalidationAudit[], outcomes: Outcome[] } {
    const run = queries.getPublishRun(runId);
    const invalidations = queries.getInvalidationsByRun(runId);
    const outcomes = queries.getOutcomesByRun(runId);
    return { run: run || undefined, invalidations, outcomes };
  },

  getStats(): { total: number, byReason: Record<string, number>, last24h: number } {
    return queries.getInvalidationStats();
  }
};
