import { queryDb, getPgPool, isPg } from './database.js';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  password?: string;
  mustChangePassword?: boolean;
  role: 'trader' | 'admin' | 'super_admin';
  tier: 'free' | 'forex_only' | 'futures_forex' | string;
  marketAccess: string;
  status: 'active' | 'suspended' | 'paused' | 'pending_deletion' | 'expired';
  subscriptionStatus?: 'active' | 'trialing' | 'paused' | 'expired' | 'canceled';
  subscriptionStart?: string;
  subscriptionEnd?: string;
  billingCycle?: 'monthly' | 'yearly' | 'custom' | 'lifetime';
  autoRenew?: boolean;
  pauseStartDate?: string;
  pauseResumeDate?: string;
  pausedRemainingDays?: number;
  createdAt: string;
  lastActive?: string;
  preferredMarket?: 'Futures' | 'Forex' | 'Both';
  riskLimit?: '1%' | '2%' | '5%';
  signalsViewed?: number;
  watchlistCount?: number;
  deletedAt?: string;
  purgeAt?: string;
  daysRemaining?: number;
  isTrial?: boolean;
  trialStartedAt?: string;
  trialExpiresAt?: string;
  trialDaysRemaining?: number;
  trialExpired?: boolean;
  trialExtendedCount?: number;
  tags?: string[];
  groups?: string[];
  customFeatures?: {
    maxSignals?: number;
    strategyAccess?: string;
    allowCalculators?: boolean;
    trialName?: string;
  };
}

// Convert DB row to UserProfile object
const mapRowToUserProfile = (row: any): UserProfile => {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    password: row.password,
    mustChangePassword: row.must_change_password === 1 || row.must_change_password === true,
    role: row.role as any,
    tier: row.tier,
    marketAccess: row.market_access,
    status: row.status as any,
    subscriptionStatus: row.subscription_status as any,
    subscriptionStart: row.subscription_start,
    subscriptionEnd: row.subscription_end,
    billingCycle: row.billing_cycle as any,
    autoRenew: row.auto_renew === 1 || row.auto_renew === true,
    pauseStartDate: row.pause_start_date,
    pauseResumeDate: row.pause_resume_date,
    pausedRemainingDays: row.paused_remaining_days,
    createdAt: row.created_at,
    lastActive: row.last_active,
    preferredMarket: row.preferred_market as any,
    riskLimit: row.risk_limit as any,
    signalsViewed: row.signals_viewed,
    watchlistCount: row.watchlist_count,
    deletedAt: row.deleted_at,
    purgeAt: row.purge_at,
    daysRemaining: row.days_remaining,
    isTrial: row.is_trial === 1 || row.is_trial === true,
    trialStartedAt: row.trial_started_at,
    trialExpiresAt: row.trial_expires_at,
    trialDaysRemaining: row.trial_days_remaining,
    trialExpired: row.trial_expired === 1 || row.trial_expired === true,
    trialExtendedCount: row.trial_extended_count,
    customFeatures: row.custom_features ? JSON.parse(row.custom_features) : undefined,
  };
};

const mapUserProfileToParams = (u: UserProfile): any[] => {
  return [
    u.id, u.name, u.email, u.password || null, u.mustChangePassword ? 1 : 0, u.role, u.tier, u.marketAccess,
    u.status, u.subscriptionStatus || null, u.subscriptionStart || null, u.subscriptionEnd || null, u.billingCycle || null,
    u.autoRenew ? 1 : 0, u.pauseStartDate || null, u.pauseResumeDate || null, u.pausedRemainingDays || null,
    u.createdAt, u.lastActive || null, u.preferredMarket || null, u.riskLimit || null, u.signalsViewed || 0,
    u.watchlistCount || 0, u.deletedAt || null, u.purgeAt || null, u.daysRemaining || null, u.isTrial ? 1 : 0,
    u.trialStartedAt || null, u.trialExpiresAt || null, u.trialDaysRemaining || null, u.trialExpired ? 1 : 0,
    u.trialExtendedCount || 0, u.customFeatures ? JSON.stringify(u.customFeatures) : null
  ];
};

