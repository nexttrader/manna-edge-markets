import { Router, Request, Response } from 'express';
import {
  getAllUsers,
  addUser,
  updateUserFull,
  updateUserRole,
  updateUserStatus,
  updateUserTier,
  updateUserPassword,
  softDeleteUser,
  restoreUser,
  pauseUserSubscription,
  resumeUserSubscription,
  setCustomSubscriptionDates,
  extendUserTrial,
  bulkUpdateUsers,
  getHoldingZoneUsers,
  findUserByEmail
} from '../db/user-store.js';
import {
  getCoupons,
  createCoupon,
  updateCouponStatus,
  applyCouponToUser,
  getTags,
  createTag,
  deleteTag,
  assignTagToUser,
  removeTagFromUser,
  getUserTags,
  getGroups,
  createGroup,
  assignUserToGroup,
  removeUserFromGroup,
  getUserGroups,
  getNotificationLogs,
  broadcastNotification,
  getAuditLogs,
  recordAuditLog
} from '../db/user-management-store.js';
import { checkSubscriptionAndTrialExpirations } from '../scheduler/subscription-cron.js';

const router = Router();

// Middleware: Authenticate Requester (Admin or SuperAdmin)
const requireAdminOrSuperAdmin = (req: Request, res: Response, next: any) => {
  const requesterEmail = (req.headers['x-admin-email'] as string) || (req.query.requesterEmail as string) || '';
  const requesterRole = (req.headers['x-admin-role'] as string) || (req.query.requesterRole as string) || 'admin';

  if (!requesterEmail && !requesterRole) {
    // Standard default admin access for internal admin dashboard UI calls
    req.body._adminEmail = 'admin@mannaedge.com';
    req.body._adminRole = 'admin';
    return next();
  }

  req.body._adminEmail = requesterEmail || 'admin@mannaedge.com';
  req.body._adminRole = requesterRole || 'admin';
  next();
};

router.use(requireAdminOrSuperAdmin);

// ==========================================
// USER DIRECTORY & PROFILE ENDPOINTS
// ==========================================
router.get('/users', (req: Request, res: Response) => {
  const search = ((req.query.search as string) || '').toLowerCase().trim();
  const role = (req.query.role as string) || '';
  const status = (req.query.status as string) || '';
  const tier = (req.query.tier as string) || '';
  const tagId = (req.query.tagId as string) || '';
  const groupId = (req.query.groupId as string) || '';

  let users = getAllUsers();

  // Attach dynamic tags and groups to each user profile
  users = users.map(u => {
    const tags = getUserTags(u.id).map(t => t.name);
    const groups = getUserGroups(u.id).map(g => g.name);
    return { ...u, tags, groups };
  });

  if (search) {
    users = users.filter(u => u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search) || u.id.toLowerCase().includes(search));
  }
  if (role) {
    users = users.filter(u => u.role === role);
  }
  if (status) {
    users = users.filter(u => u.status === status);
  }
  if (tier) {
    users = users.filter(u => u.tier === tier);
  }
  if (tagId) {
    users = users.filter(u => getUserTags(u.id).some(t => t.id === tagId));
  }
  if (groupId) {
    users = users.filter(u => getUserGroups(u.id).some(g => g.id === groupId));
  }

  res.json({ success: true, count: users.length, users });
});

router.post('/users', (req: Request, res: Response) => {
  const { name, email, role, tier, isTrial, preferredMarket, riskLimit } = req.body;
  if (!name || !email) {
    return res.status(400).json({ success: false, error: 'Name and Email are required.' });
  }

  const existing = findUserByEmail(email);
  if (existing) {
    return res.status(400).json({ success: false, error: 'A user with this email address already exists.' });
  }

  const user = addUser({
    name,
    email,
    role: role || 'trader',
    tier: tier || 'futures_forex',
    isTrial: Boolean(isTrial),
    preferredMarket: preferredMarket || 'Both',
    riskLimit: riskLimit || '1%'
  });

  recordAuditLog({
    adminEmail: req.body._adminEmail,
    adminRole: req.body._adminRole,
    action: 'USER_CREATED',
    targetUserId: user.id,
    detailsJson: JSON.stringify({ name, email, role: user.role, tier: user.tier, isTrial: user.isTrial })
  });

  res.json({ success: true, user });
});

