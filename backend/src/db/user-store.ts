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
}

const initialUserProfiles: UserProfile[] = [
  { id: 'usr_chadwin_super', name: 'Chadwin Solomon', email: 'chadwinsolomon@gmail.com', password: 'temp123', mustChangePassword: true, role: 'super_admin', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded Super Admin - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_cindy', name: 'Cindy King', email: 'Cindy.king@kingdomdaytraders.com', password: 'temp123', mustChangePassword: true, role: 'admin', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded Admin - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_brian_king', name: 'Brian King', email: 'kdtfutures@gmail.com', password: 'temp123', mustChangePassword: true, role: 'admin', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded Admin - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
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
  { id: 'usr_sade', name: 'Sade Aina', email: 'falx3trade@gmail.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded - Pending First Login', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0 },
  { id: 'usr_joette', name: 'Joette Rodriguez', email: 'joetterodriguez@gmail.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded 21-Day VIP Trial Pass', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0, isTrial: true, trialExpiresAt: new Date(Date.now() + 21 * 86400000).toISOString(), trialDaysRemaining: 21, trialExpired: false },
  { id: 'usr_deven', name: 'Deven Daehn', email: 'devendaehn@gmail.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded 21-Day VIP Trial Pass', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0, isTrial: true, trialExpiresAt: new Date(Date.now() + 21 * 86400000).toISOString(), trialDaysRemaining: 21, trialExpired: false },
  { id: 'usr_sekou', name: 'Sekou Reid', email: 'sekou_reid@yahoo.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded 21-Day VIP Trial Pass', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0, isTrial: true, trialExpiresAt: new Date(Date.now() + 21 * 86400000).toISOString(), trialDaysRemaining: 21, trialExpired: false },
  { id: 'usr_joshua', name: 'Joshua Adam Smith', email: 'hcfman83@gmail.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded 21-Day VIP Trial Pass', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0, isTrial: true, trialExpiresAt: new Date(Date.now() + 21 * 86400000).toISOString(), trialDaysRemaining: 21, trialExpired: false },
  { id: 'usr_rigobert', name: 'Rigobert Ebonta', email: 'ebonta1@gmail.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded 21-Day VIP Trial Pass', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0, isTrial: true, trialExpiresAt: new Date(Date.now() + 21 * 86400000).toISOString(), trialDaysRemaining: 21, trialExpired: false },
  { id: 'usr_kelly', name: 'Kelly Carraway', email: 'kckingdomcapital@gmail.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded 21-Day VIP Trial Pass', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0, isTrial: true, trialExpiresAt: new Date(Date.now() + 21 * 86400000).toISOString(), trialDaysRemaining: 21, trialExpired: false },
  { id: 'usr_william', name: 'William Nathaniel Jewell', email: 'stillpressingtoward@yahoo.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded 21-Day VIP Trial Pass', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0, isTrial: true, trialExpiresAt: new Date(Date.now() + 21 * 86400000).toISOString(), trialDaysRemaining: 21, trialExpired: false },
  { id: 'usr_phillip', name: 'Phillip Steiner', email: 'coachphilsteiner@gmaiil.com', password: 'temp123', mustChangePassword: true, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Preloaded 21-Day VIP Trial Pass', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 0, watchlistCount: 0, isTrial: true, trialExpiresAt: new Date(Date.now() + 21 * 86400000).toISOString(), trialDaysRemaining: 21, trialExpired: false },
  { id: 'usr_demo_trader', name: 'Demo Trader', email: 'demo.trader@mannaedge.com', password: 'demopassword123', mustChangePassword: false, role: 'trader', tier: 'futures_forex', marketAccess: 'all', status: 'active', createdAt: new Date().toISOString(), lastActive: 'Active Demo Session', preferredMarket: 'Both', riskLimit: '1%', signalsViewed: 18, watchlistCount: 4 }
];

let userStore: UserProfile[] = [...initialUserProfiles];
let holdingZoneStore: UserProfile[] = [];

export const findUserByEmail = (email: string): UserProfile | undefined => {
  const all = getAllUsers();
  return all.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
};

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
  tier?: 'free' | 'forex_only' | 'futures_forex' | string;
  preferredMarket?: 'Futures' | 'Forex' | 'Both';
  riskLimit?: '1%' | '2%' | '5%';
  isTrial?: boolean;
  trialDays?: number;
}): UserProfile => {
  const now = new Date();
  const trialDays = profile.trialDays !== undefined ? profile.trialDays : 14; // Default 14-day trial
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
    trialStartedAt: now.toISOString(),
    trialExpiresAt: trialExpiresDate.toISOString(),
    trialDaysRemaining: trialDays,
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

export const updateUserRole = (userId: string, role: 'trader' | 'admin' | 'super_admin'): UserProfile | null => {
  const user = userStore.find(u => u.id === userId || u.email.toLowerCase() === userId.toLowerCase());
  if (!user) return null;
  user.role = role;
  return user;
};

export const updateUserStatus = (userId: string, status: 'active' | 'suspended'): UserProfile | null => {
  const user = userStore.find(u => u.id === userId || u.email.toLowerCase() === userId.toLowerCase());
  if (!user) return null;
  user.status = status;
  return user;
};

export const updateUserFull = (
  userId: string, 
  updates: Partial<Pick<UserProfile, 'name' | 'tier' | 'role' | 'status' | 'preferredMarket' | 'riskLimit'>>
): UserProfile | null => {
  const user = userStore.find(u => u.id === userId || u.email.toLowerCase() === userId.toLowerCase());
  if (!user) return null;
  if (updates.name) user.name = updates.name;
  if (updates.tier) user.tier = updates.tier;
  if (updates.role) user.role = updates.role;
  if (updates.status) user.status = updates.status;
  if (updates.preferredMarket) user.preferredMarket = updates.preferredMarket;
  if (updates.riskLimit) user.riskLimit = updates.riskLimit;
  return user;
};

export const pauseUserSubscription = (
  userId: string,
  autoResumeDate?: string
): { success: boolean; user?: UserProfile; error?: string } => {
  const user = userStore.find(u => u.id === userId || u.email.toLowerCase() === userId.toLowerCase());
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

  return { success: true, user };
};

export const resumeUserSubscription = (
  userId: string
): { success: boolean; user?: UserProfile; error?: string } => {
  const user = userStore.find(u => u.id === userId || u.email.toLowerCase() === userId.toLowerCase());
  if (!user) return { success: false, error: 'User account not found' };

  const now = new Date();
  const daysToAdd = user.pausedRemainingDays || 30;
  const newEnd = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

  user.status = 'active';
  user.subscriptionStatus = user.isTrial ? 'trialing' : 'active';
  user.subscriptionEnd = newEnd.toISOString();
  delete user.pauseStartDate;
  delete user.pauseResumeDate;
  delete user.pausedRemainingDays;

  return { success: true, user };
};

export const setCustomSubscriptionDates = (
  userId: string,
  startDate: string,
  endDate: string,
  billingCycle: 'monthly' | 'yearly' | 'custom' | 'lifetime' = 'custom'
): { success: boolean; user?: UserProfile; error?: string } => {
  const user = userStore.find(u => u.id === userId || u.email.toLowerCase() === userId.toLowerCase());
  if (!user) return { success: false, error: 'User account not found' };

  user.subscriptionStart = startDate;
  user.subscriptionEnd = endDate;
  user.billingCycle = billingCycle;
  user.status = 'active';
  user.subscriptionStatus = 'active';

  return { success: true, user };
};

export const extendUserTrial = (
  userId: string,
  daysToExtend: number
): { success: boolean; user?: UserProfile; error?: string } => {
  const user = userStore.find(u => u.id === userId || u.email.toLowerCase() === userId.toLowerCase());
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

  return { success: true, user };
};

export const bulkUpdateUsers = (
  userIds: string[],
  action: 'extend_trial_7d' | 'extend_sub_30d' | 'pause' | 'resume' | 'change_tier',
  payload?: any
): { updatedCount: number } => {
  let count = 0;
  for (const id of userIds) {
    if (action === 'extend_trial_7d') {
      if (extendUserTrial(id, 7).success) count++;
    } else if (action === 'extend_sub_30d') {
      const user = userStore.find(u => u.id === id || u.email.toLowerCase() === id.toLowerCase());
      if (user) {
        const curEnd = user.subscriptionEnd ? new Date(user.subscriptionEnd).getTime() : Date.now();
        user.subscriptionEnd = new Date(curEnd + 30 * 86400000).toISOString();
        user.status = 'active';
        count++;
      }
    } else if (action === 'pause') {
      if (pauseUserSubscription(id).success) count++;
    } else if (action === 'resume') {
      if (resumeUserSubscription(id).success) count++;
    } else if (action === 'change_tier' && payload?.tier) {
      if (updateUserTier(id, payload.tier)) count++;
    }
  }
  return { updatedCount: count };
};


