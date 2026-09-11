import { newsEngine } from '../news/news-engine';
import { telegramBotService } from '../notifications/telegram-bot';
import { createLogger } from '../telemetry/logger';

const logger = createLogger('EarlyScanService');

export interface EarlyScanStatus {
  hasEarlyScanToday: boolean;
  hasCompletedToday: boolean;
  noticeSentToday: boolean;
  earlyScanTimeET: string;
  standardScanTimeET: string;
  targetMarket: string;
  events: any[];
  firstEvent: any | null;
  scheduledTimeET: string;
  bannerText: string;
  isEarlyScanNeeded: boolean;
  isStandardTimeScan: boolean;
  scanHour: number;
  scanMinute: number;
}

class EarlyScanService {
  private lastCompletedDateET: string | null = null;
  private lastNoticeSentDateET: string | null = null;

  public getTodayET(date: Date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date); // YYYY-MM-DD
  }

  public getStatus(date: Date = new Date()): EarlyScanStatus {
    const todayET = this.getTodayET(date);
    const newsInfo = newsEngine.hasNyAmHighImpactNews(date);

    const hasCompleted = this.lastCompletedDateET === todayET;
    const noticeSent = this.lastNoticeSentDateET === todayET;

    let bannerText = '';
    if (newsInfo.hasNews) {
      if (hasCompleted) {
        if (newsInfo.isStandardTimeScan) {
          bannerText = `Forex Scan executed at 08:00 AM ET (30 minutes prior to ${newsInfo.firstEvent?.currency} ${newsInfo.firstEvent?.title} at ${newsInfo.scheduledTimeET}). Both Forex & Futures completed.`;
        } else {
          bannerText = `Early Forex Scan completed at ${newsInfo.targetScanTimeET} ahead of high-impact news (${newsInfo.firstEvent?.currency} ${newsInfo.firstEvent?.title} at ${newsInfo.scheduledTimeET}). Futures scan scheduled at 08:00 AM ET.`;
        }
      } else {
        if (newsInfo.isStandardTimeScan) {
          bannerText = `HIGH-IMPACT NEWS DETECTED: ${newsInfo.firstEvent?.currency} ${newsInfo.firstEvent?.title} scheduled at ${newsInfo.scheduledTimeET}. The Forex scanner will execute 30 minutes prior to news at 08:00 AM ET (aligned with standard session open).`;
        } else {
          bannerText = `HIGH-IMPACT NEWS DETECTED: ${newsInfo.firstEvent?.currency} ${newsInfo.firstEvent?.title} scheduled at ${newsInfo.scheduledTimeET}. The Forex scanner will execute 30 minutes prior to news at ${newsInfo.targetScanTimeET}. Futures scan remains at 08:00 AM ET.`;
        }
      }
    }

    return {
      hasEarlyScanToday: newsInfo.hasNews,
      hasCompletedToday: hasCompleted,
      noticeSentToday: noticeSent,
      earlyScanTimeET: newsInfo.targetScanTimeET,
      standardScanTimeET: '08:00 AM ET',
      targetMarket: newsInfo.isEarlyScanNeeded ? 'forex' : 'both',
      events: newsInfo.events,
      firstEvent: newsInfo.firstEvent,
      scheduledTimeET: newsInfo.scheduledTimeET,
      bannerText,
      isEarlyScanNeeded: newsInfo.isEarlyScanNeeded,
      isStandardTimeScan: newsInfo.isStandardTimeScan,
      scanHour: newsInfo.scanHour,
      scanMinute: newsInfo.scanMinute
    };
  }

  public isEarlyScanRequired(date: Date = new Date()): boolean {
    const status = this.getStatus(date);
    return status.hasEarlyScanToday && !status.hasCompletedToday && status.isEarlyScanNeeded;
  }

  public isEarlyScanDue(date: Date = new Date()): boolean {
    const status = this.getStatus(date);
    if (!status.hasEarlyScanToday || status.hasCompletedToday || !status.isEarlyScanNeeded) {
      return false;
    }

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(date);
    const curHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const curMin = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
    const curTotalMinutes = curHour * 60 + curMin;
    const targetTotalMinutes = status.scanHour * 60 + status.scanMinute;

    return curTotalMinutes >= targetTotalMinutes;
  }

  public markCompleted(date: Date = new Date()): void {
    const todayET = this.getTodayET(date);
    this.lastCompletedDateET = todayET;
    logger.info({ todayET }, 'Pre-news Forex scan marked as completed for today');
  }

  public async checkAndSendNotice(date: Date = new Date()): Promise<boolean> {
    const todayET = this.getTodayET(date);
    if (this.lastNoticeSentDateET === todayET) {
      return false; // Already sent today
    }

    const newsInfo = newsEngine.hasNyAmHighImpactNews(date);
    if (!newsInfo.hasNews || !newsInfo.firstEvent) {
      return false;
    }

    try {
      const eventTitle = newsInfo.events.length > 1
        ? newsInfo.events.map(e => `${e.currency} ${e.title}`).join(' | ')
        : `${newsInfo.firstEvent.currency} ${newsInfo.firstEvent.title}`;
      const sent = await telegramBotService.sendEarlyScanNotice(
        eventTitle,
        newsInfo.scheduledTimeET,
        newsInfo.targetScanTimeET
      );
      if (sent) {
        this.lastNoticeSentDateET = todayET;
        logger.info({ todayET, eventTitle, scanTime: newsInfo.targetScanTimeET }, 'Telegram pre-news scan notice successfully dispatched');
        return true;
      }
    } catch (err) {
      logger.error({ err }, 'Failed to dispatch Telegram pre-news scan notice');
    }
    return false;
  }
}

export const earlyScanService = new EarlyScanService();