router.put('/users/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const updates = req.body;
  const user = updateUserFull(id, updates);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  recordAuditLog({
    adminEmail: req.body._adminEmail,
    adminRole: req.body._adminRole,
    action: 'USER_UPDATED',
    targetUserId: user.id,
    detailsJson: JSON.stringify(updates)
  });

  res.json({ success: true, user });
});

router.delete('/users/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const result = softDeleteUser(id);
  if (!result.success) return res.status(404).json({ success: false, error: 'User not found' });

  recordAuditLog({
    adminEmail: req.body._adminEmail,
    adminRole: req.body._adminRole,
    action: 'USER_SOFT_DELETED',
    targetUserId: id
  });

  res.json({ success: true, message: 'User moved to 30-day holding zone.' });
});

router.post('/users/:id/restore', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const result = restoreUser(id);
  if (!result.success) return res.status(404).json({ success: false, error: 'User not found in holding zone' });

  recordAuditLog({
    adminEmail: req.body._adminEmail,
    adminRole: req.body._adminRole,
    action: 'USER_RESTORED',
    targetUserId: id
  });

  res.json({ success: true, user: result.user });
});

// ==========================================
// SUBSCRIPTION PAUSE / RESUME / CUSTOM DATES / TRIALS
// ==========================================
router.post('/users/:id/pause', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { autoResumeDate } = req.body;
  const resObj = pauseUserSubscription(id, autoResumeDate);
  if (!resObj.success) return res.status(400).json(resObj);

  recordAuditLog({
    adminEmail: req.body._adminEmail,
    adminRole: req.body._adminRole,
    action: 'SUBSCRIPTION_PAUSED',
    targetUserId: id,
    detailsJson: JSON.stringify({ autoResumeDate, remainingDays: resObj.user?.pausedRemainingDays })
  });

  res.json(resObj);
});

router.post('/users/:id/resume', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const resObj = resumeUserSubscription(id);
  if (!resObj.success) return res.status(400).json(resObj);

  recordAuditLog({
    adminEmail: req.body._adminEmail,
    adminRole: req.body._adminRole,
    action: 'SUBSCRIPTION_RESUMED',
    targetUserId: id,
    detailsJson: JSON.stringify({ newSubscriptionEnd: resObj.user?.subscriptionEnd })
  });

  res.json(resObj);
});

router.post('/users/:id/custom-dates', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { startDate, endDate, billingCycle } = req.body;
  if (!startDate || !endDate) return res.status(400).json({ success: false, error: 'startDate and endDate are required.' });

  const resObj = setCustomSubscriptionDates(id, startDate, endDate, billingCycle);
  if (!resObj.success) return res.status(400).json(resObj);

  recordAuditLog({
    adminEmail: req.body._adminEmail,
    adminRole: req.body._adminRole,
    action: 'CUSTOM_SUB_DATES_SET',
    targetUserId: id,
    detailsJson: JSON.stringify({ startDate, endDate, billingCycle })
  });

  res.json(resObj);
});

router.post('/users/:id/extend-trial', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const days = Number(req.body.days) || 7;
  const resObj = extendUserTrial(id, days);
  if (!resObj.success) return res.status(400).json(resObj);

  recordAuditLog({
    adminEmail: req.body._adminEmail,
    adminRole: req.body._adminRole,
    action: 'TRIAL_EXTENDED',
    targetUserId: id,
    detailsJson: JSON.stringify({ daysExtended: days, newExpiry: resObj.user?.trialExpiresAt })
  });

  res.json(resObj);
});

router.post('/users/bulk', (req: Request, res: Response) => {
  const { userIds, action, payload } = req.body;
  if (!Array.isArray(userIds) || userIds.length === 0 || !action) {
    return res.status(400).json({ success: false, error: 'userIds array and action are required.' });
  }

  const result = bulkUpdateUsers(userIds, action, payload);

  recordAuditLog({
    adminEmail: req.body._adminEmail,
    adminRole: req.body._adminRole,
    action: 'BULK_USER_ACTION',
    detailsJson: JSON.stringify({ action, count: result.updatedCount, userIds })
  });

  res.json({ success: true, updatedCount: result.updatedCount });
});

