import { telegramBotService } from '../notifications/telegram-bot';
import { EdgeSetup } from '../discovery/types';

async function runTelegramTest() {
  console.log('--- Telegram Bot Notification Service Test ---');

  const futuresSetup: EdgeSetup = {
    id: `test_futures_${Date.now()}`,
    instrument: 'NQ',
    market: 'futures',
    created_at: new Date().toISOString(),
    killzone_origin: 'ny_am',
    bias: 'long',
    entry_zone_low: 30288.25,
    entry_zone_high: 30305.25,
    entry_zone_mid: 30296.75,
    stop: 30240.88,
    tp1: 30334.24,
    tp2: 30365.36,
    r_multiple_1: 2.0,
    r_multiple_2: 3.0,
    signal_state: 'awaiting_entry',
    superseded: 0,
    tradable: 1,
    conviction_score: 89.7,
    liquidity_score: 92.5,
    strategy_id: 'snd_pro',
    strategy_tier: 'pro'
  };

  const forexSetup: EdgeSetup = {
    id: `test_forex_${Date.now()}`,
    instrument: 'EUR/USD',
    market: 'forex',
    created_at: new Date().toISOString(),
    killzone_origin: 'london',
    bias: 'long',
    entry_zone_low: 1.0820,
    entry_zone_high: 1.0825,
    entry_zone_mid: 1.08225,
    stop: 1.0805,
    tp1: 1.0855,
    tp2: 1.0875,
    r_multiple_1: 2.0,
    r_multiple_2: 3.0,
    signal_state: 'awaiting_entry',
    superseded: 0,
    tradable: 1,
    conviction_score: 91.2,
    liquidity_score: 95.0,
    strategy_id: 'snd_pro',
    strategy_tier: 'pro'
  };

  console.log('\n--- 1. Sample Message: SND FUTURES SIGNAL ---');
  const futuresMsg = telegramBotService.formatNewSetupMessage(futuresSetup);
  console.log(futuresMsg);

  console.log('\n--- 2. Sample Message: SND FOREX SIGNAL ---');
  const forexMsg = telegramBotService.formatNewSetupMessage(forexSetup);
  console.log(forexMsg);

  console.log('\n--- 3. Sample Message: ENTRY TRIGGERED ---');
  console.log(telegramBotService.formatEntryTriggeredMessage(futuresSetup));

  console.log('\n--- 4. Sample Message: BREAKEVEN RISK-FREE ALERT ---');
  console.log(telegramBotService.formatBreakevenMessage(futuresSetup));

  console.log('\n--- 5. Sample Message: TARGET 1 HIT (+2R) ---');
  console.log(telegramBotService.formatTarget1HitMessage(futuresSetup));

  console.log('\n--- 6. Sample Message: TARGET 2 RUNNER HIT (+3R) ---');
  console.log(telegramBotService.formatTarget2HitMessage(futuresSetup));

  const token = process.env.TELEGRAM_BOT_TOKEN || '8967922501:AAHTrpdPi5tdOo7RA0elzha74BQPGLNM1rY';
  const chatId = process.env.TELEGRAM_CHAT_ID || '-1004468729951';

  if (token && chatId) {
    console.log(`\n🚀 Dispatching live test signal to channel ${chatId}...`);
    process.env.TELEGRAM_BOT_TOKEN = token;
    process.env.TELEGRAM_CHAT_ID = chatId;
    process.env.TELEGRAM_ENABLED = 'true';
    telegramBotService.init();
    
    // Send Futures Signal
    const res1 = await telegramBotService.sendMessage(futuresMsg);
    console.log(`Futures Signal Send Status: ${res1 ? 'SUCCESS ✅' : 'FAILED ❌'}`);

    // Send Forex Signal
    const res2 = await telegramBotService.sendMessage(forexMsg);
    console.log(`Forex Signal Send Status: ${res2 ? 'SUCCESS ✅' : 'FAILED ❌'}`);
  }
}

runTelegramTest().catch(console.error);
