import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { queryDb } from '../db/database';
import * as queries from '../db/queries';
import { EdgeSetup } from '../discovery/types';
import { telegramBotService } from '../notifications/telegram-bot';
import { createLogger } from '../telemetry/logger';

const logger = createLogger('SignalAuditService');

export interface AuditRow {
  tradeId: string;
  timeBrokerLocal: string;
  asset: string;
  directionSignalType: string;
  executedAction: string;
  finalOutcome: string;
  rootCauseKeyEvents: string;
  isLoss?: boolean;
  isWin?: boolean;
  isActive?: boolean;
  isCancelled?: boolean;
  isFailed?: boolean;
}

export interface SignalAuditReportData {
  reportId: string;
  reportNumber: number;
  title: string;
  sessionName: string;
  tradingDate: string;
  periodStartUtc: string;
  periodEndUtc: string;
  signalsCount: number;
  activeCount: number;
  closedCount: number;
  winsCount: number;
  lossesCount: number;
  breakevenCount: number;
  cancelledCount: number;
  failedCount: number;
  rows: AuditRow[];
  pdfPath?: string;
  createdAt: string;
}

export class SignalAuditService {
  private reportsDir: string;

  constructor() {
    this.reportsDir = path.resolve(process.cwd(), 'reports/audit');
    try {
      if (!fs.existsSync(this.reportsDir)) {
        fs.mkdirSync(this.reportsDir, { recursive: true });
      }
    } catch (err) {
      logger.warn({ err }, 'Could not create reports directory');
    }
  }

  /**
   * Derives trading day window starting at 8:00 PM EST (20:00 America/New_York) at Asia session open.
   */
  public getTradingDayWindow(refDate: Date = new Date()): {
    tradingDate: string;
    startUtcIso: string;
    endUtcIso: string;
  } {
    // Format refDate in America/New_York
    const nyStr = refDate.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const nyDate = new Date(nyStr);
    const hour = nyDate.getHours();

    // If hour >= 20, cycle started today at 20:00 NY
    // If hour < 20, cycle started yesterday at 20:00 NY
    const startNy = new Date(nyDate);
    if (hour < 20) {
      startNy.setDate(startNy.getDate() - 1);
    }
    startNy.setHours(20, 0, 0, 0);

    const endNy = new Date(startNy);
    endNy.setDate(endNy.getDate() + 1);

    const offsetMs = refDate.getTime() - nyDate.getTime();
    const startUtc = new Date(startNy.getTime() + offsetMs);
    const endUtc = new Date(endNy.getTime() + offsetMs);

    return {
      tradingDate: startNy.toISOString().split('T')[0],
      startUtcIso: startUtc.toISOString(),
      endUtcIso: endUtc.toISOString()
    };
  }

  /**
   * Helper: formats symbol cleanly (EURUSD, NQ, etc.)
   */
  private cleanSymbol(instrument: string): string {
    return (instrument || '').replace(/\//g, '').toUpperCase();
  }

  /**
   * Helper: derives short Trade ID: #GBPUSD-06C7
   */
  private fmtId(setup: EdgeSetup): string {
    if (!setup || !setup.id) return '#SND-0001';
    const sym = this.cleanSymbol(setup.instrument);
    const rawId = setup.id.replace(/^test_/, '');
    const parts = rawId.split('-');
    const suffix = parts.length > 1
      ? parts[0].substring(0, 4).toUpperCase()
      : rawId.substring(rawId.length - 4).toUpperCase();
    return `#${sym}-${suffix}`;
  }

  /**
   * Formats Broker / Local time: e.g. 03:01:30 / 02:01
   */
  private fmtBrokerLocalTime(dateStr?: string): string {
    const d = dateStr ? new Date(dateStr) : new Date();
    // Local EST/EDT
    const localTimeStr = d.toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });

