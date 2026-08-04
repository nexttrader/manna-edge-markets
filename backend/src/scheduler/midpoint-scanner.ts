import { KillzoneInfo } from '../discovery/types';
import * as queries from '../db/queries';
import { discoverUnifiedSetups } from '../discovery/unified-discovery';
import { executePublishRun } from '../publish-gate/publish-gate';
import { createLogger } from '../telemetry/logger';

const logger = createLogger('midpoint-scanner');

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

    const futuresCount = futuresSetups.length;
    const forexCount = forexSetups.length;

    // Minimum requirement: 2 assets per asset class on the dashboard
    const futuresNeedsScan = futuresCount < 2;
    const forexNeedsScan = forexCount < 2;

    if (!futuresNeedsScan && !forexNeedsScan) {
        logger.info(
            { futuresCount, forexCount },
            'Killzone midpoint check: Both asset classes have >= 2 active setups on dash. Skipping rescan.'
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
