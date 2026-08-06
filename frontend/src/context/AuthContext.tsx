import React, { createContext, useContext, useState, useEffect } from 'react';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'trader' | 'admin' | 'super_admin';
  tier?: 'free' | 'forex_only' | 'futures_forex';
  marketAccess?: 'all' | 'futures' | 'forex';
  mustChangePassword?: boolean;
  isTrial?: boolean;
  trialExpiresAt?: string;
  trialDaysRemaining?: number;
  trialExpired?: boolean;
  lastActive?: string;
}

interface AuthContextType {
  user: User | null;
  originalAdmin: User | null;
  isImpersonating: boolean;
  login: (email: string, role?: 'trader' | 'admin' | 'super_admin', name?: string, tier?: 'free' | 'forex_only' | 'futures_forex', mustChangePassword?: boolean) => void;
  logout: () => void;
  elevateToSuperAdmin: () => void;
  impersonateUser: (targetUser: User) => void;
  stopImpersonating: () => void;
  updateMustChangePassword: (val: boolean) => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('manna_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [originalAdmin, setOriginalAdmin] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('manna_admin_backup');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const isImpersonating = !!originalAdmin;

  useEffect(() => {
    if (user) {
      localStorage.setItem('manna_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('manna_user');
    }
  }, [user]);

  useEffect(() => {
    if (originalAdmin) {
      localStorage.setItem('manna_admin_backup', JSON.stringify(originalAdmin));
    } else {
      localStorage.removeItem('manna_admin_backup');
    }
  }, [originalAdmin]);

  const login = (email: string, role: 'trader' | 'admin' | 'super_admin' = 'trader', name?: string, tier: 'free' | 'forex_only' | 'futures_forex' = 'futures_forex', mustChangePassword: boolean = false) => {
    const defaultName = role === 'super_admin' ? 'Super Administrator (Master)' : role === 'admin' ? 'System Administrator' : 'Institutional Trader';
    const newUser: User = {
      id: `usr_${Date.now()}`,
      name: name || defaultName,
      email,
      role,
      tier: (role === 'admin' || role === 'super_admin') ? 'futures_forex' : tier,
      marketAccess: tier === 'forex_only' ? 'forex' : 'all',
      mustChangePassword
    };
    setOriginalAdmin(null);
    setUser(newUser);
  };

  const updateMustChangePassword = (val: boolean) => {
    if (user) {
      const updated = { ...user, mustChangePassword: val };
      setUser(updated);
      localStorage.setItem('manna_user', JSON.stringify(updated));
    }
  };

  const impersonateUser = (targetUser: User) => {
    if (user?.role === 'admin' || user?.role === 'super_admin' || originalAdmin?.role === 'admin' || originalAdmin?.role === 'super_admin') {
      const adminToBackup = originalAdmin || user;
      setOriginalAdmin(adminToBackup);
      setUser({
        ...targetUser,
        tier: targetUser.tier || 'futures_forex'
      });
    } else {
      console.warn('Impersonation denied: Only Admins and Super Admins can impersonate user accounts.');
    }
  };

  const stopImpersonating = () => {
    if (originalAdmin) {
      setUser(originalAdmin);
      setOriginalAdmin(null);
    }
  };

  const elevateToSuperAdmin = () => {
    if (user) {
      const superUser: User = {
        ...user,
        role: 'super_admin',
        tier: 'futures_forex'
      };
      setUser(superUser);
      localStorage.setItem('manna_user', JSON.stringify(superUser));
    } else {
      login('superadmin@mannaedge.com', 'super_admin', 'Master Telemetry Admin', 'futures_forex');
    }
  };

  const logout = () => {
    setUser(null);
    setOriginalAdmin(null);
    try {
      localStorage.removeItem('manna_user');
      localStorage.removeItem('manna_original_admin');
      localStorage.removeItem('manna_passcode_unlocked');
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  };

  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        originalAdmin, 
        isImpersonating, 
        login, 
        logout, 
        elevateToSuperAdmin,
        impersonateUser, 
        stopImpersonating,
        updateMustChangePassword,
        isAuthenticated: !!user 
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
