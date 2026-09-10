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
        bannerText = `Early Forex Scan completed at 07:30 AM ET ahead of high-impact news (${newsInfo.firstEvent?.currency} ${newsInfo.firstEvent?.title} at ${newsInfo.scheduledTimeET}). Futures scan scheduled at 08:00 AM ET.`;
      } else {
        bannerText = `HIGH-IMPACT NEWS DETECTED: ${newsInfo.firstEvent?.currency} ${newsInfo.firstEvent?.title} scheduled at ${newsInfo.scheduledTimeET}. The Forex scanner will execute 30 minutes earlier at 07:30 AM ET. Futures scan remains at 08:00 AM ET.`;
      }
    }

    return {
      hasEarlyScanToday: newsInfo.hasNews,
      hasCompletedToday: hasCompleted,
      noticeSentToday: noticeSent,
      earlyScanTimeET: '07:30 AM ET',
      standardScanTimeET: '08:00 AM ET',
      targetMarket: 'forex',
      events: newsInfo.events,
      firstEvent: newsInfo.firstEvent,
      scheduledTimeET: newsInfo.scheduledTimeET,
      bannerText
    };
  }

  public isEarlyScanRequired(date: Date = new Date()): boolean {
    const status = this.getStatus(date);
    return status.hasEarlyScanToday && !status.hasCompletedToday;
  }

  public markCompleted(date: Date = new Date()): void {
    const todayET = this.getTodayET(date);
    this.lastCompletedDateET = todayET;
    logger.info({ todayET }, 'Early Forex scan marked as completed for today');
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
        '07:30 AM ET'
      );
      if (sent) {
        this.lastNoticeSentDateET = todayET;
        logger.info({ todayET, eventTitle }, 'Telegram early scan notice successfully dispatched');
        return true;
      }
    } catch (err) {
      logger.error({ err }, 'Failed to dispatch Telegram early scan notice');
    }
    return false;
  }
}

export const earlyScanService = new EarlyScanService();
