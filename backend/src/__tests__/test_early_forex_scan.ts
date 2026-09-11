import { newsEngine } from '../news/news-engine';
import { earlyScanService } from '../scheduler/early-scan-service';
import { telegramBotService } from '../notifications/telegram-bot';

async function runTests() {
  console.log('🧪 Starting Early Forex News Scan Verification Tests...\n');

  // Test 1: News Engine NY AM High Impact News Filter
  console.log('Test 1: Testing NY AM High-Impact News detection');
  const testDate = new Date('2026-09-10T12:30:00Z'); // 08:30 AM EDT
  
  // Inject mock high-impact events
  (newsEngine as any).isLive = true;
  (newsEngine as any).events = [
    {
      id: 'mock-1',
      title: 'Consumer Price Index m/m',
      currency: 'USD',
      impact: 'high',
      eventTime: '2026-09-10T12:30:00.000Z' // 08:30 AM EDT
    },
    {
      id: 'mock-2',
      title: 'ISM Services PMI',
      currency: 'USD',
      impact: 'high',
      eventTime: '2026-09-10T14:00:00.000Z' // 10:00 AM EDT
    },
    {
      id: 'mock-3',
      title: 'German Prelim CPI',
      currency: 'EUR',
      impact: 'low',
      eventTime: '2026-09-10T12:00:00.000Z'
    },
    {
      id: 'mock-4',
      title: 'Crude Oil Inventories',
      currency: 'USD',
      impact: 'medium',
      eventTime: '2026-09-10T14:30:00.000Z'
    }
  ];

  const nyAmCheck = newsEngine.hasNyAmHighImpactNews(testDate);
  console.log('  Result:', {
    hasNews: nyAmCheck.hasNews,
    firstEvent: nyAmCheck.firstEvent?.title,
    scheduledTimeET: nyAmCheck.scheduledTimeET,
    targetScanTimeET: nyAmCheck.targetScanTimeET,
    isEarlyScanNeeded: nyAmCheck.isEarlyScanNeeded,
    isStandardTimeScan: nyAmCheck.isStandardTimeScan,
    eventsCount: nyAmCheck.events.length
  });

  if (!nyAmCheck.hasNews || nyAmCheck.events.length !== 2 || nyAmCheck.firstEvent?.id !== 'mock-1') {
    throw new Error('Test 1 Failed: hasNyAmHighImpactNews did not correctly identify NY AM high impact events.');
  }
  // For 08:30 AM news, pre-news scan is 30 mins prior = 08:00 AM ET (aligned with standard session)
  if (nyAmCheck.targetScanTimeET !== '08:00 AM ET' || nyAmCheck.isEarlyScanNeeded !== false || nyAmCheck.isStandardTimeScan !== true) {
    throw new Error(`Test 1 Failed: Expected 08:00 AM ET pre-news scan, got ${nyAmCheck.targetScanTimeET}`);
  }
  console.log('  ✅ Test 1 Passed: Identified 08:30 ET and 10:00 ET high-impact news correctly with 08:00 AM ET scan.\n');

  // Test 2: EarlyScanService Status & Banner Content for 08:30 News
  console.log('Test 2: Testing EarlyScanService state before completion for 08:30 news');
  const statusBefore = earlyScanService.getStatus(testDate);
  console.log('  Status before completion:', {
    hasEarlyScanToday: statusBefore.hasEarlyScanToday,
    hasCompletedToday: statusBefore.hasCompletedToday,
    earlyScanTimeET: statusBefore.earlyScanTimeET,
    isEarlyScanNeeded: statusBefore.isEarlyScanNeeded,
    isStandardTimeScan: statusBefore.isStandardTimeScan,
    bannerText: statusBefore.bannerText
  });

  if (!statusBefore.hasEarlyScanToday || statusBefore.hasCompletedToday) {
    throw new Error('Test 2 Failed: Status before completion is invalid.');
  }
  if (statusBefore.earlyScanTimeET !== '08:00 AM ET') {
    throw new Error(`Test 2 Failed: Expected 08:00 AM ET scan time, got ${statusBefore.earlyScanTimeET}`);
  }

  // Check strict constraint: zero mention of manna
  if (/manna/i.test(statusBefore.bannerText)) {
    throw new Error('Test 2 Failed: Banner text contains forbidden word "manna"!');
  }
  console.log('  ✅ Test 2 Passed: Banner correctly configured for 08:00 AM ET scan with zero mention of "manna".\n');

  // Test 3: Dynamic Timing for 08:15 and 08:00 News Events
  console.log('Test 3: Testing dynamic pre-news timing for 08:15 ET and 08:00 ET releases');
  // Inject 08:15 AM event (ADP)
  (newsEngine as any).events = [
    {
      id: 'mock-adp',
      title: 'ADP Non-Farm Employment Change',
      currency: 'USD',
      impact: 'high',
      eventTime: '2026-09-10T12:15:00.000Z' // 08:15 AM EDT
    }
  ];
  const adpCheck = newsEngine.hasNyAmHighImpactNews(testDate);
  console.log('  08:15 News scan timing:', { targetScanTimeET: adpCheck.targetScanTimeET, isEarlyScanNeeded: adpCheck.isEarlyScanNeeded });
  if (adpCheck.targetScanTimeET !== '07:45 AM ET' || !adpCheck.isEarlyScanNeeded) {
    throw new Error(`Test 3 Failed: Expected 07:45 AM ET for 08:15 news, got ${adpCheck.targetScanTimeET}`);
  }

  // Inject 08:00 AM event (e.g. Retail Sales)
  (newsEngine as any).events = [
    {
      id: 'mock-early',
      title: 'Retail Sales m/m',
      currency: 'USD',
      impact: 'high',
      eventTime: '2026-09-10T12:00:00.000Z' // 08:00 AM EDT
    }
  ];
  const earlyCheck = newsEngine.hasNyAmHighImpactNews(testDate);
  console.log('  08:00 News scan timing:', { targetScanTimeET: earlyCheck.targetScanTimeET, isEarlyScanNeeded: earlyCheck.isEarlyScanNeeded });
  if (earlyCheck.targetScanTimeET !== '07:30 AM ET' || !earlyCheck.isEarlyScanNeeded) {
    throw new Error(`Test 3 Failed: Expected 07:30 AM ET for 08:00 news, got ${earlyCheck.targetScanTimeET}`);
  }
  console.log('  ✅ Test 3 Passed: Dynamic timing correctly yields 07:45 ET (for 08:15 news) and 07:30 ET (for 08:00 news).\n');

  // Test 4: Double-Scan Prevention (Mark Completed)
  console.log('Test 4: Testing Double-Scan Prevention & Completion Status');
  earlyScanService.markCompleted(testDate);
  const statusAfter = earlyScanService.getStatus(testDate);
  const isRequiredAfter = earlyScanService.isEarlyScanRequired(testDate);

  console.log('  Status after completion:', {
    hasCompletedToday: statusAfter.hasCompletedToday,
    isEarlyScanRequired: isRequiredAfter,
    bannerText: statusAfter.bannerText
  });

  if (!statusAfter.hasCompletedToday || isRequiredAfter) {
    throw new Error('Test 4 Failed: Double scan protection failed — early scan marked completed should not be required again.');
  }
  if (/manna/i.test(statusAfter.bannerText)) {
    throw new Error('Test 4 Failed: Completed banner text contains forbidden word "manna"!');
  }
  console.log('  ✅ Test 4 Passed: Double scan protection successfully verified.\n');

  // Test 5: Telegram Warning Notice Formatting
  console.log('Test 5: Testing Telegram Warning Notice formatting');
  let sentText = '';
  // Spy on sendMessage
  (telegramBotService as any).sendMessage = async (text: string) => {
    sentText = text;
    return true;
  };

  await telegramBotService.sendEarlyScanNotice('USD Consumer Price Index m/m', '08:30 AM ET', '08:00 AM ET');
  console.log('  Telegram Message Preview (Standard Alignment):\n' + sentText);

  if (!sentText.includes('08:00 AM ET') || !sentText.includes('08:30 AM ET')) {
    throw new Error('Test 5 Failed: Telegram message missing critical scan details.');
  }
  if (/manna/i.test(sentText)) {
    throw new Error('Test 5 Failed: Telegram alert contains forbidden word "manna"!');
  }

  await telegramBotService.sendEarlyScanNotice('USD ADP Employment', '08:15 AM ET', '07:45 AM ET');
  console.log('  Telegram Message Preview (Early Rescheduled):\n' + sentText);
  if (!sentText.includes('07:45 AM ET') || !sentText.includes('Forex Only')) {
    throw new Error('Test 5 Failed: Telegram message missing early scan details.');
  }
  if (/manna/i.test(sentText)) {
    throw new Error('Test 5 Failed: Telegram alert contains forbidden word "manna"!');
  }
  console.log('\n  ✅ Test 5 Passed: Telegram alerts formatted cleanly with zero mention of "manna".\n');

  // Test 6: Verify that only real high-impact events trigger rescheduling (holidays & minor speeches rejected)
  console.log('Test 6: Testing exclusion of Bank Holidays and minor voting member speeches');
  (newsEngine as any).events = [
    {
      id: 'mock-holiday',
      title: 'US Bank Holiday',
      currency: 'USD',
      impact: 'high',
      eventTime: '2026-09-10T12:30:00.000Z'
    },
    {
      id: 'mock-speech',
      title: 'FOMC Member Barkin Speaks',
      currency: 'USD',
      impact: 'high',
      eventTime: '2026-09-10T13:00:00.000Z'
    }
  ];

  const fakeNewsCheck = newsEngine.hasNyAmHighImpactNews(testDate);
  console.log('  Bank Holiday & Minor Speech result:', { hasNews: fakeNewsCheck.hasNews, count: fakeNewsCheck.events.length });
  if (fakeNewsCheck.hasNews) {
    throw new Error('Test 6 Failed: Bank Holiday or minor speech incorrectly triggered early scan rescheduling!');
  }
  console.log('  ✅ Test 6 Passed: Holidays and minor speeches strictly rejected from triggering early scans.\n');

  console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Test execution error:', err);
  process.exit(1);
});
