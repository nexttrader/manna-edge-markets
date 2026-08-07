import React, { createContext, useContext, useState, useEffect } from 'react';
import { API_BASE } from '../config';

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
  customFeatures?: {
    maxSignals?: number;
    strategyAccess?: string;
    allowCalculators?: boolean;
    trialName?: string;
  };
}

interface AuthContextType {
  user: User | null;
  originalAdmin: User | null;
  isImpersonating: boolean;
  login: (
    email: string,
    role?: 'trader' | 'admin' | 'super_admin',
    name?: string,
    tier?: 'free' | 'forex_only' | 'futures_forex' | string,
    mustChangePassword?: boolean,
    isTrial?: boolean,
    trialDaysRemaining?: number,
    trialExpired?: boolean,
    trialExpiresAt?: string,
    customFeatures?: any
  ) => void;
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

  const login = (
    email: string,
    role: 'trader' | 'admin' | 'super_admin' = 'trader',
    name?: string,
    tier: 'free' | 'forex_only' | 'futures_forex' | string = 'futures_forex',
    mustChangePassword: boolean = false,
    isTrial: boolean = false,
    trialDaysRemaining?: number,
    trialExpired: boolean = false,
    trialExpiresAt?: string,
    customFeatures?: any
  ) => {
    const defaultName = role === 'super_admin' ? 'Super Administrator (Master)' : role === 'admin' ? 'System Administrator' : 'Institutional Trader';
    const newUser: User = {
      id: `usr_${Date.now()}`,
      name: name || defaultName,
      email,
      role,
      tier: (role === 'admin' || role === 'super_admin') ? 'futures_forex' : tier as any,
      marketAccess: tier === 'forex_only' ? 'forex' : 'all',
      mustChangePassword,
      isTrial,
      trialDaysRemaining,
      trialExpired,
      trialExpiresAt,
      customFeatures
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

  useEffect(() => {
    if (user && !isImpersonating) {
      // Sync user profile state dynamically on app load
      fetch(`${API_BASE}/api/admin/auth/profile?email=${encodeURIComponent(user.email)}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.user) {
            setUser(prev => {
              if (!prev) return null;
              const updated = {
                ...prev,
                name: data.user.name,
                role: data.user.role,
                tier: data.user.tier,
                mustChangePassword: data.user.mustChangePassword,
                isTrial: data.user.isTrial,
                trialExpiresAt: data.user.trialExpiresAt,
                trialDaysRemaining: data.user.trialDaysRemaining,
                trialExpired: data.user.trialExpired,
                customFeatures: data.user.customFeatures,
              };
              localStorage.setItem('manna_user', JSON.stringify(updated));
              return updated;
            });
          }
        })
        .catch(err => console.error('Failed to sync user profile:', err));
    }
  }, [user?.email, isImpersonating]);

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
