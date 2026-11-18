export type MacroEventType = 'CPI' | 'NFP' | 'FOMC' | 'ELECTION';

export interface MacroCalendarEvent {
  dateStr: string; // YYYY-MM-DD (NY calendar date)
  type: MacroEventType;
  label: string;
  title: string;
  timeET: string;
  impactNote: string;
  hasSep?: boolean;
  forecast?: string;
  previous?: string;
  actual?: string;
  fromLiveFeed?: boolean;
}

const CPI_META = {
  type: 'CPI' as const,
  label: 'CPI',
  title: 'US Consumer Price Index (CPI)',
  timeET: '08:30 AM ET',
  impactNote: 'Major USD inflation print — triggers rapid repricing in yields, indices (NQ/ES), gold, and USD pairs at 08:30 ET.',
};

const NFP_META = {
  type: 'NFP' as const,
  label: 'NFP',
  title: 'US Non-Farm Payrolls (NFP)',
  timeET: '08:30 AM ET',
  impactNote: 'Flagship US labor report — frequently causes wide stop runs, spread expansion, and high-R directional swings at 08:30 ET.',
};

const FOMC_META = {
  type: 'FOMC' as const,
  label: 'FOMC',
  title: 'FOMC Rate Decision & Statement',
  timeET: '02:00 PM ET',
  impactNote: 'Federal Reserve policy announcement (14:00 ET) & Chair press conference (14:30 ET) — high two-sided volatility across all markets.',
};

const ELECTION_META = {
  type: 'ELECTION' as const,
  label: 'ELECTION',
  title: 'US Election Day',
  timeET: 'All Day ET',
  impactNote: 'US federal/general Election Day — elevated headline risk, positioning shifts, and overnight/post-election repricing across US indices (NQ/ES/YM), yields, gold, and USD pairs.',
};

const MACRO_META_BY_TYPE: Record<MacroEventType, typeof CPI_META | typeof NFP_META | typeof FOMC_META | typeof ELECTION_META> = {
  CPI: CPI_META,
  NFP: NFP_META,
  FOMC: FOMC_META,
  ELECTION: ELECTION_META,
};

// Official US BLS CPI release dates (2025–2027)
const CPI_DATES: readonly string[] = [
  // 2025 (Oct 2025 index omitted by BLS due to federal lapse in appropriations; Nov 2025 delayed to Dec 18)
  '2025-01-15', '2025-02-12', '2025-03-12', '2025-04-10', '2025-05-13', '2025-06-11',
  '2025-07-15', '2025-08-12', '2025-09-11', '2025-10-24', '2025-12-18',
  // 2026
  '2026-01-13', '2026-02-13', '2026-03-11', '2026-04-10', '2026-05-12', '2026-06-10',
  '2026-07-14', '2026-08-12', '2026-09-11', '2026-10-14', '2026-11-10', '2026-12-10',
  // 2027
  '2027-01-13', '2027-02-11', '2027-03-10', '2027-04-13', '2027-05-12', '2027-06-10',
  '2027-07-14', '2027-08-11', '2027-09-14', '2027-10-14', '2027-11-10', '2027-12-10',
];

// Official US BLS Employment Situation (NFP) release dates (2025–2027)
const NFP_DATES: readonly string[] = [
  // 2025 (Sep/Nov 2025 releases delayed due to federal lapse in appropriations)
  '2025-01-10', '2025-02-07', '2025-03-07', '2025-04-04', '2025-05-02', '2025-06-06',
  '2025-07-03', '2025-08-01', '2025-09-05', '2025-11-20', '2025-12-16',
  // 2026
  '2026-01-09', '2026-02-11', '2026-03-06', '2026-04-03', '2026-05-08', '2026-06-05',
  '2026-07-02', '2026-08-07', '2026-09-04', '2026-10-02', '2026-11-06', '2026-12-04',
  // 2027
  '2027-01-08', '2027-02-05', '2027-03-05', '2027-04-02', '2027-05-07', '2027-06-04',
  '2027-07-02', '2027-08-06', '2027-09-03', '2027-10-08', '2027-11-05', '2027-12-03',
];

// Official Federal Reserve FOMC Rate Decision / Statement dates (2025–2027)
const FOMC_DATES: readonly { dateStr: string; hasSep: boolean }[] = [
  // 2025
  { dateStr: '2025-01-29', hasSep: false },
  { dateStr: '2025-03-19', hasSep: true },
  { dateStr: '2025-05-07', hasSep: false },
  { dateStr: '2025-06-18', hasSep: true },
  { dateStr: '2025-07-30', hasSep: false },
  { dateStr: '2025-09-17', hasSep: true },
  { dateStr: '2025-10-29', hasSep: false },
  { dateStr: '2025-12-10', hasSep: true },
  // 2026
  { dateStr: '2026-01-28', hasSep: false },
  { dateStr: '2026-03-18', hasSep: true },
  { dateStr: '2026-04-29', hasSep: false },
  { dateStr: '2026-06-17', hasSep: true },
  { dateStr: '2026-07-29', hasSep: false },
  { dateStr: '2026-09-16', hasSep: true },
  { dateStr: '2026-10-28', hasSep: false },
  { dateStr: '2026-12-09', hasSep: true },
  // 2027 (Oct 26-27 2027 is a strategy-only meeting with no rate statement)
  { dateStr: '2027-01-27', hasSep: false },
  { dateStr: '2027-03-17', hasSep: true },
  { dateStr: '2027-04-28', hasSep: false },
  { dateStr: '2027-06-09', hasSep: true },
  { dateStr: '2027-07-28', hasSep: false },
  { dateStr: '2027-09-15', hasSep: true },
  { dateStr: '2027-11-17', hasSep: false },
];

