import cron from 'node-cron';
import { getAllUsers, pauseUserSubscription, resumeUserSubscription } from '../db/user-store.js';
import { sendNotificationToUser, recordAuditLog } from '../db/user-management-store.js';

export async function checkSubscriptionAndTrialExpirations(): Promise<{
  checkedCount: number;
  autoResumedCount: number;
  expiredTrialsCount: number;
  notificationsSentCount: number;
}> {
  const users = await getAllUsers();
  const now = Date.now();
  let autoResumedCount = 0;
  let expiredTrialsCount = 0;
  let notificationsSentCount = 0;

  for (const user of users) {
    // 1. Auto-resume paused subscriptions if pauseResumeDate has arrived
    if (user.status === 'paused' && user.pauseResumeDate) {
      const resumeTime = new Date(user.pauseResumeDate).getTime();
      if (now >= resumeTime) {
        await resumeUserSubscription(user.id);
        autoResumedCount++;
        await sendNotificationToUser(
          user.id,
          'Subscription Resumed',
          'Your subscription pause period has completed. Access to Manna Edge Markets has been automatically restored.',
          'sub_resumed'
        );
        notificationsSentCount++;
      }
    }

    // 2. Evaluate Trial Expirations & Warnings
    if (user.isTrial && user.trialExpiresAt) {
      const expiryMs = new Date(user.trialExpiresAt).getTime();
      const remainingMs = expiryMs - now;
      const daysLeft = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));

      if (remainingMs <= 0 && !user.trialExpired) {
        user.trialExpired = true;
        user.trialDaysRemaining = 0;
        user.status = 'expired';
        expiredTrialsCount++;
        await sendNotificationToUser(
          user.id,
          'VIP Trial Expired',
          'Your VIP trial pass for Manna Edge Markets has expired. Upgrade your plan to continue accessing live signals.',
          'trial_expiring'
        );
        notificationsSentCount++;
      } else if (daysLeft === 7 || daysLeft === 3 || daysLeft === 1) {
        await sendNotificationToUser(
          user.id,
          `Trial Expiring in ${daysLeft} Day${daysLeft > 1 ? 's' : ''}`,
          `Your trial pass expires in ${daysLeft} day${daysLeft > 1 ? 's' : ''}. Secure your subscription to prevent signal access interruption.`,
          'trial_expiring'
        );
        notificationsSentCount++;
      }
    }

    // 3. Evaluate Paid Subscription Expirations & Warnings
    if (!user.isTrial && user.subscriptionEnd && user.status === 'active') {
      const expiryMs = new Date(user.subscriptionEnd).getTime();
      const remainingMs = expiryMs - now;
      const daysLeft = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));

      if (remainingMs <= 0) {
        user.status = 'expired';
        user.subscriptionStatus = 'expired';
        await sendNotificationToUser(
          user.id,
          'Subscription Expired',
          'Your subscription to Manna Edge Markets has expired. Please renew to restore live market signal access.',
          'sub_expiring'
        );
        notificationsSentCount++;
      } else if (daysLeft === 7 || daysLeft === 3 || daysLeft === 1) {
        await sendNotificationToUser(
          user.id,
          `Subscription Expiring in ${daysLeft} Day${daysLeft > 1 ? 's' : ''}`,
          `Your subscription will expire in ${daysLeft} day${daysLeft > 1 ? 's' : ''}. Renew today to stay ahead of market killzones.`,
          'sub_expiring'
        );
        notificationsSentCount++;
      }
    }
  }

  if (autoResumedCount > 0 || expiredTrialsCount > 0 || notificationsSentCount > 0) {
    await recordAuditLog({
      adminEmail: 'System Cron Scheduler',
      adminRole: 'super_admin',
      action: 'CRON_EXPIRATION_RUN',
      detailsJson: JSON.stringify({ checkedCount: users.length, autoResumedCount, expiredTrialsCount, notificationsSentCount })
    });
  }

  return {
    checkedCount: users.length,
    autoResumedCount,
    expiredTrialsCount,
    notificationsSentCount
  };
}

export function startSubscriptionScheduler() {
  console.log('⏳ Starting Automated User Subscription & Trial Expiry Scheduler...');
  // Run daily at 00:00 midnight
  cron.schedule('0 0 * * *', async () => {
    try {
      console.log('⏰ Running daily User Subscription & Trial Expiry evaluation...');
      const res = await checkSubscriptionAndTrialExpirations();
      console.log(`✅ Subscription Cron completed: Checked ${res.checkedCount} users, Auto-resumed ${res.autoResumedCount}, Notifications sent ${res.notificationsSentCount}`);
    } catch (e: any) {
      console.error('⚠️ Error running subscription cron:', e.message);
    }
  });

  // Also run immediate pass on server start
  setTimeout(async () => {
    try {
      await checkSubscriptionAndTrialExpirations();
    } catch (e: any) {
      console.error('⚠️ Error on initial subscription check:', e.message);
    }
  }, 5000);
}