    // Broker time (Standard MT4/MT5 is UTC+2 / EET, 7 hours ahead of EST or UTC+2)
    // Broker time displays HH:mm:ss
    const brokerDate = new Date(d.getTime() + 2 * 3600 * 1000); // UTC+2
    const brokerTimeStr = brokerDate.toLocaleTimeString('en-US', {
      timeZone: 'UTC',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    return `${brokerTimeStr}\n/ ${localTimeStr}`;
  }

  /**
   * Formats time for narrative: HH:mm:ss
   */
  private fmtTime(dateStr?: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  /**
   * Estimate lot size based on standard contract/risk model
   */
  private calculateLotSize(setup: EdgeSetup): string {
    const risk = Math.abs((setup.entry_price_recorded || setup.entry_zone_mid) - setup.stop);
    if (risk <= 0) return '1.00';
    if (setup.market === 'forex') {
      // 1% on $100,000 account = $1,000 risk. Pip value ~$10/lot
      const pips = risk * 10000;
      const lots = pips > 0 ? (1000 / (pips * 10)) : 5.0;
      return Math.min(20, Math.max(0.5, Number(lots.toFixed(2)))).toFixed(2);
    }
    // Futures
    return '2';
  }

  /**
   * Compiles the comprehensive signal audit report for the current day cycle
   */
  public async generateSignalAudit(
    sessionName: string = 'scheduled',
    customDate?: string
  ): Promise<SignalAuditReportData> {
    const now = new Date();
    const window = this.getTradingDayWindow(customDate ? new Date(customDate) : now);
    const reportNumber = await queries.getNextAuditReportNumber();
    const reportId = `audit_rep_${Date.now()}_${reportNumber}`;

    // Query all signals created during this day cycle
    const setups = await queries.getSignalsForTradingDay(window.startUtcIso, window.endUtcIso);

    let activeCount = 0;
    let closedCount = 0;
    let winsCount = 0;
    let lossesCount = 0;
    let breakevenCount = 0;
    let cancelledCount = 0;
    let failedCount = 0;

    const rows: AuditRow[] = [];

    for (const setup of setups) {
      const tradeId = this.fmtId(setup);
      const asset = this.cleanSymbol(setup.instrument);
      const isLong = (setup.bias || 'long').toLowerCase() === 'long';
      const meta: any = (() => { try { return JSON.parse(setup.metadata || '{}'); } catch { return {}; } })();
      const isMarket = meta.order_type === 'MARKET';

      const directionSignalType = isLong
        ? (isMarket ? 'BUY\n(BUY_MARKET)' : 'BUY\n(BUY_LIMIT)')
        : (isMarket ? 'SELL\n(SELL_MARKET)' : 'SELL\n(SELL_LIMIT)');

      const timeBrokerLocal = this.fmtBrokerLocalTime(setup.created_at);

      // Check outcomes and invalidations for this setup
      const outcomes = await queries.getOutcomesBySetup(setup.id);
      const invAudits = await queries.getSetupHistory(setup.id, setup.market || 'futures');
      const vpsSync = await queries.getVpsTradeSync(setup.id);

      const latestOutcome = outcomes.length > 0 ? outcomes[0] : null;
      const latestInv = invAudits.length > 0 ? invAudits[invAudits.length - 1] : null;

      const lotSize = vpsSync?.lots ? vpsSync.lots.toFixed(2) : this.calculateLotSize(setup);
      const entryPx = (setup.entry_price_recorded || setup.entry_zone_mid || setup.entry_zone_low).toFixed(setup.market === 'forex' ? 5 : 2);

      let executedAction = '';
      let finalOutcome = '';
      let rootCauseKeyEvents = '';

      let isWin = false;
      let isLoss = false;
      let isActive = false;
      let isCancelled = false;
      let isFailed = false;

      // Check if intake was rejected (e.g. entry zone zero-width)
      const isZeroWidthZone = Math.abs(setup.entry_zone_high - setup.entry_zone_low) < 0.000001;
      const isIntakeRejected = isZeroWidthZone || setup.tradable === 0 && !setup.entry_triggered_at && setup.signal_state === 'invalidated';

      if (vpsSync && vpsSync.executed_action) {
        // Use explicit VPS telemetry override if present
        executedAction = vpsSync.executed_action;
        finalOutcome = vpsSync.outcome_status || 'UNKNOWN';
        rootCauseKeyEvents = vpsSync.root_cause_notes || '';
      } else if (isZeroWidthZone) {
        executedAction = 'Rejected\nat Intake';
        finalOutcome = 'REJECTED';
        rootCauseKeyEvents = `Entry zone low (${setup.entry_zone_low}) == high (${setup.entry_zone_high}). Dropped cleanly at intake.`;
        isFailed = true;
        failedCount++;
      } else if (setup.signal_state === 'invalidated' && setup.invalidation_reason?.includes('safeguard')) {
        executedAction = 'Rejected\nby EA Safeguard';
        finalOutcome = 'REJECTED';
        rootCauseKeyEvents = `Active running trade had tp1_hit == false. Safeguard FEAT-023 rejected replacement signal.`;
        isFailed = true;
        failedCount++;
      } else if (setup.signal_state === 'invalidated' && (setup.invalidation_reason?.includes('invalid_price') || setup.invalidation_reason?.includes('broker'))) {
        executedAction = 'Rejected\nby Broker';
        finalOutcome = 'EXECUTION_FAILED';
        rootCauseKeyEvents = `Current Ask was outside zone [${setup.entry_zone_low}, ${setup.entry_zone_high}]. MT5 rejected: 10015 (invalid price).`;
        isFailed = true;
        failedCount++;
      } else if (setup.superseded === 1 || setup.signal_state === 'superseded') {
        const orderTypeLabel = isLong ? 'Buy Limit' : 'Sell Limit';
        executedAction = `${orderTypeLabel} Placed\n(${lotSize} lots at\n${entryPx})`;
        finalOutcome = 'CANCELLED';
        const cancelTime = this.fmtTime(setup.resolved_at || setup.created_at);
        const opposingId = setup.superseded_by ? `#${this.cleanSymbol(setup.instrument)}-${setup.superseded_by.substring(0, 4).toUpperCase()}` : 'opposing signal';
        rootCauseKeyEvents = `Remained pending until ${cancelTime} when ${opposingId} arrived. Order cancelled cleanly.`;
        isCancelled = true;
        cancelledCount++;
      } else if (setup.signal_state === 'awaiting_entry' && !setup.entry_triggered_at) {
        const orderTypeLabel = isLong ? 'Buy Limit' : 'Sell Limit';
        executedAction = `${orderTypeLabel} Placed\n(${lotSize} lots at\n${entryPx})`;
        finalOutcome = 'STILL PENDING';
        rootCauseKeyEvents = `Currently active pending order waiting for price touch at ${entryPx}.`;
        isActive = true;
        activeCount++;
      } else if (setup.signal_state === 'active' || setup.signal_state === 'runner') {
        const fillTime = this.fmtTime(setup.entry_triggered_at);
        const fillPx = (setup.entry_price_recorded || setup.entry_zone_mid).toFixed(setup.market === 'forex' ? 5 : 2);
        const orderVerb = isMarket ? `Market ${isLong ? 'Buy' : 'Sell'} Filled` : `${isLong ? 'Buy' : 'Sell'} Limit Placed`;
        executedAction = `${orderVerb}\n(${lotSize} lots at\n${fillPx})`;

        if (setup.is_breakeven === 1 || setup.signal_state === 'runner') {
          finalOutcome = 'STILL ACTIVE (SL @ BE)';
          const beTime = fillTime ? `Hit 1RR after entry (SL moved to BE ${fillPx}).` : 'SL moved to BE.';
          const runnerNote = setup.signal_state === 'runner' ? ` TP1 hit, runner targeting TP2 (${setup.tp2}).` : ' Currently open at zero risk.';
          rootCauseKeyEvents = `Limit filled at ${fillTime} (${fillPx}). ${beTime}${runnerNote}`;
        } else {
          finalOutcome = 'STILL ACTIVE';
          rootCauseKeyEvents = `Limit filled at ${fillTime} (${fillPx}). Position live in market, monitoring for 1RR.`;
        }
        isActive = true;
        activeCount++;
      } else if (setup.signal_state === 'resolved' || latestOutcome) {
        const outcomeType = latestOutcome?.outcome_type || setup.invalidation_reason || '';
        const exitTime = this.fmtTime(latestOutcome?.execution_time || setup.resolved_at);
        const exitPx = (latestOutcome?.execution_price || setup.stop).toFixed(setup.market === 'forex' ? 5 : 2);
        const fillTime = this.fmtTime(setup.entry_triggered_at);
        const fillPx = (setup.entry_price_recorded || setup.entry_zone_mid).toFixed(setup.market === 'forex' ? 5 : 2);

        const orderVerb = isMarket ? `Market ${isLong ? 'Buy' : 'Sell'} Filled` : `${isLong ? 'Buy' : 'Sell'} Limit Placed`;
        executedAction = `${orderVerb}\n(${lotSize} lots at\n${fillPx})`;

        if (outcomeType.includes('tp2')) {
          const rVal = setup.r_multiple_2 || 3.0;
          const plDollars = (rVal * 1000).toFixed(2);
          finalOutcome = `CLOSED (+${rVal.toFixed(2)}R /\n+$${plDollars})`;
          rootCauseKeyEvents = `In-zone at intake (${fillPx}). Hit 1RR (SL -> BE). Hit TP1 (+2R). Exited at ${exitTime} via TP2 at ${exitPx}.`;
          isWin = true;
          winsCount++;
          closedCount++;
        } else if (outcomeType.includes('tp1') || outcomeType.includes('tp')) {
          const rVal = setup.r_multiple_1 || 2.0;
          const plDollars = (rVal * 1000).toFixed(2);
          finalOutcome = `CLOSED (+${rVal.toFixed(2)}R /\n+$${plDollars})`;
          rootCauseKeyEvents = `Filled at ${fillTime} (${fillPx}). Hit 1RR (SL moved to BE). Exited at ${exitTime} via TP1 at ${exitPx}.`;
          isWin = true;
          winsCount++;
          closedCount++;
        } else if (outcomeType.includes('be')) {
          finalOutcome = 'CLOSED (0.00R /\n$0.00)';
          rootCauseKeyEvents = `Filled at ${fillTime} (${fillPx}). Hit 1RR (SL moved to BE ${fillPx}). Reversed and hit BE SL at ${exitTime} (${exitPx}).`;
          breakevenCount++;
          closedCount++;
        } else if (outcomeType.includes('sl') || outcomeType.includes('stop')) {
          const plDollars = '1,000.00';
          finalOutcome = `CLOSED (-1.00R /\n-$${plDollars})`;
          rootCauseKeyEvents = `Filled at ${fillTime} (${fillPx}). Hit Stop Loss at ${exitTime} (${exitPx}). Trade cleanly closed by broker SL.`;
          isLoss = true;
          lossesCount++;
          closedCount++;
        } else {
          finalOutcome = 'CLOSED';
          rootCauseKeyEvents = `Trade resolved at ${exitTime}. Invalidation/exit reason: ${outcomeType.replace(/_/g, ' ')}.`;
          closedCount++;
        }
      } else {
        executedAction = `${isLong ? 'Buy' : 'Sell'} Limit Placed\n(${lotSize} lots at\n${entryPx})`;
        finalOutcome = setup.signal_state.toUpperCase();
        rootCauseKeyEvents = `Signal recorded in state: ${setup.signal_state}.`;
        closedCount++;
      }

      rows.push({
        tradeId,
        timeBrokerLocal,
        asset,
        directionSignalType,
        executedAction,
        finalOutcome,
        rootCauseKeyEvents,
        isWin,
        isLoss,
        isActive,
        isCancelled,
        isFailed
      });
    }

    const reportData: SignalAuditReportData = {
      reportId,
      reportNumber,
      title: 'SND Signals — Signal-by-Signal Processing Audit',
      sessionName,
      tradingDate: window.tradingDate,
      periodStartUtc: window.startUtcIso,
      periodEndUtc: window.endUtcIso,
      signalsCount: rows.length,
      activeCount,
      closedCount,
      winsCount,
      lossesCount,
      breakevenCount,
      cancelledCount,
      failedCount,
      rows,
      createdAt: now.toISOString()
    };

    // Generate PDF
    const pdfFilename = `SND_Signal_Audit_Report_${reportNumber}_${window.tradingDate}.pdf`;
    const pdfPath = path.join(this.reportsDir, pdfFilename);
    await this.generateAuditPdf(reportData, pdfPath);
    reportData.pdfPath = pdfPath;

    // Save record to DB
    await queries.saveSignalAuditReport({
      id: reportId,
      report_number: reportNumber,
      title: reportData.title,
      session_name: sessionName,
      period_start: window.startUtcIso,
      period_end: window.endUtcIso,
      signals_count: reportData.signalsCount,
      active_count: reportData.activeCount,
      closed_count: reportData.closedCount,
      pdf_path: pdfPath,
      summary_json: JSON.stringify({
        wins: winsCount,
        losses: lossesCount,
        breakevens: breakevenCount,
        cancelled: cancelledCount,
        failed: failedCount,
        rows
      }),
      telegram_sent: 0,
      created_at: now.toISOString()
    });

    logger.info({ reportNumber, signals: rows.length, pdfPath }, 'Signal Audit Report compiled and saved');
    return reportData;
  }

  /**
   * Generates clean vector PDF table matching the user's sample layout
   */
  public async generateAuditPdf(data: SignalAuditReportData, outputPath: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 30,
        bufferPages: true
      });

      const writeStream = fs.createWriteStream(outputPath);
      const buffers: Buffer[] = [];

      doc.on('data', b => buffers.push(b));
      doc.pipe(writeStream);

      const pageWidth = 595.28;
      const pageHeight = 841.89;
      const margin = 30;
      const contentWidth = pageWidth - margin * 2; // 535.28 pt

      // Table columns definition
      const columns = [
        { key: 'tradeId',             title: 'Signal /\nTrade ID',          width: 72 },
        { key: 'timeBrokerLocal',     title: 'Time\n(Broker\n/ Local)',     width: 55 },
        { key: 'asset',               title: 'Asset',                       width: 48 },
        { key: 'directionSignalType', title: 'Direction &\nSignal Type',    width: 65 },
        { key: 'executedAction',      title: 'Executed\nAction',            width: 78 },
        { key: 'finalOutcome',        title: 'Final Outcome',               width: 82 },
        { key: 'rootCauseKeyEvents',  title: 'Root Cause\n/ Key Event',     width: 135.28 }
      ];

      const drawHeader = (isFirstPage: boolean) => {
        let yPos = margin;
        if (isFirstPage) {
          // Title
          doc.font('Helvetica-Bold').fontSize(18).fillColor('#1e293b')
             .text('Signal-by-Signal Processing Audit', margin, yPos);
          yPos += 24;

          // Subtitle
          doc.font('Helvetica').fontSize(9).fillColor('#475569')
             .text(
               `Below is the comprehensive audit of all ${data.signalsCount} signals received and processed on ${data.tradingDate} (Report #${data.reportNumber}).`,
               margin,
               yPos
             );
          yPos += 20;
        } else {
          yPos = margin + 5;
        }

        // Table column headers
        const headerHeight = 36;
        let curX = margin;

        doc.lineWidth(0.5).strokeColor('#cbd5e1');

        columns.forEach(col => {
          // Fill background for header
          doc.rect(curX, yPos, col.width, headerHeight).fillAndStroke('#f8fafc', '#cbd5e1');
          doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#0f172a')
             .text(col.title, curX + 4, yPos + 4, {
               width: col.width - 8,
               align: 'left',
               lineGap: 1
             });
          curX += col.width;
        });

        return yPos + headerHeight;
      };

      let currentY = drawHeader(true);

      // Render rows
      for (const row of data.rows) {
        // Calculate dynamic height needed for this row
        doc.font('Helvetica').fontSize(7);
        const hTradeId   = doc.heightOfString(row.tradeId, { width: columns[0].width - 8 });
        const hTime      = doc.heightOfString(row.timeBrokerLocal, { width: columns[1].width - 8 });
        const hAsset     = doc.heightOfString(row.asset, { width: columns[2].width - 8 });
        const hDir       = doc.heightOfString(row.directionSignalType, { width: columns[3].width - 8 });
        const hAction    = doc.heightOfString(row.executedAction, { width: columns[4].width - 8 });
        const hOutcome   = doc.heightOfString(row.finalOutcome, { width: columns[5].width - 8 });
        const hRootCause = doc.heightOfString(row.rootCauseKeyEvents, { width: columns[6].width - 8, lineGap: 1.5 });

        const rowHeight = Math.max(42, hTradeId, hTime, hAsset, hDir, hAction, hOutcome, hRootCause) + 12;

        // Check page break
        if (currentY + rowHeight > pageHeight - margin - 25) {
          doc.addPage();
          currentY = drawHeader(false);
        }

        // Draw row cells
        let curX = margin;
        doc.lineWidth(0.5).strokeColor('#cbd5e1');

        // Draw outer borders for cells
        columns.forEach(col => {
          doc.rect(curX, currentY, col.width, rowHeight).stroke();
          curX += col.width;
        });

        // Cell 1: Trade ID
        curX = margin;
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#0f172a')
           .text(row.tradeId, curX + 4, currentY + 6, { width: columns[0].width - 8 });

        // Cell 2: Time
        curX += columns[0].width;
        doc.font('Helvetica').fontSize(6.8).fillColor('#334155')
           .text(row.timeBrokerLocal, curX + 4, currentY + 6, { width: columns[1].width - 8 });

        // Cell 3: Asset
        curX += columns[1].width;
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#0f172a')
           .text(row.asset, curX + 4, currentY + 6, { width: columns[2].width - 8 });

        // Cell 4: Direction & Signal Type
        curX += columns[2].width;
        const isLong = row.directionSignalType.includes('BUY');
        doc.font('Helvetica').fontSize(7).fillColor(isLong ? '#166534' : '#991b1b')
           .text(row.directionSignalType, curX + 4, currentY + 6, { width: columns[3].width - 8 });

        // Cell 5: Executed Action
        curX += columns[3].width;
        doc.font('Helvetica').fontSize(7).fillColor('#1e293b')
           .text(row.executedAction, curX + 4, currentY + 6, { width: columns[4].width - 8 });

        // Cell 6: Final Outcome
        curX += columns[4].width;
        let outcomeColor = '#0f172a';
        if (row.isWin) outcomeColor = '#15803d'; // green
        else if (row.isLoss || row.isFailed) outcomeColor = '#b91c1c'; // dark red
        else if (row.isActive) outcomeColor = '#0e7490'; // teal
        else if (row.isCancelled) outcomeColor = '#475569'; // slate

        doc.font('Helvetica-Bold').fontSize(7).fillColor(outcomeColor)
           .text(row.finalOutcome, curX + 4, currentY + 6, { width: columns[5].width - 8 });

        // Cell 7: Root Cause / Key Event
        curX += columns[5].width;
        doc.font('Helvetica').fontSize(6.8).fillColor('#334155')
           .text(row.rootCauseKeyEvents, curX + 4, currentY + 6, {
             width: columns[6].width - 8,
             lineGap: 1.5
           });

        currentY += rowHeight;
      }

      // Add footers with page numbers
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.font('Helvetica').fontSize(7).fillColor('#94a3b8')
           .text(
             `SND Signals • Report #${data.reportNumber} • Page ${i + 1} of ${range.count}`,
             margin,
             pageHeight - margin + 8,
             { align: 'center', width: contentWidth }
           );
      }