// Official US General Election Days (Tuesday next after the first Monday in November, 2024–2027)
const ELECTION_DATES: readonly { dateStr: string; title: string }[] = [
  { dateStr: '2024-11-05', title: 'US Presidential & General Election Day' },
  { dateStr: '2025-11-04', title: 'US Off-Year General Election Day' },
  { dateStr: '2026-11-03', title: 'US Midterm General Election Day' },
  { dateStr: '2027-11-02', title: 'US Off-Year General Election Day' },
];

export const STATIC_MACRO_EVENTS_BY_DATE: Record<string, MacroCalendarEvent[]> = (() => {
  const map: Record<string, MacroCalendarEvent[]> = {};
  const add = (ev: MacroCalendarEvent) => {
    if (!map[ev.dateStr]) map[ev.dateStr] = [];
    map[ev.dateStr].push(ev);
  };

  for (const dateStr of CPI_DATES) {
    add({ dateStr, ...CPI_META });
  }
  for (const dateStr of NFP_DATES) {
    add({ dateStr, ...NFP_META });
  }
  for (const { dateStr, hasSep } of FOMC_DATES) {
    add({
      dateStr,
      ...FOMC_META,
      hasSep,
      title: hasSep
        ? 'FOMC Rate Decision, Statement & Dot Plot (SEP)'
        : FOMC_META.title,
    });
  }
  for (const { dateStr, title } of ELECTION_DATES) {
    add({
      dateStr,
      ...ELECTION_META,
      title,
    });
  }

  return map;
})();

export interface LiveFeedEventLike {
  title?: string;
  country?: string;
  currency?: string;
  impact?: string;
  eventTime?: string;
  forecast?: string;
  previous?: string;
  actual?: string;
}

/**
 * Classifies high-impact USD live calendar events into CPI, NFP, or FOMC.
 * Excludes ADP payrolls, minor FOMC member speeches, and FOMC meeting minutes.
 */
export function classifyLiveMacroEvent(event: LiveFeedEventLike): MacroEventType | null {
  const currency = (event.currency || event.country || '').toUpperCase();
  if (currency !== 'USD') return null;
  if ((event.impact || '').toLowerCase() !== 'high') return null;

  const title = (event.title || '').trim().toLowerCase();
  if (!title) return null;

  if (title.includes('cpi') || title.includes('consumer price index')) {
    return 'CPI';
  }

  if (
    !title.includes('adp') &&
    (title.includes('non-farm') ||
      title.includes('nonfarm') ||
      title.includes('payrolls') ||
      title.includes('nfp'))
  ) {
    return 'NFP';
  }

  if (
    !title.includes('speaks') &&
    !title.includes('speaking') &&
    !title.includes('minutes') &&
    (title.includes('federal funds rate') ||
      title.includes('fomc statement') ||
      title.includes('fomc economic projections') ||
      title.includes('fomc press conference') ||
      title.includes('fomc'))
  ) {
    return 'FOMC';
  }

  return null;
}

export function formatIsoToNYDateStr(isoTime: string): string | null {
  const parsed = new Date(isoTime);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed);
}

export function formatIsoToNYTimeLabel(isoTime: string): string {
  const parsed = new Date(isoTime);
  if (Number.isNaN(parsed.getTime())) return '';
  return (
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(parsed) + ' ET'
  );
}

/**
 * Merges static official 2025–2027 CPI/NFP/FOMC dates with any live NewsEngine events,
 * enriching matching dates with Forecast / Previous / Actual numbers when available.
 */
export function buildMacroEventsMap(
  liveEvents: LiveFeedEventLike[] = []
): Record<string, MacroCalendarEvent[]> {
  const merged: Record<string, MacroCalendarEvent[]> = {};

  for (const [dateStr, events] of Object.entries(STATIC_MACRO_EVENTS_BY_DATE)) {
    merged[dateStr] = events.map((ev) => ({ ...ev }));
  }

  for (const raw of liveEvents) {
    if (!raw.eventTime) continue;
    const type = classifyLiveMacroEvent(raw);
    if (!type) continue;

    const dateStr = formatIsoToNYDateStr(raw.eventTime);
    if (!dateStr) continue;

    const baseMeta = MACRO_META_BY_TYPE[type];
    const existingList = (merged[dateStr] ??= []);
    const existing = existingList.find((item) => item.type === type);
    const liveTime = formatIsoToNYTimeLabel(raw.eventTime);

    if (existing) {
      if (raw.forecast && !existing.forecast) existing.forecast = raw.forecast;
      if (raw.previous && !existing.previous) existing.previous = raw.previous;
      if (raw.actual && !existing.actual) existing.actual = raw.actual;
      existing.fromLiveFeed = true;
    } else {
      existingList.push({
        dateStr,
        ...baseMeta,
        title: raw.title?.trim() || baseMeta.title,
        timeET: liveTime || baseMeta.timeET,
        forecast: raw.forecast,
        previous: raw.previous,
        actual: raw.actual,
        fromLiveFeed: true,
      });
    }
  }

  return merged;
}

/**
 * Returns today's calendar date as YYYY-MM-DD without UTC midnight drift.
 */
export function getTodayPlainDateStr(): string {
  const temporalNow = (globalThis as { Temporal?: { Now?: { plainDateISO?: () => { toString: () => string } } } })
    .Temporal?.Now?.plainDateISO;
  if (typeof temporalNow === 'function') {
    return temporalNow().toString();
  }
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatPlainDateHeading(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  // Construct UTC noon from plain calendar components so weekday/month formatting never shifts across zones
  const safeUtcNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return safeUtcNoon.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
