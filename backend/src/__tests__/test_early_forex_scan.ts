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
    eventsCount: nyAmCheck.events.length
  });

  if (!nyAmCheck.hasNews || nyAmCheck.events.length !== 2 || nyAmCheck.firstEvent?.id !== 'mock-1') {
    throw new Error('Test 1 Failed: hasNyAmHighImpactNews did not correctly identify NY AM high impact events.');
  }
  console.log('  ✅ Test 1 Passed: Identified 08:30 ET and 10:00 ET high-impact news correctly.\n');

  // Test 2: EarlyScanService Status & Banner Content
  console.log('Test 2: Testing EarlyScanService state before completion');
  const statusBefore = earlyScanService.getStatus(testDate);
  console.log('  Status before completion:', {
    hasEarlyScanToday: statusBefore.hasEarlyScanToday,
    hasCompletedToday: statusBefore.hasCompletedToday,
    earlyScanTimeET: statusBefore.earlyScanTimeET,
    bannerText: statusBefore.bannerText
  });

  if (!statusBefore.hasEarlyScanToday || statusBefore.hasCompletedToday) {
    throw new Error('Test 2 Failed: Status before completion is invalid.');
  }

  // Check strict constraint: zero mention of manna
  if (/manna/i.test(statusBefore.bannerText)) {
    throw new Error('Test 2 Failed: Banner text contains forbidden word "manna"!');
  }
  console.log('  ✅ Test 2 Passed: Banner correctly configured with zero mention of "manna".\n');

  // Test 3: Double-Scan Prevention (Mark Completed)
  console.log('Test 3: Testing Double-Scan Prevention & Completion Status');
  earlyScanService.markCompleted(testDate);
  const statusAfter = earlyScanService.getStatus(testDate);
  const isRequiredAfter = earlyScanService.isEarlyScanRequired(testDate);

  console.log('  Status after completion:', {
    hasCompletedToday: statusAfter.hasCompletedToday,
    isEarlyScanRequired: isRequiredAfter,
    bannerText: statusAfter.bannerText
  });

  if (!statusAfter.hasCompletedToday || isRequiredAfter) {
    throw new Error('Test 3 Failed: Double scan protection failed — early scan marked completed should not be required again.');
  }
  if (/manna/i.test(statusAfter.bannerText)) {
    throw new Error('Test 3 Failed: Completed banner text contains forbidden word "manna"!');
  }
  console.log('  ✅ Test 3 Passed: Double scan protection successfully verified.\n');

  // Test 4: Telegram Warning Notice Formatting
  console.log('Test 4: Testing Telegram Warning Notice formatting');
  let sentText = '';
  // Spy on sendMessage
  (telegramBotService as any).sendMessage = async (text: string) => {
    sentText = text;
    return true;
  };

  await telegramBotService.sendEarlyScanNotice('USD Consumer Price Index m/m', '08:30 AM ET', '07:30 AM ET');
  console.log('  Telegram Message Preview:\n' + sentText);

  if (!sentText.includes('07:30 AM ET') || !sentText.includes('Forex Only') || !sentText.includes('08:00 AM ET')) {
    throw new Error('Test 4 Failed: Telegram message missing critical scan details.');
  }
  if (/manna/i.test(sentText)) {
    throw new Error('Test 4 Failed: Telegram alert contains forbidden word "manna"!');
  }
  console.log('\n  ✅ Test 4 Passed: Telegram alert formatted cleanly with zero mention of "manna".\n');

  console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Test execution error:', err);
  process.exit(1);
});
