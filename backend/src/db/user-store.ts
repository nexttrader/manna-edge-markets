export interface UserProfile {
  id: string;
  name: string;
  email: string;
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
  { id: 'usr_admin', name: 'System Administrator', email: 'admin@mannaedge.com', role: 'admin', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date(Date.now() - 90 * 86400000).toISOString(), lastActive: 'Just now', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 412, watchlistCount: 12 },
  { id: 'usr_david', name: 'David Chen', email: 'dchen@retailtrader.com', role: 'trader', tier: 'free', marketAccess: '2 Futures + 2 Forex', status: 'active', createdAt: new Date(Date.now() - 30 * 86400000).toISOString(), lastActive: 'Yesterday', preferredMarket: 'Futures', riskLimit: '1%', signalsViewed: 45, watchlistCount: 2 },
  { id: 'usr_sarah', name: 'Sarah Jenkins', email: 's.jenkins@forexdesk.com', role: 'trader', tier: 'forex_only', marketAccess: 'forex', status: 'active', createdAt: new Date(Date.now() - 15 * 86400000).toISOString(), lastActive: '2 hours ago', preferredMarket: 'Forex', riskLimit: '2%', signalsViewed: 89, watchlistCount: 5 },
  { id: 'usr_alex', name: 'Alex Thompson', email: 'alex.t@propfirm.com', role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date(Date.now() - 45 * 86400000).toISOString(), lastActive: '10 mins ago', preferredMarket: 'Both', riskLimit: '2%', signalsViewed: 230, watchlistCount: 9 },
  { id: 'usr_marcus', name: 'Marcus Vance', email: 'vance.m@alphaquant.co', role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date(Date.now() - 60 * 86400000).toISOString(), lastActive: '5 mins ago', preferredMarket: 'Futures', riskLimit: '5%', signalsViewed: 178, watchlistCount: 7 },
  { id: 'usr_demo', name: 'Institutional Trader (Default)', email: 'trader@mannaedge.com', role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Just now', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 310, watchlistCount: 15 }
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
  role?: 'trader' | 'admin' | 'super_admin'; 
  tier?: 'free' | 'forex_only' | 'futures_forex';
  preferredMarket?: 'Futures' | 'Forex' | 'Both';
  riskLimit?: '1%' | '2%' | '5%';
}): UserProfile => {
  const newUser: UserProfile = {
    id: `usr_${Date.now()}`,
    name: profile.name,
    email: profile.email,
    role: profile.role || 'trader',
    tier: profile.tier || 'free',
    marketAccess: profile.tier === 'forex_only' ? 'forex' : profile.tier === 'free' ? '2 Futures + 2 Forex' : 'all',
    status: 'active',
    createdAt: new Date().toISOString(),
    lastActive: 'Just created',
    preferredMarket: profile.preferredMarket || 'Both',
    riskLimit: profile.riskLimit || '1%',
    signalsViewed: 0,
    watchlistCount: 0
  };

  // Check active user store for exact duplicate active account
  const existingIdx = userStore.findIndex(u => u.email.toLowerCase() === profile.email.toLowerCase());
  if (existingIdx >= 0) {
    userStore[existingIdx] = { ...userStore[existingIdx], ...newUser };
    return userStore[existingIdx];
  }

  // If previous user with same details is in holding zone, new user can still be added!
  userStore.unshift(newUser);
  return newUser;
};

export const updateUserTier = (userId: string, tier: 'free' | 'forex_only' | 'futures_forex'): UserProfile | null => {
  const user = userStore.find(u => u.id === userId || u.email === userId);
  if (!user) return null;

  user.tier = tier;
  user.marketAccess = tier === 'forex_only' ? 'forex' : tier === 'free' ? '2 Futures + 2 Forex' : 'all';
  return user;
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

  // Re-add to active user store (overwrite if same ID exists)
  const activeIdx = userStore.findIndex(u => u.id === target.id);
  if (activeIdx >= 0) {
    userStore[activeIdx] = target;
  } else {
    userStore.unshift(target);
  }

  return { success: true, user: target };
};