const upsertUserSql = `
  INSERT INTO user_profiles (
    id, name, email, password, must_change_password, role, tier, market_access, status,
    subscription_status, subscription_start, subscription_end, billing_cycle, auto_renew,
    pause_start_date, pause_resume_date, paused_remaining_days, created_at, last_active,
    preferred_market, risk_limit, signals_viewed, watchlist_count, deleted_at, purge_at,
    days_remaining, is_trial, trial_started_at, trial_expires_at, trial_days_remaining,
    trial_expired, trial_extended_count, custom_features
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  )
  ON CONFLICT (email) DO UPDATE SET
    name = EXCLUDED.name,
    password = EXCLUDED.password,
    must_change_password = EXCLUDED.must_change_password,
    role = EXCLUDED.role,
    tier = EXCLUDED.tier,
    market_access = EXCLUDED.market_access,
    status = EXCLUDED.status,
    subscription_status = EXCLUDED.subscription_status,
    subscription_start = EXCLUDED.subscription_start,
    subscription_end = EXCLUDED.subscription_end,
    billing_cycle = EXCLUDED.billing_cycle,
    auto_renew = EXCLUDED.auto_renew,
    pause_start_date = EXCLUDED.pause_start_date,
    pause_resume_date = EXCLUDED.pause_resume_date,
    paused_remaining_days = EXCLUDED.paused_remaining_days,
    last_active = EXCLUDED.last_active,
    preferred_market = EXCLUDED.preferred_market,
    risk_limit = EXCLUDED.risk_limit,
    signals_viewed = EXCLUDED.signals_viewed,
    watchlist_count = EXCLUDED.watchlist_count,
    deleted_at = EXCLUDED.deleted_at,
    purge_at = EXCLUDED.purge_at,
    days_remaining = EXCLUDED.days_remaining,
    is_trial = EXCLUDED.is_trial,
    trial_started_at = EXCLUDED.trial_started_at,
    trial_expires_at = EXCLUDED.trial_expires_at,
    trial_days_remaining = EXCLUDED.trial_days_remaining,
    trial_expired = EXCLUDED.trial_expired,
    trial_extended_count = EXCLUDED.trial_extended_count,
    custom_features = EXCLUDED.custom_features
`;

const upsertUser = async (user: UserProfile) => {
  if (isPg()) {
    await queryDb(upsertUserSql, mapUserProfileToParams(user));
  } else {
    // SQLite upsert
    const sqliteSql = upsertUserSql.replace('ON CONFLICT (email)', 'ON CONFLICT (email)');
    await queryDb(sqliteSql, mapUserProfileToParams(user));
  }
};

export const findUserByEmail = async (email: string): Promise<UserProfile | undefined> => {
  const rows = await queryDb('SELECT * FROM user_profiles WHERE LOWER(email) = LOWER(?)', [email.trim()]);
  if (rows.length > 0) return mapRowToUserProfile(rows[0]);
  return undefined;
};

export const findUserById = async (id: string): Promise<UserProfile | undefined> => {
  const rows = await queryDb('SELECT * FROM user_profiles WHERE id = ? OR LOWER(email) = LOWER(?)', [id, id]);
  if (rows.length > 0) return mapRowToUserProfile(rows[0]);
  return undefined;
};

export const getAllUsers = async (): Promise<UserProfile[]> => {
  const now = Date.now();
  const rows = await queryDb('SELECT * FROM user_profiles WHERE status != ?', ['pending_deletion']);
  return rows.map(mapRowToUserProfile).map(u => {
    if (u.isTrial && u.trialExpiresAt) {
      const expiresTime = new Date(u.trialExpiresAt).getTime();
      const remainingMs = Math.max(0, expiresTime - now);
      const trialDaysRemaining = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
      const trialExpired = remainingMs <= 0;
      return { ...u, trialDaysRemaining, trialExpired };
    }
    return u;
  });
};

export const getHoldingZoneUsers = async (): Promise<UserProfile[]> => {
  const now = Date.now();
  const rows = await queryDb('SELECT * FROM user_profiles WHERE status = ?', ['pending_deletion']);
  let users = rows.map(mapRowToUserProfile);
  
  // Auto-purge
  users = users.filter(u => {
    if (!u.purgeAt) return true;
    return new Date(u.purgeAt).getTime() > now;
  });

  return users.map(u => {
    const purgeTime = u.purgeAt ? new Date(u.purgeAt).getTime() : now + 30 * 86400000;
    const remainingMs = Math.max(0, purgeTime - now);
    const daysRemaining = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
    return { ...u, daysRemaining };
  });
};

