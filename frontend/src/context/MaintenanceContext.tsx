import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../config';
import { useAuth } from './AuthContext';

export interface MaintenanceState {
  enabled: boolean;
  message: string;
  estimatedReturnTime: string;
  updatedAt?: string;
  updatedBy?: string;
}

interface MaintenanceContextType {
  maintenance: MaintenanceState;
  loading: boolean;
  toggleMaintenance: (enabled: boolean, message?: string, estimatedReturnTime?: string) => Promise<boolean>;
  refetchMaintenance: () => Promise<void>;
}

const defaultState: MaintenanceState = {
  enabled: false,
  message: 'Manna is currently undergoing scheduled system maintenance.',
  estimatedReturnTime: 'Asia Session Today'
};

const MaintenanceContext = createContext<MaintenanceContextType>({
  maintenance: defaultState,
  loading: true,
  toggleMaintenance: async () => false,
  refetchMaintenance: async () => {}
});

export const MaintenanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [maintenance, setMaintenance] = useState<MaintenanceState>(defaultState);
  const [loading, setLoading] = useState(true);

  const fetchMaintenanceStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/system/maintenance`);
      if (res.ok) {
        const data = await res.json();
        setMaintenance({
          enabled: Boolean(data.enabled),
          message: data.message || defaultState.message,
          estimatedReturnTime: data.estimatedReturnTime || defaultState.estimatedReturnTime,
          updatedAt: data.updatedAt,
          updatedBy: data.updatedBy
        });
      }
    } catch (e) {
      console.warn('Failed to fetch maintenance status:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMaintenanceStatus();
    const interval = setInterval(fetchMaintenanceStatus, 20000); // poll every 20s
    return () => clearInterval(interval);
  }, [fetchMaintenanceStatus]);

  const toggleMaintenance = async (enabled: boolean, message?: string, estimatedReturnTime?: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/system/maintenance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-email': user?.email || 'admin@mannaedge.com',
          'x-admin-role': user?.role || 'admin'
        },
        body: JSON.stringify({
          enabled,
          message: message || maintenance.message,
          estimatedReturnTime: estimatedReturnTime || maintenance.estimatedReturnTime,
          updatedBy: user?.email || 'admin'
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.maintenance) {
          setMaintenance({
            enabled: Boolean(data.maintenance.enabled),
            message: data.maintenance.message || defaultState.message,
            estimatedReturnTime: data.maintenance.estimatedReturnTime || defaultState.estimatedReturnTime,
            updatedAt: data.maintenance.updatedAt,
            updatedBy: data.maintenance.updatedBy
          });
        }
        return true;
      }
    } catch (e) {
      console.error('Error toggling maintenance mode:', e);
    }
    return false;
  };

  return (
    <MaintenanceContext.Provider value={{ maintenance, loading, toggleMaintenance, refetchMaintenance: fetchMaintenanceStatus }}>
      {children}
    </MaintenanceContext.Provider>
  );
};

export const useMaintenance = () => useContext(MaintenanceContext);
