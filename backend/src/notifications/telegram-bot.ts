import { publishEvents } from '../publish-gate/publish-gate';
import { EdgeSetup } from '../discovery/types';
import { createLogger } from '../telemetry/logger';
import { getNotificationSettingsMap, getDisabledDisplayAssets } from '../db/queries';

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

interface TelegramQueueItem {
  id: string;
  description: string;
  execute: () => Promise<Response>;
  resolve: (value: boolean) => void;
  reject: (reason?: any) => void;
  retries: number;
}

class TelegramBotService {
  private config: TelegramConfig = { enabled: false, botToken: '', chatId: '' };
  private isInitialized = false;

  // ── Rate Limiting Queue State ──
  private queue: TelegramQueueItem[] = [];
  private isProcessingQueue = false;
  private minIntervalMs = 1100; // Telegram chat limit is 1 req/sec; 1100ms guarantees safe margin
  private lastDispatchTime = 0;

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

  /** Internal queue pacing and inspection helpers */
  public getQueueLength(): number { return this.queue.length; }
  public setMinIntervalMs(ms: number): void { this.minIntervalMs = ms; }

  /** Waits until all currently enqueued Telegram dispatches have completed */
  public async drainQueue(): Promise<void> {
    while (this.queue.length > 0 || this.isProcessingQueue) {
      await new Promise(r => setTimeout(r, 50));
    }
  }

  // ── Queue Processing Engine ──────────────────────────────────────────────────