export const addUser = async (profile: { 
  name: string; 
  email: string; 
  password?: string;
  mustChangePassword?: boolean;
  role?: 'trader' | 'admin' | 'super_admin'; 
  tier?: 'free' | 'forex_only' | 'futures_forex' | string;
  preferredMarket?: 'Futures' | 'Forex' | 'Both';
  riskLimit?: '1%' | '2%' | '5%';
  isTrial?: boolean;
  trialDays?: number;
  trialStartedAt?: string | null;
  trialExpiresAt?: string | null;
}): Promise<UserProfile> => {
  const now = new Date();
  const trialDays = profile.trialDays !== undefined ? profile.trialDays : 14; 
  const trialExpiresDate = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

  const newUser: UserProfile = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    name: profile.name,
    email: profile.email,
    password: profile.password || 'temp123',
    mustChangePassword: profile.mustChangePassword !== undefined ? profile.mustChangePassword : false,
    role: profile.role || 'trader',
    tier: profile.tier || 'free',
    marketAccess: profile.tier === 'forex_only' ? 'forex' : profile.tier === 'futures_forex' ? 'all' : '2 Futures + 2 Forex',
    status: 'active',
    subscriptionStatus: profile.isTrial || profile.tier === 'free' ? 'trialing' : 'active',
    createdAt: now.toISOString(),
    lastActive: profile.isTrial || profile.tier === 'free' ? 'Registered 14-Day Free Trial' : 'Preloaded Account',
    preferredMarket: profile.preferredMarket || 'Both',
    riskLimit: profile.riskLimit || '1%',
    signalsViewed: 0,
    watchlistCount: 0,
    isTrial: profile.isTrial !== undefined ? profile.isTrial : true,
    trialStartedAt: profile.trialStartedAt !== undefined ? (profile.trialStartedAt || undefined) : now.toISOString(),
    trialExpiresAt: profile.trialExpiresAt !== undefined ? (profile.trialExpiresAt || undefined) : trialExpiresDate.toISOString(),
    trialDaysRemaining: trialDays,
    trialExpired: false
  };

  const existing = await findUserByEmail(profile.email);
  if (existing) {
    const merged = { ...existing, ...newUser, id: existing.id };
    await upsertUser(merged);
    return merged;
  }

  await upsertUser(newUser);
  return newUser;
};

export const bulkPreloadUsers = async (
  rawUsers: Array<{ name: string; email: string; tier?: 'free' | 'forex_only' | 'futures_forex'; role?: 'trader' | 'admin' }>,
  isTrial: boolean = false
): Promise<{ importedCount: number; users: UserProfile[] }> => {
  let count = 0;
  for (const raw of rawUsers) {
    if (raw.name && raw.email) {
      await addUser({
        name: raw.name.trim(),
        email: raw.email.trim(),
        role: raw.role || 'trader',
        tier: 'futures_forex',
        mustChangePassword: true,
        isTrial
      });
      count++;
    }
  }
  return { importedCount: count, users: await getAllUsers() };
};

export const completeFirstLoginPasswordSetup = async (email: string, newPassword: string): Promise<{ success: boolean; user?: UserProfile; error?: string }> => {
  const user = await findUserByEmail(email);
  if (!user) return { success: false, error: 'User account not found' };

  user.password = newPassword;
  user.mustChangePassword = false;
  user.lastActive = 'Just logged in';

  // If this is a trial user whose trial hasn't started yet (i.e. trialStartedAt is null or empty)
  if (user.isTrial && !user.trialStartedAt) {
    const now = new Date();
    const trialDays = user.trialDaysRemaining || 21;
    user.trialStartedAt = now.toISOString();
    user.trialExpiresAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000).toISOString();
  }

  await upsertUser(user);
  return { success: true, user };
};

export const updateUserTier = async (userId: string, tier: 'free' | 'forex_only' | 'futures_forex'): Promise<UserProfile | null> => {
  const user = await findUserById(userId);
  if (!user) return null;

  user.tier = tier;
  user.marketAccess = tier === 'forex_only' ? 'forex' : tier === 'free' ? '2 Futures + 2 Forex' : 'all';
  await upsertUser(user);
  return user;
};

export const updateUserPassword = async (
  userId: string,
  newPassword: string,
  requesterRole: 'trader' | 'admin' | 'super_admin',
  requesterEmail?: string
): Promise<{ success: boolean; error?: string }> => {
  const target = await findUserById(userId);
  if (!target) {
    return { success: false, error: 'User account not found' };
  }

  const isSelf = Boolean(requesterEmail && requesterEmail.toLowerCase() === target.email.toLowerCase());

  if (isSelf) {
    target.password = newPassword;
    target.mustChangePassword = false;
    await upsertUser(target);
    return { success: true };
  }

  if (requesterRole === 'super_admin') {
    target.password = newPassword;
    await upsertUser(target);
    return { success: true };
  }

  if (requesterRole === 'admin') {
    if (target.role === 'admin' || target.role === 'super_admin') {
      return { success: false, error: 'Access Denied: Only Super Admin can change an Admin account password.' };
    }
    target.password = newPassword;
    await upsertUser(target);
    return { success: true };
  }

  return { success: false, error: 'Unauthorized: You do not have permission to change this password.' };
};

