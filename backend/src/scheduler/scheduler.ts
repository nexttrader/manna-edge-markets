import cron = require('node-cron');
import { mapTimestampToKillzone, KillzoneInfo } from './killzone-mapper';
import { Killzone } from '../discovery/types';
import { autoGenerateSessionPerformanceReports } from '../analytics/report-generator';
import { signalAuditService } from '../analytics/signal-audit-service';
import { earlyScanService } from './early-scan-service';

let scheduledTasks: cron.ScheduledTask[] = [];

export function startScheduler(
    onKillzoneBoundary: (kz: KillzoneInfo) => Promise<void>,
    onKillzoneMidpoint?: (kz: KillzoneInfo) => Promise<void>,
    onEarlyForexScan?: (kz: KillzoneInfo) => Promise<void>
): void {
    // 1. Killzone Start Boundaries (02:00, 08:00, 13:00/14:00, 20:00 ET)
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
                    await autoGenerateSessionPerformanceReports(b.expected);
                    if (b.expected === 'ny_am') {
                        earlyScanService.markCompleted(now);
                    }
                } catch (error) {
                    console.error(`Error in onKillzoneBoundary handler for ${b.expected}:`, error);
                }
            }
        }, {
            timezone: 'America/New_York'
        });
        
        scheduledTasks.push(task);
    });

    // 2. Killzone Midpoint Booster Boundaries (03:30 ET London, 09:30 ET NY AM, 14:30 ET NY PM, 21:30 ET Asia)
    const midpoints: Array<{ cron: string; expected: Killzone; label: string }> = [
        { cron: '30 3 * * *', expected: 'london', label: '03:30 ET (London Midpoint)' },
        { cron: '30 9 * * *', expected: 'ny_am', label: '09:30 ET (NY AM Midpoint)' },
        { cron: '30 14 * * *', expected: 'ny_pm', label: '14:30 ET (NY PM Midpoint)' },
        { cron: '30 21 * * *', expected: 'asia', label: '21:30 ET (Asia Midpoint)' }
    ];

    midpoints.forEach(m => {
        const task = cron.schedule(m.cron, async () => {
            const now = new Date();
            const kzInfo = mapTimestampToKillzone(now);
            console.log(`⏳ Killzone MIDPOINT boundary cron triggered for ${m.expected} (${m.label}) at ${now.toISOString()}`);
            
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

    // 3. 30 Minutes Prior to Every Session Scan: Signal-by-Signal Processing Audit Report
    // London: 01:30 ET (scan at 02:00)
    // NY AM:  07:30 ET (scan at 08:00)
    // NY PM:  13:30 ET (scan at 14:00)
    // Asia:   19:30 ET (scan at 20:00)
    const preScanAudits: Array<{ cron: string; targetSession: string; label: string }> = [
        { cron: '30 1 * * *', targetSession: 'london', label: '01:30 ET (30m Pre-London Scan)' },
        { cron: '30 7 * * *', targetSession: 'ny_am',  label: '07:30 ET (30m Pre-NY AM Scan)' },
        { cron: '30 13 * * *', targetSession: 'ny_pm', label: '13:30 ET (30m Pre-NY PM Scan)' },
        { cron: '30 19 * * *', targetSession: 'asia',  label: '19:30 ET (30m Pre-Asia Scan)' }
    ];

    preScanAudits.forEach(audit => {
        const task = cron.schedule(audit.cron, async () => {
            const now = new Date();
            console.log(`📋 30-Minute Pre-Scan Signal Audit triggered for ${audit.targetSession.toUpperCase()} (${audit.label}) at ${now.toISOString()}`);
            try {
                await signalAuditService.runScheduledPreScanAudit(audit.targetSession);
            } catch (error) {
                console.error(`Error in 30-minute pre-scan audit for ${audit.targetSession}:`, error);
            }
        }, {
            timezone: 'America/New_York'
        });

        scheduledTasks.push(task);
    });

    // 4. Early Scan Telegram Warning Notice Check (07:00 ET Mon-Fri)
    const earlyNoticeTask = cron.schedule('0 7 * * 1-5', async () => {
        try {
            await earlyScanService.checkAndSendNotice();
        } catch (error) {
            console.error('Error in early scan notice check at 07:00 ET:', error);
        }
    }, {
        timezone: 'America/New_York'
    });
    scheduledTasks.push(earlyNoticeTask);

    // 5. NY AM High-Impact News: Dynamic Pre-News Early Forex Scan (30m prior to earliest news)
    // Checks every minute Mon-Fri between 07:00 and 07:59 ET for an early scan (<08:00 ET) timed 30m prior to news
    const earlyForexScanTask = cron.schedule('* 7 * * 1-5', async () => {
        const now = new Date();
        try {
            if (earlyScanService.isEarlyScanDue(now)) {
                const status = earlyScanService.getStatus(now);
                console.log(`⚡ NY AM High-Impact News: Executing Early Forex Scan at ${status.earlyScanTimeET} (${now.toISOString()})`);
                const kzInfo: KillzoneInfo = {
                    killzone: 'ny_am',
                    name: 'NY_AM',
                    boundaryET: `${String(status.scanHour).padStart(2, '0')}:${String(status.scanMinute).padStart(2, '0')}`,
                    boundaryUTC: now.toISOString()
                };
                if (onEarlyForexScan) {
                    await onEarlyForexScan(kzInfo);
                }
                earlyScanService.markCompleted(now);
            }
        } catch (error) {
            console.error('Error executing dynamic pre-news early Forex scan:', error);
        }
    }, {
        timezone: 'America/New_York'
    });
    scheduledTasks.push(earlyForexScanTask);

    // Initial startup check for warning notice if within 07:00-07:30 ET window
    setTimeout(async () => {
        try {
            await earlyScanService.checkAndSendNotice();
        } catch (err) {
            // Ignore startup check errors
        }
    }, 5000);
    
    console.log(`Scheduler started with ${scheduledTasks.length} America/New_York boundary, midpoint, pre-scan & early-scan jobs registered.`);
}

export function stopScheduler(): void {
    scheduledTasks.forEach(task => task.stop());
    scheduledTasks = [];
    console.log('Scheduler stopped.');
}

export async function triggerManualRun(killzone: Killzone): Promise<void> {
    console.log(`Manual run triggered for killzone: ${killzone}`);
}
