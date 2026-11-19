import { KillzoneInfo, Killzone } from '../discovery/types';
export { KillzoneInfo, Killzone };

export interface ETDateParts {
    year: number;
    month: number;
    day: number;
    weekday: string; // 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat'
    hour: number;
    minute: number;
}

const ET_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
});

export function getETDateParts(timestamp: Date): ETDateParts {
    const parts = ET_PARTS_FORMATTER.formatToParts(timestamp);
    const getVal = (type: string) => parts.find(p => p.type === type)?.value || '';
    return {
        year: parseInt(getVal('year'), 10),
        month: parseInt(getVal('month'), 10),
        day: parseInt(getVal('day'), 10),
        weekday: getVal('weekday'),
        hour: parseInt(getVal('hour'), 10) % 24,
        minute: parseInt(getVal('minute'), 10)
    };
}

export function mapTimestampToKillzone(timestamp: Date): KillzoneInfo | null {
    const { weekday, hour } = getETDateParts(timestamp);

    let killzone: Killzone | null = null;
    let boundaryET = '';

    // Sunday 17:00-19:59 ET is the weekly open heading into Monday Asia, never NY PM
    if (weekday === 'Sun' && hour >= 17 && hour < 20) {
        killzone = 'asia';
        boundaryET = '20:00';
    } else if (hour >= 20 || hour < 2) {
        killzone = 'asia';
        boundaryET = '20:00';
    } else if (hour >= 2 && hour < 8) {
        killzone = 'london';
        boundaryET = '02:00';
    } else if (hour >= 8 && hour < 14) {
        killzone = 'ny_am';
        boundaryET = '08:00';
    } else if (hour >= 14 && hour < 20) {
        killzone = 'ny_pm';
        boundaryET = '14:00';
    }

    if (!killzone) return null;

    return {
        killzone,
        name: killzone.toUpperCase(),
        boundaryET,
        boundaryUTC: timestamp.toISOString()
    };
}

export function getCurrentKillzone(now: Date = new Date()): KillzoneInfo {
    const kz = mapTimestampToKillzone(now);
    if (!kz) {
        // Fallback safety
        return {
            killzone: 'asia',
            name: 'ASIA',
            boundaryET: '20:00',
            boundaryUTC: now.toISOString()
        };
    }
    return kz;
}

export function getNextKillzoneBoundary(now: Date): { killzone: Killzone; boundaryUTC: Date; boundaryET: string } {
    const { hour } = getETDateParts(now);

    let nextHour = 0;
    let killzone: Killzone = 'asia';
    let boundaryET = '20:00';

    if (hour >= 20 || hour < 2) {
        nextHour = 2;
        killzone = 'london';
        boundaryET = '02:00';
    } else if (hour >= 2 && hour < 8) {
        nextHour = 8;
        killzone = 'ny_am';
        boundaryET = '08:00';
    } else if (hour >= 8 && hour < 14) {
        nextHour = 14;
        killzone = 'ny_pm';
        boundaryET = '14:00';
    } else if (hour >= 14 && hour < 20) {
        nextHour = 20;
        killzone = 'asia';
        boundaryET = '20:00';
    }

    // Increment hours until we hit nextHour in NY time
    const nextDate = new Date(now.getTime());
    while (true) {
        nextDate.setHours(nextDate.getHours() + 1);
        if (getETDateParts(nextDate).hour === nextHour) {
            nextDate.setMinutes(0, 0, 0);
            break;
        }
    }

    return {
        killzone,
        boundaryUTC: nextDate,
        boundaryET
    };
}

export function getKillzoneBoundariesForDate(date: Date): KillzoneInfo[] {
    const boundaries: KillzoneInfo[] = [];

    const targetHours = [2, 8, 14, 20];
    const killzones: Killzone[] = ['london', 'ny_am', 'ny_pm', 'asia'];
    const etStrings = ['02:00', '08:00', '14:00', '20:00'];

    const current = new Date(date);
    current.setUTCHours(0, 0, 0, 0);

    for (let i = 0; i < 48; i++) {
        const { hour } = getETDateParts(current);
        const targetIndex = targetHours.indexOf(hour);

        if (targetIndex !== -1 && current.getUTCMinutes() === 0) {
            const exists = boundaries.find(b => b.killzone === killzones[targetIndex]);
            if (!exists) {
                boundaries.push({
                    killzone: killzones[targetIndex],
                    name: killzones[targetIndex].toUpperCase(),
                    boundaryET: etStrings[targetIndex],
                    boundaryUTC: current.toISOString()
                });
            }
        }
        current.setHours(current.getHours() + 1);
    }

    return boundaries;
}

export function isForexMarketOpen(timestamp: Date = new Date()): boolean {
    const { weekday, hour } = getETDateParts(timestamp);

    // Global Forex: Closes Friday 17:00 ET (5 PM) and re-opens Sunday 17:00 ET (5 PM)
    if (weekday === 'Fri' && hour >= 17) return false;
    if (weekday === 'Sat') return false;
    if (weekday === 'Sun' && hour < 17) return false;

    return true;
}

