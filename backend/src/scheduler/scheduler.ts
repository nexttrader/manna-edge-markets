import cron = require('node-cron');
import { mapTimestampToKillzone, KillzoneInfo } from './killzone-mapper';
import { Killzone } from '../discovery/types';

let scheduledTasks: cron.ScheduledTask[] = [];

export function startScheduler(
    onKillzoneBoundary: (kz: KillzoneInfo) => Promise<void>,
    onKillzoneMidpoint?: (kz: KillzoneInfo) => Promise<void>
): void {
    // 1. Killzone Start Boundaries (02:00, 08:00, 14:00, 20:00 ET)
    const boundaries: Array<{ cron: string; expected: Killzone }> = [
        { cron: '0 2 * * *', expected: 'london' },
        { cron: '0 8 * * *', expected: 'ny_am' },
        { cron: '0 14 * * *', expected: 'ny_pm' },
        { cron: '0 20 * * *', expected: 'asia' }
    ];

    boundaries.forEach(b => {
        const task = cron.schedule(b.cron, async () => {
            const now = new Date();
            const kzInfo = mapTimestampToKillzone(now);
            console.log(`⏱️ Killzone START boundary cron triggered for ${b.expected} at ${now.toISOString()}`);
            
            if (kzInfo && kzInfo.killzone === b.expected) {
                try {
                    await onKillzoneBoundary(kzInfo);
                } catch (error) {
                    console.error(`Error in onKillzoneBoundary handler for ${b.expected}:`, error);
                }
            }
        }, {
            timezone: 'America/New_York'
        });
        
        scheduledTasks.push(task);
    });

    // 2. Killzone Midpoint Booster Boundaries (05:00, 11:00, 17:00, 23:00 ET)
    const midpoints: Array<{ cron: string; expected: Killzone }> = [
        { cron: '0 5 * * *', expected: 'london' },
        { cron: '0 11 * * *', expected: 'ny_am' },
        { cron: '0 17 * * *', expected: 'ny_pm' },
        { cron: '0 23 * * *', expected: 'asia' }
    ];

    midpoints.forEach(m => {
        const task = cron.schedule(m.cron, async () => {
            const now = new Date();
            const kzInfo = mapTimestampToKillzone(now);
            console.log(`⏳ Killzone MIDPOINT boundary cron triggered for ${m.expected} at ${now.toISOString()}`);
            
            if (onKillzoneMidpoint && kzInfo && kzInfo.killzone === m.expected) {
                try {
                    await onKillzoneMidpoint(kzInfo);
                } catch (error) {
                    console.error(`Error in onKillzoneMidpoint handler for ${m.expected}:`, error);
                }
            }
        }, {
            timezone: 'America/New_York'
        });
        
        scheduledTasks.push(task);
    });
    
    console.log(`Scheduler started with ${scheduledTasks.length} America/New_York boundary & midpoint jobs registered.`);
}

export function stopScheduler(): void {
    scheduledTasks.forEach(task => task.stop());
    scheduledTasks = [];
    console.log('Scheduler stopped.');
}

export async function triggerManualRun(killzone: Killzone): Promise<void> {
    console.log(`Manual run triggered for killzone: ${killzone}`);
}
