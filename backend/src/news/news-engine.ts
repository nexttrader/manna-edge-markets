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

export class NewsEngine {
  private events: EconomicEvent[] = [];
  private isLive: boolean = false;
  private lastFetchedAt: number = 0;
  private isFetching: boolean = false;
  private lastError: string | null = null;
  private activeSource: string | null = null;

  constructor() {
    this.refreshLiveEvents();
    // Refresh live news twice a day (every 12 hours)
    setInterval(() => this.refreshLiveEvents(), 12 * 60 * 60 * 1000);
  }

  /**
   * Cycles through a priority list of real financial calendar feeds twice daily or on demand.
   * If all feeds fail, simulated fallbacks are NOT generated — isLive is set to false.
   */
  public async refreshLiveEvents(): Promise<void> {
    if (this.isFetching) return;
    this.isFetching = true;

    const candidateFeeds = [
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
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*'
          }
        });

        if (response.ok) {
          const rawData = (await response.json()) as any;
          const parsed = feed.type === 'ff' 
            ? this.parseForexFactoryEvents(rawData)
            : this.parseFXStreetEvents(Array.isArray(rawData) ? rawData : (rawData?.events || []));

          if (parsed.length > 0) {
            this.events = parsed;
            this.isLive = true;
            this.activeSource = feed.name;
            this.lastError = null;
            this.lastFetchedAt = Date.now();
            console.log(`[NewsEngine] 🟢 Successfully synced ${this.events.length} live economic events from ${feed.name}.`);
            this.isFetching = false;
            return;
          }
        }
      } catch (err) {
        console.warn(`[NewsEngine] ⚠️ Feed fetch failed for ${feed.name}:`, String(err));
      }
    }

    // All real feeds failed — DO NOT generate simulated mock events. Mark feed as broken/offline.
    this.events = [];
    this.isLive = false;
    this.activeSource = null;
    this.lastError = 'All live economic calendar feeds are currently unreachable or policy-blocked. Please check ForexFactory (forexfactory.com/calendar) for live releases.';
    this.lastFetchedAt = Date.now();
    this.isFetching = false;
    console.warn('[NewsEngine] 🔴 All live calendar feeds unreachable. Calendar feed offline notice enabled.');
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

  private parseFXStreetEvents(rawEvents: any[]): EconomicEvent[] {
    if (!Array.isArray(rawEvents)) return [];
    return rawEvents
      .filter((e: any) => e && (e.name || e.title))
      .map((e: any, index: number) => {
        let impact: 'high' | 'medium' | 'low' = 'low';
        if (e.volatility === 'HIGH' || e.impact === 'HIGH' || e.volatility === 3) impact = 'high';
        else if (e.volatility === 'MEDIUM' || e.impact === 'MEDIUM' || e.volatility === 2) impact = 'medium';

        const eventTime = e.dateUtc || e.date || new Date().toISOString();

        return {
          id: `fx_${index}_${new Date(eventTime).getTime()}`,
          title: String(e.name || e.title).trim(),
          country: String(e.countryCode || e.currency || 'USD').toUpperCase(),
          currency: String(e.currency || e.countryCode || 'USD').toUpperCase() as any,
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
      return e.impact === 'high' && time >= now - 30 * 60000 && time <= futureLimit;
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
      if (e.impact !== 'high') continue;
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
}

export const newsEngine = new NewsEngine();

