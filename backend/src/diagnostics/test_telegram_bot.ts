import { telegramBotService } from '../notifications/telegram-bot';
import { EdgeSetup } from '../discovery/types';

async function runTelegramTest() {
  console.log('--- Telegram Bot Notification Service Test ---');

  const sampleSetup: EdgeSetup = {
    id: `test_snd_${Date.now()}`,
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
    strategy_id: 'manna_snd',
    strategy_tier: 'pro',
    metadata: JSON.stringify({
      source: 'yahoo_finance_futures',
      selection_rationale: '[MANNA SND] Curve: LOW | 15M Trend: UP. Imbalance Zone (Rally-Base-Rally) inside 1H Demand Curve. Limit Buy at Proximal line (30296.75), SL beyond Distal line (30240.88).'
    })
  };

  const newSetupMsg = telegramBotService.formatNewSetupMessage(sampleSetup);
  console.log('\n--- Sample Telegram Message: NEW SETUP ---');
  console.log(newSetupMsg);

  const entryMsg = telegramBotService.formatEntryTriggeredMessage(sampleSetup);
  console.log('\n--- Sample Telegram Message: ENTRY TRIGGERED ---');
  console.log(entryMsg);

  const beMsg = telegramBotService.formatBreakevenMessage(sampleSetup);
  console.log('\n--- Sample Telegram Message: BREAKEVEN ALERT ---');
  console.log(beMsg);

  const tp1Msg = telegramBotService.formatTarget1HitMessage(sampleSetup);
  console.log('\n--- Sample Telegram Message: TARGET 1 HIT ---');
  console.log(tp1Msg);

  const tp2Msg = telegramBotService.formatTarget2HitMessage(sampleSetup);
  console.log('\n--- Sample Telegram Message: TARGET 2 HIT ---');
  console.log(tp2Msg);

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (token && chatId) {
    console.log('\n🚀 Dispatching live test message to Telegram channel/group...');
    telegramBotService.init();
    const success = await telegramBotService.sendMessage(newSetupMsg);
    console.log(`Live Send Status: ${success ? 'SUCCESS ✅' : 'FAILED ❌'}`);
  } else {
    console.log('\nℹ️ Live send skipped: TELEGRAM_BOT_TOKEN & TELEGRAM_CHAT_ID environment variables not provided.');
  }
}

runTelegramTest().catch(console.error);
