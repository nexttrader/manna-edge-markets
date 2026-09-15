import assert from 'assert';
import { telegramBotService } from '../notifications/telegram-bot';

async function runTelegramQueueTests() {
  console.log('🧪 Starting Telegram Message Queue & Pacing Tests...\n');

  const origFetch = globalThis.fetch;

  try {
    // ── Test 1: Disabled mode returns false immediately ────────────────────────
    console.log('Test 1: Verifying disabled/unconfigured state returns false without queuing...');
    (telegramBotService as any).config = { enabled: false, botToken: '', chatId: '' };
    const disabledResult = await telegramBotService.sendMessage('Test disabled message');
    assert.strictEqual(disabledResult, false, 'Should return false when disabled');
    assert.strictEqual(telegramBotService.getQueueLength(), 0, 'Queue should remain empty');
    console.log('  ✓ Disabled state verified (returns false immediately, 0 queue length)\n');

    // ── Test 2: Pacing across sequential messages ──────────────────────────────
    console.log('Test 2: Verifying sequential message pacing...');
    (telegramBotService as any).config = { enabled: true, botToken: 'mock_token', chatId: 'mock_chat' };
    telegramBotService.setMinIntervalMs(80); // 80ms interval for fast test

    const dispatchTimestamps: number[] = [];
    const receivedPayloads: string[] = [];

    globalThis.fetch = async (url: any, options: any) => {
      dispatchTimestamps.push(Date.now());
      const body = JSON.parse(options.body);
      receivedPayloads.push(body.text);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    // Fire 3 messages concurrently (simulating rapid scan burst)
    const p1 = telegramBotService.sendMessage('Signal 1: EURUSD');
    const p2 = telegramBotService.sendMessage('Signal 2: GBPUSD');
    const p3 = telegramBotService.sendMessage('Signal 3: EURGBP');

    const results = await Promise.all([p1, p2, p3]);

    assert.deepStrictEqual(results, [true, true, true], 'All 3 messages should succeed');
    assert.deepStrictEqual(receivedPayloads, ['Signal 1: EURUSD', 'Signal 2: GBPUSD', 'Signal 3: EURGBP'], 'FIFO order must be preserved');
    
    // Check that there was pacing between dispatch timestamps
    const gap1 = dispatchTimestamps[1] - dispatchTimestamps[0];
    const gap2 = dispatchTimestamps[2] - dispatchTimestamps[1];
    assert.ok(gap1 >= 70, `Gap 1 (${gap1}ms) should be at least ~70ms`);
    assert.ok(gap2 >= 70, `Gap 2 (${gap2}ms) should be at least ~70ms`);

    console.log(`  ✓ 3 concurrent signals delivered in FIFO order with pacing (${gap1}ms, ${gap2}ms gap)\n`);

    // ── Test 3: HTTP 429 Rate Limiting with retry_after ────────────────────────
    console.log('Test 3: Verifying HTTP 429 Too Many Requests retry-after handling...');
    telegramBotService.setMinIntervalMs(30);

    let attempts = 0;
    const attemptedTexts: string[] = [];

    globalThis.fetch = async (url: any, options: any) => {
      attempts++;
      const body = JSON.parse(options.body);
      attemptedTexts.push(body.text);

      if (attempts === 1) {
        // First attempt returns 429 with retry_after = 0.1s
        return new Response(
          JSON.stringify({
            ok: false,
            error_code: 429,
            description: 'Too Many Requests: retry after 0.1',
            parameters: { retry_after: 0.1 }
          }),
          { status: 429 }
        );
      }

      // Second attempt succeeds
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const rateLimitedSend = await telegramBotService.sendMessage('Signal: #EURGBP-B1D8');
    assert.strictEqual(rateLimitedSend, true, 'Signal must succeed after 429 retry');
    assert.strictEqual(attempts, 2, 'Should have made exactly 2 attempts');
    assert.strictEqual(attemptedTexts[0], 'Signal: #EURGBP-B1D8', 'Attempt 1 was EURGBP');
    assert.strictEqual(attemptedTexts[1], 'Signal: #EURGBP-B1D8', 'Attempt 2 retried EURGBP');
    console.log('  ✓ HTTP 429 caught, queue paused, and message successfully retried without data loss\n');

    // ── Test 4: Permanent 400 Bad Request error does not stall the queue ────────
    console.log('Test 4: Verifying permanent 400 Bad Request error drops without hanging queue...');
    telegramBotService.setMinIntervalMs(20);

    const callLog: string[] = [];

    globalThis.fetch = async (url: any, options: any) => {
      const body = JSON.parse(options.body);
      callLog.push(body.text);
      if (body.text === 'Bad Message') {
        return new Response(JSON.stringify({ ok: false, description: 'Bad Request: can\'t parse entities' }), { status: 400 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const badResult = await telegramBotService.sendMessage('Bad Message');
    const goodResult = await telegramBotService.sendMessage('Good Message');

    assert.strictEqual(badResult, false, 'Bad message should resolve to false');
    assert.strictEqual(goodResult, true, 'Subsequent good message should still succeed');
    assert.deepStrictEqual(callLog, ['Bad Message', 'Good Message'], 'Queue should process both in order');
    console.log('  ✓ Permanent error handled gracefully; queue continued smoothly to next item\n');

    console.log('🎉 ALL Telegram Queue & Pacing Tests Passed Successfully!');
  } finally {
    globalThis.fetch = origFetch;
    telegramBotService.setMinIntervalMs(1100); // restore default 1100ms
  }
}

runTelegramQueueTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
