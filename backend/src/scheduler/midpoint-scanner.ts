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

    const isNYAMCashOpen = kzInfo.killzone === 'ny_am';

    // Scan fires when EITHER open market is below the minimum signal threshold,
    // OR unconditionally for futures at 09:30 ET (NY Cash Open) when cash market volume activates.
    const futuresNeedsScan = isFuturesOpen && (futuresCount < MIN_SIGNALS_PER_CLASS || isNYAMCashOpen);
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

    // For regular midpoint booster, exclude active instruments.
    // For 09:30 ET US Cash Open, do NOT exclude futures instruments so fresh Cash Open volume is evaluated for all futures contracts.
    const allActiveSetups = [...futuresSetups, ...forexSetups];
    const activeInstruments = isNYAMCashOpen 
        ? forexSetups.map((s: any) => s.instrument).filter(Boolean)
        : allActiveSetups.map((s: any) => s.instrument).filter(Boolean);

    logger.info(
        {
            futuresCount,
            forexCount,
            marketScope,
            isNYAMCashOpen,
            excludedInstruments: activeInstruments
        },
        `🔍 Mid-killzone trigger: ${marketScope} scan activated${isNYAMCashOpen ? ' (09:30 ET US Cash Open Futures Recheck)' : ''}.`
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
