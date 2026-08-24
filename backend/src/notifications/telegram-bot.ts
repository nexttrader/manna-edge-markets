import { publishEvents } from '../publish-gate/publish-gate';
import { EdgeSetup } from '../discovery/types';
import { createLogger } from '../telemetry/logger';
import { getNotificationSettingsMap } from '../db/queries';

const logger = createLogger('TelegramBotService');

export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Removes slashes from instrument names: EUR/USD → EURUSD */
function cleanSymbol(instrument: string): string {
  return (instrument || '').replace(/\//g, '').toUpperCase();
}

/** Formats a UTC date string as "YYYY-MM-DD HH:MM:SS UTC" */
function fmtTs(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  return `${d.toISOString().replace('T', ' ').substring(0, 19)} UTC`;
}

/** Derives short Trade ID: #GBPUSD-06C7 */
function fmtId(setup: EdgeSetup): string {
  if (!setup || !setup.id) return '#SND-0001';
  const sym = cleanSymbol(setup.instrument);
  const rawId = setup.id.replace(/^test_/, '');
  const parts = rawId.split('-');
  const suffix = parts.length > 1
    ? parts[0].substring(0, 4).toUpperCase()
    : rawId.substring(rawId.length - 4).toUpperCase();
  return `#${sym}-${suffix}`;
}

/** "🔴 SELL LIMIT" | "🟢 BUY LIMIT" | "🔴 SELL MARKET" | "🟢 BUY MARKET" */
function orderBadge(setup: EdgeSetup): string {
  const isLong = (setup.bias || 'long').toLowerCase() === 'long';
  const meta: any = (() => { try { return JSON.parse(setup.metadata || '{}'); } catch { return {}; } })();
  const isMarket = meta.order_type === 'MARKET';
  if (isLong) return isMarket ? '🟢 BUY MARKET' : '🟢 BUY LIMIT';
  return isMarket ? '🔴 SELL MARKET' : '🔴 SELL LIMIT';
}

/** "SND FOREX" | "SND FUTURES" */
function mktPrefix(setup: EdgeSetup): string {
  return (setup.market || '').toLowerCase() === 'forex' ? 'SND FOREX' : 'SND FUTURES';
}

// ─── Service ──────────────────────────────────────────────────────────────────

class TelegramBotService {
  private config: TelegramConfig = { enabled: false, botToken: '', chatId: '' };
  private isInitialized = false;

  public init() {
    if (this.isInitialized) return;

    const botToken   = process.env.TELEGRAM_BOT_TOKEN || '';
    const chatId     = process.env.TELEGRAM_CHAT_ID || '';
    const enabledStr = process.env.TELEGRAM_ENABLED;
    const enabled    = enabledStr !== undefined ? enabledStr === 'true' : Boolean(botToken && chatId);

    this.config = { enabled, botToken, chatId };
    this.isInitialized = true;

    if (!enabled || !botToken || !chatId) {
      logger.info('Telegram Bot Service initialized (DISABLED — waiting for TELEGRAM_BOT_TOKEN & TELEGRAM_CHAT_ID)');
    } else {
      logger.info({ chatId }, '🚀 Telegram Bot Service initialized & active');
    }

    publishEvents.on('setup_created',        (setup: EdgeSetup) => this.handleSetupCreated(setup));
    publishEvents.on('setup_entered',        (setup: EdgeSetup) => this.handleSetupEntered(setup));
    publishEvents.on('setup_breakeven',      (setup: EdgeSetup) => this.handleBreakevenReached(setup));
    publishEvents.on('breakeven_reached',    (setup: EdgeSetup) => this.handleBreakevenReached(setup));
    publishEvents.on('setup_runner_started', (payload: any)     => this.handleRunnerStarted(payload));
    publishEvents.on('target1_hit',          (setup: EdgeSetup) => this.handleTarget1Hit(setup));
    publishEvents.on('target2_hit',          (setup: EdgeSetup) => this.handleTarget2Hit(setup));
    publishEvents.on('setup_resolved',       (payload: any)     => this.handleSetupResolved(payload));
    publishEvents.on('setup_invalidated',    (payload: any)     => this.handleSetupInvalidated(payload));
    publishEvents.on('setup_superseded',     (payload: any)     => this.handleSetupSuperseded(payload));
  }

  public getConfig(): TelegramConfig { return this.config; }

  // ── Core send ──────────────────────────────────────────────────────────────

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
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode, disable_web_page_preview: true })
      });
      if (!res.ok) {
        logger.error({ status: res.status, error: await res.text() }, 'Failed to send Telegram message');
        return false;
      }
      logger.info('Telegram alert message dispatched successfully');
      return true;
    } catch (err: any) {
      logger.error({ err: err.message }, 'Error dispatching Telegram message');
      return false;
    }
  }

  /** Checks DB feature toggle before sending. Defaults to enabled on cold start. */
  private async sendIfEnabled(key: string, text: string): Promise<void> {
    try {
      const map = await getNotificationSettingsMap();
      if (key in map && !map[key]) {
        logger.debug({ key }, 'Notification suppressed by feature toggle');
        return;
      }
    } catch { /* DB not ready yet — send anyway */ }
    await this.sendMessage(text);
  }

  // ── Event Handlers ─────────────────────────────────────────────────────────

  private async handleSetupCreated(setup: EdgeSetup) {
    if (!setup) return;
    await this.sendIfEnabled('notify_new_signal', this.formatSignal(setup));
  }

  private async handleSetupEntered(setup: EdgeSetup) {
    if (!setup) return;
    await this.sendIfEnabled('notify_entry_triggered', this.formatEntryTriggeredStatus(setup));
  }

  private async handleBreakevenReached(setup: EdgeSetup) {
    if (!setup) return;
    await this.sendIfEnabled('notify_move_to_breakeven', this.formatBreakevenManage(setup));
  }

  private async handleRunnerStarted(payload: any) {
    const setup = payload?.setup || payload;
    if (!setup) return;
    await this.sendIfEnabled('notify_tp1_hit', this.formatTp1Manage(setup));
  }

  private async handleTarget1Hit(setup: EdgeSetup) {
    if (!setup) return;
    await this.sendIfEnabled('notify_tp1_hit', this.formatTp1Manage(setup));
  }

  private async handleTarget2Hit(setup: EdgeSetup) {
    if (!setup) return;
    await this.sendIfEnabled('notify_tp2_hit', this.formatTp2Manage(setup));
  }

  private async handleSetupResolved(payload: any) {
    const setup = payload?.setup || payload;
    const outcomeType: string = payload?.outcome?.outcome_type || payload?.outcome || '';
    if (!setup) return;
    if      (outcomeType === 'tp1_hit') await this.sendIfEnabled('notify_tp1_hit', this.formatTp1Manage(setup));
    else if (outcomeType === 'tp2_hit') await this.sendIfEnabled('notify_tp2_hit', this.formatTp2Manage(setup));
    else if (outcomeType === 'sl_hit')  await this.sendIfEnabled('notify_sl_hit',  this.formatSlHitStatus(setup));
    else if (outcomeType === 'be_hit')  await this.sendIfEnabled('notify_be_hit',  this.formatBeExitStatus(setup));
  }

  private async handleSetupInvalidated(payload: { setupId: string; reason: string; setup?: EdgeSetup; superseded?: boolean }) {
    if (!payload.setup) return;
    if (payload.superseded) {
      await this.sendIfEnabled('notify_superseded_cancel', this.formatSupersededManage(payload.setup, payload.reason));
    } else {
      await this.sendIfEnabled('notify_invalidation', this.formatInvalidatedStatus(payload.setup, payload.reason));
    }
  }

  private async handleSetupSuperseded(payload: { setup: EdgeSetup; reason?: string }) {
    if (!payload?.setup) return;
    await this.sendIfEnabled('notify_superseded_cancel', this.formatSupersededManage(payload.setup, payload.reason));
  }

  // ── Message Formatters ─────────────────────────────────────────────────────

  // ── SIGNAL ────────────────────────────────────────────────────────────────

  public formatSignal(setup: EdgeSetup): string {
    const p    = mktPrefix(setup);
    const id   = fmtId(setup);
    const sym  = cleanSymbol(setup.instrument);
    const conv = setup.conviction_score ? `${setup.conviction_score}%` : 'N/A';
    return `<b>🟡 ${p} SIGNAL ⚡</b>
━━━━━━━━━━━━━━━━━━━━━
🆔 <b>Trade ID:</b> <code>${id}</code>
📊 <b>Asset:</b> ${sym}
🎯 <b>Order:</b> ${orderBadge(setup)}
📍 <b>Entry Zone:</b> <code>${setup.entry_zone_low} – ${setup.entry_zone_high}</code>
🛑 <b>Stop Loss:</b> <code>${setup.stop}</code>
🎯 <b>TP1 (+2R):</b> <code>${setup.tp1}</code>
🏆 <b>TP2 (+3R):</b> <code>${setup.tp2 ?? 'Open Runner'}</code>
🔥 <b>Conviction:</b> <b>${conv}</b>
📅 <b>Date &amp; Time:</b> <code>${fmtTs(setup.created_at)}</code>
━━━━━━━━━━━━━━━━━━━━━
<i>Execute with discipline &amp; proper risk management.</i>`;
  }

  // ── STATUS ────────────────────────────────────────────────────────────────

  public formatEntryTriggeredStatus(setup: EdgeSetup): string {
    const p      = mktPrefix(setup);
    const id     = fmtId(setup);
    const sym    = cleanSymbol(setup.instrument);
    const fillPx = setup.entry_zone_mid || setup.entry_zone_low;
    return `<b>⚡ ${p} STATUS ⚡</b>
━━━━━━━━━━━━━━━━━━━━━
🆔 <b>Trade ID:</b> <code>${id}</code>
📊 <b>Asset:</b> ${sym}
🎯 <b>Order:</b> ${orderBadge(setup)} (FILLED)
📍 <b>Fill Price:</b> <code>${fillPx}</code>
🛑 <b>Stop Loss:</b> <code>${setup.stop}</code>
🎯 <b>TP1 (+2R):</b> <code>${setup.tp1}</code>
🏆 <b>TP2 (+3R):</b> <code>${setup.tp2 ?? 'Open Runner'}</code>
📢 <b>Status:</b> ORDER FILLED — Trade is now <b>LIVE</b> in the market.
📅 <b>Date &amp; Time:</b> <code>${fmtTs(setup.entry_triggered_at)}</code>
━━━━━━━━━━━━━━━━━━━━━`;
  }

  public formatSlHitStatus(setup: EdgeSetup): string {
    const p   = mktPrefix(setup);
    const id  = fmtId(setup);
    const sym = cleanSymbol(setup.instrument);
    return `<b>🛑 ${p} STATUS ⚡</b>
━━━━━━━━━━━━━━━━━━━━━
🆔 <b>Trade ID:</b> <code>${id}</code>
📊 <b>Asset:</b> ${sym}
📢 <b>Status:</b> STOP LOSS HIT (-1.0R)
🛑 <b>Exit Price:</b> <code>${setup.stop}</code>
📅 <b>Date &amp; Time:</b> <code>${fmtTs()}</code>
━━━━━━━━━━━━━━━━━━━━━`;
  }

  public formatBeExitStatus(setup: EdgeSetup): string {
    const p      = mktPrefix(setup);
    const id     = fmtId(setup);
    const sym    = cleanSymbol(setup.instrument);
    const exitPx = setup.entry_zone_mid || setup.entry_zone_low;
    return `<b>🛡️ ${p} STATUS ⚡</b>
━━━━━━━━━━━━━━━━━━━━━
🆔 <b>Trade ID:</b> <code>${id}</code>
📊 <b>Asset:</b> ${sym}
📢 <b>Status:</b> BREAKEVEN EXIT (0.0R)
🛑 <b>Exit Price:</b> <code>${exitPx}</code>
📅 <b>Date &amp; Time:</b> <code>${fmtTs()}</code>
━━━━━━━━━━━━━━━━━━━━━`;
  }

  public formatInvalidatedStatus(setup: EdgeSetup, reason?: string): string {
    const p   = mktPrefix(setup);
    const id  = fmtId(setup);
    const sym = cleanSymbol(setup.instrument);
    const why = (reason || 'market_structure_breach').replace(/_/g, ' ');
    return `<b>⛔ ${p} STATUS ⚡</b>
━━━━━━━━━━━━━━━━━━━━━
🆔 <b>Trade ID:</b> <code>${id}</code>
📊 <b>Asset:</b> ${sym}
📢 <b>Status:</b> SIGNAL INVALIDATED
⚠️ <b>Reason:</b> ${why}.
👉 <b>Instruction:</b> Discard setup — do not enter.
📅 <b>Date &amp; Time:</b> <code>${fmtTs()}</code>
━━━━━━━━━━━━━━━━━━━━━`;
  }

  // ── MANAGE ────────────────────────────────────────────────────────────────

  public formatSupersededManage(setup: EdgeSetup, reason?: string): string {
    const p   = mktPrefix(setup);
    const id  = fmtId(setup);
    const sym = cleanSymbol(setup.instrument);
    const why = (reason || 'fresh_liquidity_scan_higher_conviction').replace(/_/g, ' ');
    return `<b>⛔ ${p} MANAGE ⚡</b>
━━━━━━━━━━━━━━━━━━━━━
🆔 <b>Trade ID:</b> <code>${id}</code>
📊 <b>Asset:</b> ${sym}
🎯 <b>Action:</b> CANCEL PENDING ORDER
📢 <b>Status:</b> SUPERSEDED / CANCELLED
⚠️ <b>Reason:</b> ${why}.
👉 <b>Instruction:</b> Delete pending order for <code>${id}</code>. New signal incoming.
📅 <b>Date &amp; Time:</b> <code>${fmtTs()}</code>
━━━━━━━━━━━━━━━━━━━━━`;
  }

  public formatBreakevenManage(setup: EdgeSetup): string {
    const p    = mktPrefix(setup);
    const id   = fmtId(setup);
    const sym  = cleanSymbol(setup.instrument);
    const bePx = setup.entry_zone_mid || setup.entry_zone_low;
    return `<b>🛡️ ${p} MANAGE ⚡</b>
━━━━━━━━━━━━━━━━━━━━━
🆔 <b>Trade ID:</b> <code>${id}</code>
📊 <b>Asset:</b> ${sym}
🎯 <b>Action:</b> MODIFY STOP LOSS
📢 <b>Status:</b> +1.0R GAIN ACHIEVED
👉 <b>Instruction:</b> Move Stop Loss to <code>${bePx}</code> (BE)
🔒 <b>Risk Status:</b> $0 Risk-Free
📅 <b>Date &amp; Time:</b> <code>${fmtTs()}</code>
━━━━━━━━━━━━━━━━━━━━━`;
  }

  public formatTp1Manage(setup: EdgeSetup): string {
    const p    = mktPrefix(setup);
    const id   = fmtId(setup);
    const sym  = cleanSymbol(setup.instrument);
    const bePx = setup.entry_zone_mid || setup.entry_zone_low;
    return `<b>🎯 ${p} MANAGE ⚡</b>
━━━━━━━━━━━━━━━━━━━━━
🆔 <b>Trade ID:</b> <code>${id}</code>
📊 <b>Asset:</b> ${sym}
🎯 <b>Action:</b> CLOSE PARTIAL (50%)
📢 <b>Status:</b> TP1 HIT (+2.0R)
💰 <b>Price Level:</b> <code>${setup.tp1}</code>
👉 <b>Instruction:</b> Close 50% lot size at TP1 (+2.0R). Keep remaining runner open for TP2 with Stop Loss locked at Breakeven (<code>${bePx}</code>).
📅 <b>Date &amp; Time:</b> <code>${fmtTs()}</code>
━━━━━━━━━━━━━━━━━━━━━`;
  }

  public formatTp2Manage(setup: EdgeSetup): string {
    const p   = mktPrefix(setup);
    const id  = fmtId(setup);
    const sym = cleanSymbol(setup.instrument);
    return `<b>🏆 ${p} MANAGE ⚡</b>
━━━━━━━━━━━━━━━━━━━━━
🆔 <b>Trade ID:</b> <code>${id}</code>
📊 <b>Asset:</b> ${sym}
🎯 <b>Action:</b> CLOSE FULL POSITION
📢 <b>Status:</b> TP2 HIT (+3.0R)
💰 <b>Price Level:</b> <code>${setup.tp2 ?? setup.tp1}</code>
🎉 <b>Result:</b> Full TP2 runner target achieved! Trade closed at +3.0R profit.
📅 <b>Date &amp; Time:</b> <code>${fmtTs()}</code>
━━━━━━━━━━━━━━━━━━━━━`;
  }

  // ── Legacy aliases (backwards compat) ─────────────────────────────────────
  /** @deprecated */ public formatNewSetupMessage(s: EdgeSetup)                { return this.formatSignal(s); }
  /** @deprecated */ public formatEntryTriggeredMessage(s: EdgeSetup)          { return this.formatEntryTriggeredStatus(s); }
  /** @deprecated */ public formatBreakevenMessage(s: EdgeSetup)               { return this.formatBreakevenManage(s); }
  /** @deprecated */ public formatTarget1HitMessage(s: EdgeSetup)              { return this.formatTp1Manage(s); }
  /** @deprecated */ public formatTarget2HitMessage(s: EdgeSetup)              { return this.formatTp2Manage(s); }
  /** @deprecated */ public formatInvalidatedMessage(s: EdgeSetup, r?: string) { return this.formatInvalidatedStatus(s, r); }
}

export const telegramBotService = new TelegramBotService();
