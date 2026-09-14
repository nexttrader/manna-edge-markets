import assert from 'assert';
import { revalidateSetup } from '../publish-gate/revalidation';
import { EdgeSetup } from '../discovery/types';

console.log('🧪 Starting Pre-Entry Invalidation & Order Cancellation Tests...\n');

// 1. Long Setup: Price touches TP1 before entry fill
const mockLongSetup: EdgeSetup = {
  id: 'test_long_usdjpy',
  instrument: 'USD/JPY',
  market: 'forex',
  created_at: new Date().toISOString(),
  killzone_origin: 'london',
  bias: 'long',
  entry_zone_low: 153.00,
  entry_zone_high: 153.20,
  entry_zone_mid: 153.10,
  stop: 152.50,
  tp1: 154.20,
  tp2: 154.70,
  r_multiple_1: 1.8,
  r_multiple_2: 2.6,
  signal_state: 'awaiting_entry',
  superseded: 0,
  tradable: 1
};

// Case 1A: Price approaching entry zone normally (valid)
const res1A = revalidateSetup(mockLongSetup, 153.50, 0.20, 153.60, 153.40);
assert.strictEqual(res1A.isValid, true, 'Long setup approaching entry within normal bounds should be valid');

// Case 1B: Spot price hits TP1 (+2R) before entry fill
const res1B = revalidateSetup(mockLongSetup, 154.25, 0.20, 154.25, 153.40);
assert.strictEqual(res1B.isValid, false, 'Price touching TP1 before entry must invalidate setup');
assert.strictEqual(res1B.reason, 'price_displaced');
assert.ok(res1B.detail?.includes('TP1'), 'Detail must indicate TP1 target was reached');

// Case 1C: Spot price runs through both TP1 and TP2 before entry fill
const res1C = revalidateSetup(mockLongSetup, 154.85, 0.20, 154.85, 153.40);
assert.strictEqual(res1C.isValid, false, 'Price running through both TPs must invalidate setup');
assert.strictEqual(res1C.reason, 'price_displaced');

// Case 1D: Intra-minute wick (maxHigh) touched TP1, but currentPrice has already started retracing
const res1D = revalidateSetup(mockLongSetup, 153.90, 0.20, 154.30, 153.70);
assert.strictEqual(res1D.isValid, false, 'Wick (maxHigh) touching TP1 before entry must invalidate setup even if price pulled back');
assert.strictEqual(res1D.reason, 'price_displaced');

// Case 1E: Price crashes through Stop Loss before entry fill
const res1E = revalidateSetup(mockLongSetup, 152.40, 0.20, 153.50, 152.40);
assert.strictEqual(res1E.isValid, false, 'Price breaching Stop Loss before entry must invalidate setup');
assert.strictEqual(res1E.reason, 'price_displaced');
assert.ok(res1E.detail?.includes('Stop Loss'), 'Detail must indicate Stop Loss was breached');

console.log('✅ TEST 1: Long Pre-Entry Invalidation (TP1, TP2, Wick High, SL Breach) Passed');


// 2. Short Setup: Price touches TP1 before entry fill
const mockShortSetup: EdgeSetup = {
  id: 'test_short_usdjpy',
  instrument: 'USD/JPY',
  market: 'forex',
  created_at: new Date().toISOString(),
  killzone_origin: 'ny_am',
  bias: 'short',
  entry_zone_low: 155.00,
  entry_zone_high: 155.20,
  entry_zone_mid: 155.10,
  stop: 155.60,
  tp1: 154.00,
  tp2: 153.50,
  r_multiple_1: 2.2,
  r_multiple_2: 3.2,
  signal_state: 'awaiting_entry',
  superseded: 0,
  tradable: 1
};

// Case 2A: Price approaching supply zone normally (valid)
const res2A = revalidateSetup(mockShortSetup, 154.60, 0.20, 154.70, 154.50);
assert.strictEqual(res2A.isValid, true, 'Short setup approaching entry within normal bounds should be valid');

// Case 2B: Spot price plunges to TP1 (+2R) without filling entry
const res2B = revalidateSetup(mockShortSetup, 153.95, 0.20, 154.70, 153.95);
assert.strictEqual(res2B.isValid, false, 'Short price reaching TP1 before entry must invalidate setup');
assert.strictEqual(res2B.reason, 'price_displaced');

// Case 2C: Spot price plunges through both TP1 and TP2 without filling entry
const res2C = revalidateSetup(mockShortSetup, 153.30, 0.20, 154.70, 153.30);
assert.strictEqual(res2C.isValid, false, 'Short price reaching TP2 before entry must invalidate setup');
assert.strictEqual(res2C.reason, 'price_displaced');

// Case 2D: Wick (minLow) pierced TP1, but price has bounced back up
const res2D = revalidateSetup(mockShortSetup, 154.30, 0.20, 154.50, 153.90);
assert.strictEqual(res2D.isValid, false, 'Wick (minLow) piercing TP1 before entry must invalidate setup even if price bounced');
assert.strictEqual(res2D.reason, 'price_displaced');

// Case 2E: Price rallies through Stop Loss before entry fill
const res2E = revalidateSetup(mockShortSetup, 155.70, 0.20, 155.70, 154.50);
assert.strictEqual(res2E.isValid, false, 'Short price breaching Stop Loss before entry must invalidate setup');
assert.strictEqual(res2E.reason, 'price_displaced');

console.log('✅ TEST 2: Short Pre-Entry Invalidation (TP1, TP2, Wick Low, SL Breach) Passed');

console.log('\n🎉 ALL PRE-ENTRY INVALIDATION TESTS PASSED SUCCESSFULLY!');
