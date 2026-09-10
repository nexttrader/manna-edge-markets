import fs from 'fs';
import path from 'path';

export interface EconomicEvent {
  id: string;
  title: string;
  country: string;
  currency: 'USD' | 'EUR' | 'GBP' | 'JPY' | 'AUD' | 'CAD' | 'CHF' | 'ALL';
  impact: 'high' | 'medium' | 'low';
  eventTime: string; // ISO 8601 string
  forecast?: string;
  previous?: string;
  actual?: string;
  unit?: string;
}

/**
 * Strictly determines whether an event is a genuine, market-moving high-impact economic release.
 * Filters out bank holidays, low-impact noise, and minor member speeches.
 */
export function isRealHighImpactNewsEvent(event: EconomicEvent): boolean {
  if (event.impact !== 'high') return false;

  const title = (event.title || '').trim().toLowerCase();
  const currency = (event.currency || event.country || '').toUpperCase();

  // Exclude Bank Holidays and All-Day/Tentative non-events
  if (
    title.includes('holiday') ||
    title.includes('bank holiday') ||
    title.includes('day 1') ||
    title.includes('day 2') ||
    title.includes('tentative')
  ) {
    return false;
  }

  // Only consider currencies directly impacting NY AM session volatility
  const nyAmCurrencies = ['USD', 'EUR', 'CAD', 'GBP'];
  if (!nyAmCurrencies.includes(currency)) {
    return false;
  }

  // Filter out non-rate speeches by minor central bank voting members
  // Only keep speeches by major Central Bank Chairs / Governors / Presidents
  if (title.includes('speaks') || title.includes('speaking')) {
    const isCentralBankLeader =
      title.includes('powell') ||
      title.includes('chair') ||
      title.includes('lagarde') ||
      title.includes('president') ||
      title.includes('bailey') ||
      title.includes('governor') ||
      title.includes('macklem');
    if (!isCentralBankLeader) {
      return false;
    }
  }

  // Recognized tier-1 market-moving macroeconomic releases
  const highImpactKeywords = [
    'cpi',
    'consumer price index',
    'pce',
    'personal consumption',
    'ppi',
    'producer price index',
    'inflation',
    'non-farm',
    'nonfarm',
    'payrolls',
    'unemployment',
    'jobless',
    'hourly earnings',
    'adp',
    'fomc',
    'rate',
    'funds rate',
    'monetary policy',
    'interest rate',
    'refinancing rate',
    'press conference',
    'powell',
    'lagarde',
    'gdp',
    'gross domestic product',
    'retail sales',
    'ism',
    'pmi',
    'consumer confidence',
    'consumer sentiment',
    'trade balance',
    'employment change'
  ];

  return highImpactKeywords.some(kw => title.includes(kw));
}

export class NewsEngine {
  private events: EconomicEvent[] = [];
  private isLive: boolean = false;
  private lastFetchedAt: number = 0;
  private isFetching: boolean = false;
  private lastError: string | null = null;
  private activeSource: string | null = null;
  private cacheFilePath: string;

  constructor() {
    this.cacheFilePath = path.join(process.cwd(), 'economic_calendar_cache.json');
    this.loadDiskCache();
    this.refreshLiveEvents();
    // Refresh live economic news every 6 hours
    setInterval(() => this.refreshLiveEvents(), 6 * 60 * 60 * 1000);
  }

