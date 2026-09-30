import { newsEngine } from '../news/news-engine';
import { earlyScanService } from '../scheduler/early-scan-service';
import { telegramBotService } from '../notifications/telegram-bot';

async function runTests() {
  console.log('🧪 Starting Early & Post-News Forex Scan Verification Tests...\n');

  // Test 1: News Engine CPI Detection (30m AFTER News Rule)
  console.log('Test 1: Testing CPI post-news detection (must scan 30 minutes AFTER 08:30 release)');
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
    isPostNewsScan: nyAmCheck.isPostNewsScan,
    specialEventType: nyAmCheck.specialEventType,
    isEarlyScanNeeded: nyAmCheck.isEarlyScanNeeded,
    isStandardTimeScan: nyAmCheck.isStandardTimeScan,
    eventsCount: nyAmCheck.events.length
  });

  if (!nyAmCheck.hasNews || nyAmCheck.events.length !== 2 || nyAmCheck.firstEvent?.id !== 'mock-1') {
    throw new Error('Test 1 Failed: hasNyAmHighImpactNews did not correctly identify high impact events.');
  }
  // For CPI, rule is strictly 30 mins AFTER news: 08:30 AM + 30m = 09:00 AM ET
  if (nyAmCheck.targetScanTimeET !== '09:00 AM ET' || nyAmCheck.isPostNewsScan !== true || nyAmCheck.specialEventType !== 'CPI') {
    throw new Error(`Test 1 Failed: Expected 09:00 AM ET post-news scan for CPI, got ${nyAmCheck.targetScanTimeET}`);
  }
  console.log('  ✅ Test 1 Passed: Identified CPI correctly with 09:00 AM ET post-news scan (30m after).\n');

  // Test 2: EarlyScanService Status & Banner Content for 08:30 CPI News
  console.log('Test 2: Testing EarlyScanService state before completion for 08:30 CPI news');
  const statusBefore = earlyScanService.getStatus(testDate);
  console.log('  Status before completion:', {
    hasEarlyScanToday: statusBefore.hasEarlyScanToday,
    hasCompletedToday: statusBefore.hasCompletedToday,
    earlyScanTimeET: statusBefore.earlyScanTimeET,
    isPostNewsScan: statusBefore.isPostNewsScan,
    specialEventType: statusBefore.specialEventType,
    bannerText: statusBefore.bannerText
  });

  if (!statusBefore.hasEarlyScanToday || statusBefore.hasCompletedToday) {
    throw new Error('Test 2 Failed: Status before completion is invalid.');
  }
  if (statusBefore.earlyScanTimeET !== '09:00 AM ET' || !statusBefore.isPostNewsScan) {
    throw new Error(`Test 2 Failed: Expected 09:00 AM ET post-news scan time, got ${statusBefore.earlyScanTimeET}`);
  }
  if (!statusBefore.bannerText.includes('30 minutes after the news event at 09:00 AM ET')) {
    throw new Error(`Test 2 Failed: Banner text does not mention 30 minutes after news: ${statusBefore.bannerText}`);
  }

  // Check strict constraint: zero mention of manna
  if (/manna/i.test(statusBefore.bannerText)) {
    throw new Error('Test 2 Failed: Banner text contains forbidden word "manna"!');
  }
  console.log('  ✅ Test 2 Passed: Banner correctly configured for 09:00 AM ET post-news scan with zero mention of "manna".\n');

  // Test 3: Pre-News Timing for Non-CPI/NFP/FOMC (ADP at 08:15 and Retail Sales at 08:00)
  console.log('Test 3: Testing pre-news timing (30m prior) for ADP and Retail Sales');
  // Inject 08:15 AM event (ADP - must scan 30m PRIOR at 07:45 AM ET)
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
  console.log('  08:15 ADP scan timing:', { targetScanTimeET: adpCheck.targetScanTimeET, isEarlyScanNeeded: adpCheck.isEarlyScanNeeded, isPostNewsScan: adpCheck.isPostNewsScan });
  if (adpCheck.targetScanTimeET !== '07:45 AM ET' || !adpCheck.isEarlyScanNeeded || adpCheck.isPostNewsScan) {
    throw new Error(`Test 3 Failed: Expected 07:45 AM ET pre-news scan for ADP, got ${adpCheck.targetScanTimeET}`);
  }

  // Inject 08:00 AM event (Retail Sales - must scan 30m PRIOR at 07:30 AM ET)
  (newsEngine as any).events = [
    {
      id: 'mock-retail',
      title: 'Retail Sales m/m',
      currency: 'USD',
      impact: 'high',
      eventTime: '2026-09-10T12:00:00.000Z' // 08:00 AM EDT
    }
  ];
  const retailCheck = newsEngine.hasNyAmHighImpactNews(testDate);
  console.log('  08:00 Retail Sales scan timing:', { targetScanTimeET: retailCheck.targetScanTimeET, isEarlyScanNeeded: retailCheck.isEarlyScanNeeded, isPostNewsScan: retailCheck.isPostNewsScan });
  if (retailCheck.targetScanTimeET !== '07:30 AM ET' || !retailCheck.isEarlyScanNeeded || retailCheck.isPostNewsScan) {
    throw new Error(`Test 3 Failed: Expected 07:30 AM ET for Retail Sales, got ${retailCheck.targetScanTimeET}`);
  }
  console.log('  ✅ Test 3 Passed: Non-CPI/NFP/FOMC events correctly retain 30m prior timing (07:45 ET for ADP, 07:30 ET for Retail Sales).\n');

  // Test 3b: NFP Timing (30m AFTER 08:30 release -> 09:00 AM ET)
  console.log('Test 3b: Testing NFP post-news timing (30m after news event)');
  (newsEngine as any).events = [
    {
      id: 'mock-nfp',
      title: 'Non-Farm Employment Change',
      currency: 'USD',
      impact: 'high',
      eventTime: '2026-09-10T12:30:00.000Z' // 08:30 AM EDT
    }
  ];
  const nfpCheck = newsEngine.hasNyAmHighImpactNews(testDate);
  console.log('  08:30 NFP scan timing:', { targetScanTimeET: nfpCheck.targetScanTimeET, isPostNewsScan: nfpCheck.isPostNewsScan, specialEventType: nfpCheck.specialEventType });
  if (nfpCheck.targetScanTimeET !== '09:00 AM ET' || !nfpCheck.isPostNewsScan || nfpCheck.specialEventType !== 'NFP') {
    throw new Error(`Test 3b Failed: Expected 09:00 AM ET post-news scan for NFP, got ${nfpCheck.targetScanTimeET}`);
  }
  console.log('  ✅ Test 3b Passed: NFP correctly triggers 09:00 AM ET post-news scan (30m after).\n');

  // Test 3c: FOMC Timing (30m AFTER 14:00 release -> 14:30 ET)
  console.log('Test 3c: Testing FOMC post-news timing (30m after news event)');
  (newsEngine as any).events = [
    {
      id: 'mock-fomc',
      title: 'FOMC Statement',
      currency: 'USD',
      impact: 'high',
      eventTime: '2026-09-10T18:00:00.000Z' // 14:00 EDT (02:00 PM ET)
    }
  ];
  const fomcCheck = newsEngine.hasNyAmHighImpactNews(testDate);
  console.log('  14:00 FOMC scan timing:', { targetScanTimeET: fomcCheck.targetScanTimeET, isPostNewsScan: fomcCheck.isPostNewsScan, specialEventType: fomcCheck.specialEventType });
  if (fomcCheck.targetScanTimeET !== '02:30 PM ET' || !fomcCheck.isPostNewsScan || fomcCheck.specialEventType !== 'FOMC') {
    throw new Error(`Test 3c Failed: Expected 02:30 PM ET post-news scan for FOMC, got ${fomcCheck.targetScanTimeET}`);
  }
  console.log('  ✅ Test 3c Passed: FOMC correctly triggers 02:30 PM ET post-news scan (30m after).\n');

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
    throw new Error('Test 4 Failed: Double scan protection failed — early/post scan marked completed should not be required again.');
  }
  if (/manna/i.test(statusAfter.bannerText)) {
    throw new Error('Test 4 Failed: Completed banner text contains forbidden word "manna"!');
  }
  console.log('  ✅ Test 4 Passed: Double scan protection successfully verified.\n');

  // Test 5: Telegram Warning Notice Formatting (Both Post-News and Pre-News)
  console.log('Test 5: Testing Telegram Warning Notice formatting');
  let sentText = '';
  // Spy on sendMessage
  (telegramBotService as any).sendMessage = async (text: string) => {
    sentText = text;
    return true;
  };

  // Test Post-News Notice (CPI / NFP / FOMC)
  await telegramBotService.sendEarlyScanNotice('USD Consumer Price Index m/m', '08:30 AM ET', '09:00 AM ET', true);
  console.log('  Telegram Message Preview (Post-News Scan):\n' + sentText);

  if (!sentText.includes('09:00 AM ET') || !sentText.includes('30 minutes after the news event')) {
    throw new Error('Test 5 Failed: Telegram message missing 30m post-news details.');
  }
  if (/manna/i.test(sentText)) {
    throw new Error('Test 5 Failed: Telegram alert contains forbidden word "manna"!');
  }

  // Test Pre-News Notice (ADP)
  await telegramBotService.sendEarlyScanNotice('USD ADP Employment', '08:15 AM ET', '07:45 AM ET', false);
  console.log('  Telegram Message Preview (Pre-News Scan):\n' + sentText);
  if (!sentText.includes('07:45 AM ET') || !sentText.includes('30 minutes prior to news')) {
    throw new Error('Test 5 Failed: Telegram message missing pre-news scan details.');
  }
  if (/manna/i.test(sentText)) {
    throw new Error('Test 5 Failed: Telegram alert contains forbidden word "manna"!');
  }
  console.log('\n  ✅ Test 5 Passed: Telegram alerts formatted cleanly for both post-news and pre-news with zero mention of "manna".\n');

  // Test 6: Verify that Bank Holidays and minor speeches are rejected
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
    throw new Error('Test 6 Failed: Bank Holiday or minor speech incorrectly triggered news scan rescheduling!');
  }
  console.log('  ✅ Test 6 Passed: Holidays and minor speeches strictly rejected from triggering news scans.\n');

  console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Test execution error:', err);
  process.exit(1);
});
