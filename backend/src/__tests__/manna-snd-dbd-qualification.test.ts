import { MannaSndStrategy } from '../discovery/strategies/manna-snd';
import type { Candle } from '../discovery/types';

function makeCandle(open: number, high: number, low: number, close: number, timestamp: string): Candle {
  return {
    timestamp,
    open,
    high,
    low,
    close,
    volume: 1000
  };
}

async function runTests() {
  console.log('--- Testing Manna SnD DBD Opposing Demand Breakdown Qualification ---');
  const strategy = new MannaSndStrategy();

  // Construct candle history on 1H:
  // 1. First, establish an opposing Demand zone (Drop-Base-Rally) around 1.3360 - 1.3380:
  //    - Leg down: 1.3400 -> 1.3360
  //    - Base: 1.3360 -> 1.3365 (body <= 55%)
  //    - Leg up: 1.3365 -> 1.3440 (strong rally)
  // 2. Next, establish an old high Rally-Base-Drop (RBD) at 1.3500 - 1.3520
  // 3. Price drops down from 1.3520 to 1.3450
  // 4. Case A: Drop-Base-Drop (DBD) at 1.3440 that breaks through the 1.3360 demand (drops to 1.3320)
  //    -> This DBD MUST qualify and be chosen over the 1.3500 RBD because it's closer to price (1.3390) and broke demand!
  // 5. Case B: Drop-Base-Drop (DBD) that did NOT break through opposing demand (only dropped to 1.3390, above demand)
  //    -> This DBD MUST be disqualified and the 1.3500 RBD chosen instead!

  // Let's test getCurveLocation directly using reflective access or setup evaluation:
  const getCurveLocation = (strategy as any).getCurveLocation.bind(strategy);

  // Candles for Case A (DBD breaks opposing demand):
  const candlesCaseA: Candle[] = [
    // Opposing Demand (Drop-Base-Rally) at index 1-2
    makeCandle(1.3420, 1.3425, 1.3370, 1.3375, '2026-09-10T01:00:00Z'), // leg_down
    makeCandle(1.3375, 1.3380, 1.3360, 1.3378, '2026-09-10T02:00:00Z'), // base (proximal ~1.3378, distal 1.3360)
    makeCandle(1.3378, 1.3450, 1.3375, 1.3445, '2026-09-10T03:00:00Z'), // leg_up (departure rally)
    makeCandle(1.3445, 1.3500, 1.3440, 1.3495, '2026-09-10T04:00:00Z'), // rally continues

    // High RBD at index 5-6 (proximal 1.3505, distal 1.3520)
    makeCandle(1.3495, 1.3520, 1.3490, 1.3515, '2026-09-11T01:00:00Z'), // leg_up
    makeCandle(1.3515, 1.3520, 1.3505, 1.3510, '2026-09-11T02:00:00Z'), // base
    makeCandle(1.3510, 1.3515, 1.3450, 1.3455, '2026-09-11T03:00:00Z'), // leg_down

    // Now DBD at index 8-9 (proximal ~1.3445, distal 1.3460):
    // Leg in: 1.3455 -> 1.3440 (leg_down)
    makeCandle(1.3455, 1.3460, 1.3435, 1.3440, '2026-09-12T01:00:00Z'), // leg_down
    makeCandle(1.3440, 1.3445, 1.3435, 1.3442, '2026-09-12T02:00:00Z'), // base (proximal ~1.3440, distal 1.3445)
    // Departure that breaks opposing demand at 1.3360:
    makeCandle(1.3442, 1.3445, 1.3340, 1.3345, '2026-09-12T03:00:00Z'), // leg_down (closes below 1.3360 demand!)
    makeCandle(1.3345, 1.3350, 1.3310, 1.3320, '2026-09-12T04:00:00Z'), // drop extension
    // Price bounces back up to 1.3390 (below the DBD at 1.3440, above demand at 1.3320)
    makeCandle(1.3320, 1.3395, 1.3315, 1.3390, '2026-09-12T05:00:00Z')
  ];

  const currentPrice = 1.3390;
  const atr = 0.0030;

  const resultCaseA = getCurveLocation(currentPrice, candlesCaseA, atr);
  console.log('Result Case A (DBD broke demand):');
  console.log('  Selected Supply formation:', resultCaseA.htfSupply.formation);
  console.log('  Selected Supply proximal:', resultCaseA.htfSupply.proximal);

  if (resultCaseA.htfSupply.formation !== 'Drop-Base-Drop') {
    throw new Error(`Expected Case A to select Drop-Base-Drop supply zone, got ${resultCaseA.htfSupply.formation}`);
  }
  console.log('✅ TEST 1 PASSED: Qualified DBD that broke opposing demand was chosen as nearest supply!');

  // Case B: The DBD did NOT break opposing demand (e.g. departure only went to 1.3395, while demand is at 1.3378)
  const candlesCaseB = candlesCaseA.map(c => ({ ...c }));
  // Modify the departure of the DBD so it doesn't break demand (low 1.3385, close 1.3390)
  candlesCaseB[9] = makeCandle(1.3442, 1.3445, 1.3385, 1.3390, '2026-09-12T03:00:00Z');
  candlesCaseB[10] = makeCandle(1.3390, 1.3395, 1.3385, 1.3388, '2026-09-12T04:00:00Z');
  candlesCaseB[11] = makeCandle(1.3388, 1.3392, 1.3385, 1.3390, '2026-09-12T05:00:00Z');

  const resultCaseB = getCurveLocation(currentPrice, candlesCaseB, atr);
  console.log('Result Case B (DBD did NOT break demand):');
  console.log('  Selected Supply formation:', resultCaseB.htfSupply.formation);
  console.log('  Selected Supply proximal:', resultCaseB.htfSupply.proximal);

  if (resultCaseB.htfSupply.formation === 'Drop-Base-Drop') {
    throw new Error('Expected Case B to REJECT Drop-Base-Drop because it did NOT break opposing demand!');
  }
  if (resultCaseB.htfSupply.formation !== 'Rally-Base-Drop') {
    throw new Error(`Expected Case B to select Rally-Base-Drop, got ${resultCaseB.htfSupply.formation}`);
  }
  console.log('✅ TEST 2 PASSED: Unqualified DBD was rejected, and RBD was chosen!');

  console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
