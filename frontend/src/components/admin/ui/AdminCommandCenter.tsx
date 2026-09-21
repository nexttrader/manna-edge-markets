import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

export interface CommandItem {
  id: string;
  title: string;
  description: string;
  category: 'Destinations' | 'Quick Actions' | 'System Tools' | 'Cross-Console';
  icon: string;
  tag?: string;
  isVault?: boolean;
  onSelect: () => void;
}

export interface AdminCommandCenterProps {
  isOpen: boolean;
  onClose: () => void;
  currentConsole: 'admin' | 'super_admin';
  isSuperAdminUser?: boolean;
  onSelectTab: (tabId: string) => void;
  onTriggerAction?: (actionId: string) => void;
}

export const AdminCommandCenter: React.FC<AdminCommandCenterProps> = ({
  isOpen,
  onClose,
  currentConsole,
  isSuperAdminUser = false,
  onSelectTab,
  onTriggerAction
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Focus input automatically when opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        setQuery('');
        setSelectedIndex(0);
        inputRef.current?.focus();
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle global shortcut (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          // Open handled by parent or state
        }
      }
      if (isOpen && e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Build command inventory
  const allCommands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [];

    // --- Tab Destinations (Current Console) ---
    if (currentConsole === 'admin') {
      items.push(
        {
          id: 'admin_overview',
          title: 'Mission Control Landing Hub',
          description: 'High-level operational overview & quick destination tiles',
          category: 'Destinations',
          icon: '🎛️',
          tag: 'Admin',
          onSelect: () => { onSelectTab('overview'); onClose(); }
        },
        {
          id: 'admin_users',
          title: 'User Accounts & Impersonation Desk',
          description: 'Manage trader accounts, passcodes, tiers & risk limits',
          category: 'Destinations',
          icon: '👤',
          tag: 'Admin',
          onSelect: () => { onSelectTab('users'); onClose(); }
        },
        {
          id: 'admin_engine',
          title: 'Strategy Engine & Manual Scans',
          description: 'Trigger killzone scans, toggle algorithms & manage live signals',
          category: 'Destinations',
          icon: '⚡',
          tag: 'Admin',
          onSelect: () => { onSelectTab('engine'); onClose(); }
        },
        {
          id: 'admin_analytics',
          title: 'Conviction & Realized Outcomes',
          description: 'Review win rates, R-multiples, decision matrix & performance reports',
          category: 'Destinations',
          icon: '🎯',
          tag: 'Admin',
          onSelect: () => { onSelectTab('analytics'); onClose(); }
        },
        {
          id: 'admin_history',
          title: 'Engine Run History & Logs',
          description: 'Audit automated cron runs, execution timing and error states',
          category: 'Destinations',
          icon: '📜',
          tag: 'Admin',
          onSelect: () => { onSelectTab('history'); onClose(); }
        },
        {
          id: 'admin_support',
          title: 'Support Centre & Live Inbox',
          description: 'View trader support tickets and issue instant responses',
          category: 'Destinations',
          icon: '🎫',
          tag: 'Admin',
          onSelect: () => { onSelectTab('support'); onClose(); }
        }
      );
    } else {
      // Super Admin Destinations
      items.push(
        {
          id: 'vault_overview',
          title: 'Master Telemetry Landing Hub',
          description: 'Root system overview, live vitals and executive destination tiles',
          category: 'Destinations',
          icon: '🎛️',
          tag: 'Vault',
          isVault: true,
          onSelect: () => { onSelectTab('overview'); onClose(); }
        },
        {
          id: 'vault_assets',
          title: 'Multi-Market Asset Visibility Hub',
          description: 'Configure active Forex & Futures symbols and strategy assignments',
          category: 'Destinations',
          icon: '🎯',
          tag: 'Vault',
          isVault: true,
          onSelect: () => { onSelectTab('assets'); onClose(); }
        },
        {
          id: 'vault_strategy_comparison',
          title: 'Strategy Analytics & Benchmarks',
          description: 'Side-by-side equity curves, drawdown benchmarks and strategy comparison',
          category: 'Destinations',
          icon: '⚔️',
          tag: 'Vault',
          isVault: true,
          onSelect: () => { onSelectTab('strategy_comparison'); onClose(); }
        },
        {
          id: 'vault_sentinel',
          title: 'Manna Elite Engine Tuning',
          description: 'Configure hyper-parameters, conviction thresholds & model rollouts',
          category: 'Destinations',
          icon: '🤖',
          tag: 'Vault',
          isVault: true,
          onSelect: () => { onSelectTab('sentinel'); onClose(); }
        },
        {
          id: 'vault_roster',
          title: 'User & Admin Governance Roster',
          description: 'Promote admins, manage staff access and user security profiles',
          category: 'Destinations',
          icon: '👥',
          tag: 'Vault',
          isVault: true,
          onSelect: () => { onSelectTab('roster'); onClose(); }
        },
        {
          id: 'vault_notifications',
          title: 'Notification Governance & Telegram Alerts',
          description: 'Configure multi-market Telegram broadcast feeds & triggers',
          category: 'Destinations',
          icon: '📡',
          tag: 'Vault',
          isVault: true,
          onSelect: () => { onSelectTab('notifications'); onClose(); }
        },
        {
          id: 'vault_strategies',
          title: 'Strategy Master Controls',
          description: 'Root algorithm enable/disable killswitches and master params',
          category: 'Destinations',
          icon: '⚙️',
          tag: 'Vault',
          isVault: true,
          onSelect: () => { onSelectTab('strategies'); onClose(); }
        },
        {
          id: 'vault_marketing',
          title: 'Marketing & Funnel Telemetry',
          description: 'Analyze visitor conversion funnels, churn, and estimated MRR',
          category: 'Destinations',
          icon: '📈',
          tag: 'Vault',
          isVault: true,
          onSelect: () => { onSelectTab('marketing'); onClose(); }
        },
        {
          id: 'vault_heatmap',
          title: 'Usage Heatmap & Feature Tracking',
          description: 'Telemetry visualization of peak platform engagement hours',
          category: 'Destinations',
          icon: '📊',
          tag: 'Vault',
          isVault: true,
          onSelect: () => { onSelectTab('heatmap'); onClose(); }
        },
        {
          id: 'vault_admin_audit',
          title: 'Admin Security Audit Trail',
          description: 'Immutable ledger of staff logins, credential resets & setting changes',
          category: 'Destinations',
          icon: '🛡️',
          tag: 'Vault',
          isVault: true,
          onSelect: () => { onSelectTab('admin_audit'); onClose(); }
        },
        {
          id: 'vault_client_accuracy',
          title: 'Client Accuracy Intelligence',
          description: 'Audit realized client trades vs engine signals & slippage',
          category: 'Destinations',
          icon: '🏷️',
          tag: 'Vault',
          isVault: true,
          onSelect: () => { onSelectTab('client_accuracy'); onClose(); }
        }
      );
    }

    // --- Quick Operational Actions ---
    items.push(
      {
        id: 'action_manna_scan',
        title: '⚡ Trigger Manna SnD Scan',
        description: 'Initiate on-demand multi-asset supply & demand liquidity scan',
        category: 'Quick Actions',
        icon: '⚡',
        tag: 'Action',
        onSelect: () => {
          if (onTriggerAction) onTriggerAction('manna_scan');
          else onSelectTab('engine');
          onClose();
        }
      },
      {
        id: 'action_asia_scan',
        title: '🌏 Trigger Asia Session Scan',
        description: 'Execute instant Asian killzone setup discovery pipeline',
        category: 'Quick Actions',
        icon: '🌏',
        tag: 'Action',
        onSelect: () => {
          if (onTriggerAction) onTriggerAction('scan_asia');
          else onSelectTab('engine');
          onClose();
        }
      },
      {
        id: 'action_london_scan',
        title: '🏛️ Trigger London Session Scan',
        description: 'Execute instant London open killzone setup discovery pipeline',
        category: 'Quick Actions',
        icon: '🏛️',
        tag: 'Action',
        onSelect: () => {
          if (onTriggerAction) onTriggerAction('scan_london');
          else onSelectTab('engine');
          onClose();
        }
      },
      {
        id: 'action_ny_am_scan',
        title: '🗽 Trigger New York AM Scan',
        description: 'Execute instant NY morning open setup discovery pipeline',
        category: 'Quick Actions',
        icon: '🗽',
        tag: 'Action',
        onSelect: () => {
          if (onTriggerAction) onTriggerAction('scan_ny_am');
          else onSelectTab('engine');
          onClose();
        }
      },
      {
        id: 'action_health_check',
        title: '🏥 Run System Health Diagnostics',
        description: 'Execute latency & connectivity checks across all engine subsystems',
        category: 'Quick Actions',
        icon: '🏥',
        tag: 'Diagnostics',
        onSelect: () => {
          if (onTriggerAction) onTriggerAction('health_check');
          onClose();
        }
      }
    );

    // Super Admin specific actions
    if (currentConsole === 'super_admin') {
      items.push(
        {
          id: 'action_download_audit_pdf',
          title: '📄 Download Latest SND Audit Report (PDF)',
          description: 'Compile and download instantaneous signal audit PDF documentation',
          category: 'Quick Actions',
          icon: '📄',
          tag: 'PDF',
          isVault: true,
          onSelect: () => {
            if (onTriggerAction) onTriggerAction('download_audit_pdf');
            onClose();
          }
        },
        {
          id: 'action_refresh_twelve_data',
          title: '🔄 Refresh Twelve Data Credits',
          description: 'Query live Twelve Data API quota remaining for today',
          category: 'Quick Actions',
          icon: '🔄',
          tag: 'API',
          isVault: true,
          onSelect: () => {
            if (onTriggerAction) onTriggerAction('refresh_twelve_data');
            onClose();
          }
        }
      );
    }

    // --- Cross-Console & Global Navigation ---
    if (isSuperAdminUser) {
      if (currentConsole === 'admin') {
        items.push({
          id: 'nav_switch_vault',
          title: '👑 Switch to Super Admin Vault',
          description: 'Navigate to root telemetry, asset controls & governance desk',
          category: 'Cross-Console',
          icon: '👑',
          tag: 'Switch',
          isVault: true,
          onSelect: () => {
            onClose();
            navigate('/vault-5287');
          }
        });
      } else {
        items.push({
          id: 'nav_switch_admin',
          title: '🛡️ Switch to Admin Desk',
          description: 'Navigate to operational strategy, user accounts & execution desk',
          category: 'Cross-Console',
          icon: '🛡️',
          tag: 'Switch',
          onSelect: () => {
            onClose();
            navigate('/admin');
          }
        });
      }
    }

    items.push({
      id: 'nav_trader_dashboard',
      title: '📊 Open Trader Dashboard',
      description: 'Return to live client market terminal and active trade setups',
      category: 'Cross-Console',
      icon: '📊',
      tag: 'Return',
      onSelect: () => {
        onClose();
        navigate('/dashboard');
      }
    });

    return items;
  }, [currentConsole, isSuperAdminUser, onSelectTab, onTriggerAction, onClose, navigate]);

  // Filter commands by search query
  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allCommands;
    return allCommands.filter(cmd =>
      cmd.title.toLowerCase().includes(q) ||
      cmd.description.toLowerCase().includes(q) ||
      cmd.category.toLowerCase().includes(q) ||
      (cmd.tag && cmd.tag.toLowerCase().includes(q))
    );
  }, [allCommands, query]);

  // Keyboard navigation within list
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].onSelect();
      }
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current) {
      const selectedEl = resultsRef.current.querySelector('.command-item.selected') as HTMLElement;
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="command-modal-overlay" onClick={onClose}>
      <div className="command-dialog" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        {/* Search Input Bar */}
        <div className="command-input-row">
          <span className="command-search-icon">🔍</span>
          <input
            ref={inputRef}
            type="text"
            className="command-search-input"
            placeholder={
              currentConsole === 'admin'
                ? "Search Admin pages, actions, scans (e.g. 'users', 'scans', 'health')..."
                : "Search Super Admin tools, telemetry, audits (e.g. 'assets', 'telegram', 'pdf')..."
            }
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
          />
          {query && (
            <button className="command-clear-btn" onClick={() => setQuery('')}>
              ✕
            </button>
          )}
        </div>

        {/* Results List */}
        <div className="command-results-list" ref={resultsRef}>
          {filteredCommands.length === 0 ? (
            <div className="command-empty-state">
              No matching destinations or actions found for "{query}"
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              const isPrevDiffCat = idx === 0 || filteredCommands[idx - 1].category !== cmd.category;

              return (
                <React.Fragment key={cmd.id}>
                  {isPrevDiffCat && (
                    <div className="command-group-heading">{cmd.category}</div>
                  )}
                  <div
                    className={`command-item ${isSelected ? 'selected' : ''} ${cmd.isVault ? 'vault-highlight' : ''}`}
                    onClick={cmd.onSelect}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div className="command-item-left">
                      <span className="command-item-icon">{cmd.icon}</span>
                      <div className="command-item-info">
                        <div className="command-item-title">{cmd.title}</div>
                        <div className="command-item-desc">{cmd.description}</div>
                      </div>
                    </div>
                    <div className="command-item-right">
                      {cmd.tag && <span className="command-item-tag">{cmd.tag}</span>}
                      {isSelected && (
                        <span style={{ fontSize: '0.72rem', color: '#c9a84c', fontWeight: 800 }}>
                          ↵ Execute
                        </span>
                      )}
                    </div>
                  </div>
                </React.Fragment>
              );
            })
          )}
        </div>

        {/* Footer Shortcut Legend */}
        <div className="command-footer">
          <div className="command-keys-legend">
            <span><strong style={{ color: '#ffffff' }}>↑↓</strong> to navigate</span>
            <span><strong style={{ color: '#ffffff' }}>↵</strong> to select</span>
            <span><strong style={{ color: '#ffffff' }}>esc</strong> to dismiss</span>
          </div>
          <span style={{ opacity: 0.8 }}>
            Console: <strong style={{ color: currentConsole === 'super_admin' ? '#b388ff' : '#ffab00' }}>
              {currentConsole === 'super_admin' ? 'SUPER ADMIN VAULT' : 'ADMIN DESK'}
            </strong>
          </span>
        </div>
      </div>
    </div>
  );
};