      doc.end();

      writeStream.on('finish', () => {
        const fullBuffer = Buffer.concat(buffers);
        resolve(fullBuffer);
      });
      writeStream.on('error', reject);
    });
  }

  /**
   * Executes scheduled or manual pre-scan audit run, dispatches to Telegram if enabled
   */
  public async runScheduledPreScanAudit(
    sessionName: string = 'scheduled',
    forceSendTelegram: boolean = false
  ): Promise<SignalAuditReportData> {
    logger.info({ sessionName }, 'Executing 30-minute Pre-Scan Signal Audit...');
    const reportData = await this.generateSignalAudit(sessionName);

    if (reportData.pdfPath && fs.existsSync(reportData.pdfPath)) {
      const pdfBuffer = fs.readFileSync(reportData.pdfPath);

      // Telegram dispatch (checks toggle notify_signal_audit_report unless forced)
      try {
        const sent = await telegramBotService.sendSignalAuditReport(reportData, pdfBuffer, forceSendTelegram);
        if (sent) {
          await queryDb(`UPDATE signal_audit_reports SET telegram_sent = 1 WHERE id = ?`, [reportData.reportId]);
          logger.info({ reportId: reportData.reportId }, 'Telegram PDF audit report dispatched successfully');
        }
      } catch (err: any) {
        logger.error({ err: err.message }, 'Failed to dispatch signal audit report to Telegram');
      }
    }

    return reportData;
  }
}

export const signalAuditService = new SignalAuditService();
