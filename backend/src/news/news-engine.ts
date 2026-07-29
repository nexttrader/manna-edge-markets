export interface EconomicEvent {
  id: string;
  title: string;
  currency: 'USD' | 'EUR' | 'GBP';
  impact: 'high' | 'medium' | 'low';
  eventTime: string; // ISO string
  forecast?: string;
  previous?: string;
}

// Major high-impact recurring economic releases
const SAMPLE_ECONOMIC_EVENTS: Omit<EconomicEvent, 'id'>[] = [
  { title: 'US CPI (Consumer Price Index) MoM / YoY', currency: 'USD', impact: 'high', eventTime: new Date(Date.now() + 14 * 60000).toISOString(), forecast: '0.3%', previous: '0.2%' },
  { title: 'FOMC Interest Rate Decision & Statement', currency: 'USD', impact: 'high', eventTime: new Date(Date.now() + 180 * 60000).toISOString(), forecast: '5.25%', previous: '5.25%' },
  { title: 'US Non-Farm Payrolls (NFP) & Unemployment', currency: 'USD', impact: 'high', eventTime: new Date(Date.now() + 1440 * 60000).toISOString(), forecast: '185K', previous: '206K' },
  { title: 'ECB Monetary Policy Statement', currency: 'EUR', impact: 'high', eventTime: new Date(Date.now() + 720 * 60000).toISOString(), forecast: '4.25%', previous: '4.25%' },
  { title: 'UK GDP (Gross Domestic Product) QoQ', currency: 'GBP', impact: 'high', eventTime: new Date(Date.now() + 960 * 60000).toISOString(), forecast: '0.6%', previous: '0.7%' }
];

export class NewsEngine {
  private events: EconomicEvent[] = [];

  constructor() {
    this.refreshEvents();
  }

  public refreshEvents(): void {
    // Generates active and upcoming high-impact economic calendar events
    const now = Date.now();
    this.events = SAMPLE_ECONOMIC_EVENTS.map((e, i) => ({
      ...e,
      id: `news_${now}_${i}`
    }));
  }

  public getUpcomingHighImpactEvents(windowMinutes: number = 180): EconomicEvent[] {
    const now = Date.now();
    const futureLimit = now + windowMinutes * 60000;

    return this.events.filter(e => {
      const time = new Date(e.eventTime).getTime();
      return e.impact === 'high' && time >= now - 15 * 60000 && time <= futureLimit;
    }).sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());
  }

  /**
   * Check if a specific time falls within a 30-minute buffer of a high-impact news event
   */
  public isNearHighImpactNews(timeIso: string, bufferMinutes: number = 30): { isNear: boolean; event?: EconomicEvent; minutesUntil?: number } {
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
