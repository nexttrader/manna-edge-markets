import { queryDb, isPg } from './database.js';
import { UserProfile, getAllUsers, findUserByEmail, applyCustomTrialToUser } from './user-store.js';
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

// ==========================================
// AUDIT LOG SERVICES
// ==========================================
export async function recordAuditLog(log: Omit<AuditLog, 'id' | 'createdAt'>): Promise<AuditLog> {
  const item: AuditLog = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    ...log,
    createdAt: new Date().toISOString()
  };
  
  try {
    await queryDb(
      `INSERT INTO admin_audit_logs (id, admin_email, admin_role, action, target_user_id, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [item.id, item.adminEmail, item.adminRole, item.action, item.targetUserId || null, item.detailsJson || null, item.createdAt]
    );
  } catch (err) {
    console.error('Failed to record audit log', err);
  }
  return item;
}

export async function getAuditLogs(): Promise<AuditLog[]> {
  const rows = await queryDb('SELECT * FROM admin_audit_logs ORDER BY created_at DESC');
  return rows.map((r: any) => ({
    id: r.id,
    adminEmail: r.admin_email,
    adminRole: r.admin_role,
    action: r.action,
    targetUserId: r.target_user_id,
    detailsJson: r.details_json,
    createdAt: r.created_at
  }));
}

// ==========================================
// COUPON SERVICES
// ==========================================
export async function getCoupons(): Promise<Coupon[]> {
  const rows = await queryDb('SELECT * FROM coupons ORDER BY created_at DESC');
  return rows.map((r: any) => ({
    id: r.id,
    code: r.code,
    discountType: r.discount_type,
    discountValue: r.discount_value,
    validFrom: r.valid_from,
    validUntil: r.valid_until,
    maxRedemptions: r.max_redemptions,
    currentRedemptions: r.current_redemptions,
    perUserLimit: r.per_user_limit,
    applicableTiers: r.applicable_tiers,
    status: r.status,
    createdBy: r.created_by,
    createdAt: r.created_at
  }));
}

export async function createCoupon(couponData: Omit<Coupon, 'id' | 'currentRedemptions' | 'createdAt'>): Promise<Coupon> {
  const newCoupon: Coupon = {
    id: `cpn_${Date.now()}_${Math.random().toString(36).substring(2, 4)}`,
    ...couponData,
    currentRedemptions: 0,
    createdAt: new Date().toISOString()
  };
  
  await queryDb(
    `INSERT INTO coupons (id, code, discount_type, discount_value, valid_from, valid_until, max_redemptions, current_redemptions, per_user_limit, applicable_tiers, status, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [newCoupon.id, newCoupon.code, newCoupon.discountType, newCoupon.discountValue, newCoupon.validFrom, newCoupon.validUntil, newCoupon.maxRedemptions, newCoupon.currentRedemptions, newCoupon.perUserLimit, newCoupon.applicableTiers, newCoupon.status, newCoupon.createdBy, newCoupon.createdAt]
  );

  await recordAuditLog({
    adminEmail: couponData.createdBy || 'Admin',
    adminRole: 'admin',
    action: 'COUPON_CREATED',
    detailsJson: JSON.stringify({ code: newCoupon.code, discountType: newCoupon.discountType, value: newCoupon.discountValue })
  });
  return newCoupon;
}

export async function updateCouponStatus(couponId: string, status: 'active' | 'disabled' | 'expired', adminEmail: string = 'Admin'): Promise<Coupon | null> {
  const rows = await queryDb('SELECT * FROM coupons WHERE id = ? OR UPPER(code) = UPPER(?)', [couponId, couponId]);
  if (!rows || rows.length === 0) return null;
  const dbCoupon = rows[0];

  await queryDb('UPDATE coupons SET status = ? WHERE id = ?', [status, dbCoupon.id]);
  
  await recordAuditLog({
    adminEmail,
    adminRole: 'admin',
    action: 'COUPON_STATUS_UPDATED',
    detailsJson: JSON.stringify({ couponId: dbCoupon.id, newStatus: status })
  });
  
  return {
    id: dbCoupon.id,
    code: dbCoupon.code,
    discountType: dbCoupon.discount_type,
    discountValue: dbCoupon.discount_value,
    validFrom: dbCoupon.valid_from,
    validUntil: dbCoupon.valid_until,
    maxRedemptions: dbCoupon.max_redemptions,
    currentRedemptions: dbCoupon.current_redemptions,
    perUserLimit: dbCoupon.per_user_limit,
    applicableTiers: dbCoupon.applicable_tiers,
    status: status,
    createdBy: dbCoupon.created_by,
    createdAt: dbCoupon.created_at
  };
}

export async function applyCouponToUser(
  couponCode: string,
  userEmail: string,
  adminEmail: string = 'Admin'
): Promise<{ success: boolean; message: string; discountDetail?: string }> {
  const rows = await queryDb('SELECT * FROM coupons WHERE UPPER(code) = UPPER(?)', [couponCode.trim()]);
  if (!rows || rows.length === 0) {
    return { success: false, message: 'Invalid or non-existent coupon code.' };
  }
  const coupon = rows[0];

  if (coupon.status !== 'active') {
    return { success: false, message: `Coupon ${coupon.code} is currently ${coupon.status}.` };
  }
  if (coupon.valid_until && new Date(coupon.valid_until).getTime() < Date.now()) {
    await queryDb('UPDATE coupons SET status = ? WHERE id = ?', ['expired', coupon.id]);
    return { success: false, message: `Coupon ${coupon.code} has expired.` };
  }
  if (coupon.current_redemptions >= coupon.max_redemptions) {
    return { success: false, message: `Coupon ${coupon.code} has reached maximum redemption limit (${coupon.max_redemptions}).` };
  }

  const user = await findUserByEmail(userEmail);
  if (!user) {
    return { success: false, message: `User profile with email ${userEmail} not found.` };
  }

  await queryDb('UPDATE coupons SET current_redemptions = current_redemptions + 1 WHERE id = ?', [coupon.id]);
  
  const redemptionDetail = `Applied ${coupon.discount_type} discount (${coupon.discount_value}) to ${user.name}`;

  await recordAuditLog({
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
export async function getTags(): Promise<UserTag[]> {
  const rows = await queryDb('SELECT * FROM user_tags ORDER BY created_at DESC');
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    description: r.description,
    createdAt: r.created_at
  }));
}

export async function createTag(name: string, color: string = '#3b82f6', description?: string): Promise<UserTag> {
  const existing = await queryDb('SELECT * FROM user_tags WHERE LOWER(name) = LOWER(?)', [name]);
  if (existing && existing.length > 0) {
    return {
      id: existing[0].id,
      name: existing[0].name,
      color: existing[0].color,
      description: existing[0].description,
      createdAt: existing[0].created_at
    };
  }
  
  const tag: UserTag = {
    id: `tag_${Date.now()}`,
    name,
    color,
    description,
    createdAt: new Date().toISOString()
  };
  await queryDb(
    'INSERT INTO user_tags (id, name, color, description, created_at) VALUES (?, ?, ?, ?, ?)',
    [tag.id, tag.name, tag.color, tag.description, tag.createdAt]
  );
  return tag;
}

export async function deleteTag(tagId: string): Promise<boolean> {
  await queryDb('DELETE FROM user_tag_mappings WHERE tag_id = ?', [tagId]);
  await queryDb('DELETE FROM user_tags WHERE id = ?', [tagId]);
  return true;
}

export async function assignTagToUser(userId: string, tagId: string): Promise<boolean> {
  const existing = await queryDb('SELECT * FROM user_tag_mappings WHERE user_id = ? AND tag_id = ?', [userId, tagId]);
  if (!existing || existing.length === 0) {
    await queryDb('INSERT INTO user_tag_mappings (user_id, tag_id) VALUES (?, ?)', [userId, tagId]);
  }
  return true;
}

export async function removeTagFromUser(userId: string, tagId: string): Promise<boolean> {
  await queryDb('DELETE FROM user_tag_mappings WHERE user_id = ? AND tag_id = ?', [userId, tagId]);
  return true;
}

export async function getUserTags(userId: string): Promise<UserTag[]> {
  const rows = await queryDb('SELECT t.* FROM user_tags t JOIN user_tag_mappings m ON t.id = m.tag_id WHERE m.user_id = ?', [userId]);
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    description: r.description,
    createdAt: r.created_at
  }));
}

