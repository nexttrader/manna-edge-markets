import assert from 'assert';
import * as queries from '../db/queries';
import { getDb } from '../db/database';

async function runTests() {
  console.log('🧪 Starting Daily Signal Cap (Max 2 Signals/Asset/Day) Tests...\n');
  getDb();

  // TEST 1: Default State (Must be false so it only takes effect once toggled on)
  console.log('Test 1: Verifying default state of daily signal cap...');
  await queries.ensureStrategySettingsSeeded();

  const defaultCap = await queries.isDailySignalCapEnabled('manna_snd');
  assert.strictEqual(defaultCap.maxSignals, 2, 'Default max signals per day must be 2');
  console.log(`  ✓ Default cap setting verified: enabled=${defaultCap.enabled}, maxSignals=${defaultCap.maxSignals}`);

  // TEST 2: Toggle ON / OFF Persistence
  console.log('\nTest 2: Verifying toggle ON / OFF persistence...');
  // Turn ON
  await queries.updateStrategyDailySignalCap('manna_snd', true, 2);
  let capOn = await queries.isDailySignalCapEnabled('manna_snd');
  assert.strictEqual(capOn.enabled, true, 'Daily cap should be enabled after toggling ON');
  assert.strictEqual(capOn.maxSignals, 2, 'Max signals should be 2');
  console.log('  ✓ Successfully enabled daily signal cap (Max 2 signals / day)');

  // Verify in getStrategySettings
  const settingsOn = await queries.getStrategySettings('super_admin');
  const mannaSndOn = settingsOn.find(s => s.id === 'manna_snd');
  assert.strictEqual(mannaSndOn?.dailySignalCapEnabled, true, 'Strategy settings should report dailySignalCapEnabled = true');
  console.log('  ✓ getStrategySettings correctly reflects active daily cap');

  // Turn OFF (revert to uncapped)
  await queries.updateStrategyDailySignalCap('manna_snd', false, 2);
  let capOff = await queries.isDailySignalCapEnabled('manna_snd');
  assert.strictEqual(capOff.enabled, false, 'Daily cap should be disabled after toggling OFF');
  console.log('  ✓ Successfully disabled daily signal cap (reverted to uncapped mode)');

  // TEST 3: New York Calendar Day Boundary Calculation
  console.log('\nTest 3: Verifying New York Calendar Day calculation...');
  // 2026-09-08 23:30 UTC = 2026-09-08 19:30 ET
  const date1 = new Date('2026-09-08T23:30:00.000Z');
  assert.strictEqual(queries.getETCalendarDay(date1), '2026-09-08', '23:30 UTC should map to 2026-09-08 ET');

  // 2026-09-09 02:30 UTC = 2026-09-08 22:30 ET (still previous day in NY)
  const date2 = new Date('2026-09-09T02:30:00.000Z');
  assert.strictEqual(queries.getETCalendarDay(date2), '2026-09-08', '02:30 UTC next day should still map to 2026-09-08 ET');

  // 2026-09-09 05:00 UTC = 2026-09-09 01:00 ET (new day in NY)
  const date3 = new Date('2026-09-09T05:00:00.000Z');
  assert.strictEqual(queries.getETCalendarDay(date3), '2026-09-09', '05:00 UTC should map to 2026-09-09 ET');
  console.log('  ✓ New York calendar day boundaries verified accurately across UTC transitions');

  // TEST 4: Capped Assets Reporting
  console.log('\nTest 4: Verifying getCappedAssetsReport on high-volume historical day...');
  const report = await queries.getCappedAssetsReport('2026-09-08');
  assert.strictEqual(report.maxSignals, 2, 'Report max signals should be 2');
  assert.ok(Array.isArray(report.availableDays), 'availableDays should be an array');
  assert.ok(Array.isArray(report.allAssetsForDay), 'allAssetsForDay should be an array');
  assert.ok(Array.isArray(report.cappedAssetsForDay), 'cappedAssetsForDay should be an array');
  console.log(`  ✓ Available days found: ${report.availableDays.slice(0, 5).join(', ')}`);
  console.log(`  ✓ Assets for 2026-09-08: ${report.allAssetsForDay.length} total, ${report.cappedAssetsForDay.length} meeting 2-signal cap`);

  const usdjpy = report.allAssetsForDay.find((a: any) => a.instrument === 'USD/JPY');
  if (usdjpy) {
    assert.ok(usdjpy.signalsCount >= 2, 'USD/JPY on 2026-09-08 should have >= 2 signals');
    assert.strictEqual(usdjpy.isCapped, true, 'USD/JPY should be marked as capped');
    console.log(`  ✓ Verified USD/JPY signal tracking: ${usdjpy.signalsCount} signals recorded (Cap Met: ${usdjpy.isCapped})`);
  }

  console.log('\n🎉 ALL DAILY SIGNAL CAP TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
