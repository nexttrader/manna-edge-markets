import { queryDb, isPg } from './database.js';
import { UserProfile, getAllUsers, findUserByEmail } from './user-store.js';
import { v4 as uuidv4 } from 'uuid';

export interface ExtendedUserProfile extends UserProfile {
  subscriptionStatus?: 'active' | 'trialing' | 'paused' | 'expired' | 'canceled';
  subscriptionStart?: string;
  subscriptionEnd?: string;
  billingCycle?: 'monthly' | 'yearly' | 'custom' | 'lifetime';
  autoRenew?: boolean;
  pauseStartDate?: string;
  pauseResumeDate?: string;
  pausedRemainingDays?: number;
  trialStartedAt?: string;
  trialDaysTotal?: number;
  trialExtendedCount?: number;
  tags?: string[];
  groups?: string[];
}

export interface Coupon {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed_amount' | 'trial_extension' | 'tier_upgrade';
  discountValue: number;
  validFrom: string;
  validUntil?: string;
  maxRedemptions: number;
  currentRedemptions: number;
  perUserLimit: number;
  applicableTiers: string;
  status: 'active' | 'disabled' | 'expired';
  createdBy?: string;
  createdAt: string;
}

export interface CouponRedemption {
  id: string;
  couponId: string;
  couponCode: string;
  userId: string;
  userEmail: string;
  discountApplied: string;
  redeemedAt: string;
}

export interface UserTag {
  id: string;
  name: string;
  color: string;
  description?: string;
  createdAt: string;
}

export interface UserGroup {
  id: string;
  name: string;
  description?: string;
  tierAssignment: string;
  createdAt: string;
  memberCount?: number;
}

