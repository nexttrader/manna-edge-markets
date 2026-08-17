import { discoverUnifiedSetups } from '../discovery/unified-discovery';
import { executePublishRun } from '../publish-gate/publish-gate';
import { getCurrentKillzone } from '../analytics/decision-matrix';
import * as queries from '../db/queries';

async function runLiveScanAndPublish() {
  const kz = getCurrentKillzone();
  const kzInfo = {
    killzone: kz.name,
    score: kz.score,
    boundaryET: '08:00 ET',
    isActive: true
  };
  
  console.log('Starting live discovery scan for Killzone:', kzInfo);
  
  // 1. Clear out invalid mock/test setups if any exist with null conviction or invalid values
  const activeSetups = await queries.getAllActiveSetups();
  for (const s of activeSetups) {
    if (s.id.startsWith('kz_mid_') || s.conviction_score === null) {
      console.log('Invalidating stale test setup:', s.id, s.instrument);
      await queries.updateSetupState(s.id, s.market, 'invalidated', {
        invalidation_reason: 'stale_test_cleanup',
        invalidation_detail: 'Cleaned up by manual admin rescan',
        tradable: 0,
        resolved_at: new Date().toISOString()
      });
    }
  }

  // 2. Discover setups across all markets and strategies
  const { futures, forex } = await discoverUnifiedSetups(kzInfo as any, `run_${Date.now()}`, 'both');
  console.log(`Discovered ${futures.length} Futures candidates and ${forex.length} Forex candidates.`);

  // 3. Execute Publish Run into DB
  const result = await executePublishRun(kzInfo as any, futures, forex, 'live', 'manual');
  console.log('Publish Run Result:', JSON.stringify(result, null, 2));

  // 4. Verify DB contents
  const newActive = await queries.getAllActiveSetups();
  console.log(`\nSuccessfully committed ${newActive.length} active setups to database:`);
  for (const setup of newActive) {
    console.log(`- [${setup.market.toUpperCase()}] ${setup.instrument} (${setup.strategy_id}): ${setup.bias.toUpperCase()} | Entry: ${setup.entry_zone_low} - ${setup.entry_zone_high} | Conviction: ${setup.conviction_score}%`);
  }
}

runLiveScanAndPublish().catch(console.error);