export const softDeleteUser = async (userId: string): Promise<{ success: boolean; user?: UserProfile }> => {
  const target = await findUserById(userId);
  if (!target) return { success: false };

  const now = new Date();
  const purgeDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); 

  target.status = 'pending_deletion';
  target.deletedAt = now.toISOString();
  target.purgeAt = purgeDate.toISOString();
  target.daysRemaining = 30;

  await upsertUser(target);
  return { success: true, user: target };
};

export const restoreUser = async (userId: string): Promise<{ success: boolean; user?: UserProfile }> => {
  const target = await findUserById(userId);
  if (!target) return { success: false };

  target.status = 'active';
  target.deletedAt = undefined;
  target.purgeAt = undefined;
  target.daysRemaining = undefined;

  await upsertUser(target);
  return { success: true, user: target };
};

export const updateUserRole = async (userId: string, role: 'trader' | 'admin' | 'super_admin'): Promise<UserProfile | null> => {
  const user = await findUserById(userId);
  if (!user) return null;
  user.role = role;
  await upsertUser(user);
  return user;
};

export const updateUserStatus = async (userId: string, status: 'active' | 'suspended'): Promise<UserProfile | null> => {
  const user = await findUserById(userId);
  if (!user) return null;
  user.status = status;
  await upsertUser(user);
  return user;
};

export const updateUserFull = async (
  userId: string, 
  updates: Partial<Pick<UserProfile, 'name' | 'tier' | 'role' | 'status' | 'preferredMarket' | 'riskLimit'>>
): Promise<UserProfile | null> => {
  const user = await findUserById(userId);
  if (!user) return null;
  if (updates.name) user.name = updates.name;
  if (updates.tier) user.tier = updates.tier;
  if (updates.role) user.role = updates.role;
  if (updates.status) user.status = updates.status;
  if (updates.preferredMarket) user.preferredMarket = updates.preferredMarket;
  if (updates.riskLimit) user.riskLimit = updates.riskLimit;
  await upsertUser(user);
  return user;
};

export const pauseUserSubscription = async (
  userId: string,
  autoResumeDate?: string
): Promise<{ success: boolean; user?: UserProfile; error?: string }> => {
  const user = await findUserById(userId);
  if (!user) return { success: false, error: 'User account not found' };

  const now = new Date();
  const currentEnd = user.subscriptionEnd ? new Date(user.subscriptionEnd).getTime() : Date.now() + 30 * 86400000;
  const remainingMs = Math.max(0, currentEnd - now.getTime());
  const pausedRemainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));

  user.status = 'paused';
  user.subscriptionStatus = 'paused';
  user.pauseStartDate = now.toISOString();
  user.pauseResumeDate = autoResumeDate || undefined;
  user.pausedRemainingDays = pausedRemainingDays;

  await upsertUser(user);
  return { success: true, user };
};

export const resumeUserSubscription = async (
  userId: string
): Promise<{ success: boolean; user?: UserProfile; error?: string }> => {
  const user = await findUserById(userId);
  if (!user) return { success: false, error: 'User account not found' };

  const now = new Date();
  const daysToAdd = user.pausedRemainingDays || 30;
  const newEnd = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

  user.status = 'active';
  user.subscriptionStatus = user.isTrial ? 'trialing' : 'active';
  user.subscriptionEnd = newEnd.toISOString();
  user.pauseStartDate = undefined;
  user.pauseResumeDate = undefined;
  user.pausedRemainingDays = undefined;

  await upsertUser(user);
  return { success: true, user };
};

export const setCustomSubscriptionDates = async (
  userId: string,
  startDate: string,
  endDate: string,
  billingCycle: 'monthly' | 'yearly' | 'custom' | 'lifetime' = 'custom'
): Promise<{ success: boolean; user?: UserProfile; error?: string }> => {
  const user = await findUserById(userId);
  if (!user) return { success: false, error: 'User account not found' };

  user.subscriptionStart = startDate;
  user.subscriptionEnd = endDate;
  user.billingCycle = billingCycle;
  user.status = 'active';
  user.subscriptionStatus = 'active';

  await upsertUser(user);
  return { success: true, user };
};

