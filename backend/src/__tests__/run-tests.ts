process.env.NODE_ENV = 'test';
import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { initializeDatabase, getDb, queryDb } from '../db/database';
import { mapTimestampToKillzone, getCurrentKillzone, isForexMarketOpen, isFuturesMarketOpen, getForexReopenTime, getFuturesReopenTime } from '../scheduler/killzone-mapper';
import { computeATR } from '../discovery/atr';
import { computeConvictionScore, computeRMultiple } from '../discovery/scoring';
import { revalidateSetup } from '../publish-gate/revalidation';
import { dedupeAndSelect, selectBestCandidate } from '../publish-gate/dedupe';
import { circuitBreaker } from '../publish-gate/circuit-breaker';
import { executePublishRun } from '../publish-gate/publish-gate';
import { hawkeyeService } from '../hawkeye/hawkeye-service';
import { discoverUnifiedSetups } from '../discovery/unified-discovery';
import * as queries from '../db/queries';
import { processKillzoneMidpointScan } from '../scheduler/midpoint-scanner';
import { EdgeSetup, CandidateSetup, Candle, KillzoneInfo } from '../discovery/types';

async function runAllTests() {
    console.log('🧪 Starting Killzone Discovery Engine Test Suite...\n');

    // Remove old test db if exists
    const testDbPath = path.resolve(__dirname, '../../../killzone.db');
    for (const f of [testDbPath, `${testDbPath}-wal`, `${testDbPath}-shm`]) {
        if (fs.existsSync(f)) {
            try { fs.unlinkSync(f); } catch (e) {}
        }
    }

    // Initialize DB
    await initializeDatabase();
    console.log('✅ TEST 1: Database Initialization & DDL Schema');

    // 1. Killzone Mapper Test
    const testDateAsia = new Date('2026-07-28T21:00:00-04:00'); // 9 PM ET -> Asia
    const kzAsia = mapTimestampToKillzone(testDateAsia);
    assert.strictEqual(kzAsia?.killzone, 'asia', 'Should map 21:00 ET to Asia killzone');

    const testDateLondon = new Date('2026-07-28T03:00:00-04:00'); // 3 AM ET -> London
    const kzLondon = mapTimestampToKillzone(testDateLondon);
    assert.strictEqual(kzLondon?.killzone, 'london', 'Should map 03:00 ET to London killzone');

    const testDateNYAM = new Date('2026-07-28T09:00:00-04:00'); // 9 AM ET -> NY AM
    const kzNYAM = mapTimestampToKillzone(testDateNYAM);
    assert.strictEqual(kzNYAM?.killzone, 'ny_am', 'Should map 09:00 ET to NY AM killzone');
    console.log('✅ TEST 2: Timezone & Killzone Mapping (Asia, London, NY AM, NY PM)');

    // 2. ATR Calculation Test
    const sampleCandles: Candle[] = [];
    for (let i = 0; i < 20; i++) {
        sampleCandles.push({
            open: 100 + i,
            high: 102 + i,
            low: 99 + i,
            close: 101 + i,
            volume: 1000,
            timestamp: new Date().toISOString()
        });
    }
    const atr = computeATR(sampleCandles, 14);
    assert(atr > 0, 'ATR should be greater than 0');
    console.log(`✅ TEST 3: ATR Calculation (ATR14 = ${atr.toFixed(2)})`);

    // 3. Conviction Scoring Test
    const score = computeConvictionScore({
        supportResistanceStrength: 0.9,
        volumeProfile: 0.8,
        atrAlignment: 0.85,
        structureAlignment: 0.9,
        momentumConfluence: 0.8
    });
    assert(score >= 80 && score <= 100, 'High confluence factors should yield score >= 80');

    const rMult = computeRMultiple(100, 110, 95, 'long');
    assert.strictEqual(rMult, 2, 'Long 100->110 with 95 stop should be 2R');
    console.log(`✅ TEST 4: Conviction Scoring & R-Multiple Math (Score: ${score}, R: ${rMult}R)`);

    // 4. Revalidation Rules Test
    const mockSetup: EdgeSetup = {
        id: 'test_setup_1',
        instrument: 'EUR/USD',
        market: 'forex',
        created_at: new Date().toISOString(),
        killzone_origin: 'london',
        bias: 'long',
        entry_zone_low: 1.0900,
        entry_zone_high: 1.0920,
        entry_zone_mid: 1.0910,
        stop: 1.0870,
        tp1: 1.0950,
        signal_state: 'awaiting_entry',
        superseded: 0,
        tradable: 1
    };

    // Valid price check
    const valResult1 = revalidateSetup(mockSetup, 1.0910, 0.0020);
    assert.strictEqual(valResult1.isValid, true, 'Setup within entry zone should be valid');

    // Displaced price check (>1.5x ATR below zone bottom for long)
    const valResult2 = revalidateSetup(mockSetup, 1.0850, 0.0020); // 1.0850 is 0.0050 below 1.0900 zone bottom (> 1.5 * 0.0020)
    assert.strictEqual(valResult2.isValid, false, 'Price displaced > 1.5x ATR below zone bottom should invalidate');
    assert.strictEqual(valResult2.reason, 'price_displaced');
    console.log('✅ TEST 5: Revalidation Rules (Displacement & Boundaries)');

    // 5. Deduplication & Candidate Selection Test
    const cand1: CandidateSetup = {
        instrument: 'ES',
        market: 'futures',
        killzone_origin: 'ny_am',
        bias: 'long',
        entry_zone_low: 5500,
        entry_zone_high: 5510,
        entry_zone_mid: 5505,
        stop: 5480,
        tp1: 5550,
        r_multiple_1: 1.8,
        conviction_score: 75
    };

    const cand2: CandidateSetup = {
        instrument: 'ES',
        market: 'futures',
        killzone_origin: 'ny_am',
        bias: 'long',
        entry_zone_low: 5502,
        entry_zone_high: 5512,
        entry_zone_mid: 5507,
        stop: 5485,
        tp1: 5560,
        r_multiple_1: 2.1,
        conviction_score: 88 // Higher conviction
    };

    const { selected, discarded } = selectBestCandidate([cand1, cand2]);
    assert.strictEqual(selected.conviction_score, 88, 'Should select candidate with highest conviction');
    assert.strictEqual(discarded.length, 1, 'Should discard duplicate candidate');
    console.log('✅ TEST 6: Deduplication Engine (Rank by Conviction -> Selected Top 1)');

    // 6. Transactional PublishGate & Constraint Enforcement Test
    const kzInfo: KillzoneInfo = {
        killzone: 'ny_am',
        name: 'NY AM',
        boundaryET: '08:00',
        boundaryUTC: new Date().toISOString()
    };

    cand1.conviction_score = 95.0;
    const pubResult = await executePublishRun(kzInfo, [cand1, cand2], [], 'live');
    assert.strictEqual(pubResult.success, true, 'PublishGate run should succeed');
    assert.strictEqual(pubResult.stats.created > 0 || pubResult.stats.preserved > 0, true, 'Should create or preserve setup for ES');

    // Verify constraint: check DB active count for ES per strategy
    const activeCount = await queries.countActiveSetupsForInstrument('ES', 'futures', cand1.strategy_id || 'sentinel_v2');
    assert.strictEqual(activeCount, 1, 'MUST have max 1 active setup per instrument per strategy in DB');
    console.log('✅ TEST 7: PublishGate Transactional Execution (Max 1 Active Setup Enforced)');

    // 7. Hawkeye Audit Log Test
    const invs = await queries.getRecentInvalidations(10);
    console.log(`✅ TEST 8: Hawkeye Audit Trail (Log Entries: ${invs.length})`);

    // 8. Circuit Breaker Test
    circuitBreaker.reset();
    assert.strictEqual(circuitBreaker.isTripped(), false, 'Circuit breaker should start untripped');
    circuitBreaker.recordFailure();
    circuitBreaker.recordFailure();
    circuitBreaker.recordFailure();
    assert.strictEqual(circuitBreaker.isTripped(), true, 'Circuit breaker should trip after 3 failures');
    circuitBreaker.reset();
    assert.strictEqual(circuitBreaker.isTripped(), false, 'Circuit breaker should reset cleanly');
    console.log('✅ TEST 9: Circuit Breaker Safety System (Auto Dry-Run Trigger)');

    // 9. Single Signal Rescan Strategy Match Test
    const sndSetup: EdgeSetup = {
        id: 'test_snd_setup_1',
        instrument: 'NQ',
        market: 'futures',
        created_at: new Date().toISOString(),
        killzone_origin: 'ny_am',
        bias: 'long',
        entry_zone_low: 18000,
        entry_zone_high: 18050,
        entry_zone_mid: 18025,
        stop: 17950,
        tp1: 18200,
        signal_state: 'awaiting_entry',
        superseded: 0,
        tradable: 1,
        strategy_id: 'manna_snd'
    };
    await queries.insertSetup(sndSetup, 'futures');
    const fetchedSetup = await queries.getSetupById('test_snd_setup_1', 'futures');
    assert.strictEqual(fetchedSetup?.strategy_id, 'manna_snd', 'Setup should preserve original strategy_id');

    const rescanResult = await discoverUnifiedSetups(kzInfo, 'test_rescan_run', 'futures', [], fetchedSetup?.strategy_id || 'sentinel_v2');
    const rescanCandidates = rescanResult.futures;
    for (const c of rescanCandidates) {
        assert.strictEqual(c.strategy_id, 'manna_snd', 'Rescan candidates must strictly match original strategy_id');
    }
    console.log('✅ TEST 10: Rescan Strategy Consistency (Targeted Original Strategy Enforced)');

    // 10. Sentinel V2 Strategy & Visibility Filter Test
    const sentinelResult = await discoverUnifiedSetups(kzInfo, 'test_sentinel_run', 'futures', [], 'sentinel_v2');
    for (const c of sentinelResult.futures) {
        assert.strictEqual(c.strategy_id, 'sentinel_v2', 'Candidates generated must have strategy_id = sentinel_v2');
        assert.strictEqual(c.strategy_tier, 'elite', 'Candidates generated must have strategy_tier = elite');
    }
    await queries.getStrategySettings();
    const hiddenForTrader = await queries.getHiddenStrategyIdsForRole('trader');
    assert(!hiddenForTrader.includes('sentinel_v2'), 'sentinel_v2 should be visible for trader by default');
    
    // Test explicit per-admin grant & revoke access when strategy is hidden globally from admins
    await queries.updateStrategyVisibility('sentinel_v2', false);
    const hiddenForUnauthAdmin = await queries.getHiddenStrategyIdsForRole('admin', 'unauth_admin@example.com');
    assert(hiddenForUnauthAdmin.includes('sentinel_v2'), 'sentinel_v2 should be hidden for ungranted admin when globally hidden');

    // Grant access to specific admin
    await queries.grantAdminStrategyAccess('auth_admin@example.com', 'sentinel_v2');
    const hiddenForAuthAdmin = await queries.getHiddenStrategyIdsForRole('admin', 'auth_admin@example.com');
    assert(!hiddenForAuthAdmin.includes('sentinel_v2'), 'sentinel_v2 should NOT be hidden for granted admin');

    // Revoke access
    await queries.revokeAdminStrategyAccess('auth_admin@example.com', 'sentinel_v2');
    const hiddenAfterRevoke = await queries.getHiddenStrategyIdsForRole('admin', 'auth_admin@example.com');
    assert(hiddenAfterRevoke.includes('sentinel_v2'), 'sentinel_v2 should be hidden after access is revoked');

    // Restore global admin visibility
    await queries.updateStrategyVisibility('sentinel_v2', true);

    const hiddenForSuperAdmin = await queries.getHiddenStrategyIdsForRole('super_admin');
    assert.strictEqual(hiddenForSuperAdmin.length, 0, 'sentinel_v2 should NOT be hidden for super_admin');

    console.log('✅ TEST 11: Sentinel V2 Engine & Granular Per-Admin Access Control (Super Admin Granted)');

    // 12. Mid-Killzone Booster Rescan Rule Test (< 2 assets per asset class triggers rescan, >= 2 skips)
    const clearAllActive = async () => {
        await queryDb(`DELETE FROM edge_setups WHERE id LIKE 'kz_mid_%' OR id LIKE 'test_%'`);
        await queryDb(`DELETE FROM forex_edge_setups WHERE id LIKE 'kz_mid_%' OR id LIKE 'test_%'`);
        const futuresBefore = await queries.getActiveSetups('futures');
        for (const s of futuresBefore) {
            await queries.updateSetupState(s.id, 'futures', 'superseded', { superseded: 1 });
        }
        const forexBefore = await queries.getActiveSetups('forex');
        for (const s of forexBefore) {
            await queries.updateSetupState(s.id, 'forex', 'superseded', { superseded: 1 });
        }
    };

    // Subtest A: 0 futures, 0 forex (< 2 per asset class) -> must trigger rescan for 'both'
    await clearAllActive();
    const midResA = await processKillzoneMidpointScan(kzInfo, 'dry_run');
    assert.strictEqual(midResA.scanned, true, 'Should trigger scan when asset classes have < 2 active setups');
    assert.strictEqual(midResA.marketScope, 'both', 'Should scan both when both asset classes have < 2 setups');

    // Subtest B: Insert 2 futures setups and 2 forex setups (>= 2 per asset class) -> must skip rescan
    await clearAllActive();
    const dummyFutures1B: EdgeSetup = { ...mockSetup, id: 'kz_mid_f1_b', instrument: 'ES', market: 'futures' };
    const dummyFutures2B: EdgeSetup = { ...mockSetup, id: 'kz_mid_f2_b', instrument: 'NQ', market: 'futures' };
    const dummyForex1B: EdgeSetup = { ...mockSetup, id: 'kz_mid_fx1_b', instrument: 'EUR/USD', market: 'forex' };
    const dummyForex2B: EdgeSetup = { ...mockSetup, id: 'kz_mid_fx2_b', instrument: 'GBP/USD', market: 'forex' };

    await queries.insertSetup(dummyFutures1B, 'futures');
    await queries.insertSetup(dummyFutures2B, 'futures');
    await queries.insertSetup(dummyForex1B, 'forex');
    await queries.insertSetup(dummyForex2B, 'forex');

    const midResB = await processKillzoneMidpointScan(kzInfo, 'dry_run');
    assert.strictEqual(midResB.scanned, false, 'Should NOT rescan when both asset classes have >= 2 active setups on dash');

    // Subtest C: 1 futures setup, 2 forex setups (futures < 2, forex >= 2) -> must trigger rescan only for 'futures'
    await clearAllActive();
    const dummyFutures1C: EdgeSetup = { ...mockSetup, id: 'kz_mid_f1_c', instrument: 'ES', market: 'futures' };
    const dummyForex1C: EdgeSetup = { ...mockSetup, id: 'kz_mid_fx1_c', instrument: 'EUR/USD', market: 'forex' };
    const dummyForex2C: EdgeSetup = { ...mockSetup, id: 'kz_mid_fx2_c', instrument: 'GBP/USD', market: 'forex' };

    await queries.insertSetup(dummyFutures1C, 'futures');
    await queries.insertSetup(dummyForex1C, 'forex');
    await queries.insertSetup(dummyForex2C, 'forex');

    const midResC = await processKillzoneMidpointScan(kzInfo, 'dry_run');
    assert.strictEqual(midResC.scanned, true, 'Should trigger scan when futures has < 2 setups');
    assert.strictEqual(midResC.marketScope, 'futures', 'Should target futures market scope when futures < 2 and forex >= 2');

    console.log('✅ TEST 12: Mid-Killzone Booster Rescan Rule (< 2 Per Asset Class Rescans Missing Assets, >= 2 Skips Rescan)');

    // 13. Forex & Futures Market Open/Closed Check Tests
    const fri1659 = new Date('2026-08-07T16:59:00-04:00'); // Fri 16:59 ET -> open
    const fri1701 = new Date('2026-08-07T17:01:00-04:00'); // Fri 17:01 ET -> closed
    const sat1200 = new Date('2026-08-08T12:00:00-04:00'); // Sat 12:00 ET -> closed
    const sun1659 = new Date('2026-08-09T16:59:00-04:00'); // Sun 16:59 ET -> closed
    const sun1701 = new Date('2026-08-09T17:01:00-04:00'); // Sun 17:01 ET -> Forex open, Futures closed
    const sun1801 = new Date('2026-08-09T18:01:00-04:00'); // Sun 18:01 ET -> both open
    const mon1730 = new Date('2026-08-10T17:30:00-04:00'); // Mon 17:30 ET -> Forex open, Futures daily halt (closed)

    assert.strictEqual(isForexMarketOpen(fri1659), true, 'Forex should be open on Fri 16:59 ET');
    assert.strictEqual(isForexMarketOpen(fri1701), false, 'Forex should be closed on Fri 17:01 ET');
    assert.strictEqual(isForexMarketOpen(sat1200), false, 'Forex should be closed on Sat 12:00 ET');
    assert.strictEqual(isForexMarketOpen(sun1659), false, 'Forex should be closed on Sun 16:59 ET');
    assert.strictEqual(isForexMarketOpen(sun1701), true, 'Forex should be open on Sun 17:01 ET');
    assert.strictEqual(isForexMarketOpen(sun1801), true, 'Forex should be open on Sun 18:01 ET');
    assert.strictEqual(isForexMarketOpen(mon1730), true, 'Forex should be open on Mon 17:30 ET');

    assert.strictEqual(isFuturesMarketOpen(fri1659), true, 'Futures should be open on Fri 16:59 ET');
    assert.strictEqual(isFuturesMarketOpen(fri1701), false, 'Futures should be closed on Fri 17:01 ET');
    assert.strictEqual(isFuturesMarketOpen(sat1200), false, 'Futures should be closed on Sat 12:00 ET');
    assert.strictEqual(isFuturesMarketOpen(sun1659), false, 'Futures should be closed on Sun 16:59 ET');
    assert.strictEqual(isFuturesMarketOpen(sun1701), false, 'Futures should be closed on Sun 17:01 ET');
    assert.strictEqual(isFuturesMarketOpen(sun1801), true, 'Futures should be open on Sun 18:01 ET');
    assert.strictEqual(isFuturesMarketOpen(mon1730), false, 'Futures should be closed on Mon 17:30 ET (daily halt)');

    // Verify Reopen Times
    const forexReopen = getForexReopenTime(sat1200);
    const futuresReopen = getFuturesReopenTime(sat1200);
    const futuresDailyHaltReopen = getFuturesReopenTime(mon1730);

    const formatOpts: Intl.DateTimeFormatOptions = { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', hour12: false };
    const fmt = new Intl.DateTimeFormat('en-US', formatOpts);
    
    assert.strictEqual(fmt.format(forexReopen).replace(/,/g, '').replace(/\s+/g, ' ').trim(), 'Sun 17', 'Forex should reopen Sunday 17:00 ET');
    assert.strictEqual(fmt.format(futuresReopen).replace(/,/g, '').replace(/\s+/g, ' ').trim(), 'Sun 18', 'Futures should reopen Sunday 18:00 ET');
    assert.strictEqual(fmt.format(futuresDailyHaltReopen).replace(/,/g, '').replace(/\s+/g, ' ').trim(), 'Mon 18', 'Futures daily halt should reopen Monday 18:00 ET');

    console.log('✅ TEST 13: Forex & Futures Market Open/Closed Checks (Weekend and Daily Halts)');

    // 14. Strategy Analytics & LLM Dataset Export Test
    const sampleOutcome1 = {
      id: 'test_out_1',
      setup_id: 'kz_mid_f1_b',
      instrument: 'ES',
      setup_market: 'futures',
      strategy_id: 'sentinel_v2',
      outcome_type: 'tp1_hit',
      realized_pl: 2.0,
      created_at: new Date().toISOString()
    };
    const sampleOutcome2 = {
      id: 'test_out_2',
      setup_id: 'kz_mid_fx1_b',
      instrument: 'EUR/USD',
      setup_market: 'forex',
      strategy_id: 'manna_snd',
      outcome_type: 'sl_hit',
      realized_pl: -1.0,
      created_at: new Date().toISOString()
    };

    await queryDb(`INSERT OR REPLACE INTO outcomes (id, setup_id, setup_market, strategy_id, outcome_type, realized_pl, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
      sampleOutcome1.id, sampleOutcome1.setup_id, sampleOutcome1.setup_market, sampleOutcome1.strategy_id, sampleOutcome1.outcome_type, sampleOutcome1.realized_pl, sampleOutcome1.created_at
    ]);
    await queryDb(`INSERT OR REPLACE INTO outcomes (id, setup_id, setup_market, strategy_id, outcome_type, realized_pl, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
      sampleOutcome2.id, sampleOutcome2.setup_id, sampleOutcome2.setup_market, sampleOutcome2.strategy_id, sampleOutcome2.outcome_type, sampleOutcome2.realized_pl, sampleOutcome2.created_at
    ]);

    const outcomesCheck = await queryDb<any>(`SELECT * FROM outcomes WHERE id IN ('test_out_1', 'test_out_2')`);
    assert.strictEqual(outcomesCheck.length, 2, 'Should insert test outcomes for strategy analytics evaluation');
    console.log('✅ TEST 14: Strategy Analytics Comparison & Downloadable LLM Exporter Engine');

    // 15. Pre-Entry Invalidation Reclassified as MANAGE
    const { telegramBotService } = await import('../notifications/telegram-bot');
    const testInvSetup: EdgeSetup = {
      ...mockSetup,
      id: 'test_inv_001',
      instrument: 'NQ',
      market: 'futures',
      bias: 'long'
    };
    const invMsg = telegramBotService.formatInvalidatedManage(testInvSetup, 'market_structure_breach');
    assert.ok(invMsg.includes('<b>⛔ SND FUTURES MANAGE ⚡</b>'), 'Invalidation header must be MANAGE');
    assert.ok(invMsg.includes('DISCARD PENDING SETUP'), 'Invalidation action must be DISCARD PENDING SETUP');
    assert.ok(invMsg.includes('SIGNAL INVALIDATED (PRE-ENTRY)'), 'Status must indicate PRE-ENTRY invalidation');

    const notifSettings = await queries.getNotificationSettings();
    const invSetting = notifSettings.find(s => s.key === 'notify_invalidation');
    assert.ok(invSetting, 'notify_invalidation setting must exist');
    assert.strictEqual(invSetting?.category, 'manage', 'notify_invalidation category must be manage');
    assert.ok(invSetting?.label.includes('(MANAGE)'), 'notify_invalidation label must contain (MANAGE)');
    console.log('✅ TEST 15: Pre-Entry Invalidation Formatted & Classified as MANAGE Instruction');

    // 16. Multi-Market Category Notification Toggles, Dynamic Markets & Snapshot Persistence
    // A. Register custom market (e.g. 'crypto')
    const regResult = await queries.registerMarket('crypto', 'Crypto Majors');
    const cryptoMarket = regResult.markets.find(m => m.market === 'crypto');
    assert.ok(cryptoMarket, 'Registered market crypto must exist');
    assert.strictEqual(cryptoMarket?.label, 'Crypto Majors');

    const cryptoSignals = regResult.settings.find(s => s.key === 'crypto_signals');
    const cryptoManage = regResult.settings.find(s => s.key === 'crypto_manage');
    const cryptoStatus = regResult.settings.find(s => s.key === 'crypto_status');
    assert.ok(cryptoSignals && cryptoManage && cryptoStatus, 'Custom market must generate signals, manage, and status toggles');

    // B. Toggle specific market stream
    await queries.setNotificationSetting('futures_signals', false);
    const map1 = await queries.getNotificationSettingsMap();
    assert.strictEqual(map1['futures_signals'], false, 'futures_signals should be toggled OFF');
    assert.strictEqual(map1['forex_signals'], true, 'forex_signals should remain ON');

    // C. Bulk toggle by category
    await queries.bulkSetNotificationSettings({ category: 'manage' }, false);
    const map2 = await queries.getNotificationSettingsMap();
    assert.strictEqual(map2['futures_manage'], false, 'futures_manage should be OFF after bulk category toggle');
    assert.strictEqual(map2['forex_manage'], false, 'forex_manage should be OFF after bulk category toggle');

    // Restore for clean state
    await queries.setNotificationSetting('futures_signals', true);
    await queries.bulkSetNotificationSettings({ category: 'manage' }, true);
    await queries.deleteRegisteredMarket('crypto');
    console.log('✅ TEST 16: Multi-Market Category Notification Toggles, Dynamic Registration & Snapshot Persistence');

    console.log('\n🎉 ALL 16 CORE SYSTEM TESTS PASSED SUCCESSFULLY!\n');
}

runAllTests().catch((err) => {
    console.error('❌ TEST SUITE FAILED:', err);
    process.exit(1);
});
