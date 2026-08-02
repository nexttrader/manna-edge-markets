export interface UserProfile {
  id: string;
  name: string;
  email: string;
  password?: string;
  mustChangePassword?: boolean;
  role: 'trader' | 'admin' | 'super_admin';
  tier: 'free' | 'forex_only' | 'futures_forex';
  marketAccess: string;
  status: 'active' | 'suspended' | 'pending_deletion';
  createdAt: string;
  lastActive?: string;
  preferredMarket?: 'Futures' | 'Forex' | 'Both';
  riskLimit?: '1%' | '2%' | '5%';
  signalsViewed?: number;
  watchlistCount?: number;
  deletedAt?: string;
  purgeAt?: string;
  daysRemaining?: number;
}

const initialUserProfiles: UserProfile[] = [
  { id: 'usr_admin', name: 'System Administrator', email: 'admin@mannaedge.com', password: 'password123', mustChangePassword: false, role: 'admin', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date(Date.now() - 90 * 86400000).toISOString(), lastActive: 'Just now', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 412, watchlistCount: 12 },
  { id: 'usr_david', name: 'David Chen', email: 'dchen@retailtrader.com', password: 'password123', mustChangePassword: false, role: 'trader', tier: 'free', marketAccess: '2 Futures + 2 Forex', status: 'active', createdAt: new Date(Date.now() - 30 * 86400000).toISOString(), lastActive: 'Yesterday', preferredMarket: 'Futures', riskLimit: '1%', signalsViewed: 45, watchlistCount: 2 },
  { id: 'usr_sarah', name: 'Sarah Jenkins', email: 's.jenkins@forexdesk.com', password: 'password123', mustChangePassword: false, role: 'trader', tier: 'forex_only', marketAccess: 'forex', status: 'active', createdAt: new Date(Date.now() - 15 * 86400000).toISOString(), lastActive: '2 hours ago', preferredMarket: 'Forex', riskLimit: '2%', signalsViewed: 89, watchlistCount: 5 },
  { id: 'usr_alex', name: 'Alex Thompson', email: 'alex.t@propfirm.com', password: 'password123', mustChangePassword: false, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date(Date.now() - 45 * 86400000).toISOString(), lastActive: '10 mins ago', preferredMarket: 'Both', riskLimit: '2%', signalsViewed: 230, watchlistCount: 9 },
  { id: 'usr_marcus', name: 'Marcus Vance', email: 'vance.m@alphaquant.co', password: 'password123', mustChangePassword: false, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date(Date.now() - 60 * 86400000).toISOString(), lastActive: '5 mins ago', preferredMarket: 'Futures', riskLimit: '5%', signalsViewed: 178, watchlistCount: 7 },
  { id: 'usr_demo', name: 'Institutional Trader (Default)', email: 'trader@mannaedge.com', password: 'password123', mustChangePassword: false, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Just now', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 310, watchlistCount: 15 }
];

let userStore: UserProfile[] = [...initialUserProfiles];
let holdingZoneStore: UserProfile[] = [];

export const getAllUsers = (): UserProfile[] => {
  return userStore;
};

export const getHoldingZoneUsers = (): UserProfile[] => {
  const now = Date.now();
  // Filter out any users older than 30 days (auto-purge)
  holdingZoneStore = holdingZoneStore.filter(u => {
    if (!u.purgeAt) return true;
    return new Date(u.purgeAt).getTime() > now;
  });

  return holdingZoneStore.map(u => {
    const purgeTime = u.purgeAt ? new Date(u.purgeAt).getTime() : now + 30 * 86400000;
    const remainingMs = Math.max(0, purgeTime - now);
    const daysRemaining = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
    return { ...u, daysRemaining };
  });
};

export const addUser = (profile: { 
  name: string; 
  email: string; 
  password?: string;
  mustChangePassword?: boolean;
  role?: 'trader' | 'admin' | 'super_admin'; 
  tier?: 'free' | 'forex_only' | 'futures_forex';
  preferredMarket?: 'Futures' | 'Forex' | 'Both';
  riskLimit?: '1%' | '2%' | '5%';
}): UserProfile => {
  const newUser: UserProfile = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    name: profile.name,
    email: profile.email,
    password: profile.password || 'temp123',
    mustChangePassword: profile.mustChangePassword !== undefined ? profile.mustChangePassword : true,
    role: profile.role || 'trader',
    tier: profile.tier || 'free',
    marketAccess: profile.tier === 'forex_only' ? 'forex' : profile.tier === 'free' ? '2 Futures + 2 Forex' : 'all',
    status: 'active',
    createdAt: new Date().toISOString(),
    lastActive: 'Preloaded - Pending First Login',
    preferredMarket: profile.preferredMarket || 'Both',
    riskLimit: profile.riskLimit || '1%',
    signalsViewed: 0,
    watchlistCount: 0
  };

  const existingIdx = userStore.findIndex(u => u.email.toLowerCase() === profile.email.toLowerCase());
  if (existingIdx >= 0) {
    userStore[existingIdx] = { ...userStore[existingIdx], ...newUser };
    return userStore[existingIdx];
  }

  userStore.unshift(newUser);
  return newUser;
};

