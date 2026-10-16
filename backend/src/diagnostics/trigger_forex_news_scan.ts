import { discoverUnifiedSetups } from '../discovery/unified-discovery';
import { executePublishRun } from '../publish-gate/publish-gate';
import { getCurrentKillzone } from '../scheduler/killzone-mapper';
import { newsEngine } from '../news/news-engine';
import { earlyScanService } from '../scheduler/early-scan-service';
import { telegramBotService } from '../notifications/telegram-bot';
import { saveSignalsSnapshot } from '../db/signal-snapshot-restore';
import { queryDb } from '../db/database';
import * as queries from '../db/queries';

async function main() {
  const now = new Date();
  console.log(`=======================================================`);
  console.log(`🚀 TRIGGERING LIVE FOREX NEWS DISCOVERY SCAN AT ${now.toISOString()}`);
  console.log(`=======================================================\n`);

  // 1. Initialize Telegram Bot Service for dispatching alerts
  try {
    telegramBotService.init();
  } catch (err: any) {
    console.warn('Telegram Bot init warning:', err.message);
  }

  // 2. Clear any stuck runs in publish_runs
  try {
    const stuck = await queryDb<{ id: string }>(`SELECT id FROM publish_runs WHERE run_state = 'running'`);
    if (stuck.length > 0) {
      console.log(`🧹 Clearing ${stuck.length} stuck running records in publish_runs...`);
      await queryDb(`UPDATE publish_runs SET run_state = 'failed', error_detail = 'Cleared by manual news rescan' WHERE run_state = 'running'`);
    }
  } catch (err: any) {
    console.warn('Could not clear stuck publish_runs:', err.message);
  }

  // 3. Clear stale setups in forex_edge_setups (> 12 hours old) to prevent lockout
  try {
    const activeForex = await queries.getActiveSetups('forex');
    console.log(`📊 Currently active Forex setups before scan: ${activeForex.length}`);
    for (const s of activeForex) {
      const ageHours = (now.getTime() - new Date(s.created_at).getTime()) / (1000 * 60 * 60);
      if (ageHours > 12) {
        console.log(`🧹 Invalidating stale Forex setup (${s.instrument} | ${s.strategy_id} | ${ageHours.toFixed(1)}h old): ${s.id}`);
        await queries.updateSetupState(s.id, 'forex', 'invalidated', {
          invalidation_reason: 'stale_setup_cleared_for_news_scan',
          invalidation_detail: `Stale setup (${ageHours.toFixed(1)} hours old) cleared to allow fresh news scan.`,
          tradable: 0,
          resolved_at: now.toISOString()
        });
      }
    }
  } catch (err: any) {
    console.warn('Warning during stale setup cleanup:', err.message);
  }

  // 4. Check Killzone
  const currentKz = getCurrentKillzone(now);
  const kzInfo = {
    killzone: currentKz.killzone,
    name: currentKz.name,
    boundaryET: currentKz.boundaryET,
    boundaryUTC: now.toISOString()
  };
  console.log(`📍 Killzone Session: ${kzInfo.name} (${kzInfo.boundaryET} ET)`);

  // 5. Evaluate High-Impact News status
  try {
    const newsInfo = newsEngine.hasNyAmHighImpactNews(now);
    const earlyStatus = earlyScanService.getStatus(now);
    console.log(`📰 High-Impact News Check:`, {
      hasNews: newsInfo.hasNews,
      eventsCount: newsInfo.events.length,
      firstEvent: newsInfo.firstEvent?.title || 'None',
      scheduledTimeET: newsInfo.scheduledTimeET || 'None',
      targetScanTimeET: newsInfo.targetScanTimeET,
      isPostNewsScan: newsInfo.isPostNewsScan,
      isEarlyScanNeeded: newsInfo.isEarlyScanNeeded
    });
  } catch (newsErr: any) {
    console.warn('News engine evaluation note:', newsErr.message);
  }

  // 6. Discover Unified Forex Setups (both Manna SnD and Sentinel v2)
  const runId = `run_news_forex_${Date.now()}`;
  console.log(`\n🔍 Executing discoverUnifiedSetups for Forex (runId: ${runId})...`);
  const { forex } = await discoverUnifiedSetups(kzInfo, runId, 'forex', [], undefined, true);
  console.log(`✨ Discovery Complete: Found ${forex.length} candidate setups for Forex.`);
  for (const cand of forex) {
    console.log(`   - [${cand.strategy_id || 'manna_snd'}] ${cand.instrument} ${cand.bias.toUpperCase()} | Entry: ${cand.entry_zone_mid} | SL: ${cand.stop} | TP1: ${cand.tp1} | Score: ${cand.conviction_score}%`);
  }

  // 7. Execute Publish Run through Publish Gate
  console.log(`\n🚪 Processing candidates through Publish Gate...`);
  const result = await executePublishRun(kzInfo, [], forex, 'live', 'manual', 'forex');
  console.log(`📋 Publish Gate Result:`, JSON.stringify(result, null, 2));

  // 8. Mark dynamic news scan completed
  earlyScanService.markCompleted(now);

  // 9. Snapshot active signals
  try {
    const allActive = await queries.getAllActiveSetups();
    await saveSignalsSnapshot(allActive);
    console.log(`💾 Persisted active snapshot of ${allActive.length} total active setups.`);
  } catch (snapErr: any) {
    console.warn('Snapshot error:', snapErr.message);
  }

  // 10. Summary verification
  const finalActiveForex = await queries.getActiveSetups('forex');
  console.log(`\n=======================================================`);
  console.log(`✅ SCAN COMPLETE — CURRENT ACTIVE FOREX SETUPS: ${finalActiveForex.length}`);
  console.log(`=======================================================`);
  for (const s of finalActiveForex) {
    console.log(`• ${s.instrument} (${s.strategy_id}): ${s.bias.toUpperCase()} | Entry: ${s.entry_zone_mid} | SL: ${s.stop} | TP1: ${s.tp1} | State: ${s.signal_state}`);
  }
}

main().catch(err => {
  console.error('❌ Error executing Forex news scan:', err);
  process.exit(1);
});