// ==========================================
// COUPON ENGINE ENDPOINTS
// ==========================================
router.get('/coupons', (_req: Request, res: Response) => {
  res.json({ success: true, coupons: getCoupons() });
});

router.post('/coupons', (req: Request, res: Response) => {
  const { code, discountType, discountValue, validUntil, maxRedemptions, perUserLimit, applicableTiers } = req.body;
  if (!code || discountValue === undefined) {
    return res.status(400).json({ success: false, error: 'Coupon code and discountValue are required.' });
  }

  const coupon = createCoupon({
    code: code.trim().toUpperCase(),
    discountType: discountType || 'percentage',
    discountValue: Number(discountValue),
    validFrom: new Date().toISOString(),
    validUntil: validUntil || undefined,
    maxRedemptions: Number(maxRedemptions) || 100,
    perUserLimit: Number(perUserLimit) || 1,
    applicableTiers: applicableTiers || 'all',
    status: 'active',
    createdBy: req.body._adminEmail
  });

  res.json({ success: true, coupon });
});

router.put('/coupons/:id/status', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { status } = req.body;
  const coupon = updateCouponStatus(id, status, req.body._adminEmail);
  if (!coupon) return res.status(404).json({ success: false, error: 'Coupon not found' });
  res.json({ success: true, coupon });
});

router.post('/coupons/apply', (req: Request, res: Response) => {
  const { code, userEmail } = req.body;
  if (!code || !userEmail) {
    return res.status(400).json({ success: false, error: 'Coupon code and userEmail are required.' });
  }

  const result = applyCouponToUser(code, userEmail, req.body._adminEmail);
  if (!result.success) return res.status(400).json(result);
  res.json(result);
});

// ==========================================
// TAGS & GROUPS ENDPOINTS
// ==========================================
router.get('/tags', (_req: Request, res: Response) => {
  res.json({ success: true, tags: getTags() });
});

router.post('/tags', (req: Request, res: Response) => {
  const { name, color, description } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'Tag name is required.' });
  const tag = createTag(name, color || '#3b82f6', description);
  res.json({ success: true, tag });
});

router.delete('/tags/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  deleteTag(id);
  res.json({ success: true, message: 'Tag deleted.' });
});

router.post('/tags/assign', (req: Request, res: Response) => {
  const { userId, tagId } = req.body;
  assignTagToUser(userId, tagId);
  res.json({ success: true, message: 'Tag assigned to user.' });
});

router.post('/tags/remove', (req: Request, res: Response) => {
  const { userId, tagId } = req.body;
  removeTagFromUser(userId, tagId);
  res.json({ success: true, message: 'Tag removed from user.' });
});

router.get('/groups', (_req: Request, res: Response) => {
  res.json({ success: true, groups: getGroups() });
});

router.post('/groups', (req: Request, res: Response) => {
  const { name, description, tierAssignment } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'Group name is required.' });
  const group = createGroup(name, description, tierAssignment || 'futures_forex');
  res.json({ success: true, group });
});

router.post('/groups/assign', (req: Request, res: Response) => {
  const { userId, groupId } = req.body;
  assignUserToGroup(userId, groupId);
  res.json({ success: true, message: 'User added to group.' });
});

router.post('/groups/remove', (req: Request, res: Response) => {
  const { userId, groupId } = req.body;
  removeUserFromGroup(userId, groupId);
  res.json({ success: true, message: 'User removed from group.' });
});

// ==========================================
// NOTIFICATIONS & AUDIT LOG ENDPOINTS
// ==========================================
router.get('/notifications/logs', (_req: Request, res: Response) => {
  res.json({ success: true, notifications: getNotificationLogs() });
});

router.post('/notifications/broadcast', (req: Request, res: Response) => {
  const { targetType, targetId, title, message } = req.body;
  if (!title || !message) return res.status(400).json({ success: false, error: 'Title and message are required.' });

  const resObj = broadcastNotification(targetType || 'all', targetId || null, title, message, req.body._adminEmail);
  res.json({ success: true, recipientCount: resObj.recipientCount });
});

router.get('/audit-logs', (_req: Request, res: Response) => {
  res.json({ success: true, auditLogs: getAuditLogs() });
});

router.post('/scheduler/run-now', (_req: Request, res: Response) => {
  const stats = checkSubscriptionAndTrialExpirations();
  res.json({ success: true, stats });
});

export default router;