export const bulkPreloadUsers = (
  rawUsers: Array<{ name: string; email: string; tier?: 'free' | 'forex_only' | 'futures_forex'; role?: 'trader' | 'admin' }>
): { importedCount: number; users: UserProfile[] } => {
  let count = 0;
  for (const raw of rawUsers) {
    if (raw.name && raw.email) {
      addUser({
        name: raw.name.trim(),
        email: raw.email.trim(),
        role: raw.role || 'trader',
        tier: raw.tier || 'futures_forex',
        mustChangePassword: true
      });
      count++;
    }
  }

  return { importedCount: count, users: getAllUsers() };
};

export const completeFirstLoginPasswordSetup = (email: string, newPassword: string): { success: boolean; user?: UserProfile; error?: string } => {
  const user = userStore.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return { success: false, error: 'User account not found' };

  user.password = newPassword;
  user.mustChangePassword = false;
  user.lastActive = 'Just logged in';
  return { success: true, user };
};

export const updateUserTier = (userId: string, tier: 'free' | 'forex_only' | 'futures_forex'): UserProfile | null => {
  const user = userStore.find(u => u.id === userId || u.email === userId);
  if (!user) return null;

  user.tier = tier;
  user.marketAccess = tier === 'forex_only' ? 'forex' : tier === 'free' ? '2 Futures + 2 Forex' : 'all';
  return user;
};

export const updateUserPassword = (
  userId: string,
  newPassword: string,
  requesterRole: 'trader' | 'admin' | 'super_admin',
  requesterEmail?: string
): { success: boolean; error?: string } => {
  const target = userStore.find(u => u.id === userId || u.email.toLowerCase() === userId.toLowerCase());
  if (!target) {
    return { success: false, error: 'User account not found' };
  }

  const isSelf = Boolean(requesterEmail && requesterEmail.toLowerCase() === target.email.toLowerCase());

  // Rule 1: Self password change is always allowed
  if (isSelf) {
    target.password = newPassword;
    target.mustChangePassword = false;
    return { success: true };
  }

  // Rule 2: Super Admin can change password for ANY trader or admin account
  if (requesterRole === 'super_admin') {
    target.password = newPassword;
    return { success: true };
  }

  // Rule 3: Regular Admin can change password for TRADER accounts, but CANNOT change password for ADMIN accounts
  if (requesterRole === 'admin') {
    if (target.role === 'admin' || target.role === 'super_admin') {
      return { success: false, error: 'Access Denied: Only Super Admin can change an Admin account password.' };
    }
    target.password = newPassword;
    return { success: true };
  }

  return { success: false, error: 'Unauthorized: You do not have permission to change this password.' };
};

export const softDeleteUser = (userId: string): { success: boolean; user?: UserProfile } => {
  const idx = userStore.findIndex(u => u.id === userId || u.email === userId);
  if (idx === -1) return { success: false };

  const [target] = userStore.splice(idx, 1);
  const now = new Date();
  const purgeDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

  target.status = 'pending_deletion';
  target.deletedAt = now.toISOString();
  target.purgeAt = purgeDate.toISOString();
  target.daysRemaining = 30;

  holdingZoneStore.unshift(target);
  return { success: true, user: target };
};

export const restoreUser = (userId: string): { success: boolean; user?: UserProfile } => {
  const idx = holdingZoneStore.findIndex(u => u.id === userId || u.email === userId);
  if (idx === -1) return { success: false };

  const [target] = holdingZoneStore.splice(idx, 1);
  target.status = 'active';
  delete target.deletedAt;
  delete target.purgeAt;
  delete target.daysRemaining;

  const activeIdx = userStore.findIndex(u => u.id === target.id);
  if (activeIdx >= 0) {
    userStore[activeIdx] = target;
  } else {
    userStore.unshift(target);
  }

  return { success: true, user: target };
};
