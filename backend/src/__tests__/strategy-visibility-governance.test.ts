import assert from 'assert';
import { initializeDatabase } from '../db/database';
import * as queries from '../db/queries';

async function runStrategyVisibilityGovernanceTests() {
  console.log('🧪 Starting Strategy Visibility Governance Test Suite...\n');

  await initializeDatabase();

  const strategies = ['sentinel_v2', 'manna_snd'];

  for (const stratId of strategies) {
    console.log(`\n--- Testing Strategy Visibility for [${stratId}] ---`);

    // 1. Reset both to visible
    await queries.updateStrategyVisibility(stratId, true);
    await queries.updateStrategyTraderVisibility(stratId, true);

    // 2. Super Admin check: always visible
    const superAdminSettings = await queries.getStrategySettings('super_admin');
    const stratSuper = superAdminSettings.find(s => s.id === stratId);
    assert(stratSuper, `Super Admin must always see ${stratId}`);
    assert.strictEqual(stratSuper.visibleToAdmins, true);
    assert.strictEqual(stratSuper.visibleToTraders, true);

    const hiddenForSuper = await queries.getHiddenStrategyIdsForRole('super_admin');
    assert(!hiddenForSuper.includes(stratId), `Super Admin must not have ${stratId} hidden`);

    // 3. Hide from Admins
    console.log(`Hiding ${stratId} from Admins...`);
    await queries.updateStrategyVisibility(stratId, false);

    const hiddenForAdmin = await queries.getHiddenStrategyIdsForRole('admin', 'admin@example.com');
    assert(hiddenForAdmin.includes(stratId), `Admin must have ${stratId} hidden when visible_to_admins is false`);

    const adminSettings = await queries.getStrategySettings('admin', 'admin@example.com');
    assert(!adminSettings.some(s => s.id === stratId), `Admin strategy settings must exclude ${stratId}`);

    // Super Admin still sees it!
    const hiddenForSuperStill = await queries.getHiddenStrategyIdsForRole('super_admin');
    assert(!hiddenForSuperStill.includes(stratId), `Super Admin must still see ${stratId} when hidden from admins`);

    // 4. Re-enable for Admins
    console.log(`Re-enabling ${stratId} for Admins...`);
    await queries.updateStrategyVisibility(stratId, true);

    const hiddenForAdminRestored = await queries.getHiddenStrategyIdsForRole('admin', 'admin@example.com');
    assert(!hiddenForAdminRestored.includes(stratId), `Admin must see ${stratId} once re-enabled`);

    // 5. Hide from Clients / Traders
    console.log(`Hiding ${stratId} from Clients / Traders...`);
    await queries.updateStrategyTraderVisibility(stratId, false);

    const hiddenForTrader = await queries.getHiddenStrategyIdsForRole('trader', 'client@example.com');
    assert(hiddenForTrader.includes(stratId), `Trader must have ${stratId} hidden when visible_to_traders is false`);

    const traderSettings = await queries.getStrategySettings('trader', 'client@example.com');
    assert(!traderSettings.some(s => s.id === stratId), `Trader strategy settings must exclude ${stratId}`);

    // Admin & Super Admin still see it if visible_to_admins is true
    const hiddenForAdminWhileTraderHidden = await queries.getHiddenStrategyIdsForRole('admin', 'admin@example.com');
    assert(!hiddenForAdminWhileTraderHidden.includes(stratId), `Admin must still see ${stratId} if visible_to_admins is true`);

    // 6. Re-enable for Clients / Traders
    console.log(`Re-enabling ${stratId} for Clients / Traders...`);
    await queries.updateStrategyTraderVisibility(stratId, true);

    const hiddenForTraderRestored = await queries.getHiddenStrategyIdsForRole('trader', 'client@example.com');
    assert(!hiddenForTraderRestored.includes(stratId), `Trader must see ${stratId} once re-enabled`);

    console.log(`✅ All visibility rules verified for [${stratId}]!`);
  }

  console.log('\n🎉 ALL STRATEGY VISIBILITY GOVERNANCE TESTS PASSED SUCCESSFULLY!');
}

runStrategyVisibilityGovernanceTests().catch(err => {
  console.error('❌ Visibility governance test failed:', err);
  process.exit(1);
});
