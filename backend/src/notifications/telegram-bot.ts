import { publishEvents } from '../publish-gate/publish-gate';
import { EdgeSetup } from '../discovery/types';
import { createLogger } from '../telemetry/logger';

const logger = createLogger('TelegramBotService');

export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
}

class TelegramBotService {
  private config: TelegramConfig = {
    enabled: false,
    botToken: '',
    chatId: ''
  };

  private isInitialized = false;

  public init() {
    if (this.isInitialized) return;

    const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    const chatId = process.env.TELEGRAM_CHAT_ID || '';
    const enabledStr = process.env.TELEGRAM_ENABLED;
    const enabled = enabledStr !== undefined ? enabledStr === 'true' : Boolean(botToken && chatId);

    this.config = { enabled, botToken, chatId };
    this.isInitialized = true;

    if (!enabled || !botToken || !chatId) {
      logger.info('Telegram Bot Service initialized (DISABLED — waiting for TELEGRAM_BOT_TOKEN & TELEGRAM_CHAT_ID)');
    } else {
      logger.info({ chatId }, '🚀 Telegram Bot Service initialized & active');
    }

    // Subscribe to PublishGate & OutcomeDetector events
    publishEvents.on('setup_created', (setup: EdgeSetup) => this.handleSetupCreated(setup));
    publishEvents.on('setup_entered', (setup: EdgeSetup) => this.handleSetupEntered(setup));
    publishEvents.on('setup_breakeven', (setup: EdgeSetup) => this.handleBreakevenReached(setup));
    publishEvents.on('breakeven_reached', (setup: EdgeSetup) => this.handleBreakevenReached(setup));
    publishEvents.on('setup_runner_started', (payload: any) => this.handleRunnerStarted(payload));
    publishEvents.on('target1_hit', (setup: EdgeSetup) => this.handleTarget1Hit(setup));
    publishEvents.on('target2_hit', (setup: EdgeSetup) => this.handleTarget2Hit(setup));
    publishEvents.on('setup_resolved', (payload: any) => this.handleSetupResolved(payload));
    publishEvents.on('setup_invalidated', (payload: any) => this.handleSetupInvalidated(payload));
  }

  public getConfig(): TelegramConfig {
    return this.config;
  }

  public async sendMessage(text: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<boolean> {
    const { enabled, botToken, chatId } = this.config;
    if (!enabled || !botToken || !chatId) {
      logger.debug('Skipping Telegram send: Bot disabled or missing credentials');
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: parseMode,
          disable_web_page_preview: true
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        logger.error({ status: res.status, error: errorText }, 'Failed to send Telegram message');
        return false;
      }

      logger.info('Telegram alert message dispatched successfully');
      return true;
    } catch (err: any) {
      logger.error({ err: err.message }, 'Error dispatching Telegram message');
      return false;
    }
  }

  // ── Event Handlers ─────────────────────────────────────────────────────────

  private async handleSetupCreated(setup: EdgeSetup) {
    if (!setup) return;
    const msg = this.formatNewSetupMessage(setup);
    await this.sendMessage(msg);
  }

  private async handleSetupEntered(setup: EdgeSetup) {
    if (!setup) return;
    const msg = this.formatEntryTriggeredMessage(setup);
    await this.sendMessage(msg);
  }

  private async handleBreakevenReached(setup: EdgeSetup) {
    if (!setup) return;
    const msg = this.formatBreakevenMessage(setup);
    await this.sendMessage(msg);
  }

  private async handleRunnerStarted(payload: any) {
    const setup = payload?.setup || payload;
    if (!setup) return;
    const msg = this.formatTarget1HitMessage(setup);
    await this.sendMessage(msg);
  }

  private async handleTarget1Hit(setup: EdgeSetup) {
    if (!setup) return;
    const msg = this.formatTarget1HitMessage(setup);
    await this.sendMessage(msg);
  }

  private async handleTarget2Hit(setup: EdgeSetup) {
    if (!setup) return;
    const msg = this.formatTarget2HitMessage(setup);
    await this.sendMessage(msg);
  }

  private async handleSetupResolved(payload: any) {
    const setup = payload?.setup || payload;
    const outcomeType = payload?.outcome?.outcome_type || payload?.outcome || '';
    if (!setup) return;
    if (outcomeType === 'tp1_hit' || outcomeType === 'TP1') {
      await this.handleTarget1Hit(setup);
    } else if (outcomeType === 'tp2_hit' || outcomeType === 'TP2') {
      await this.handleTarget2Hit(setup);
    } else if (outcomeType === 'sl_hit') {
      await this.sendMessage(`🛑 <b>STOP LOSS HIT — ${setup.instrument}</b>\nTrade hit Stop Loss at <code>${setup.stop}</code> (-1.0R).`);
    } else if (outcomeType === 'be_hit') {
      await this.sendMessage(`🛡️ <b>BREAKEVEN EXIT — ${setup.instrument}</b>\nTrade closed at Breakeven (0.0R profit).`);
    }
  }

  private async handleSetupInvalidated(payload: { setupId: string; reason: string; setup?: EdgeSetup }) {
    if (payload.setup) {
      const msg = this.formatInvalidatedMessage(payload.setup, payload.reason);
      await this.sendMessage(msg);
    }
  }

