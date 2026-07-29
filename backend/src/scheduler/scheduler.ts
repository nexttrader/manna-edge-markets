import cron = require('node-cron');
import { mapTimestampToKillzone, KillzoneInfo } from './killzone-mapper';
import { Killzone } from '../discovery/types';

let scheduledTasks: cron.ScheduledTask[] = [];

export function startScheduler(onKillzoneBoundary: (kz: KillzoneInfo) => Promise<void>): void {
    // Schedule exact 02:00 ET, 08:00 ET, 14:00 ET, 20:00 ET boundaries using America/New_York timezone
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
            console.log(`⏱️ Killzone boundary cron triggered for ${b.expected} at ${now.toISOString()}`);
            
            if (kzInfo && kzInfo.killzone === b.expected) {
                try {
                    await onKillzoneBoundary(kzInfo);
                } catch (error) {
                    console.error(`Error in onKillzoneBoundary handler for ${b.expected}:`, error);
                }
            } else {
                console.log(`Killzone mismatch for ${b.expected} at ${now.toISOString()}`);
            }
        }, {
            timezone: 'America/New_York'
        });
        
        scheduledTasks.push(task);
    });
    
    console.log(`Scheduler started with ${scheduledTasks.length} America/New_York boundary jobs registered.`);
}

export function stopScheduler(): void {
    scheduledTasks.forEach(task => task.stop());
    scheduledTasks = [];
    console.log('Scheduler stopped.');
}

export async function triggerManualRun(killzone: Killzone): Promise<void> {
    console.log(`Manual run triggered for killzone: ${killzone}`);
}
