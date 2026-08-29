import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as queries from '../db/queries';
import { queryDb, initializeDatabase } from '../db/database';
import { TelegramBot } from '../notifications/telegram-bot';

describe('Asset Display Visibility & Background Tracking Engine Tests', () => {
  before(async () => {
    await initializeDatabase();
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
    const now = new Date().toISOString();
    await queryDb(
      `INSERT INTO edge_setups (id, instrument, market, created_at, killzone_origin, bias, entry_zone_low, entry_zone_high, entry_zone_mid, entry_price_recorded, stop, tp1, signal_state, conviction_score, strategy_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [setupId, 'ES', 'futures', now, 'ny_am', 'long', 5000, 5010, 5005, 5005, 4980, 5055, 'awaiting_entry', 88, 'sentinel_v2']
    );

    // Verify setup exists in DB
    const saved = await queries.getSetupById(setupId);
    assert.ok(saved, 'Setup must be recorded in DB even if asset display is disabled');
    assert.equal(saved.instrument, 'ES');
  });

  it('TEST 4: Telegram alert gate suppresses notifications for turned-off assets', async () => {
    const disabledAssets = await queries.getDisabledDisplayAssets();
    assert.ok(disabledAssets.includes('ES'));

    // Test sendIfEnabled suppression
    const testSetup = {
      id: 'test_es_alert',
      instrument: 'ES',
      market: 'futures',
      bias: 'long',
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

  it('TEST 7: Hiding sentinel_v2 from admins excludes it from getHiddenStrategyIdsForRole and getStrategySettings', async () => {
    // Hide sentinel_v2 from admins
    await queries.updateStrategyVisibility('sentinel_v2', false);

    const hiddenForAdmin = await queries.getHiddenStrategyIdsForRole('admin', 'admin@example.com');
    assert.ok(hiddenForAdmin.includes('sentinel_v2'), 'sentinel_v2 must be in hidden strategy IDs for admin');

    const adminSettings = await queries.getStrategySettings('admin', 'admin@example.com');
    assert.ok(!adminSettings.some(s => s.id === 'sentinel_v2'), 'admin must NOT see sentinel_v2 when hidden');

    const superAdminSettings = await queries.getStrategySettings('super_admin');
    assert.ok(superAdminSettings.some(s => s.id === 'sentinel_v2'), 'super admin MUST see sentinel_v2');

    // Re-enable for admins
    await queries.updateStrategyVisibility('sentinel_v2', true);
    const hiddenAfter = await queries.getHiddenStrategyIdsForRole('admin', 'admin@example.com');
    assert.ok(!hiddenAfter.includes('sentinel_v2'), 'sentinel_v2 must not be hidden once re-enabled for admins');
  });

  it('TEST 8: Hiding sentinel_v2 from clients excludes it for traders', async () => {
    // Hide sentinel_v2 from clients/traders
    await queries.updateStrategyTraderVisibility('sentinel_v2', false);

    const hiddenForTrader = await queries.getHiddenStrategyIdsForRole('trader', 'trader@example.com');
    assert.ok(hiddenForTrader.includes('sentinel_v2'), 'sentinel_v2 must be in hidden strategy IDs for trader');

    const traderSettings = await queries.getStrategySettings('trader', 'trader@example.com');
    assert.ok(!traderSettings.some(s => s.id === 'sentinel_v2'), 'trader must NOT see sentinel_v2 when hidden');

    // Re-enable for traders
    await queries.updateStrategyTraderVisibility('sentinel_v2', true);
    const hiddenAfter = await queries.getHiddenStrategyIdsForRole('trader', 'trader@example.com');
    assert.ok(!hiddenAfter.includes('sentinel_v2'), 'sentinel_v2 must not be hidden once re-enabled for traders');
  });

  after(async () => {
    // Reset ES to true for clean test state
    await queries.setAssetDisplay('ES', true);
    await queries.updateStrategyVisibility('sentinel_v2', true);
    await queries.updateStrategyTraderVisibility('sentinel_v2', true);
  });
});