  private loadDiskCache(): void {
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        const raw = fs.readFileSync(this.cacheFilePath, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.events) && data.events.length > 0) {
          this.events = data.events;
          this.isLive = true;
          this.lastFetchedAt = data.lastFetchedAt || Date.now();
          this.activeSource = data.activeSource || 'Disk Cache';
          console.log(`[NewsEngine] 💾 Loaded ${this.events.length} economic calendar events from disk cache.`);
        }
      }
    } catch (err) {
      console.warn('[NewsEngine] ⚠️ Failed to load disk cache:', String(err));
    }
  }

  private saveDiskCache(): void {
    try {
      const payload = {
        lastFetchedAt: this.lastFetchedAt,
        activeSource: this.activeSource,
        events: this.events
      };
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(payload, null, 2), 'utf8');
    } catch (err) {
      console.warn('[NewsEngine] ⚠️ Failed to save disk cache:', String(err));
    }
  }

  /**
   * Cycles through real financial calendar feeds (CSV primary, JSON fallback).
   */
  public async refreshLiveEvents(): Promise<void> {
    if (this.isFetching) return;
    this.isFetching = true;

    const candidateFeeds = [
      {
        name: 'ForexFactory NFS Media CSV',
        url: 'https://nfs.faireconomy.media/ff_calendar_thisweek.csv',
        type: 'csv'
      },
      {
        name: 'ForexFactory NFS Media JSON',
        url: 'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
        type: 'ff'
      }
    ];

    for (const feed of candidateFeeds) {
      try {
        const response = await fetch(feed.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            'Accept': feed.type === 'csv' ? 'text/csv, text/plain, */*' : 'application/json, text/plain, */*'
          }
        });

        if (response.ok) {
          let parsed: EconomicEvent[] = [];
          if (feed.type === 'csv') {
            const rawCsv = await response.text();
            if (!rawCsv.includes('<!DOCTYPE') && !rawCsv.includes('Rate Limited')) {
              parsed = this.parseForexFactoryCSV(rawCsv);
            }
          } else {
            const text = await response.text();
            if (!text.includes('<!DOCTYPE') && !text.includes('Rate Limited')) {
              const rawData = JSON.parse(text);
              parsed = this.parseForexFactoryEvents(rawData);
            }
          }

          if (parsed.length > 0) {
            this.events = parsed;
            this.isLive = true;
            this.activeSource = feed.name;
            this.lastError = null;
            this.lastFetchedAt = Date.now();
            this.saveDiskCache();
            console.log(`[NewsEngine] 🟢 Successfully synced ${this.events.length} live economic events from ${feed.name}.`);
            this.isFetching = false;
            return;
          }
        }
      } catch (err) {
        console.warn(`[NewsEngine] ⚠️ Feed fetch failed for ${feed.name}:`, String(err));
      }
    }

    // If live sync failed, preserve existing cached events if available
    if (this.events.length > 0) {
      this.isLive = true;
      this.lastError = 'Live calendar update temporarily rate-limited; using active cached calendar.';
      console.log(`[NewsEngine] ℹ️ Retaining ${this.events.length} cached events during temporary rate limit.`);
    } else {
      this.isLive = false;
      this.activeSource = null;
      this.lastError = 'All live economic calendar feeds are currently unreachable. Please check ForexFactory.com for today\'s releases.';
      console.warn('[NewsEngine] 🔴 All live calendar feeds unreachable and no cache available.');
    }

    this.lastFetchedAt = Date.now();
    this.isFetching = false;
  }

  private parseForexFactoryCSV(rawCsv: string): EconomicEvent[] {
    const lines = rawCsv.split('\n').filter(l => l.trim().length > 0);
    if (lines.length <= 1) return [];

    const events: EconomicEvent[] = [];

    // Header: Title,Country,Date,Time,Impact,Forecast,Previous,URL
    for (let i = 1; i < lines.length; i++) {
      const row: string[] = [];
      let inQuotes = false;
      let curr = '';

      for (const char of lines[i]) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          row.push(curr.trim());
          curr = '';
        } else {
          curr += char;
        }
      }
      row.push(curr.trim());

      if (row.length >= 5) {
        const [title, country, dateStr, timeStr, impactRaw, forecast, previous] = row;
        if (!title || !dateStr || !timeStr) continue;

        // Skip non-specific all-day or tentative times
        const lowerTime = timeStr.toLowerCase();
        if (lowerTime.includes('day') || lowerTime.includes('tentative')) {
          continue;
        }

        // dateStr is MM-DD-YYYY, timeStr is UTC (e.g. 12:30pm, 6:00am)
        const dateParts = dateStr.split('-').map(Number);
        if (dateParts.length !== 3) continue;
        const [month, day, year] = dateParts;

        const timeMatch = timeStr.trim().match(/^(\d+):(\d+)(am|pm)$/i);
        if (!timeMatch) continue;

        let hour = parseInt(timeMatch[1], 10);
        const min = parseInt(timeMatch[2], 10);
        const isPm = timeMatch[3].toLowerCase() === 'pm';
        if (isPm && hour < 12) hour += 12;
        if (!isPm && hour === 12) hour = 0;

        const utcDate = new Date(Date.UTC(year, month - 1, day, hour, min, 0));
        const eventTime = utcDate.toISOString();

        let impact: 'high' | 'medium' | 'low' = 'low';
        const imp = (impactRaw || '').toLowerCase();
        if (imp.includes('high') || imp === 'red') impact = 'high';
        else if (imp.includes('med') || imp === 'orange') impact = 'medium';

        events.push({
          id: `ff_csv_${i}_${utcDate.getTime()}`,
          title: title.trim(),
          country: (country || 'USD').toUpperCase(),
          currency: (country || 'USD').toUpperCase() as any,
          impact,
          eventTime,
          forecast: forecast || undefined,
          previous: previous || undefined
        });
      }
    }

    return events.sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());
  }

  private parseForexFactoryEvents(rawEvents: any[]): EconomicEvent[] {
    if (!Array.isArray(rawEvents)) return [];
    return rawEvents
      .filter((e: any) => e && e.title && e.date)
      .map((e: any, index: number) => {
        let impact: 'high' | 'medium' | 'low' = 'low';
        const impStr = (e.impact || '').toLowerCase();
        if (impStr.includes('high') || impStr === 'red') impact = 'high';
        else if (impStr.includes('med') || impStr === 'orange') impact = 'medium';

        const eventTime = e.dateISO || new Date(e.date).toISOString();

        return {
          id: `ff_${index}_${new Date(eventTime).getTime()}`,
          title: String(e.title).trim(),
          country: String(e.country || 'USD').toUpperCase(),
          currency: (e.country || 'USD').toUpperCase() as any,
          impact,
          eventTime,
          forecast: e.forecast || undefined,
          previous: e.previous || undefined,
          actual: e.actual || undefined
        };
      })
      .sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());
  }

  public getAllEvents(): EconomicEvent[] {
    return this.events;
  }

  public getCalendarStatus(): { isLive: boolean; lastFetchedAt: number; lastError: string | null; eventCount: number; activeSource: string | null } {
    return {
      isLive: this.isLive,
      lastFetchedAt: this.lastFetchedAt,
      lastError: this.lastError,
      eventCount: this.events.length,
      activeSource: this.activeSource
    };
  }

  public getUpcomingHighImpactEvents(windowMinutes: number = 1440): EconomicEvent[] {
    if (!this.isLive) return [];
    const now = Date.now();
    const futureLimit = now + windowMinutes * 60000;

    return this.events.filter(e => {
      const time = new Date(e.eventTime).getTime();
      return isRealHighImpactNewsEvent(e) && time >= now - 30 * 60000 && time <= futureLimit;
    }).sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());
  }

  /**
   * Evaluates if a given timestamp or current moment is within a 30-min window of high-impact news
   */
  public isNearHighImpactNews(timeIso: string = new Date().toISOString(), bufferMinutes: number = 30): { isNear: boolean; event?: EconomicEvent; minutesUntil?: number } {
    if (!this.isLive) return { isNear: false };
    const timeMs = new Date(timeIso).getTime();
    const bufferMs = bufferMinutes * 60000;

    for (const e of this.events) {
      if (!isRealHighImpactNewsEvent(e)) continue;
      const eventMs = new Date(e.eventTime).getTime();
      const diffMs = eventMs - timeMs;

      if (Math.abs(diffMs) <= bufferMs) {
        return {
          isNear: true,
          event: e,
          minutesUntil: Math.round(diffMs / 60000)
        };
      }
    }

    return { isNear: false };
  }

  /**
   * Checks if genuine, real high-impact economic news is scheduled during the NY AM session (08:00 - 12:00 ET)
   * for Forex-relevant currencies (USD, EUR, GBP, CAD).
   */
  public hasNyAmHighImpactNews(targetDate: Date = new Date()): {
    hasNews: boolean;
    events: EconomicEvent[];
    firstEvent: EconomicEvent | null;
    scheduledTimeET: string;
    description: string;
  } {
    if (!this.isLive || this.events.length === 0) {
      return { hasNews: false, events: [], firstEvent: null, scheduledTimeET: '', description: '' };
    }

    const nyFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const targetDayStr = nyFormatter.format(targetDate);

    const nyAmHighImpact = this.events.filter(e => {
      if (!isRealHighImpactNewsEvent(e)) return false;

      const eventDate = new Date(e.eventTime);
      const eventDayStr = nyFormatter.format(eventDate);
      if (eventDayStr !== targetDayStr) return false;

      const hourFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        hour12: false
      });
      const hourET = parseInt(hourFormatter.format(eventDate), 10);
      // NY AM session window (08:00 ET to 12:00 ET, e.g. 08:15 ECB, 08:30 CPI/NFP, 10:00 ISM)
      return hourET >= 8 && hourET < 12;
    }).sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());

    if (nyAmHighImpact.length === 0) {
      return { hasNews: false, events: [], firstEvent: null, scheduledTimeET: '', description: '' };
    }

    const first = nyAmHighImpact[0];
    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    const scheduledTimeET = timeFormatter.format(new Date(first.eventTime)) + ' ET';

    const eventNames = nyAmHighImpact.map(e => {
      const timeStr = timeFormatter.format(new Date(e.eventTime)) + ' ET';
      return `${e.currency} ${e.title} (${timeStr})`;
    }).join(', ');

    return {
      hasNews: true,
      events: nyAmHighImpact,
      firstEvent: first,
      scheduledTimeET,
      description: eventNames
    };
  }
}

export const newsEngine = new NewsEngine();