export async function getGroups(): Promise<UserGroup[]> {
  const groups = await queryDb('SELECT * FROM user_groups ORDER BY created_at DESC');
  const res: UserGroup[] = [];
  for (const g of groups) {
    const mappings = await queryDb('SELECT COUNT(*) as count FROM user_group_mappings WHERE group_id = ?', [g.id]);
    res.push({
      id: g.id,
      name: g.name,
      description: g.description,
      tierAssignment: g.tier_assignment,
      createdAt: g.created_at,
      memberCount: parseInt(mappings[0].count) || 0
    });
  }
  return res;
}

export async function createGroup(name: string, description?: string, tierAssignment: string = 'futures_forex'): Promise<UserGroup> {
  const group: UserGroup = {
    id: `grp_${Date.now()}`,
    name,
    description,
    tierAssignment,
    createdAt: new Date().toISOString(),
    memberCount: 0
  };
  await queryDb(
    'INSERT INTO user_groups (id, name, description, tier_assignment, created_at) VALUES (?, ?, ?, ?, ?)',
    [group.id, group.name, group.description, group.tierAssignment, group.createdAt]
  );
  return group;
}

export async function assignUserToGroup(userId: string, groupId: string): Promise<boolean> {
  const existing = await queryDb('SELECT * FROM user_group_mappings WHERE user_id = ? AND group_id = ?', [userId, groupId]);
  if (!existing || existing.length === 0) {
    await queryDb('INSERT INTO user_group_mappings (user_id, group_id) VALUES (?, ?)', [userId, groupId]);
  }
  return true;
}

