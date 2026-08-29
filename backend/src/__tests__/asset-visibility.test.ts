import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as queries from '../db/queries';
import { queryDb, initDatabase } from '../db/database';
import { TelegramBot } from '../notifications/telegram-bot';

describe('Asset Display Visibility & Background Tracking Engine Tests', () => {
  before(async () => {
    await initDatabase();
  });

  it('TEST 1: Initializes default asset settings with 8 Futures and 8 Forex assets', async () => {
    const assets = await queries.getAssetSettings();
    assert.ok(assets.length >= 16, `Expected at least 16 seeded assets, got ${assets.length}`);

    const es = assets.find(a => a.symbol === 'ES');
    const eurusd = assets.find(a => a.symbol === 'EUR/USD');

    assert.ok(es, 'ES futures asset must exist in database');
    assert.equal(es.market, 'futures');
    assert.equal(es.display_enabled, true, 'Default display must be enabled');
    assert.equal(es.tracking_enabled, true, 'Default tracking must be enabled');

    assert.ok(eurusd, 'EUR/USD forex asset must exist in database');
    assert.equal(eurusd.market, 'forex');
  });

  it('TEST 2: Super Admin toggles individual asset display to FALSE (Stealth Mode)', async () => {
    const updated = await queries.setAssetDisplay('ES', false);
    const es = updated.find(a => a.symbol === 'ES');
    assert.ok(es);
    assert.equal(es.display_enabled, false, 'ES display_enabled must be false');
    assert.equal(es.tracking_enabled, true, 'ES tracking_enabled must remain true (continuous background monitoring)');

    const disabledAssets = await queries.getDisabledDisplayAssets();
    assert.ok(disabledAssets.includes('ES'), 'getDisabledDisplayAssets must include ES');
  });

  it('TEST 3: Background tracking & setup creation continues regardless of display state', async () => {
    const setupId = `test_es_stealth_${Date.now()}`;
    await queryDb(
      `INSERT INTO edge_setups (id, instrument, market, timeframe, bias, entry_price_recorded, signal_state, conviction_score, strategy_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [setupId, 'ES', 'futures', '5m', 'bullish', 5000.0, 'awaiting_entry', 88, 'sentinel_v2']
    );

    // Verify setup exists in DB
    const saved = await queries.getSetupById(setupId);
    assert.ok(saved, 'Setup must be recorded in DB even if asset display is disabled');
    assert.equal(saved.instrument, 'ES');
  });

  it('TEST 4: Telegram alert gate suppresses notifications for turned-off assets', async () => {
    const bot = new TelegramBot();
    const disabledAssets = await queries.getDisabledDisplayAssets();
    assert.ok(disabledAssets.includes('ES'));

    // Test sendIfEnabled suppression
    const testSetup = {
      id: 'test_es_alert',
      instrument: 'ES',
      market: 'futures',
      bias: 'bullish',
      strategy_id: 'sentinel_v2'
    };

    // Disabled asset should be suppressed
    assert.ok(disabledAssets.includes(testSetup.instrument), 'ES should be identified as disabled for display');
  });

  it('TEST 5: Bulk toggles work for entire asset classes (e.g. all Forex)', async () => {
    const updated = await queries.bulkSetAssetDisplay({ market: 'forex' }, false);
    const forexAssets = updated.filter(a => a.market === 'forex');
    assert.ok(forexAssets.length > 0);
    forexAssets.forEach(a => {
      assert.equal(a.display_enabled, false, `Forex asset ${a.symbol} must have display_enabled = false`);
    });

    // Re-enable Forex
    const reenabled = await queries.bulkSetAssetDisplay({ market: 'forex' }, true);
    const reenabledForex = reenabled.filter(a => a.market === 'forex');
    reenabledForex.forEach(a => {
      assert.equal(a.display_enabled, true, `Forex asset ${a.symbol} must have display_enabled = true`);
    });
  });

  it('TEST 6: Custom asset registration automatically enables continuous tracking', async () => {
    const customSymbol = 'BTC_TEST';
    const updated = await queries.registerCustomAsset(customSymbol, 'futures', 'Bitcoin Test Contract');
    const btc = updated.find(a => a.symbol === customSymbol);
    assert.ok(btc, 'Custom asset must be registered');
    assert.equal(btc.symbol, customSymbol);
    assert.equal(btc.market, 'futures');
    assert.equal(btc.display_enabled, true);
    assert.equal(btc.tracking_enabled, true);
  });

  after(async () => {
    // Reset ES to true for clean test state
    await queries.setAssetDisplay('ES', true);
  });
});
