import assert from 'assert';
import { getDb, queryDb } from '../db/database';
import * as queries from '../db/queries';
import { telegramBotService } from '../notifications/telegram-bot';

async function runTests() {
  console.log('🧪 Starting Super Admin Signal Resend & Asset Cap Override Tests...\n');
  getDb();

  // ── TEST 1: Signal Cap Override Management ──────────────────────────────
  console.log('Test 1: Setting and retrieving session and 24hr cap overrides...');
  const now = new Date();
  const sessionExpiry = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(); // +2h
  const dayExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(); // +24h

  // Set Session override for EUR/USD
  await queries.setAssetSignalCapOverride({
    instrument: 'EUR/USD',
    market: 'forex',
    strategyId: 'manna_snd',
    extraSignals: 1,
    maxSignals: 3,
    scopeType: 'session',
    sessionName: 'london',
    expiresAt: sessionExpiry,
    createdBy: 'super_admin'
  });

  const eurOverride = await queries.getActiveSignalCapOverride('EUR/USD', 'manna_snd');
  assert.ok(eurOverride, 'EUR/USD active override must exist');
  assert.strictEqual(eurOverride?.max_signals, 3, 'EUR/USD max_signals should be 3');
  assert.strictEqual(eurOverride?.scope_type, 'session', 'Scope type must be session');
  assert.strictEqual(eurOverride?.session_name, 'london', 'Session name must be london');
  console.log('  ✓ Session override for EUR/USD successfully verified');

  // Set 24hr override for GBP/USD
  await queries.setAssetSignalCapOverride({
    instrument: 'GBP/USD',
    market: 'forex',
    strategyId: 'manna_snd',
    extraSignals: 2,
    maxSignals: 4,
    scopeType: '24hr',
    expiresAt: dayExpiry,
    createdBy: 'super_admin'
  });

  const gbpOverride = await queries.getActiveSignalCapOverride('GBP/USD', 'manna_snd');
  assert.ok(gbpOverride, 'GBP/USD active override must exist');
  assert.strictEqual(gbpOverride?.max_signals, 4, 'GBP/USD max_signals should be 4');
  assert.strictEqual(gbpOverride?.scope_type, '24hr', 'Scope type must be 24hr');
  console.log('  ✓ 24hr override for GBP/USD successfully verified');

  // ── TEST 2: Active Overrides in getCappedAssetsReport ───────────────────
  console.log('\nTest 2: Verifying active overrides merged in getCappedAssetsReport...');
  const todayET = queries.getETCalendarDay();
  const report = await queries.getCappedAssetsReport(todayET);
  assert.ok(Array.isArray(report.activeOverrides), 'Report must contain activeOverrides list');
  const foundEur = report.activeOverrides.find((o: any) => o.instrument === 'EUR/USD');
  const foundGbp = report.activeOverrides.find((o: any) => o.instrument === 'GBP/USD');
  assert.ok(foundEur, 'EUR/USD must be in activeOverrides list');
  assert.ok(foundGbp, 'GBP/USD must be in activeOverrides list');
  console.log(`  ✓ getCappedAssetsReport returned ${report.activeOverrides.length} active overrides`);

  // ── TEST 3: Delete & Expired Override Handling ───────────────────────────
  console.log('\nTest 3: Testing deletion and expired override handling...');
  await queries.deleteAssetSignalCapOverride('EUR/USD');
  const deletedEur = await queries.getActiveSignalCapOverride('EUR/USD', 'manna_snd');
  assert.strictEqual(deletedEur, null, 'Deleted override must return null');
  console.log('  ✓ Manual override deletion verified');

  // Insert an expired override
  const pastExpiry = new Date(now.getTime() - 60 * 1000).toISOString(); // 1 minute ago
  await queryDb(
    `INSERT INTO asset_signal_cap_overrides (instrument, market, strategy_id, extra_signals, max_signals, scope_type, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(instrument) DO UPDATE SET expires_at = excluded.expires_at`,
    ['USD/JPY', 'forex', 'manna_snd', 1, 3, 'session', pastExpiry, now.toISOString()]
  );
  const expiredUsd = await queries.getActiveSignalCapOverride('USD/JPY', 'manna_snd');
  assert.strictEqual(expiredUsd, null, 'Expired override must automatically return null');
  console.log('  ✓ Expired override correctly rejected and cleaned up');

  // ── TEST 4: Setup ID Update for Trade ID Reassignment ─────────────────
  console.log('\nTest 4: Verifying updateSetupId database synchronization...');
  const testOldId = 'test_trade_resend_old_' + Date.now();
  const testNewId = 'test_trade_resend_new_' + Date.now();

  // Insert dummy setup
  await queryDb(
    `INSERT INTO forex_edge_setups (id, instrument, market, created_at, killzone_origin, bias, entry_zone_low, entry_zone_high, entry_zone_mid, stop, tp1)
     VALUES (?, 'EUR/USD', 'forex', ?, 'london', 'long', 1.0850, 1.0855, 1.0852, 1.0830, 1.0900)`,
    [testOldId, now.toISOString()]
  );

  // Update setup ID
  const updateOk = await queries.updateSetupId(testOldId, testNewId, 'forex');
  assert.strictEqual(updateOk, true, 'updateSetupId should return true');

  const oldLookup = await queryDb(`SELECT id FROM forex_edge_setups WHERE id = ?`, [testOldId]);
  const newLookup = await queryDb<any>(`SELECT * FROM forex_edge_setups WHERE id = ?`, [testNewId]);
  assert.strictEqual(oldLookup.length, 0, 'Old setup ID should no longer exist');
  assert.strictEqual(newLookup.length, 1, 'New setup ID must exist');
  console.log('  ✓ Setup ID successfully updated in database');

  // ── TEST 5: Telegram Message Formatting with Reassigned ID ────────────
  console.log('\nTest 5: Verifying Telegram message formatting with new ID...');
  const setupRecord = newLookup[0];
  const formatted = telegramBotService.formatSignal(setupRecord);
  assert.ok(formatted.includes('SIGNAL'), 'Message must contain SIGNAL header');
  assert.ok(formatted.includes('EURUSD'), 'Message must contain clean symbol EURUSD');
  assert.ok(formatted.includes('Trade ID:'), 'Message must contain Trade ID field');
  console.log('  ✓ Telegram signal message generated with new Trade ID format:');
  console.log('    ' + formatted.split('\n').slice(0, 4).join('\n    '));

  // Clean up test records
  await queryDb(`DELETE FROM forex_edge_setups WHERE id = ?`, [testNewId]);
  await queries.deleteAssetSignalCapOverride('GBP/USD');
  console.log('\n🎉 All Super Admin Resend & Asset Cap Override tests passed successfully!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