export async function removeUserFromGroup(userId: string, groupId: string): Promise<boolean> {
  await queryDb('DELETE FROM user_group_mappings WHERE user_id = ? AND group_id = ?', [userId, groupId]);
  return true;
}

export async function getUserGroups(userId: string): Promise<UserGroup[]> {
  const rows = await queryDb('SELECT g.* FROM user_groups g JOIN user_group_mappings m ON g.id = m.group_id WHERE m.user_id = ?', [userId]);
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    tierAssignment: r.tier_assignment,
    createdAt: r.created_at
  }));
}

// ==========================================
// NOTIFICATIONS SERVICES
// ==========================================
export async function sendNotificationToUser(userId: string, title: string, message: string, type: string = 'announcement'): Promise<NotificationItem> {
  const notif: NotificationItem = {
    id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 4)}`,
    userId,
    type,
    title,
    message,
    isRead: false,
    createdAt: new Date().toISOString()
  };
  await queryDb(
    'INSERT INTO notifications (id, user_id, type, title, message, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [notif.id, notif.userId, notif.type, notif.title, notif.message, notif.isRead ? 1 : 0, notif.createdAt]
  );
  return notif;
}

export async function broadcastNotification(
  targetType: 'all' | 'tag' | 'group',
  targetId: string | null,
  title: string,
  message: string,
  adminEmail: string
): Promise<{ recipientCount: number }> {
  const users = await getAllUsers();
  let recipients: UserProfile[] = [];

  if (targetType === 'all') {
    recipients = users;
  } else if (targetType === 'tag' && targetId) {
    const mappings = await queryDb('SELECT user_id FROM user_tag_mappings WHERE tag_id = ?', [targetId]);
    const userIds = mappings.map((m: any) => m.user_id);
    recipients = users.filter(u => userIds.includes(u.id));
  } else if (targetType === 'group' && targetId) {
    const mappings = await queryDb('SELECT user_id FROM user_group_mappings WHERE group_id = ?', [targetId]);
    const userIds = mappings.map((m: any) => m.user_id);
    recipients = users.filter(u => userIds.includes(u.id));
  }

  for (const user of recipients) {
    await sendNotificationToUser(user.id, title, message, 'announcement');
  }

  await recordAuditLog({
    adminEmail,
    adminRole: 'admin',
    action: 'BROADCAST_NOTIFICATION_SENT',
    detailsJson: JSON.stringify({ targetType, targetId, recipientCount: recipients.length, title })
  });

  return { recipientCount: recipients.length };
}

export async function getNotificationsForUser(userId: string): Promise<NotificationItem[]> {
  const rows = await queryDb('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  return rows.map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    type: r.type,
    title: r.title,
    message: r.message,
    isRead: Boolean(r.is_read),
    createdAt: r.created_at
  }));
}

export async function getNotificationLogs(): Promise<NotificationItem[]> {
  const rows = await queryDb('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 500');
  return rows.map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    type: r.type,
    title: r.title,
    message: r.message,
    isRead: Boolean(r.is_read),
    createdAt: r.created_at
  }));
}

// ==========================================
// CUSTOM TRIAL TEMPLATES & ASSIGNMENT
// ==========================================
export async function getCustomTrialTemplates(): Promise<CustomTrialTemplate[]> {
  const rows = await queryDb('SELECT * FROM custom_trial_templates ORDER BY created_at DESC');
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    days: r.days,
    expiryDate: r.expiry_date,
    tier: r.tier,
    strategyAccess: r.strategy_access,
    maxSignals: r.max_signals,
    allowCalculators: Boolean(r.allow_calculators),
    createdAt: r.created_at,
    createdBy: r.created_by
  }));
}

export async function createCustomTrialTemplate(data: Omit<CustomTrialTemplate, 'id' | 'createdAt'>): Promise<CustomTrialTemplate> {
  const template: CustomTrialTemplate = {
    id: `tmpl_${Date.now()}`,
    ...data,
    createdAt: new Date().toISOString()
  };
  await queryDb(
    'INSERT INTO custom_trial_templates (id, name, days, expiry_date, tier, strategy_access, max_signals, allow_calculators, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [template.id, template.name, template.days, template.expiryDate, template.tier, template.strategyAccess, template.maxSignals, template.allowCalculators ? 1 : 0, template.createdAt, template.createdBy]
  );
  return template;
}

export async function assignCustomTrialToTargets(
  targetType: 'individual' | 'group' | 'tag',
  targetIds: string[],
  payload: any,
  adminEmail: string = 'admin@mannaedge.com'
): Promise<{ success: boolean; affectedCount: number; userEmails: string[] }> {
  const allUsers = await getAllUsers();
  let targetUserIds: string[] = [];

  if (targetType === 'individual') {
    targetUserIds = targetIds;
  } else if (targetType === 'group') {
    for (const grpId of targetIds) {
      const mappings = await queryDb('SELECT user_id FROM user_group_mappings WHERE group_id = ?', [grpId]);
      targetUserIds.push(...mappings.map((m: any) => m.user_id));
    }
  } else if (targetType === 'tag') {
    for (const tagId of targetIds) {
      const mappings = await queryDb('SELECT user_id FROM user_tag_mappings WHERE tag_id = ?', [tagId]);
      targetUserIds.push(...mappings.map((m: any) => m.user_id));
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
    const res = await applyCustomTrialToUser(uid, payload);
    if (res.success && res.user) {
      affectedCount++;
      affectedEmails.push(res.user.email);
      await sendNotificationToUser(
        res.user.id,
        `🎉 Custom Trial Assigned: ${payload.trialName || 'Special Access Pass'}`,
        `Your account has been granted a custom trial (${payload.trialName}) active until ${res.user.trialExpiresAt ? new Date(res.user.trialExpiresAt).toLocaleDateString() : 'expiry'}. Enjoy full market access!`,
        'announcement'
      );
    }
  }

  await recordAuditLog({
    adminEmail,
    adminRole: 'admin',
    action: 'CUSTOM_TRIAL_ASSIGNED_BULK',
    detailsJson: JSON.stringify({ targetType, targetIds, affectedCount, affectedEmails, payload })
  });

  return { success: true, affectedCount, userEmails: affectedEmails };
}
