import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth, type RoleViewMode } from '../context/AuthContext';
import './RoleViewSwitcher.css';

interface RoleViewSwitcherProps {
  compact?: boolean;
  onAfterSwitch?: () => void;
}

const VIEW_OPTIONS: Array<{
  role: RoleViewMode;
  icon: string;
  label: string;
  title: string;
}> = [
  {
    role: 'super_admin',
    icon: '👑',
    label: 'Super',
    title: 'Super Admin View — see all signals, hidden assets, Vault & controls',
  },
  {
    role: 'admin',
    icon: '🛡️',
    label: 'Admin',
    title: 'Admin View — preview only what Admins are assigned by Super Admin',
  },
  {
    role: 'trader',
    icon: '👤',
    label: 'Client',
    title: 'Client View — preview Trader experience with hidden strategies & assets removed',
  },
];

export const RoleViewSwitcher: React.FC<RoleViewSwitcherProps> = ({
  compact = false,
  onAfterSwitch,
}) => {
  const { isRealSuperAdmin, isImpersonating, effectiveRole, setViewRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (!isRealSuperAdmin || isImpersonating) {
    return null;
  }

  const handleSelectRole = (nextRole: RoleViewMode) => {
    setViewRole(nextRole);

    if (nextRole === 'trader' && (location.pathname.startsWith('/admin') || location.pathname.startsWith('/vault-5287'))) {
      navigate('/dashboard');
    } else if (nextRole === 'admin' && location.pathname.startsWith('/vault-5287')) {
      navigate('/admin');
    }

    onAfterSwitch?.();
  };

  return (
    <div
      className={`role-view-switcher font-mono ${compact ? 'is-compact' : ''} ${effectiveRole !== 'super_admin' ? 'is-previewing' : ''}`}
      role="group"
      aria-label="Switch Role View"
      title="Switch between Super Admin, Admin, and Client views without logging out"
    >
      {!compact && <span className="rvs-prefix">VIEW:</span>}
      {VIEW_OPTIONS.map((opt) => {
        const isActive = effectiveRole === opt.role;
        return (
          <button
            key={opt.role}
            type="button"
            className={`rvs-btn ${opt.role} ${isActive ? 'active' : ''}`}
            onClick={() => handleSelectRole(opt.role)}
            title={opt.title}
            aria-pressed={isActive}
          >
            <span className="rvs-icon">{opt.icon}</span>
            <span className="rvs-label">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
};
