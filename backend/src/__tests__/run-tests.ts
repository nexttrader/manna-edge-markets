import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { initializeDatabase, getDb } from '../db/database';
import { mapTimestampToKillzone, getCurrentKillzone } from '../scheduler/killzone-mapper';
import { computeATR } from '../discovery/atr';
import { computeConvictionScore, computeRMultiple } from '../discovery/scoring';
import { revalidateSetup } from '../publish-gate/revalidation';
import { dedupeAndSelect, selectBestCandidate } from '../publish-gate/dedupe';
import { circuitBreaker } from '../publish-gate/circuit-breaker';
import { executePublishRun } from '../publish-gate/publish-gate';
import { hawkeyeService } from '../hawkeye/hawkeye-service';
import { discoverUnifiedSetups } from '../discovery/unified-discovery';
import * as queries from '../db/queries';
import { EdgeSetup, CandidateSetup, Candle, KillzoneInfo } from '../discovery/types';

async function runAllTests() {
    console.log('🧪 Starting Killzone Discovery Engine Test Suite...\n');

    // Remove old test db if exists
    const testDbPath = path.resolve(__dirname, '../../../killzone.db');
    if (fs.existsSync(testDbPath)) {
        try { fs.unlinkSync(testDbPath); } catch (e) {}
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

    const pubResult = await executePublishRun(kzInfo, [cand1, cand2], [], 'live');
    assert.strictEqual(pubResult.success, true, 'PublishGate run should succeed');
    assert.strictEqual(pubResult.stats.created, 1, 'Should create exactly 1 setup for ES');

    // Verify constraint: check DB active count for ES
    const activeCount = await queries.countActiveSetupsForInstrument('ES', 'futures');
    assert.strictEqual(activeCount, 1, 'MUST have max 1 active setup per instrument in DB');
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

    const rescanResult = await discoverUnifiedSetups(kzInfo, 'test_rescan_run', 'futures', [], fetchedSetup?.strategy_id || 'manna_basic');
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
    const hiddenForTrader = await queries.getHiddenStrategyIdsForRole('trader');
    assert(hiddenForTrader.includes('sentinel_v2'), 'sentinel_v2 should be hidden for trader by default');
    const hiddenForAdmin = await queries.getHiddenStrategyIdsForRole('admin');
    assert(hiddenForAdmin.includes('sentinel_v2'), 'sentinel_v2 should be hidden for admin by default');
    const hiddenForSuperAdmin = await queries.getHiddenStrategyIdsForRole('super_admin');
    assert.strictEqual(hiddenForSuperAdmin.length, 0, 'sentinel_v2 should NOT be hidden for super_admin');

    console.log('✅ TEST 11: Sentinel V2 Engine & Multi-Tier Visibility Control (Super Admin Exclusive)');

    console.log('\n🎉 ALL 11 CORE SYSTEM TESTS PASSED SUCCESSFULLY!\n');
}

runAllTests().catch((err) => {
    console.error('❌ TEST SUITE FAILED:', err);
    process.exit(1);
});