  private enqueue(
    description: string,
    execute: () => Promise<Response>
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        id: Math.random().toString(36).substring(2, 9),
        description,
        execute,
        resolve,
        reject,
        retries: 0
      });
      this.processQueue().catch(err => {
        logger.error({ err: err.message }, 'Unexpected error running Telegram queue processor');
      });
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    try {
      while (this.queue.length > 0) {
        const item = this.queue[0];

        // Enforce rate limiting pacing: ensure minimum gap of minIntervalMs between dispatches
        const now = Date.now();
        const elapsed = now - this.lastDispatchTime;
        if (elapsed < this.minIntervalMs) {
          const waitTime = this.minIntervalMs - elapsed;
          await new Promise(r => setTimeout(r, waitTime));
        }

        try {
          const res = await item.execute();
          this.lastDispatchTime = Date.now();

          if (res.ok) {
            this.queue.shift();
            logger.info({ description: item.description }, 'Telegram message dispatched successfully');
            item.resolve(true);
          } else if (res.status === 429) {
            // Telegram Rate Limit (Too Many Requests)
            let retryAfter = 3;
            try {
              const data: any = await res.json();
              if (data?.parameters?.retry_after) {
                retryAfter = Number(data.parameters.retry_after);
              }
            } catch {}

            const pauseMs = (retryAfter * 1000) + 500;
            logger.warn(
              { description: item.description, status: 429, retryAfter, pauseMs },
              'Telegram 429 rate limit hit. Pausing queue and retrying...'
            );

            item.retries++;
            if (item.retries > 5) {
              logger.error({ description: item.description }, 'Telegram message dropped after exceeding max 429 retries (5)');
              this.queue.shift();
              item.resolve(false);
            } else {
              // Wait requested backoff duration before retrying this item
              await new Promise(r => setTimeout(r, pauseMs));
            }
          } else if (res.status >= 500 && res.status <= 599) {
            // Temporary Telegram server error
            item.retries++;
            if (item.retries > 3) {
              logger.error({ status: res.status, description: item.description }, 'Telegram server error: dropped after 3 retries');
              this.queue.shift();
              item.resolve(false);
            } else {
              const backoffMs = item.retries * 1500;
              logger.warn({ status: res.status, backoffMs }, 'Telegram 5xx error. Retrying after backoff...');
              await new Promise(r => setTimeout(r, backoffMs));
            }
          } else {
            // Permanent client error (e.g. 400 Bad Request / parse error)
            const errorText = await res.text().catch(() => '');
            logger.error({ status: res.status, error: errorText, description: item.description }, 'Failed to send Telegram message (permanent error)');
            this.queue.shift();
            item.resolve(false);
          }
        } catch (err: any) {
          // Network fetch failure
          item.retries++;
          if (item.retries > 3) {
            logger.error({ err: err.message, description: item.description }, 'Network error during Telegram dispatch: dropped after 3 retries');
            this.queue.shift();
            item.resolve(false);
          } else {
            logger.warn({ err: err.message, retries: item.retries }, 'Network error contacting Telegram. Retrying in 2s...');
            await new Promise(r => setTimeout(r, 2000));
          }
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  // ── Core send ──────────────────────────────────────────────────────────────

  public async sendMessage(text: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<boolean> {
    const { enabled, botToken, chatId } = this.config;
    if (!enabled || !botToken || !chatId) {
      logger.debug('Skipping Telegram send: Bot disabled or missing credentials');
      return false;
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const payload = {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: true
    };

    return this.enqueue(text.substring(0, 45).replace(/\n/g, ' '), () => {
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    });
  }

  public async sendDocument(
    fileBuffer: Buffer,
    filename: string,
    caption?: string,
    parseMode: 'HTML' | 'Markdown' = 'HTML'
  ): Promise<boolean> {
    const { enabled, botToken, chatId } = this.config;
    if (!enabled || !botToken || !chatId) {
      logger.debug('Skipping Telegram sendDocument: Bot disabled or missing credentials');
      return false;
    }

    const url = `https://api.telegram.org/bot${botToken}/sendDocument`;

    return this.enqueue(`doc:${filename}`, () => {
      const formData = new FormData();
      formData.append('chat_id', chatId);
      const blob = new Blob([fileBuffer], { type: 'application/pdf' });
      formData.append('document', blob, filename);
      if (caption) {
        formData.append('caption', caption);
        formData.append('parse_mode', parseMode);
      }
      return fetch(url, {
        method: 'POST',
        body: formData
      });
    });
  }

  public async sendSignalAuditReport(
    reportData: any,
    pdfBuffer: Buffer,
    force: boolean = false
  ): Promise<boolean> {
    if (!force) {
      try {
        const map = await getNotificationSettingsMap();
        if ('notify_all_report' in map && !map['notify_all_report']) {
          logger.debug('Signal audit report suppressed by notify_all_report master toggle');
          return false;
        }
        if ('notify_signal_audit_report' in map && !map['notify_signal_audit_report']) {
          logger.debug('Signal audit report suppressed by notify_signal_audit_report toggle');
          return false;
        }
      } catch {}
    }

    const filename = `SND_Signal_Audit_Report_${reportData.reportNumber}_${reportData.tradingDate}.pdf`;
    const sessionLabel = reportData.sessionName ? reportData.sessionName.toUpperCase().replace(/_/g, ' ') : 'SESSION';
    const caption = `📋 <b>SND SIGNALS — SIGNAL-BY-SIGNAL AUDIT REPORT #${reportData.reportNumber}</b>
━━━━━━━━━━━━━━━━━━━━━
📅 <b>Trading Day:</b> <code>${reportData.tradingDate} (From 8:00 PM EST)</code>
⏱️ <b>Pre-Scan Check:</b> 30m before ${sessionLabel} Scan
📊 <b>Total Signals Audited:</b> ${reportData.signalsCount}
🟢 <b>Wins / In-Profit:</b> ${reportData.winsCount} | 🔴 <b>Losses:</b> ${reportData.lossesCount}
🛡️ <b>Breakeven / Active:</b> ${reportData.activeCount} | ⛔ <b>Cancelled / Rejected:</b> ${reportData.cancelledCount + reportData.failedCount}
━━━━━━━━━━━━━━━━━━━━━
<i>Attached is the comprehensive signal-by-signal audit PDF table with Trade IDs, broker execution status, and root cause notes.</i>`;

    return await this.sendDocument(pdfBuffer, filename, caption);
  }

  /** Checks DB feature toggle hierarchy before sending. Defaults to enabled on cold start. */
  private async sendIfEnabled(
    key: string,
    text: string,
    setup?: EdgeSetup | null,
    category?: 'signal' | 'manage' | 'status' | 'report'
  ): Promise<void> {
    try {
      const map = await getNotificationSettingsMap();

      // Check if asset display is turned off for clients & admins
      if (setup?.instrument) {
        const setupKz = (setup as any).killzone_origin;
        const disabledAssets = await getDisabledDisplayAssets(setupKz);
        if (disabledAssets.includes(setup.instrument)) {
          logger.debug({ key, instrument: setup.instrument, session: setupKz }, 'Telegram notification suppressed: Asset display is turned OFF for public/clients in this session');
          return;
        }
      }

      // 1. Global Master category check (e.g. notify_all_signal, notify_all_manage, notify_all_status)
      if (category) {
        const globalCatKey = `notify_all_${category}`;
        if (globalCatKey in map && !map[globalCatKey]) {
          logger.debug({ key, category, globalCatKey }, 'Notification suppressed by global category master toggle');
          return;
        }
      }

      // 2. Market-specific checks if setup has a market
      if (setup?.market) {
        const market = setup.market.toLowerCase().trim();

        // Market Master (e.g. market_futures_all, market_forex_all, market_crypto_all)
        const marketMasterKey = `market_${market}_all`;
        if (marketMasterKey in map && !map[marketMasterKey]) {
          logger.debug({ key, market, marketMasterKey }, 'Notification suppressed by market master toggle');
          return;
        }

        // Market Category (e.g. futures_signals, futures_manage, futures_status)
        if (category) {
          const catSuffix = category === 'signal' ? 'signals' : category; // normalize 'signal' -> 'signals'
          const marketCategoryKey = `${market}_${catSuffix}`;
          if (marketCategoryKey in map && !map[marketCategoryKey]) {
            logger.debug({ key, market, marketCategoryKey }, 'Notification suppressed by market category toggle');
            return;
          }
        }
      }

      // 3. Granular Specific Feature Key (e.g. notify_invalidation, notify_tp1_hit, etc.)
      if (key in map && !map[key]) {
        logger.debug({ key }, 'Notification suppressed by granular feature toggle');
        return;
      }
    } catch { /* DB not ready yet — send anyway */ }

    await this.sendMessage(text);
  }

  // ── Event Handlers ─────────────────────────────────────────────────────────

  private async handleSetupCreated(setup: EdgeSetup) {
    if (!setup) return;
    await this.sendIfEnabled('notify_new_signal', this.formatSignal(setup), setup, 'signal');
  }

  private async handleSetupEntered(setup: EdgeSetup) {
    if (!setup) return;
    await this.sendIfEnabled('notify_entry_triggered', this.formatEntryTriggeredStatus(setup), setup, 'status');
  }

  private async handleBreakevenReached(setup: EdgeSetup) {
    if (!setup) return;
    await this.sendIfEnabled('notify_move_to_breakeven', this.formatBreakevenManage(setup), setup, 'manage');
  }

  private async handleRunnerStarted(payload: any) {
    const setup = payload?.setup || payload;
    if (!setup) return;
    await this.sendIfEnabled('notify_tp1_hit', this.formatTp1Manage(setup), setup, 'manage');
  }

  private async handleTarget1Hit(setup: EdgeSetup) {
    if (!setup) return;
    await this.sendIfEnabled('notify_tp1_hit', this.formatTp1Manage(setup), setup, 'manage');
  }

  private async handleTarget2Hit(setup: EdgeSetup) {
    if (!setup) return;
    await this.sendIfEnabled('notify_tp2_hit', this.formatTp2Manage(setup), setup, 'manage');
  }

  private async handleSetupResolved(payload: any) {
    const setup = payload?.setup || payload;
    const outcomeType: string = payload?.outcome?.outcome_type || payload?.outcome || '';
    if (!setup) return;
    if      (outcomeType === 'tp1_hit') await this.sendIfEnabled('notify_tp1_hit', this.formatTp1Manage(setup), setup, 'manage');
    else if (outcomeType === 'tp2_hit') await this.sendIfEnabled('notify_tp2_hit', this.formatTp2Manage(setup), setup, 'manage');
    else if (outcomeType === 'sl_hit')  await this.sendIfEnabled('notify_sl_hit',  this.formatSlHitStatus(setup), setup, 'status');
    else if (outcomeType === 'be_hit')  await this.sendIfEnabled('notify_be_hit',  this.formatBeExitStatus(setup), setup, 'status');
  }

  private async handleSetupInvalidated(payload: { setupId: string; reason: string; setup?: EdgeSetup; superseded?: boolean }) {
    if (!payload.setup) return;
    if (payload.superseded) {
      await this.sendIfEnabled('notify_superseded_cancel', this.formatSupersededManage(payload.setup, payload.reason), payload.setup, 'manage');
    } else {
      await this.sendIfEnabled('notify_invalidation', this.formatInvalidatedManage(payload.setup, payload.reason), payload.setup, 'manage');
    }
  }

  private async handleSetupSuperseded(payload: { setup: EdgeSetup; reason?: string }) {
    if (!payload?.setup) return;
    await this.sendIfEnabled('notify_superseded_cancel', this.formatSupersededManage(payload.setup, payload.reason), payload.setup, 'manage');
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

  // ── MANAGE ────────────────────────────────────────────────────────────────

  public formatInvalidatedManage(setup: EdgeSetup, reason?: string): string {
    const p   = mktPrefix(setup);
    const id  = fmtId(setup);
    const sym = cleanSymbol(setup.instrument);
    let why = (reason || 'market_structure_breach').replace(/_/g, ' ');
    let instruction = 'Discard setup — do not enter. Pending order cancelled.';

    if (reason === 'target_reached_pre_entry') {
      why = 'Target Reached Pre-Entry (Move Completed Without Fill)';
      instruction = 'Target hit before limit order could fill. Pending order cancelled.';
    } else if (reason === 'stop_breached_pre_entry') {
      why = 'Stop Level Breached Pre-Entry (Zone Consumed)';
      instruction = 'Price broke beyond stop before filling order. Pending order cancelled.';
    } else if (reason === 'price_displaced') {
      why = 'Zone Blown Through (> 1.5x ATR Volatility Invalidation)';
      instruction = 'Price moved aggressively through zone. Pending order cancelled.';
    }

    return `<b>⛔ ${p} MANAGE ⚡</b>
━━━━━━━━━━━━━━━━━━━━━
🆔 <b>Trade ID:</b> <code>${id}</code>
📊 <b>Asset:</b> ${sym}
🎯 <b>Action:</b> CANCEL PENDING ORDER
📢 <b>Status:</b> SIGNAL INVALIDATED (PRE-ENTRY)
⚠️ <b>Reason:</b> ${why}.
👉 <b>Instruction:</b> ${instruction}
📅 <b>Date &amp; Time:</b> <code>${fmtTs()}</code>
━━━━━━━━━━━━━━━━━━━━━`;
  }

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

  public async sendEarlyScanNotice(eventTitle: string, eventTimeET: string, scheduledScanTimeET: string): Promise<boolean> {
    const isStandard = scheduledScanTimeET === '08:00 AM ET';
    const actionText = isStandard
      ? `The <b>Forex Scanner</b> will execute <b>30 minutes prior to news</b> at <b>08:00 AM ET</b> (aligned with standard session open).`
      : `The <b>Forex Scanner</b> will execute <b>30 minutes prior to news</b> at <b>${scheduledScanTimeET}</b> (standard: 08:00 AM ET).`;
    const marketText = isStandard
      ? `Both Forex & Futures will scan at 08:00 AM ET.`
      : `Forex Only (Futures scan remains scheduled at 08:00 AM ET).`;

    const text = `⚠️ <b>HIGH-IMPACT NEWS SCHEDULE WARNING</b>
━━━━━━━━━━━━━━━━━━━━━
📢 <b>Notice:</b> High-impact economic news is scheduled during today's New York AM session.
📰 <b>Event:</b> ${eventTitle} (${eventTimeET})
⚡ <b>Action:</b> ${actionText}
📊 <b>Market:</b> ${marketText}
📅 <b>Timestamp:</b> <code>${fmtTs()}</code>
━━━━━━━━━━━━━━━━━━━━━`;
    return this.sendMessage(text);
  }

  // ── Legacy aliases (backwards compat) ─────────────────────────────────────
  /** @deprecated */ public formatNewSetupMessage(s: EdgeSetup)                { return this.formatSignal(s); }
  /** @deprecated */ public formatEntryTriggeredMessage(s: EdgeSetup)          { return this.formatEntryTriggeredStatus(s); }
  /** @deprecated */ public formatBreakevenMessage(s: EdgeSetup)               { return this.formatBreakevenManage(s); }
  /** @deprecated */ public formatTarget1HitMessage(s: EdgeSetup)              { return this.formatTp1Manage(s); }
  /** @deprecated */ public formatTarget2HitMessage(s: EdgeSetup)              { return this.formatTp2Manage(s); }
  /** @deprecated */ public formatInvalidatedMessage(s: EdgeSetup, r?: string) { return this.formatInvalidatedManage(s, r); }
  /** @deprecated */ public formatInvalidatedStatus(s: EdgeSetup, r?: string)  { return this.formatInvalidatedManage(s, r); }
}

export const telegramBotService = new TelegramBotService();
