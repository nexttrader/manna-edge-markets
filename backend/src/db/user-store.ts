export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'trader' | 'admin' | 'super_admin';
  tier: 'free' | 'forex_only' | 'futures_forex';
  marketAccess: string;
  status: 'active' | 'suspended';
  createdAt: string;
  lastActive?: string;
}

const initialUserProfiles: UserProfile[] = [
  { id: 'usr_admin', name: 'System Administrator', email: 'admin@mannaedge.com', role: 'admin', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Just now' },
  { id: 'usr_david', name: 'David Chen', email: 'dchen@retailtrader.com', role: 'trader', tier: 'free', marketAccess: '2 Futures + 2 Forex', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Yesterday' },
  { id: 'usr_sarah', name: 'Sarah Jenkins', email: 's.jenkins@forexdesk.com', role: 'trader', tier: 'forex_only', marketAccess: 'forex', status: 'active', createdAt: new Date().toISOString(), lastActive: '2 hours ago' },
  { id: 'usr_alex', name: 'Alex Thompson', email: 'alex.t@propfirm.com', role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: '10 mins ago' },
  { id: 'usr_marcus', name: 'Marcus Vance', email: 'vance.m@alphaquant.co', role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: '5 mins ago' },
  { id: 'usr_demo', name: 'Institutional Trader (Default)', email: 'trader@mannaedge.com', role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Just now' }
];

let userStore: UserProfile[] = [...initialUserProfiles];

export const getAllUsers = (): UserProfile[] => {
  return userStore;
};

export const addUser = (profile: { name: string; email: string; role?: 'trader' | 'admin' | 'super_admin'; tier?: 'free' | 'forex_only' | 'futures_forex' }): UserProfile => {
  const newUser: UserProfile = {
    id: `usr_${Date.now()}`,
    name: profile.name,
    email: profile.email,
    role: profile.role || 'trader',
    tier: profile.tier || 'free',
    marketAccess: profile.tier === 'forex_only' ? 'forex' : profile.tier === 'free' ? '2 Futures + 2 Forex' : 'all',
    status: 'active',
    createdAt: new Date().toISOString(),
    lastActive: 'Just created'
  };

  const existingIdx = userStore.findIndex(u => u.email.toLowerCase() === profile.email.toLowerCase());
  if (existingIdx >= 0) {
    userStore[existingIdx] = { ...userStore[existingIdx], ...newUser };
    return userStore[existingIdx];
  }

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
