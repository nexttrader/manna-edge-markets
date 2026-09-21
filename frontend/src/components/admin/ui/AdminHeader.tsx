import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

export interface AdminTabConfig {
  id: string;
  label: string;
  icon: string;
  count?: number | string;
  alertCount?: number;
  color?: string;
}

export interface AdminHeaderProps {
  currentConsole: 'admin' | 'super_admin';
  userName?: string;
  userEmail?: string;
  isSuperAdminUser: boolean;
  tabs: AdminTabConfig[];
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  onOpenCommandCenter: () => void;
  onLogout: () => void;
  twelveDataUsage?: {
    credits_left_today: number;
    plan_daily_limit: number;
    daily_usage: number;
    timestamp?: string;
  } | null;
  onRefreshTwelveData?: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  currentConsole,
  userName = 'Administrator',
  isSuperAdminUser,
  tabs,
  activeTab,
  onSelectTab,
  onOpenCommandCenter,
  onLogout,
  twelveDataUsage,
  onRefreshTwelveData
}) => {
  const navigate = useNavigate();

  return (
    <header className="console-header">
      {/* Top Utility & Brand Bar */}
      <div className="console-header-inner">
        {/* Left: Brand, Back link & Titles */}
        <div className="console-brand-section">
          <Link to="/dashboard" className="console-return-btn font-mono" title="Back to Trader Dashboard">
            ← Trader Dashboard
          </Link>

          <div className="console-title-group">
            <div className="console-app-name font-mono">Manna Edge Markets</div>
            <div className="console-title-row">
              <h1 className="console-main-title">
                {currentConsole === 'super_admin' ? '👑 Master Telemetry & Vault' : '🛡️ Strategy & Performance Desk'}
              </h1>

              {/* Console Switcher (for privileged users) */}
              {isSuperAdminUser && (
                <div className="console-switcher font-mono">
                  <button
                    type="button"
                    className={`console-switcher-btn ${currentConsole === 'admin' ? 'active-admin' : ''}`}
                    onClick={() => navigate('/admin')}
                    title="Switch to Admin Desk"
                  >
                    🛡️ Admin
                  </button>
                  <button
                    type="button"
                    className={`console-switcher-btn ${currentConsole === 'super_admin' ? 'active-vault' : ''}`}
                    onClick={() => navigate('/vault-5287')}
                    title="Switch to Super Admin Vault"
                  >
                    👑 Vault
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Center: Searchable Command Center Bar */}
        <button
          type="button"
          className="console-command-trigger font-mono"
          onClick={onOpenCommandCenter}
          title="Open Command Center (⌘K)"
        >
          <span className="console-command-trigger-text">
            <span>🔍</span>
            <span>Search or jump to...</span>
          </span>
          <span className="console-kbd-shortcut">⌘K</span>
        </button>

        {/* Right: Live Telemetry / User Pill / Logout */}
        <div className="console-header-right font-mono">
          {/* Twelve Data Quota Pill (Super Admin only) */}
          {currentConsole === 'super_admin' && twelveDataUsage && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(0, 229, 255, 0.08)',
                border: '1px solid rgba(0, 229, 255, 0.3)',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.74rem'
              }}
            >
              <span style={{ color: '#00e5ff', fontWeight: 800 }}>
                📶 TD Credits: {twelveDataUsage.credits_left_today} / {twelveDataUsage.plan_daily_limit}
              </span>
              {onRefreshTwelveData && (
                <button
                  type="button"
                  onClick={onRefreshTwelveData}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#00e5ff',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    padding: 0
                  }}
                  title="Refresh Twelve Data Quota"
                >
                  🔄
                </button>
              )}
            </div>
          )}

          {/* Role Badge */}
          <div className={`console-role-pill ${currentConsole === 'super_admin' ? 'vault' : 'admin'}`}>
            {currentConsole === 'super_admin' ? '👑 SUPER ADMIN' : `⚙️ ${userName}`}
          </div>

          {/* Sign Out Button */}
          <button
            type="button"
            className="console-btn-logout"
            onClick={onLogout}
            title="Sign out of console"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Navigation Tabs Strip */}
      <nav className="console-nav-strip">
        <div className="console-nav-inner font-mono">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                className={`console-tab-item ${isActive ? 'active' : ''} ${currentConsole === 'super_admin' ? 'vault-style' : ''}`}
                onClick={() => onSelectTab(tab.id)}
                style={isActive && tab.color ? { borderColor: tab.color } : {}}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className="console-tab-counter">{tab.count}</span>
                )}
                {tab.alertCount !== undefined && tab.alertCount > 0 && (
                  <span className="console-tab-badge-alert">{tab.alertCount}</span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </header>
  );
};