export interface NotificationItem {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationTrigger {
  id: string;
  eventType: string;
  thresholdDays: number;
  templateTitle: string;
  templateBody: string;
  enabled: boolean;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  adminEmail: string;
  adminRole: string;
  action: string;
  targetUserId?: string;
  detailsJson?: string;
  createdAt: string;
}

// In-Memory Storage for High-Speed Fallback / Preloaded Sync
let localCoupons: Coupon[] = [
  {
    id: 'cpn_welcome21',
    code: 'WELCOME21',
    discountType: 'trial_extension',
    discountValue: 21,
    validFrom: new Date().toISOString(),
    maxRedemptions: 500,
    currentRedemptions: 12,
    perUserLimit: 1,
    applicableTiers: 'all',
    status: 'active',
    createdBy: 'System Super Admin',
    createdAt: new Date().toISOString()
  },
  {
    id: 'cpn_kdt50off',
    code: 'KDT50OFF',
    discountType: 'percentage',
    discountValue: 50,
    validFrom: new Date().toISOString(),
    validUntil: new Date(Date.now() + 90 * 86400000).toISOString(),
    maxRedemptions: 100,
    currentRedemptions: 34,
    perUserLimit: 1,
    applicableTiers: 'futures_forex',
    status: 'active',
    createdBy: 'brian_king',
    createdAt: new Date().toISOString()
  }
];

let localTags: UserTag[] = [
  { id: 'tag_vip', name: 'VIP Trader', color: '#8b5cf6', description: 'High lifetime value subscriber', createdAt: new Date().toISOString() },
  { id: 'tag_beta', name: 'Beta Tester', color: '#ec4899', description: 'Early access features', createdAt: new Date().toISOString() },
  { id: 'tag_at_risk', name: 'At Risk', color: '#ef4444', description: 'Trial or subscription expiring soon', createdAt: new Date().toISOString() },
  { id: 'tag_kdt', name: 'KDT Member', color: '#10b981', description: 'Kingdom Day Traders community', createdAt: new Date().toISOString() }
];

let localGroups: UserGroup[] = [
  { id: 'grp_kdt_futures', name: 'KDT Futures Cohort Q3', description: 'Futures mastery cohort members', tierAssignment: 'futures_forex', createdAt: new Date().toISOString(), memberCount: 14 },
  { id: 'grp_forex_vip', name: 'Forex VIP Inner Circle', description: 'High conviction Forex signals group', tierAssignment: 'forex_only', createdAt: new Date().toISOString(), memberCount: 8 }
];

let localTagMappings: { userId: string; tagId: string }[] = [
  { userId: 'usr_joette', tagId: 'tag_vip' },
  { userId: 'usr_deven', tagId: 'tag_beta' },
  { userId: 'usr_cindy', tagId: 'tag_kdt' }
];

let localGroupMappings: { userId: string; groupId: string }[] = [
  { userId: 'usr_joette', groupId: 'grp_kdt_futures' },
  { userId: 'usr_deven', groupId: 'grp_forex_vip' }
];

let localAuditLogs: AuditLog[] = [
  {
    id: `audit_${Date.now()}_1`,
    adminEmail: 'chadwinsolomon@gmail.com',
    adminRole: 'super_admin',
    action: 'SYSTEM_INIT',
    detailsJson: JSON.stringify({ message: 'User Management System Initialized' }),
    createdAt: new Date().toISOString()
  }
];

let localNotifications: NotificationItem[] = [];

// ==========================================
// AUDIT LOG SERVICES
// ==========================================
export function recordAuditLog(log: Omit<AuditLog, 'id' | 'createdAt'>): AuditLog {
  const item: AuditLog = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    ...log,
    createdAt: new Date().toISOString()
  };
  localAuditLogs.unshift(item);
  try {
    queryDb(
      `INSERT INTO admin_audit_logs (id, admin_email, admin_role, action, target_user_id, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [item.id, item.adminEmail, item.adminRole, item.action, item.targetUserId || null, item.detailsJson || null, item.createdAt]
    ).catch(() => {});
  } catch {}
  return item;
}

export function getAuditLogs(): AuditLog[] {
  return localAuditLogs;
}

// ==========================================
// COUPON SERVICES
// ==========================================
export function getCoupons(): Coupon[] {
  return localCoupons;
}

export function createCoupon(couponData: Omit<Coupon, 'id' | 'currentRedemptions' | 'createdAt'>): Coupon {
  const newCoupon: Coupon = {
    id: `cpn_${Date.now()}_${Math.random().toString(36).substring(2, 4)}`,
    ...couponData,
    currentRedemptions: 0,
    createdAt: new Date().toISOString()
  };
  localCoupons.unshift(newCoupon);
  recordAuditLog({
    adminEmail: couponData.createdBy || 'Admin',
    adminRole: 'admin',
    action: 'COUPON_CREATED',
    detailsJson: JSON.stringify({ code: newCoupon.code, discountType: newCoupon.discountType, value: newCoupon.discountValue })
  });
  return newCoupon;
}

export function updateCouponStatus(couponId: string, status: 'active' | 'disabled' | 'expired', adminEmail: string = 'Admin'): Coupon | null {
  const coupon = localCoupons.find(c => c.id === couponId || c.code.toUpperCase() === couponId.toUpperCase());
  if (!coupon) return null;
  coupon.status = status;
  recordAuditLog({
    adminEmail,
    adminRole: 'admin',
    action: 'COUPON_STATUS_UPDATED',
    detailsJson: JSON.stringify({ couponId: coupon.id, newStatus: status })
  });
  return coupon;
}

export function applyCouponToUser(
  couponCode: string,
  userEmail: string,
  adminEmail: string = 'Admin'
): { success: boolean; message: string; discountDetail?: string } {
  const coupon = localCoupons.find(c => c.code.trim().toUpperCase() === couponCode.trim().toUpperCase());
  if (!coupon) {
    return { success: false, message: 'Invalid or non-existent coupon code.' };
  }
  if (coupon.status !== 'active') {
    return { success: false, message: `Coupon ${coupon.code} is currently ${coupon.status}.` };
  }
  if (coupon.validUntil && new Date(coupon.validUntil).getTime() < Date.now()) {
    coupon.status = 'expired';
    return { success: false, message: `Coupon ${coupon.code} has expired.` };
  }
  if (coupon.currentRedemptions >= coupon.maxRedemptions) {
    return { success: false, message: `Coupon ${coupon.code} has reached maximum redemption limit (${coupon.maxRedemptions}).` };
  }

  const user = findUserByEmail(userEmail);
  if (!user) {
    return { success: false, message: `User profile with email ${userEmail} not found.` };
  }

  coupon.currentRedemptions++;
  const redemptionDetail = `Applied ${coupon.discountType} discount (${coupon.discountValue}) to ${user.name}`;

  recordAuditLog({
    adminEmail,
    adminRole: 'admin',
    action: 'COUPON_REDEEMED',
    targetUserId: user.id,
    detailsJson: JSON.stringify({ couponCode: coupon.code, userEmail, redemptionDetail })
  });

  return { success: true, message: `Coupon ${coupon.code} successfully applied!`, discountDetail: redemptionDetail };
}

// ==========================================
// TAGS & GROUPS SERVICES
// ==========================================
export function getTags(): UserTag[] {
  return localTags;
}

export function createTag(name: string, color: string = '#3b82f6', description?: string): UserTag {
  const existing = localTags.find(t => t.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  const tag: UserTag = {
    id: `tag_${Date.now()}`,
    name,
    color,
    description,
    createdAt: new Date().toISOString()
  };
  localTags.push(tag);
  return tag;
}

export function deleteTag(tagId: string): boolean {
  localTags = localTags.filter(t => t.id !== tagId);
  localTagMappings = localTagMappings.filter(m => m.tagId !== tagId);
  return true;
}

export function assignTagToUser(userId: string, tagId: string): boolean {
  const existing = localTagMappings.find(m => m.userId === userId && m.tagId === tagId);
  if (!existing) {
    localTagMappings.push({ userId, tagId });
  }
  return true;
}

export function removeTagFromUser(userId: string, tagId: string): boolean {
  localTagMappings = localTagMappings.filter(m => !(m.userId === userId && m.tagId === tagId));
  return true;
}

export function getUserTags(userId: string): UserTag[] {
  const tagIds = localTagMappings.filter(m => m.userId === userId).map(m => m.tagId);
  return localTags.filter(t => tagIds.includes(t.id));
}

export function getGroups(): UserGroup[] {
  return localGroups.map(g => {
    const count = localGroupMappings.filter(m => m.groupId === g.id).length;
    return { ...g, memberCount: count };
  });
}

export function createGroup(name: string, description?: string, tierAssignment: string = 'futures_forex'): UserGroup {
  const group: UserGroup = {
    id: `grp_${Date.now()}`,
    name,
    description,
    tierAssignment,
    createdAt: new Date().toISOString(),
    memberCount: 0
  };
  localGroups.push(group);
  return group;
}

export function assignUserToGroup(userId: string, groupId: string): boolean {
  const existing = localGroupMappings.find(m => m.userId === userId && m.groupId === groupId);
  if (!existing) {
    localGroupMappings.push({ userId, groupId });
  }
  return true;
}

export function removeUserFromGroup(userId: string, groupId: string): boolean {
  localGroupMappings = localGroupMappings.filter(m => !(m.userId === userId && m.groupId === groupId));
  return true;
}

export function getUserGroups(userId: string): UserGroup[] {
  const groupIds = localGroupMappings.filter(m => m.userId === userId).map(m => m.groupId);
  return localGroups.filter(g => groupIds.includes(g.id));
}

// ==========================================
// NOTIFICATIONS SERVICES
// ==========================================
export function sendNotificationToUser(userId: string, title: string, message: string, type: string = 'announcement'): NotificationItem {
  const notif: NotificationItem = {
    id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 4)}`,
    userId,
    type,
    title,
    message,
    isRead: false,
    createdAt: new Date().toISOString()
  };
  localNotifications.unshift(notif);
  return notif;
}

export function broadcastNotification(
  targetType: 'all' | 'tag' | 'group',
  targetId: string | null,
  title: string,
  message: string,
  adminEmail: string
): { recipientCount: number } {
  const users = getAllUsers();
  let recipients: UserProfile[] = [];

  if (targetType === 'all') {
    recipients = users;
  } else if (targetType === 'tag' && targetId) {
    const userIds = localTagMappings.filter(m => m.tagId === targetId).map(m => m.userId);
    recipients = users.filter(u => userIds.includes(u.id));
  } else if (targetType === 'group' && targetId) {
    const userIds = localGroupMappings.filter(m => m.groupId === targetId).map(m => m.userId);
    recipients = users.filter(u => userIds.includes(u.id));
  }

  for (const user of recipients) {
    sendNotificationToUser(user.id, title, message, 'announcement');
  }

  recordAuditLog({
    adminEmail,
    adminRole: 'admin',
    action: 'BROADCAST_NOTIFICATION_SENT',
    detailsJson: JSON.stringify({ targetType, targetId, recipientCount: recipients.length, title })
  });

  return { recipientCount: recipients.length };
}

export function getNotificationsForUser(userId: string): NotificationItem[] {
  return localNotifications.filter(n => n.userId === userId);
}

export function getNotificationLogs(): NotificationItem[] {
  return localNotifications;
}

// ==========================================
// CUSTOM TRIAL TEMPLATES & ASSIGNMENT
// ==========================================
export interface CustomTrialTemplate {
  id: string;
  name: string;
  days?: number;
  expiryDate?: string;
  tier: 'futures_forex' | 'forex_only' | 'free';
  strategyAccess: 'all' | 'sentinel_v2' | 'manna_snd';
  maxSignals: number;
  allowCalculators: boolean;
  createdAt: string;
  createdBy?: string;
}

let localTrialTemplates: CustomTrialTemplate[] = [
  {
    id: 'trial_preset_14d_vip',
    name: '14-Day VIP Full Access Trial',
    days: 14,
    tier: 'futures_forex',
    strategyAccess: 'all',
    maxSignals: 6,
    allowCalculators: true,
    createdAt: new Date().toISOString(),
    createdBy: 'system'
  },
  {
    id: 'trial_preset_30d_pro',
    name: '30-Day Pro Cohort Trial',
    days: 30,
    tier: 'futures_forex',
    strategyAccess: 'all',
    maxSignals: 999,
    allowCalculators: true,
    createdAt: new Date().toISOString(),
    createdBy: 'system'
  }
];

export function getCustomTrialTemplates(): CustomTrialTemplate[] {
  return localTrialTemplates;
}

export function createCustomTrialTemplate(data: Omit<CustomTrialTemplate, 'id' | 'createdAt'>): CustomTrialTemplate {
  const template: CustomTrialTemplate = {
    id: `tmpl_${Date.now()}`,
    ...data,
    createdAt: new Date().toISOString()
  };
  localTrialTemplates.push(template);
  return template;
}

export function assignCustomTrialToTargets(
  targetType: 'individual' | 'group' | 'tag',
  targetIds: string[],
  payload: any,
  adminEmail: string = 'admin@mannaedge.com'
): { success: boolean; affectedCount: number; userEmails: string[] } {
  const { applyCustomTrialToUser } = require('./user-store.js');
  const allUsers = getAllUsers();
  let targetUserIds: string[] = [];

  if (targetType === 'individual') {
    targetUserIds = targetIds;
  } else if (targetType === 'group') {
    for (const grpId of targetIds) {
      const uIds = localGroupMappings.filter(m => m.groupId === grpId).map(m => m.userId);
      targetUserIds.push(...uIds);
    }
  } else if (targetType === 'tag') {
    for (const tagId of targetIds) {
      const uIds = localTagMappings.filter(m => m.tagId === tagId).map(m => m.userId);
      targetUserIds.push(...uIds);
    }
  }

  // Deduplicate user IDs & resolve emails to user IDs if needed
  const resolvedIds: string[] = [];
  for (const item of targetUserIds) {
    const matched = allUsers.find(u => u.id === item || u.email.toLowerCase() === item.toLowerCase());
    if (matched) resolvedIds.push(matched.id);
  }

  const uniqueUserIds = Array.from(new Set(resolvedIds));

  let affectedCount = 0;
  const affectedEmails: string[] = [];

  for (const uid of uniqueUserIds) {
    const res = applyCustomTrialToUser(uid, payload);
    if (res.success && res.user) {
      affectedCount++;
      affectedEmails.push(res.user.email);
      sendNotificationToUser(
        res.user.id,
        `🎉 Custom Trial Assigned: ${payload.trialName || 'Special Access Pass'}`,
        `Your account has been granted a custom trial (${payload.trialName}) active until ${res.user.trialExpiresAt ? new Date(res.user.trialExpiresAt).toLocaleDateString() : 'expiry'}. Enjoy full market access!`,
        'announcement'
      );
    }
  }

  recordAuditLog({
    adminEmail,
    adminRole: 'admin',
    action: 'CUSTOM_TRIAL_ASSIGNED_BULK',
    detailsJson: JSON.stringify({ targetType, targetIds, affectedCount, affectedEmails, payload })
  });

  return { success: true, affectedCount, userEmails: affectedEmails };
}