  // ── Message Formatters ─────────────────────────────────────────────────────

  public formatNewSetupMessage(setup: EdgeSetup): string {
    const isSnD = (setup.strategy_id || '').toLowerCase().includes('snd');
    const stratTitle = isSnD ? '🟡 MANNA SND' : '🟣 SENTINEL V2';
    const isLong = (setup.bias || 'long').toLowerCase() === 'long';
    const directionBadge = isLong ? '🟢 BUY LIMIT (LONG)' : '🔴 SELL LIMIT (SHORT)';

    let rationale = '';
    if (setup.metadata) {
      try {
        const meta = typeof setup.metadata === 'string' ? JSON.parse(setup.metadata) : setup.metadata;
        rationale = meta.selection_rationale || meta.description || '';
      } catch {}
    }

    const convScore = setup.conviction_score ? `${setup.conviction_score}%` : 'N/A';
    const marketStr = (setup.market || 'futures').toUpperCase();

    return `<b>${stratTitle} — NEW TRADE SETUP ⚡</b>
━━━━━━━━━━━━━━━━━━━━━
📊 <b>Asset:</b> ${setup.instrument} (${marketStr})
🎯 <b>Order:</b> ${directionBadge}
📍 <b>Entry Zone:</b> <code>${setup.entry_zone_low} – ${setup.entry_zone_high}</code>
🛑 <b>Stop Loss:</b> <code>${setup.stop}</code>
🎯 <b>Target 1 (+2R):</b> <code>${setup.tp1}</code>
🏆 <b>Target 2 (+3R):</b> <code>${setup.tp2 || 'Open Runner'}</code>
🔥 <b>Conviction Score:</b> <b>${convScore}</b>
${rationale ? `\n📚 <b>Rationale:</b> <i>${rationale}</i>` : ''}
━━━━━━━━━━━━━━━━━━━━━
<i>Execute with discipline & check your position sizing before placing orders.</i>`;
  }

  public formatEntryTriggeredMessage(setup: EdgeSetup): string {
    const isLong = (setup.bias || 'long').toLowerCase() === 'long';
    const dir = isLong ? 'LONG' : 'SHORT';
    return `⚡ <b>ENTRY TRIGGERED — ${setup.instrument} (${dir})</b>
━━━━━━━━━━━━━━━━━━━━━
Price has tapped the 15M Entry Zone at <code>${setup.entry_zone_mid || setup.entry_zone_low}</code>.
Trade is now <b>LIVE</b> in the market!
🎯 <b>Target 1 (+2R):</b> <code>${setup.tp1}</code>
🛑 <b>Stop Loss:</b> <code>${setup.stop}</code>`;
  }

  public formatBreakevenMessage(setup: EdgeSetup): string {
    const isLong = (setup.bias || 'long').toLowerCase() === 'long';
    const dir = isLong ? 'LONG' : 'SHORT';
    const entryMid = setup.entry_zone_mid || setup.entry_zone_low;
    return `🛡️ <b>RISK-FREE TRADE ALERT — ${setup.instrument} (${dir})</b>
━━━━━━━━━━━━━━━━━━━━━
Price reached <b>+1.0R open profit</b>!
👉 <b>ACTION REQUIRED:</b> Move Stop Loss to Breakeven (BE @ <code>${entryMid}</code>).
Position is now <b>$0 RISK-FREE</b>! 🚀`;
  }

  public formatTarget1HitMessage(setup: EdgeSetup): string {
    const isLong = (setup.bias || 'long').toLowerCase() === 'long';
    const dir = isLong ? 'LONG' : 'SHORT';
    return `🎯 <b>TAKE PROFIT 1 HIT — ${setup.instrument} (${dir})</b>
━━━━━━━━━━━━━━━━━━━━━
Target 1 (+2.0R Profit) achieved at <code>${setup.tp1}</code>!
💰 <b>Realized +2.0R Profit Locked In</b>.
Adjust remaining runner stop loss to Breakeven.`;
  }

  public formatTarget2HitMessage(setup: EdgeSetup): string {
    const isLong = (setup.bias || 'long').toLowerCase() === 'long';
    const dir = isLong ? 'LONG' : 'SHORT';
    return `🏆 <b>TARGET 2 RUNNER ACHIEVED — ${setup.instrument} (${dir})</b>
━━━━━━━━━━━━━━━━━━━━━
Full Target 2 (+3.0R Profit) hit at <code>${setup.tp2 || setup.tp1}</code>!
🎉 <b>Maximum +3.0R Runner Profit Logged!</b>`;
  }

  public formatInvalidatedMessage(setup: EdgeSetup, reason?: string): string {
    const isLong = (setup.bias || 'long').toLowerCase() === 'long';
    const dir = isLong ? 'LONG' : 'SHORT';
    return `⛔ <b>SIGNAL INVALIDATED — ${setup.instrument} (${dir})</b>
━━━━━━━━━━━━━━━━━━━━━
Signal for <code>${setup.instrument}</code> was invalidated.
${reason ? `Reason: <i>${reason}</i>` : 'Market structure displaced or setup superseded.'}`;
  }
}

export const telegramBotService = new TelegramBotService();