export function isFuturesMarketOpen(timestamp: Date = new Date()): boolean {
    const { weekday, hour } = getETDateParts(timestamp);

    // CME Futures: Closes Friday 17:00 ET (5 PM) and re-opens Sunday 18:00 ET (6 PM)
    if (weekday === 'Fri' && hour >= 17) return false;
    if (weekday === 'Sat') return false;
    if (weekday === 'Sun' && hour < 18) return false;

    // Daily maintenance halt: Monday through Thursday 17:00 to 18:00 ET
    if ((weekday === 'Mon' || weekday === 'Tue' || weekday === 'Wed' || weekday === 'Thu') && hour === 17) {
        return false;
    }

    return true;
}

export function isMarketOpen(timestamp: Date = new Date()): boolean {
    return isForexMarketOpen(timestamp);
}

/**
 * Returns true only during active institutional Mon-Fri trading sessions
 * (Sunday 20:00 ET Asia Killzone open through Friday 17:00 ET NY close).
 * Blocks closed weekend hours AND the illiquid Sunday 17:00-19:59 ET rollover gap
 * so signals and outcomes never land on Saturday or Sunday.
 */
export function isTradingSessionActive(
    market: 'futures' | 'forex' | 'both' = 'both',
    timestamp: Date = new Date()
): boolean {
    const { weekday, hour } = getETDateParts(timestamp);
    if (weekday === 'Sat') return false;
    if (weekday === 'Sun' && hour < 20) return false;
    if (weekday === 'Fri' && hour >= 17) return false;

    if (market === 'forex') return isForexMarketOpen(timestamp);
    if (market === 'futures') return isFuturesMarketOpen(timestamp);
    return isForexMarketOpen(timestamp) || isFuturesMarketOpen(timestamp);
}

/**
 * Maps a timestamp to its ET Trading Day (YYYY-MM-DD) and Killzone session.
 * Hours >= 20:00 ET roll forward into the next calendar day's Asia session.
 */
export function getETTradingDayAndSession(
    timestampOrIso: Date | string
): { tradingDay: string; weekdayNum: number; isWeekend: boolean; session: Killzone } | null {
    const dt = timestampOrIso instanceof Date ? timestampOrIso : new Date(timestampOrIso);
    if (Number.isNaN(dt.getTime())) return null;

    const { year, month, day, hour } = getETDateParts(dt);
    const tradingDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

    let session: Killzone;
    if (hour >= 20) {
        session = 'asia';
        tradingDate.setUTCDate(tradingDate.getUTCDate() + 1);
    } else if (hour < 2) {
        session = 'asia';
    } else if (hour >= 2 && hour < 8) {
        session = 'london';
    } else if (hour >= 8 && hour < 14) {
        session = 'ny_am';
    } else {
        session = 'ny_pm';
    }

    const tYear = tradingDate.getUTCFullYear();
    const tMonth = String(tradingDate.getUTCMonth() + 1).padStart(2, '0');
    const tDay = String(tradingDate.getUTCDate()).padStart(2, '0');
    const weekdayNum = tradingDate.getUTCDay(); // 0 = Sun, 6 = Sat

    return {
        tradingDay: `${tYear}-${tMonth}-${tDay}`,
        weekdayNum,
        isWeekend: weekdayNum === 0 || weekdayNum === 6,
        session
    };
}

/**
 * Returns true if the given timestamp occurred while the target market was closed
 * for the weekend (Fri >= 17:00 ET, Saturday, or Sun < market open).
 */
export function isWeekendMarketClosed(
    market: string | undefined,
    timestampOrIso: Date | string | null | undefined
): boolean {
    if (!timestampOrIso) return false;
    const dt = timestampOrIso instanceof Date ? timestampOrIso : new Date(timestampOrIso);
    if (Number.isNaN(dt.getTime())) return false;

    const { weekday, hour } = getETDateParts(dt);
    const isFx = (market || '').toLowerCase() === 'forex';
    if (weekday === 'Fri' && hour >= 17) return true;
    if (weekday === 'Sat') return true;
    if (weekday === 'Sun' && hour < (isFx ? 17 : 18)) return true;
    return false;
}

/**
 * Identifies trades that belong to Saturday/Sunday on the calendar or were
 * created, filled, or resolved during weekend market-closed hours.
 */
export function isWeekendTrade(trade: {
    market?: string | null;
    setup_market?: string | null;
    instrument?: string | null;
    time_exited?: string | null;
    execution_time?: string | null;
    resolved_at?: string | null;
    time_entered?: string | null;
    entry_triggered_at?: string | null;
    filled_at?: string | null;
    time_signaled?: string | null;
    created_at?: string | null;
}): boolean {
    const rawMarket = (trade.market || trade.setup_market || '').toLowerCase();
    const market = rawMarket === 'forex' || rawMarket === 'futures'
        ? rawMarket
        : (trade.instrument && trade.instrument.includes('/') ? 'forex' : 'futures');

    const exitTs = trade.time_exited || trade.execution_time || trade.resolved_at || trade.created_at;
    if (exitTs) {
        const td = getETTradingDayAndSession(exitTs);
        if (td?.isWeekend) return true;
        if (isWeekendMarketClosed(market, exitTs)) return true;
    }

    const signalTs = trade.time_signaled || trade.created_at;
    if (signalTs && isWeekendMarketClosed(market, signalTs)) return true;

    const entryTs = trade.time_entered || trade.entry_triggered_at || trade.filled_at;
    if (entryTs && isWeekendMarketClosed(market, entryTs)) return true;

    return false;
}

