import { KillzoneInfo } from '../discovery/types';
import * as queries from '../db/queries';
import { discoverUnifiedSetups } from '../discovery/unified-discovery';
import { executePublishRun } from '../publish-gate/publish-gate';
import { createLogger } from '../telemetry/logger';
import { isForexMarketOpen, isFuturesMarketOpen } from './killzone-mapper';

const logger = createLogger('midpoint-scanner');

// Minimum signals required per asset class. Scan fires if either open market is below this.
const MIN_SIGNALS_PER_CLASS = 2;

export async function processKillzoneMidpointScan(
    kzInfo: KillzoneInfo,
    runMode: 'live' | 'dry_run' = 'live'
): Promise<{
    scanned: boolean;
    marketScope?: 'both' | 'futures' | 'forex';
    futuresCount: number;
    forexCount: number;
    result?: any;
}> {
    const futuresSetups = await queries.getActiveSetups('futures');
    const forexSetups = await queries.getActiveSetups('forex');

    const now = new Date();
    const isForexOpen = isForexMarketOpen(now);
    const isFuturesOpen = isFuturesMarketOpen(now);

    const futuresCount = futuresSetups.length;
    const forexCount = forexSetups.length;

    // Scan fires when EITHER open market is below the minimum signal threshold.
    // Uses <= (less than or equal) so that having exactly MIN_SIGNALS_PER_CLASS - 1
    // or fewer in an open market always triggers a fill attempt.
    const futuresNeedsScan = isFuturesOpen && futuresCount < MIN_SIGNALS_PER_CLASS;
    const forexNeedsScan = isForexOpen && forexCount < MIN_SIGNALS_PER_CLASS;

    if (!futuresNeedsScan && !forexNeedsScan) {
        logger.info(
            { futuresCount, forexCount, isFuturesOpen, isForexOpen },
            'Killzone midpoint check: Both asset classes have >= 2 active setups or their markets are closed. Skipping rescan.'
        );
        return { scanned: false, futuresCount, forexCount };
    }

    let marketScope: 'both' | 'futures' | 'forex' = 'both';
    if (futuresNeedsScan && !forexNeedsScan) {
        marketScope = 'futures';
    } else if (forexNeedsScan && !futuresNeedsScan) {
        marketScope = 'forex';
    }

    const allActiveSetups = [...futuresSetups, ...forexSetups];
    const activeInstruments = allActiveSetups.map((s: any) => s.instrument).filter(Boolean);

    logger.info(
        {
            futuresCount,
            forexCount,
            marketScope,
            excludedInstruments: activeInstruments
        },
        `🔍 Mid-killzone trigger: ${marketScope} has < 2 active assets per asset class. Triggering scan for missing assets.`
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
