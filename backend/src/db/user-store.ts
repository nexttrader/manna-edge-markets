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
  isTrial?: boolean;
  trialExpiresAt?: string;
  trialDaysRemaining?: number;
  trialExpired?: boolean;
}

const initialUserProfiles: UserProfile[] = [
  { id: 'usr_admin', name: 'System Administrator', email: 'admin@mannaedge.com', password: 'password123', mustChangePassword: false, role: 'admin', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date(Date.now() - 90 * 86400000).toISOString(), lastActive: 'Just now', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 412, watchlistCount: 12 },
  { id: 'usr_kaylin', name: 'Kaylin Van Ordt', email: 'kaylinangelinemeyer@gmail.com', password: 'temp123', mustChangePassword: true, role: 'admin', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_isabell', name: 'Isabell Truitt', email: 'isabelltruitt@gmail.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_david_lee', name: 'David Lee', email: 'fabulousyachts@me.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_parke', name: 'Parke Deans', email: 'pl_deans@comcast.net', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_teresa', name: 'Teresa Orton', email: 'fcubed.tfo@gmail.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_bob', name: 'Bob Wills', email: 'bwills@socal.rr.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_timothy', name: 'Timothy Miranda', email: 'timothyj.miranda@icloud.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_lance', name: 'Lance Smith', email: 'smithlrds@gmail.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_sean', name: 'Sean Findley', email: 'fins@iglide.net', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_chris', name: 'Chris Edwards', email: 'chrislek@aol.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_elizabeth', name: 'Elizabeth Speers', email: 'icanoe@mac.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_jeffery', name: 'Jeffery Smith', email: 'jeffery.j.smith007@gmail.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_alberto', name: 'Alberto Guevara', email: 'solyjupiter2016@gmail.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_douglas_h', name: 'Douglas Hardiman', email: 'douglashardiman@gmail.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_karen', name: 'Karen Millar', email: 'tkmillar1611@yahoo.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_sequoia', name: 'Sequoia Ross', email: 'sequoiaross@protonmail.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_claudio', name: 'Claudio Martinez', email: 'dalastclaw@gmail.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_mark', name: 'Mark Martino', email: 'mtino15@gmail.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_valerie', name: 'Valerie Chaille', email: 'valerie.chaille@gmail.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_joseph', name: 'Joseph Tucker', email: 'coachjrt@gmail.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_andre_sr', name: 'Andre Martin', email: 'andremartinsr@gmail.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_douglas_s', name: 'Douglas Schulz', email: 'drschulz@sbcglobal.net', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_dennis', name: 'Dennis Brock', email: 'dennisbrock83@gmail.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_deb', name: 'Deb Mead', email: 'lilomee@gmail.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_cassandra', name: 'Cassandra Irwin', email: 'cassylee1344@gmail.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_andre_mst', name: 'Andre Martin', email: 'andremartmst@gmail.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_george', name: 'George Arceneaux Jr', email: 'georgearceneauxtrades@gmail.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_chad', name: 'Chad Terrell', email: 'spirittrading25@gmail.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_brian', name: 'Brian Hillabush', email: 'bhillabush@gmail.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_mary', name: 'Mary E Herriott', email: '1dawnmillie@gmail.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_sade', name: 'Sade Aina', email: 'falx3trade@gmail.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 }
];

let userStore: UserProfile[] = [...initialUserProfiles];
let holdingZoneStore: UserProfile[] = [];

export const getAllUsers = (): UserProfile[] => {
  const now = Date.now();
  return userStore.map(u => {
    if (u.isTrial && u.trialExpiresAt) {
      const expiresTime = new Date(u.trialExpiresAt).getTime();
      const remainingMs = Math.max(0, expiresTime - now);
      const trialDaysRemaining = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
      const trialExpired = remainingMs <= 0;
      return {
        ...u,
        trialDaysRemaining,
        trialExpired
      };
    }
    return u;
  });
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
  isTrial?: boolean;
}): UserProfile => {
  const now = new Date();
  const trialExpiresDate = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000); // 21 days from now

  const newUser: UserProfile = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    name: profile.name,
    email: profile.email,
    password: profile.password || 'temp123',
    mustChangePassword: profile.mustChangePassword !== undefined ? profile.mustChangePassword : true,
    role: profile.role || 'trader',
    tier: profile.tier || 'futures_forex',
    marketAccess: 'all',
    status: 'active',
    createdAt: now.toISOString(),
    lastActive: profile.isTrial ? 'Preloaded 21-Day VIP Trial' : 'Preloaded - Pending First Login',
    preferredMarket: profile.preferredMarket || 'Both',
    riskLimit: profile.riskLimit || '1%',
    signalsViewed: 0,
    watchlistCount: 0,
    isTrial: profile.isTrial || false,
    trialExpiresAt: profile.isTrial ? trialExpiresDate.toISOString() : undefined,
    trialDaysRemaining: profile.isTrial ? 21 : undefined,
    trialExpired: false
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
  rawUsers: Array<{ name: string; email: string; tier?: 'free' | 'forex_only' | 'futures_forex'; role?: 'trader' | 'admin' }>,
  isTrial: boolean = false
): { importedCount: number; users: UserProfile[] } => {
  let count = 0;
  for (const raw of rawUsers) {
    if (raw.name && raw.email) {
      addUser({
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