export const SCALP_TRACKING_START_DAY = '2026-11-19';
export const SCALP_TRACKING_START_ISO = '2026-11-19T16:15:00.000Z';
export const MTF_ALIGNMENT_START_ISO = SCALP_TRACKING_START_ISO;

export interface PreCutoffTradeLike {
    trading_style?: string | null;
    strategy_id?: string | null;
    metadata?: string | Record<string, any> | null;
    time_exited?: string | null;
    execution_time?: string | null;
    resolved_at?: string | null;
    updated_at?: string | null;
    time_signaled?: string | null;
    created_at?: string | null;
}

function matchesPreCutoffTimestampOrLegacyMeta(trade: PreCutoffTradeLike, cutoff: string): boolean {
    if (trade.metadata) {
        const metaStr = typeof trade.metadata === 'string'
            ? trade.metadata
            : JSON.stringify(trade.metadata);
        if (
            metaStr.includes('mtf_isolated_desk') &&
            !metaStr.includes('"engine":"manna_snd"') &&
            !metaStr.includes('mtf_manna_snd')
        ) {
            return true;
        }
    }

    const exitTs = trade.time_exited || trade.execution_time || trade.resolved_at || trade.updated_at || trade.created_at;
    const sigTs = trade.time_signaled || trade.created_at;

    if (cutoff.includes('T')) {
        const cutoffMs = new Date(cutoff).getTime();
        if (Number.isFinite(cutoffMs)) {
            if (exitTs) {
                const exitMs = new Date(exitTs).getTime();
                if (Number.isFinite(exitMs) && exitMs < cutoffMs) return true;
            }
            if (sigTs) {
                const sigMs = new Date(sigTs).getTime();
                if (Number.isFinite(sigMs) && sigMs < cutoffMs) return true;
            }
        }
    } else {
        if (exitTs) {
            const td = getETTradingDayAndSession(exitTs);
            if (td && td.tradingDay < cutoff) return true;
        }
        if (sigTs) {
            const td = getETTradingDayAndSession(sigTs);
            if (td && td.tradingDay < cutoff) return true;
        }
    }

    return false;
}

/**
 * Returns true if a Scalping or Swing trade belongs to before the Manna SnD parameter
 * alignment cutoff (`2026-11-19T16:15:00.000Z`) or carries legacy pre-alignment
 * `mtf_isolated_desk` metadata. Never flags Intraday strategies (`manna_snd`, `sentinel_v2`, etc.).
 */
export function isPreCutoffMtfTrade(
    trade: PreCutoffTradeLike,
    cutoff: string = MTF_ALIGNMENT_START_ISO
): boolean {
    const style = (trade.trading_style || '').toUpperCase();
    const strat = (trade.strategy_id || '').toLowerCase();
    const isScalp = style === 'SCALP' || strat === 'manna_scalper';
    const isSwing = style === 'SWING' || strat === 'manna_swing';
    if (!isScalp && !isSwing) return false;

    return matchesPreCutoffTimestampOrLegacyMeta(trade, cutoff);
}

/**
 * Returns true if a Scalping trade belongs to before the Manna SnD parameter
 * alignment cutoff (`2026-11-19T16:15:00.000Z`) or carries legacy pre-alignment
 * `mtf_isolated_desk` metadata, so historical pre-alignment scalp records are
 * excluded while live Manna SnD Scalping tracking runs cleanly onwards.
 */
export function isPreCutoffScalpTrade(
    trade: PreCutoffTradeLike,
    cutoff: string = SCALP_TRACKING_START_ISO
): boolean {
    const style = (trade.trading_style || '').toUpperCase();
    const strat = (trade.strategy_id || '').toLowerCase();
    if (style !== 'SCALP' && strat !== 'manna_scalper') return false;

    return matchesPreCutoffTimestampOrLegacyMeta(trade, cutoff);
}

export function getForexReopenTime(now: Date = new Date()): Date {
    const temp = new Date(now.getTime());
    temp.setMinutes(0, 0, 0);
    temp.setMilliseconds(0);
    for (let i = 0; i < 200; i++) {
        temp.setHours(temp.getHours() + 1);
        if (isForexMarketOpen(temp)) {
            return temp;
        }
    }
    return temp;
}

export function getFuturesReopenTime(now: Date = new Date()): Date {
    const temp = new Date(now.getTime());
    temp.setMinutes(0, 0, 0);
    temp.setMilliseconds(0);
    for (let i = 0; i < 200; i++) {
        temp.setHours(temp.getHours() + 1);
        if (isFuturesMarketOpen(temp)) {
            return temp;
        }
    }
    return temp;
}

