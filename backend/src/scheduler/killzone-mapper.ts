import { KillzoneInfo, Killzone } from '../discovery/types';
export { KillzoneInfo, Killzone };

export function mapTimestampToKillzone(timestamp: Date): KillzoneInfo | null {
    const formatOptions: Intl.DateTimeFormatOptions = { 
        timeZone: 'America/New_York', 
        hour: '2-digit', 
        hour12: false 
    };
    const formatter = new Intl.DateTimeFormat('en-US', formatOptions);
    const hourStr = formatter.format(timestamp);
    const hour = parseInt(hourStr, 10);
    
    let killzone: Killzone | null = null;
    let boundaryET = '';
    
    if (hour >= 20 || hour < 2) {
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

export function getCurrentKillzone(now: Date): KillzoneInfo {
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
    const formatOptions: Intl.DateTimeFormatOptions = { 
        timeZone: 'America/New_York', 
        hour: '2-digit', 
        hour12: false 
    };
    const formatter = new Intl.DateTimeFormat('en-US', formatOptions);
    const hourStr = formatter.format(now);
    const hour = parseInt(hourStr, 10);
    
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
        const nextHourStr = formatter.format(nextDate);
        if (parseInt(nextHourStr, 10) === nextHour) {
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
    
    const formatOptions: Intl.DateTimeFormatOptions = { 
        timeZone: 'America/New_York', 
        hour: '2-digit', 
        hour12: false 
    };
    const formatter = new Intl.DateTimeFormat('en-US', formatOptions);
    
    const current = new Date(date);
    current.setUTCHours(0, 0, 0, 0);
    
    for (let i = 0; i < 48; i++) {
        const hourStr = formatter.format(current);
        const hour = parseInt(hourStr, 10);
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