export const extendUserTrial = async (
  userId: string,
  daysToExtend: number
): Promise<{ success: boolean; user?: UserProfile; error?: string }> => {
  const user = await findUserById(userId);
  if (!user) return { success: false, error: 'User account not found' };

  const currentExpiry = user.trialExpiresAt ? new Date(user.trialExpiresAt).getTime() : Date.now();
  const baseTime = Math.max(Date.now(), currentExpiry);
  const newExpiry = new Date(baseTime + daysToExtend * 24 * 60 * 60 * 1000);

  user.isTrial = true;
  user.trialExpiresAt = newExpiry.toISOString();
  user.trialExtendedCount = (user.trialExtendedCount || 0) + 1;
  user.trialExpired = false;
  user.status = 'active';
  user.subscriptionStatus = 'trialing';

  await upsertUser(user);
  return { success: true, user };
};

export const bulkUpdateUsers = async (
  userIds: string[],
  action: 'extend_trial_7d' | 'extend_sub_30d' | 'pause' | 'resume' | 'change_tier',
  payload?: any
): Promise<{ updatedCount: number }> => {
  let count = 0;
  for (const id of userIds) {
    if (action === 'extend_trial_7d') {
      if ((await extendUserTrial(id, 7)).success) count++;
    } else if (action === 'extend_sub_30d') {
      const user = await findUserById(id);
      if (user) {
        const curEnd = user.subscriptionEnd ? new Date(user.subscriptionEnd).getTime() : Date.now();
        user.subscriptionEnd = new Date(curEnd + 30 * 86400000).toISOString();
        user.status = 'active';
        await upsertUser(user);
        count++;
      }
    } else if (action === 'pause') {
      if ((await pauseUserSubscription(id)).success) count++;
    } else if (action === 'resume') {
      if ((await resumeUserSubscription(id)).success) count++;
    } else if (action === 'change_tier' && payload?.tier) {
      if (await updateUserTier(id, payload.tier)) count++;
    }
  }
  return { updatedCount: count };
};

export interface CustomTrialPayload {
  trialName: string;
  days?: number;
  expiryDate?: string;
  tier: 'futures_forex' | 'forex_only' | 'free';
  strategyAccess: 'all' | 'sentinel_v2' | 'manna_snd';
  maxSignals: number;
  allowCalculators: boolean;
}

export const applyCustomTrialToUser = async (
  userIdOrEmail: string,
  payload: CustomTrialPayload
): Promise<{ success: boolean; user?: UserProfile; error?: string }> => {
  const user = await findUserById(userIdOrEmail);
  if (!user) return { success: false, error: 'User account not found' };

  let expiryIso: string;
  if (payload.expiryDate) {
    expiryIso = new Date(payload.expiryDate).toISOString();
  } else {
    const days = payload.days || 14;
    expiryIso = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  user.isTrial = true;
  user.trialStartedAt = new Date().toISOString();
  user.trialExpiresAt = expiryIso;
  user.subscriptionStart = new Date().toISOString();
  user.subscriptionEnd = expiryIso;
  user.trialExpired = false;
  user.status = 'active';
  user.subscriptionStatus = 'trialing';
  user.tier = payload.tier || 'futures_forex';
  user.customFeatures = {
    maxSignals: payload.maxSignals || 6,
    strategyAccess: payload.strategyAccess || 'all',
    allowCalculators: payload.allowCalculators !== false,
    trialName: payload.trialName || 'Custom Trial'
  };

  await upsertUser(user);
  return { success: true, user };
};

// Seed utility to initialize database if empty
export const seedUsersIfEmpty = async () => {
  const existing = await queryDb('SELECT COUNT(*) as count FROM user_profiles');
  if (existing[0].count === 0) {
    console.log('User profiles table empty. Seeding initial preloaded users...');
    
    const initialUserProfiles: any[] = [
      { id: 'usr_chadwin_super', name: 'Chadwin Solomon', email: 'chadwinsolomon@gmail.com', password: 'temp123', mustChangePassword: false, role: 'super_admin', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Super Admin', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
      { id: 'usr_cindy', name: 'Cindy King', email: 'Cindy.king@kingdomdaytraders.com', password: 'temp123', mustChangePassword: false, role: 'admin', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Admin', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
      { id: 'usr_brian_king', name: 'Brian King', email: 'kdtfutures@gmail.com', password: 'temp123', mustChangePassword: false, role: 'admin', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Admin', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
      { id: 'usr_kaylin', name: 'Kaylin Van Ordt', email: 'kaylinangelinemeyer@gmail.com', password: 'temp123', mustChangePassword: false, role: 'admin', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Admin', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
      { id: 'usr_demo_trader', name: 'Demo Trader', email: 'demo.trader@mannaedge.com', password: 'demopassword123', mustChangePassword: false, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Active Demo Session', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 18, watchlistCount: 4 }
    ];

    for (const profile of initialUserProfiles) {
      await upsertUser(profile);
    }
  }
};
