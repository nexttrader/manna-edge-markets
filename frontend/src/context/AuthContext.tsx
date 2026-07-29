import React, { createContext, useContext, useState, useEffect } from 'react';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'trader' | 'admin';
}

interface AuthContextType {
  user: User | null;
  login: (email: string, role?: 'trader' | 'admin', name?: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('manna_user');
      return saved ? JSON.parse(saved) : { id: 'usr_demo', name: 'Institutional Trader', email: 'trader@mannaedge.com', role: 'trader' };
    } catch {
      return { id: 'usr_demo', name: 'Institutional Trader', email: 'trader@mannaedge.com', role: 'trader' };
    }
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem('manna_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('manna_user');
    }
  }, [user]);

  const login = (email: string, role: 'trader' | 'admin' = 'trader', name?: string) => {
    const defaultName = role === 'admin' ? 'System Administrator' : 'Institutional Trader';
    const newUser: User = {
      id: `usr_${Date.now()}`,
      name: name || defaultName,
      email,
      role
    };
    setUser(newUser);
  };

  const logout = () => {
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
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
