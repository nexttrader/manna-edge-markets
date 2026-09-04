import { KillzoneInfo } from '../discovery/types';
import * as queries from '../db/queries';
import { discoverUnifiedSetups } from '../discovery/unified-discovery';
import { executePublishRun } from '../publish-gate/publish-gate';
import { createLogger } from '../telemetry/logger';
import { isForexMarketOpen, isFuturesMarketOpen } from './killzone-mapper';
import { outcomeDetector } from '../outcomes/outcome-detector';

const logger = createLogger('midpoint-scanner');

// Minimum signals required per asset class to maintain active killzone coverage.
const MIN_SIGNALS_FOREX = 4;
const MIN_SIGNALS_FUTURES = 2;

export async function processKillzoneMidpointScan(
    kzInfo: KillzoneInfo,
    runMode: 'live' | 'dry_run' = 'live',
    timestamp: Date = new Date()
): Promise<{
    scanned: boolean;
    marketScope?: 'both' | 'futures' | 'forex';
    futuresCount: number;
    forexCount: number;
    result?: any;
}> {
    // 1. Force evaluation of all active setups to ensure resolved/TP/SL states are fresh & synced
    try {
        await outcomeDetector.evaluateAllSetups(true);
    } catch (err) {
        logger.warn({ err }, 'Outcome detector pre-scan evaluation encountered an error');
    }

    const futuresSetups = await queries.getActiveSetups('futures');
    const forexSetups = await queries.getActiveSetups('forex');

    const isForexOpen = isForexMarketOpen(timestamp);
    const isFuturesOpen = isFuturesMarketOpen(timestamp);

    const futuresCount = futuresSetups.length;
    const forexCount = forexSetups.length;

    // Scan fires when EITHER open market is below its minimum signal threshold.
    const futuresNeedsScan = isFuturesOpen && futuresCount < MIN_SIGNALS_FUTURES;
    const forexNeedsScan = isForexOpen && forexCount < MIN_SIGNALS_FOREX;

    if (!futuresNeedsScan && !forexNeedsScan) {
        logger.info(
            { futuresCount, forexCount, minFutures: MIN_SIGNALS_FUTURES, minForex: MIN_SIGNALS_FOREX, isFuturesOpen, isForexOpen },
            'Killzone midpoint check: Both asset classes have sufficient active setups or their markets are closed. Skipping rescan.'
        );
        return { scanned: false, futuresCount, forexCount };
    }

    let marketScope: 'both' | 'futures' | 'forex' = 'both';
    if (futuresNeedsScan && !forexNeedsScan) {
        marketScope = 'futures';
    } else if (forexNeedsScan && !futuresNeedsScan) {
        marketScope = 'forex';
    }

    // Exclude currently pending/active instruments to prevent duplicate setups on the same asset.
    // Stale awaiting_entry setups older than 6 hours are not allowed to block new discoveries.
    const nowMs = timestamp.getTime();
    const activeInstruments = [...futuresSetups, ...forexSetups]
        .filter((s: any) => {
            if (s.signal_state === 'awaiting_entry' && s.created_at) {
                const ageMs = nowMs - new Date(s.created_at).getTime();
                if (ageMs > 6 * 60 * 60 * 1000) return false;
            }
            return true;
        })
        .map((s: any) => s.instrument)
        .filter(Boolean);

    logger.info(
        {
            futuresCount,
            forexCount,
            minFutures: MIN_SIGNALS_FUTURES,
            minForex: MIN_SIGNALS_FOREX,
            marketScope,
            excludedInstruments: activeInstruments
        },
        `🔍 Mid-killzone trigger: ${marketScope} scan activated for missing assets (Forex count: ${forexCount}/${MIN_SIGNALS_FOREX}, Futures count: ${futuresCount}/${MIN_SIGNALS_FUTURES}).`
    );

    const runId = `mid_run_${Date.now()}`;
    const { futures, forex } = await discoverUnifiedSetups(kzInfo, runId, marketScope, activeInstruments);
    const result = await executePublishRun(kzInfo, futures, forex, runMode, 'scheduled');

    logger.info({ result }, 'Mid-killzone booster publish run completed.');

    return {
        scanned: true,
        marketScope,
        futuresCount,
        forexCount,
        result
    };
}
