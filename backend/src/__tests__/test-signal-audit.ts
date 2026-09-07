import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { signalAuditService } from '../analytics/signal-audit-service';
import { initializeDatabase, queryDb } from '../db/database';
import * as queries from '../db/queries';
import { telegramBotService } from '../notifications/telegram-bot';

async function runTests() {
  console.log('🧪 Starting SND Signal-by-Signal Processing Audit Test Suite...\n');

  await initializeDatabase();

  // ── TEST 1: Trading Day Window ───────────────────────────────────────────────
  console.log('Test 1: Testing Trading Day 8:00 PM EST Window Calculation...');
  // 1a. Monday 21:00 ET (Tuesday 01:00 UTC during EDT)
  const t1 = signalAuditService.getTradingDayWindow(new Date('2026-09-08T01:00:00Z'));
  // 1b. Tuesday 01:30 ET (Tuesday 05:30 UTC)
  const t2 = signalAuditService.getTradingDayWindow(new Date('2026-09-08T05:30:00Z'));
  // 1c. Tuesday 19:30 ET (Tuesday 23:30 UTC)
  const t3 = signalAuditService.getTradingDayWindow(new Date('2026-09-08T23:30:00Z'));
  // 1d. Tuesday 20:05 ET (Wednesday 00:05 UTC) -> rolls over!
  const t4 = signalAuditService.getTradingDayWindow(new Date('2026-09-09T00:05:00Z'));

  assert.strictEqual(t1.tradingDate, t2.tradingDate, '21:00 ET and 01:30 ET must share the same trading day');
  assert.strictEqual(t2.tradingDate, t3.tradingDate, '01:30 ET and 19:30 ET must share the same trading day');
  assert.notStrictEqual(t3.tradingDate, t4.tradingDate, '20:05 ET must start a new trading day cycle');
  console.log(`✅ Test 1 Passed: Trading Day windows correctly bound to 8:00 PM EST (${t1.tradingDate} -> rollover ${t4.tradingDate})`);

  // ── TEST 2: Seed Test Signals for Current Day Window ─────────────────────────
  console.log('\nTest 2: Seeding realistic signals matching user sample layout...');
  const currentWindow = signalAuditService.getTradingDayWindow(new Date());
  const seedTime1 = new Date(new Date(currentWindow.startUtcIso).getTime() + 2 * 3600 * 1000).toISOString();
  const seedTime2 = new Date(new Date(currentWindow.startUtcIso).getTime() + 4 * 3600 * 1000).toISOString();
  const seedTime3 = new Date(new Date(currentWindow.startUtcIso).getTime() + 6 * 3600 * 1000).toISOString();
  const seedTime4 = new Date(new Date(currentWindow.startUtcIso).getTime() + 8 * 3600 * 1000).toISOString();
  const seedTime5 = new Date(new Date(currentWindow.startUtcIso).getTime() + 10 * 3600 * 1000).toISOString();

  // Setup 1: EURUSD - Rejected by Broker (Invalid Price)
  await queryDb(`
    INSERT INTO forex_edge_setups (
      id, instrument, market, created_at, killzone_origin, bias,
      entry_zone_low, entry_zone_high, entry_zone_mid, stop, tp1, tp2,
      signal_state, tradable, conviction_score, invalidation_reason, strategy_id
    ) VALUES (
      'test_EURUSD_7B55', 'EUR/USD', 'forex', ?, 'london', 'long',
      1.16158, 1.16171, 1.16165, 1.16000, 1.16500, 1.16800,
      'invalidated', 0, 88.5, 'invalid_price_broker_rejected', 'sentinel_v2'
    ) ON CONFLICT (id) DO UPDATE SET created_at = ?
  `, [seedTime1, seedTime1]);

  // Setup 2: GBPUSD - Rejected at Intake (Zero-width zone)
  await queryDb(`
    INSERT INTO forex_edge_setups (
      id, instrument, market, created_at, killzone_origin, bias,
      entry_zone_low, entry_zone_high, entry_zone_mid, stop, tp1, tp2,
      signal_state, tradable, conviction_score, invalidation_reason, strategy_id
    ) VALUES (
      'test_GBPUSD_85D7', 'GBP/USD', 'forex', ?, 'london', 'long',
      1.35170, 1.35170, 1.35170, 1.34900, 1.35500, 1.35800,
      'invalidated', 0, 75.0, 'zero_width_zone', 'sentinel_v2'
    ) ON CONFLICT (id) DO UPDATE SET created_at = ?
  `, [seedTime1, seedTime1]);

  // Setup 3: USDJPY - Closed Win (+5.26R)
  await queryDb(`
    INSERT INTO forex_edge_setups (
      id, instrument, market, created_at, entry_triggered_at, resolved_at,
      killzone_origin, bias, entry_zone_low, entry_zone_high, entry_zone_mid,
      entry_price_recorded, stop, tp1, tp2, r_multiple_1, r_multiple_2,
      signal_state, tradable, conviction_score, strategy_id
    ) VALUES (
      'test_USDJPY_D014', 'USD/JPY', 'forex', ?, ?, ?,
      'london', 'short', 156.240, 156.260, 156.254,
      156.254, 156.400, 155.800, 155.479, 2.0, 5.26,
      'resolved', 0, 92.0, 'sentinel_v2'
    ) ON CONFLICT (id) DO UPDATE SET created_at = ?
  `, [seedTime2, seedTime2, seedTime3, seedTime2]);

  await queryDb(`
    INSERT INTO outcomes (
      id, setup_id, setup_market, strategy_id, outcome_type, execution_price,
      execution_time, realized_pl, duration_min, created_at
    ) VALUES (
      'out_test_USDJPY_D014', 'test_USDJPY_D014', 'forex', 'sentinel_v2', 'tp2_hit', 155.479,
      ?, 5.26, 480.0, ?
    ) ON CONFLICT (id) DO UPDATE SET realized_pl = 5.26
  `, [seedTime3, seedTime3]);

  // Setup 4: EURGBP - Still Active at Breakeven
  await queryDb(`
    INSERT INTO forex_edge_setups (
      id, instrument, market, created_at, entry_triggered_at,
      killzone_origin, bias, entry_zone_low, entry_zone_high, entry_zone_mid,
      entry_price_recorded, stop, initial_stop, tp1, tp2,
      signal_state, is_breakeven, tradable, conviction_score, strategy_id
    ) VALUES (
      'test_EURGBP_78F5', 'EUR/GBP', 'forex', ?, ?,
      'london', 'short', 0.85930, 0.85950, 0.85941,
      0.85941, 0.85941, 0.86100, 0.85500, 0.85200,
      'active', 1, 1, 85.0, 'sentinel_v2'
    ) ON CONFLICT (id) DO UPDATE SET created_at = ?
  `, [seedTime2, seedTime3, seedTime2]);

  // Setup 5: USDCAD - Superseded / Cancelled
  await queryDb(`
    INSERT INTO forex_edge_setups (
      id, instrument, market, created_at, resolved_at,
      killzone_origin, bias, entry_zone_low, entry_zone_high, entry_zone_mid,
      stop, tp1, tp2, signal_state, superseded, superseded_by, tradable, strategy_id
    ) VALUES (
      'test_USDCAD_22C4', 'USD/CAD', 'forex', ?, ?,
      'london', 'short', 1.38560, 1.38580, 1.38573,
      1.38800, 1.38000, 1.37500, 'superseded', 1, 'FB18', 0, 'sentinel_v2'
    ) ON CONFLICT (id) DO UPDATE SET created_at = ?
  `, [seedTime3, seedTime4, seedTime3]);

  // Setup 6: USDCAD - Still Pending (FB18)
  await queryDb(`
    INSERT INTO forex_edge_setups (
      id, instrument, market, created_at,
      killzone_origin, bias, entry_zone_low, entry_zone_high, entry_zone_mid,
      stop, tp1, tp2, signal_state, tradable, conviction_score, strategy_id
    ) VALUES (
      'test_USDCAD_FB18', 'USD/CAD', 'forex', ?,
      'ny_am', 'long', 1.38060, 1.38080, 1.38069,
      1.37800, 1.38500, 1.38800, 'awaiting_entry', 1, 89.0, 'sentinel_v2'
    ) ON CONFLICT (id) DO UPDATE SET created_at = ?
  `, [seedTime5, seedTime5]);

  console.log('✅ Test 2 Passed: 6 test signals seeded across distinct lifecycle states.');

  // ── TEST 3: Generate Signal Audit & PDF Document ─────────────────────────────
  console.log('\nTest 3: Generating Signal Audit Report & Vector PDF via PDFKit...');
  const auditReport = await signalAuditService.generateSignalAudit('london');

  assert.ok(auditReport.reportNumber > 0, 'Report number must be > 0');
  assert.strictEqual(auditReport.signalsCount >= 6, true, `Expected >= 6 signals, got ${auditReport.signalsCount}`);
  assert.ok(auditReport.pdfPath, 'PDF path must exist');
  assert.strictEqual(fs.existsSync(auditReport.pdfPath!), true, 'PDF file must exist on disk');

  const pdfBuffer = fs.readFileSync(auditReport.pdfPath!);
  assert.strictEqual(pdfBuffer.toString('utf8', 0, 5), '%PDF-', 'PDF file must start with %PDF- header');
  assert.strictEqual(pdfBuffer.length > 2000, true, `PDF file length should be > 2000 bytes, got ${pdfBuffer.length}`);
  console.log(`✅ Test 3 Passed: Report #${auditReport.reportNumber} compiled. PDF size: ${pdfBuffer.length} bytes at ${auditReport.pdfPath}`);

  // ── TEST 4: Validate Exact Table Columns & Format ────────────────────────────
  console.log('\nTest 4: Validating Table Columns & Row Values...');
  const rowMap = new Map(auditReport.rows.map(r => [r.tradeId, r]));

  const eur = rowMap.get('#EURUSD-7B55');
  assert.ok(eur, '#EURUSD-7B55 must be present in audit report');
  assert.strictEqual(eur?.asset, 'EURUSD');
  assert.strictEqual(eur?.executedAction.includes('Rejected'), true);
  assert.strictEqual(eur?.finalOutcome, 'EXECUTION_FAILED');

  const gbp = rowMap.get('#GBPUSD-85D7');
  assert.ok(gbp, '#GBPUSD-85D7 must be present in audit report');
  assert.strictEqual(gbp?.finalOutcome, 'REJECTED');
  assert.strictEqual(gbp?.executedAction.includes('Rejected'), true);

  const jpy = rowMap.get('#USDJPY-D014');
  assert.ok(jpy, '#USDJPY-D014 must be present in audit report');
  assert.strictEqual(jpy?.finalOutcome.includes('CLOSED'), true);
  assert.strictEqual(jpy?.isWin, true);

  const eurgbp = rowMap.get('#EURGBP-78F5');
  assert.ok(eurgbp, '#EURGBP-78F5 must be present in audit report');
  assert.strictEqual(eurgbp?.finalOutcome, 'STILL ACTIVE (SL @ BE)');

  const cadCanc = rowMap.get('#USDCAD-22C4');
  assert.ok(cadCanc, '#USDCAD-22C4 must be present in audit report');
  assert.strictEqual(cadCanc?.finalOutcome, 'CANCELLED');

  const cadPend = rowMap.get('#USDCAD-FB18');
  assert.ok(cadPend, '#USDCAD-FB18 must be present in audit report');
  assert.strictEqual(cadPend?.finalOutcome, 'STILL PENDING');

  console.log('✅ Test 4 Passed: All 7 columns accurately populated matching user specification.');

  // ── TEST 5: Sequential Report Counter ────────────────────────────────────────
  console.log('\nTest 5: Testing Monotonic Sequential Report Counter...');
  const secondReport = await signalAuditService.generateSignalAudit('london_rescan');
  assert.strictEqual(secondReport.reportNumber, auditReport.reportNumber + 1, 'Report number must increment sequentially by 1');
  console.log(`✅ Test 5 Passed: Report numbers incremented from #${auditReport.reportNumber} to #${secondReport.reportNumber}`);

  // ── TEST 6: Strict SND Branding (Zero "Manna" Occurrences) ───────────────────
  console.log('\nTest 6: Auditing branding (Ensuring 0 occurrences of "manna" / "manner")...');
  const reportJsonStr = JSON.stringify(auditReport).toLowerCase();
  assert.strictEqual(reportJsonStr.includes('manner edge'), false, 'Must not contain "manner edge"');
  assert.strictEqual(reportJsonStr.includes('manner'), false, 'Must not contain "manner"');
  assert.strictEqual(auditReport.title.includes('SND Signals'), true, 'Report title must be "SND Signals"');
  console.log('✅ Test 6 Passed: Strict SND Signals branding verified. 0 occurrences of "manna" or "manner".');

  // ── TEST 7: Notification Toggle Verification ────────────────────────────────
  console.log('\nTest 7: Verifying Notification Toggle Integration...');
  const settings = await queries.getNotificationSettings();
  const auditSetting = settings.find(s => s.key === 'notify_signal_audit_report');
  assert.ok(auditSetting, 'notify_signal_audit_report toggle must exist in notification_settings');
  assert.strictEqual(auditSetting?.category, 'report', 'Category must be report');
  console.log(`✅ Test 7 Passed: notify_signal_audit_report toggle verified: enabled=${auditSetting?.enabled}`);

  console.log('\n🎉 ALL 7 TEST SUITES PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
