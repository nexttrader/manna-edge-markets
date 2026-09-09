import assert from 'assert';
import { calculateExcursionFromCandles, resolveYahooSymbol } from '../analytics/candle-excursion-service';
import { Candle } from '../discovery/types';

console.log('🧪 Testing MAE & MFE Excursion Calculation Engine...\n');

// ── Test 1: Symbol resolution ────────────────────────────────────────────────
assert.strictEqual(resolveYahooSymbol('NQ'), 'NQ=F');
assert.strictEqual(resolveYahooSymbol('ES'), 'ES=F');
assert.strictEqual(resolveYahooSymbol('EUR/USD'), 'EURUSD=X');
assert.strictEqual(resolveYahooSymbol('EURUSD'), 'EURUSD=X');
console.log('✅ Test 1 Passed: Symbol mapping resolved correctly.');

// ── Test 2: Long trade with 25% adverse drawdown before 2R winner ────────────
// Entry: 100, Stop: 90 (Risk = 10 pts = 1R).
// During trade, lowest low reached is 97.5 (2.5 pts drawdown = 0.25R MAE).
// Highest high reached is 120 (20 pts gain = 2.0R MFE).
const mockCandlesLong: Candle[] = [
  { open: 100, high: 102, low: 98.0, close: 101, volume: 1000, timestamp: '2026-09-08T14:00:00Z' },
  { open: 101, high: 101.5, low: 97.5, close: 99, volume: 1200, timestamp: '2026-09-08T14:01:00Z' }, // Lowest point (97.5)
  { open: 99, high: 110, low: 98.5, close: 109, volume: 1500, timestamp: '2026-09-08T14:02:00Z' },
  { open: 109, high: 120, low: 108, close: 120, volume: 2000, timestamp: '2026-09-08T14:03:00Z' }  // Highest point (120)
];

const resLong = calculateExcursionFromCandles({
  instrument: 'NQ=F',
  bias: 'long',
  entryPrice: 100,
  initialStop: 90,
  candles: mockCandlesLong,
  exitPrice: 120
});

assert.strictEqual(resLong.lowestPrice, 97.5, 'Lowest price must be 97.5');
assert.strictEqual(resLong.highestPrice, 120, 'Highest price must be 120');
assert.strictEqual(resLong.maePoints, 2.5, 'MAE points should be 100 - 97.5 = 2.5');
assert.strictEqual(resLong.maeR, 0.25, 'MAE R should be 2.5 / 10 = 0.25R');
assert.strictEqual(resLong.mfePoints, 20, 'MFE points should be 120 - 100 = 20');
assert.strictEqual(resLong.mfeR, 2.0, 'MFE R should be 20 / 10 = 2.0R');
assert.strictEqual(resLong.barsHeld, 4, 'Bars held should be 4');
console.log('✅ Test 2 Passed: Long trade MAE (0.25R) and MFE (2.0R) computed accurately.');

// ── Test 3: Short trade with adverse pullup against position before drop ──────
// Entry: 1.1000, Stop: 1.1050 (Risk = 0.0050 = 50 pips = 1R).
// During trade, highest high reaches 1.1015 (15 pips adverse = 0.30R MAE).
// Lowest low reaches 1.0900 (100 pips favorable = 2.0R MFE).
const mockCandlesShort: Candle[] = [
  { open: 1.1000, high: 1.1015, low: 1.0990, close: 1.0995, volume: 500, timestamp: '2026-09-08T15:00:00Z' }, // Peak against short (1.1015)
  { open: 1.0995, high: 1.1000, low: 1.0950, close: 1.0955, volume: 600, timestamp: '2026-09-08T15:01:00Z' },
  { open: 1.0955, high: 1.0960, low: 1.0900, close: 1.0905, volume: 800, timestamp: '2026-09-08T15:02:00Z' }  // Low of trade (1.0900)
];

const resShort = calculateExcursionFromCandles({
  instrument: 'EUR/USD',
  bias: 'short',
  entryPrice: 1.1000,
  initialStop: 1.1050,
  candles: mockCandlesShort,
  exitPrice: 1.0900
});

assert.strictEqual(resShort.highestPrice, 1.1015, 'Short highest price must be 1.1015');
assert.strictEqual(resShort.lowestPrice, 1.0900, 'Short lowest price must be 1.0900');
assert.strictEqual(resShort.maePoints, 0.0015, 'Short MAE points should be 0.0015');
assert.strictEqual(resShort.maeR, 0.3, 'Short MAE R should be 0.0015 / 0.0050 = 0.30R');
assert.strictEqual(resShort.mfePoints, 0.0100, 'Short MFE points should be 0.0100');
assert.strictEqual(resShort.mfeR, 2.0, 'Short MFE R should be 0.0100 / 0.0050 = 2.0R');
console.log('✅ Test 3 Passed: Short trade MAE (0.30R) and MFE (2.0R) computed accurately.');

// ── Test 4: Stop Loss hit (full 1.0R MAE) ────────────────────────────────────
const mockCandlesSL: Candle[] = [
  { open: 100, high: 100.5, low: 89.5, close: 89.5, volume: 1000, timestamp: '2026-09-08T16:00:00Z' }
];

const resSL = calculateExcursionFromCandles({
  instrument: 'NQ=F',
  bias: 'long',
  entryPrice: 100,
  initialStop: 90,
  candles: mockCandlesSL,
  exitPrice: 90
});

assert.strictEqual(resSL.maePoints, 10.5, 'SL hit went 10.5 points below entry');
assert.strictEqual(resSL.maeR, 1.05, 'MAE should record the full stop excursion (1.05R including slippage)');
console.log('✅ Test 4 Passed: Stop Loss excursion correctly captured at >= 1.0R.');

console.log('\n🎉 All Excursion Calculation Unit Tests Passed Successfully!');
