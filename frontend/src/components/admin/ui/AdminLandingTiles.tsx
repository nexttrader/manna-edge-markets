import React from 'react';

export interface AdminLandingTilesProps {
  currentConsole: 'admin' | 'super_admin';
  onNavigateTab: (tabId: string) => void;

  // Admin Data Vitals
  adminData?: {
    activeSetupsCount?: number;
    usersCount?: number;
    recentOutcomesCount?: number;
    runsCount?: number;
    unreadSupportCount?: number;
    systemHealth?: {
      heroStatus?: string;
      heroBadgeText?: string;
      simpleSummary?: string;
      lastCheckedAt?: string;
      subsystems?: Array<{
        id: string;
        name: string;
        icon: string;
        status: string;
        plainEnglishStatus: string;
        latencyMs: number;
      }>;
    } | null;
    circuitBreakerActive?: boolean;
    onTriggerMannaScan?: () => void;
    onRunHealthCheck?: () => void;
  };

  // Super Admin Data Vitals
  vaultData?: {
    sentinelSetupsCount?: number;
    sentinelWinRate?: number;
    estimatedMRR?: number;
    onlineTradersCount?: number;
    rosterCount?: number;
    strategiesCount?: number;
    adminLogsCount?: number;
    auditReportNumber?: number | string;
    onDownloadAuditPdf?: () => void;
    onTriggerTwelveDataRefresh?: () => void;
  };
}

export const AdminLandingTiles: React.FC<AdminLandingTilesProps> = ({
  currentConsole,
  onNavigateTab,
  adminData,
  vaultData
}) => {
  if (currentConsole === 'admin') {
    const {
      activeSetupsCount = 0,
      usersCount = 0,
      recentOutcomesCount = 0,
      runsCount = 0,
      unreadSupportCount = 0,
      systemHealth,
      circuitBreakerActive = false,
      onTriggerMannaScan,
      onRunHealthCheck
    } = adminData || {};

    const isSystemHealthy = systemHealth?.heroStatus !== 'critical';

    return (
      <div className="console-hub-container animate-fade-in">
        {/* Executive Vitals Top Strip */}
        <div className="console-vitals-strip font-mono">
          <div className="console-vital-card" style={{ '--card-accent': '#00e5ff' } as React.CSSProperties}>
            <div className="console-vital-header">
              <span>⚡ Active Live Signals</span>
              <span>LIVE</span>
            </div>
            <div className="console-vital-value" style={{ color: '#00e5ff' }}>
              {activeSetupsCount}
            </div>
            <div className="console-vital-desc">Currently published trade setups in market</div>
          </div>

          <div className="console-vital-card" style={{ '--card-accent': '#ffab00' } as React.CSSProperties}>
            <div className="console-vital-header">
              <span>👤 Registered Traders</span>
              <span>ACCOUNTS</span>
            </div>
            <div className="console-vital-value" style={{ color: '#ffab00' }}>
              {usersCount}
            </div>
            <div className="console-vital-desc">Total managed accounts across all tiers</div>
          </div>

          <div className="console-vital-card" style={{ '--card-accent': '#00e676' } as React.CSSProperties}>
            <div className="console-vital-header">
              <span>🏥 Core Engine Status</span>
              <span style={{ color: isSystemHealthy ? '#00e676' : '#ff1744' }}>
                {circuitBreakerActive ? 'TRIPPED' : isSystemHealthy ? 'ONLINE' : 'DEGRADED'}
              </span>
            </div>
            <div className="console-vital-value" style={{ color: isSystemHealthy ? '#00e676' : '#ff1744' }}>
              {circuitBreakerActive ? 'CIRCUIT OPEN' : isSystemHealthy ? '100% HEALTHY' : 'WARNING'}
            </div>
            <div className="console-vital-desc">Real-time telemetry across 5 core subsystems</div>
          </div>

          <div className="console-vital-card" style={{ '--card-accent': '#ffd700' } as React.CSSProperties}>
            <div className="console-vital-header">
              <span>🎫 Support Backlog</span>
              <span>TICKETS</span>
            </div>
            <div className="console-vital-value" style={{ color: unreadSupportCount > 0 ? '#ff5252' : '#ffd700' }}>
              {unreadSupportCount}
            </div>
            <div className="console-vital-desc">Pending trader inquiries awaiting resolution</div>
          </div>
        </div>

        {/* DOMAIN 1: Live Strategy & Market Operations */}
        <div className="console-domain-group">
          <div className="console-domain-header font-mono">
            <h2 className="console-domain-title" style={{ '--domain-color': '#00e5ff' } as React.CSSProperties}>
              <span>⚡</span>
              <span>Live Strategy &amp; Execution Operations</span>
            </h2>
            <span className="console-domain-count">Core Engine Module</span>
          </div>

          <div className="console-tiles-grid">
            {/* Tile: Strategy Engine */}
            <div
              className="console-tile"
              style={{ '--tile-accent': '#00e5ff', '--tile-glow': 'rgba(0, 229, 255, 0.12)' } as React.CSSProperties}
              onClick={() => onNavigateTab('engine')}
            >
              <div>
                <div className="console-tile-top font-mono">
                  <div className="console-tile-icon-wrap">⚡</div>
                  <div className="console-tile-tag-wrap">
                    <span className="console-tile-category">EXECUTION</span>
                    <span className="console-tile-stat-badge">{activeSetupsCount} Active Setups</span>
                  </div>
                </div>
                <div className="console-tile-body" style={{ marginTop: '14px' }}>
                  <h3 className="console-tile-title">
                    <span>Strategy Engine &amp; Scans</span>
                    <span>→</span>
                  </h3>
                  <p className="console-tile-desc">
                    Trigger manual killzone scans, toggle automated trading algorithms, manage live trade signals, and inspect real-time market setups.
                  </p>
                </div>
              </div>
              <div className="console-tile-footer font-mono">
                <button type="button" className="console-tile-launch-btn">
                  Open Engine Console →
                </button>
                {onTriggerMannaScan && (
                  <button
                    type="button"
                    className="console-tile-secondary-btn"
                    onClick={e => { e.stopPropagation(); onTriggerMannaScan(); }}
                    title="Quick Scan"
                  >
                    ⚡ Quick Scan
                  </button>
                )}
              </div>
            </div>

            {/* Tile: Conviction & Realized Outcomes */}
            <div
              className="console-tile"
              style={{ '--tile-accent': '#e056fd', '--tile-glow': 'rgba(224, 86, 253, 0.12)' } as React.CSSProperties}
              onClick={() => onNavigateTab('analytics')}
            >
              <div>
                <div className="console-tile-top font-mono">
                  <div className="console-tile-icon-wrap">🎯</div>
                  <div className="console-tile-tag-wrap">
                    <span className="console-tile-category">INTELLIGENCE</span>
                    <span className="console-tile-stat-badge">{recentOutcomesCount} Outcomes</span>
                  </div>
                </div>
                <div className="console-tile-body" style={{ marginTop: '14px' }}>
                  <h3 className="console-tile-title">
                    <span>Conviction &amp; Outcomes</span>
                    <span>→</span>
                  </h3>
                  <p className="console-tile-desc">
                    Review realized trade win rates, R-multiples, killzone performance metrics, decision matrix, and the performance reports approval pipeline.
                  </p>
                </div>
              </div>
              <div className="console-tile-footer font-mono">
                <button type="button" className="console-tile-launch-btn">
                  Review Intelligence →
                </button>
              </div>
            </div>

            {/* Tile: Run History */}
            <div
              className="console-tile"
              style={{ '--tile-accent': '#00e676', '--tile-glow': 'rgba(0, 230, 118, 0.12)' } as React.CSSProperties}
              onClick={() => onNavigateTab('history')}
            >
              <div>
                <div className="console-tile-top font-mono">
                  <div className="console-tile-icon-wrap">📜</div>
                  <div className="console-tile-tag-wrap">
                    <span className="console-tile-category">AUDITING</span>
                    <span className="console-tile-stat-badge">{runsCount} Recent Runs</span>
                  </div>
                </div>
                <div className="console-tile-body" style={{ marginTop: '14px' }}>
                  <h3 className="console-tile-title">
                    <span>Run History &amp; Logs</span>
                    <span>→</span>
                  </h3>
                  <p className="console-tile-desc">
                    Audit cron job execution cycles, discovery durations, signal publish rates, and system error traces across all sessions.
                  </p>
                </div>
              </div>
              <div className="console-tile-footer font-mono">
                <button type="button" className="console-tile-launch-btn">
                  Inspect Run Ledger →
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* DOMAIN 2: People, Accounts & Trader Support */}
        <div className="console-domain-group">
          <div className="console-domain-header font-mono">
            <h2 className="console-domain-title" style={{ '--domain-color': '#ffab00' } as React.CSSProperties}>
              <span>👥</span>
              <span>Trader Governance &amp; Support Operations</span>
            </h2>
            <span className="console-domain-count">Account &amp; Client Services</span>
          </div>

          <div className="console-tiles-grid">
            {/* Tile: User Accounts */}
            <div
              className="console-tile"
              style={{ '--tile-accent': '#ffab00', '--tile-glow': 'rgba(255, 171, 0, 0.12)' } as React.CSSProperties}
              onClick={() => onNavigateTab('users')}
            >
              <div>
                <div className="console-tile-top font-mono">
                  <div className="console-tile-icon-wrap">👤</div>
                  <div className="console-tile-tag-wrap">
                    <span className="console-tile-category">ROSTER</span>
                    <span className="console-tile-stat-badge">{usersCount} Accounts</span>
                  </div>
                </div>
                <div className="console-tile-body" style={{ marginTop: '14px' }}>
                  <h3 className="console-tile-title">
                    <span>User Accounts &amp; Impersonation</span>
                    <span>→</span>
                  </h3>
                  <p className="console-tile-desc">
                    Manage client profiles, risk parameters, credential updates, subscription tiers, and instant impersonation for client support.
                  </p>
                </div>
              </div>
              <div className="console-tile-footer font-mono">
                <button type="button" className="console-tile-launch-btn">
                  Manage User Accounts →
                </button>
              </div>
            </div>

            {/* Tile: Support Centre */}
            <div
              className="console-tile"
              style={{ '--tile-accent': '#ffd700', '--tile-glow': 'rgba(255, 215, 0, 0.12)' } as React.CSSProperties}
              onClick={() => onNavigateTab('support')}
            >
              <div>
                <div className="console-tile-top font-mono">
                  <div className="console-tile-icon-wrap">🎫</div>
                  <div className="console-tile-tag-wrap">
                    <span className="console-tile-category">SUPPORT</span>
                    <span className="console-tile-stat-badge">
                      {unreadSupportCount > 0 ? `⚠️ ${unreadSupportCount} Unread` : 'All Clear'}
                    </span>
                  </div>
                </div>
                <div className="console-tile-body" style={{ marginTop: '14px' }}>
                  <h3 className="console-tile-title">
                    <span>Support Centre &amp; Helpdesk</span>
                    <span>→</span>
                  </h3>
                  <p className="console-tile-desc">
                    Direct communications conduit to traders. Respond to client inquiries, ticket escalations, and subscription requests.
                  </p>
                </div>
              </div>
              <div className="console-tile-footer font-mono">
                <button type="button" className="console-tile-launch-btn">
                  Open Support Inbox →
                </button>
              </div>
            </div>

            {/* Tile: System Health Diagnostics */}
            <div
              className="console-tile"
              style={{ '--tile-accent': '#00e676', '--tile-glow': 'rgba(0, 230, 118, 0.12)' } as React.CSSProperties}
              onClick={() => onNavigateTab('engine')}
            >
              <div>
                <div className="console-tile-top font-mono">
                  <div className="console-tile-icon-wrap">🏥</div>
                  <div className="console-tile-tag-wrap">
                    <span className="console-tile-category">DIAGNOSTICS</span>
                    <span className="console-tile-stat-badge">Automated 15m</span>
                  </div>
                </div>
                <div className="console-tile-body" style={{ marginTop: '14px' }}>
                  <h3 className="console-tile-title">
                    <span>System Health &amp; Subsystems</span>
                    <span>→</span>
                  </h3>
                  <p className="console-tile-desc">
                    Automated latency monitoring across SQLite DB, Twelve Data pricing streams, Killzone scheduler, and live SSE event sockets.
                  </p>
                </div>
              </div>
              <div className="console-tile-footer font-mono">
                <button type="button" className="console-tile-launch-btn">
                  View Subsystems →
                </button>
                {onRunHealthCheck && (
                  <button
                    type="button"
                    className="console-tile-secondary-btn"
                    onClick={e => { e.stopPropagation(); onRunHealthCheck(); }}
                  >
                    ⚡ Run Check
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Super Admin Vault Mode ---
  const {
    sentinelSetupsCount = 0,
    sentinelWinRate = 0,
    estimatedMRR = 0,
    onlineTradersCount = 0,
    rosterCount = 0,
    strategiesCount = 0,
    adminLogsCount = 0,
    auditReportNumber,
    onDownloadAuditPdf
  } = vaultData || {};

  return (
    <div className="console-hub-container animate-fade-in">
      {/* Super Admin Vitals Top Strip */}
      <div className="console-vitals-strip font-mono">
        <div className="console-vital-card" style={{ '--card-accent': '#ce93d8' } as React.CSSProperties}>
          <div className="console-vital-header">
            <span>🤖 Manna Elite v1.2 Signals</span>
            <span>PROPRIETARY</span>
          </div>
          <div className="console-vital-value" style={{ color: '#ce93d8' }}>
            {sentinelSetupsCount}
          </div>
          <div className="console-vital-desc">Elite algorithm signals currently tracked</div>
        </div>

        <div className="console-vital-card" style={{ '--card-accent': '#00e676' } as React.CSSProperties}>
          <div className="console-vital-header">
            <span>🏆 Manna Elite Win Rate</span>
            <span>ACCURACY</span>
          </div>
          <div className="console-vital-value" style={{ color: '#00e676' }}>
            {sentinelWinRate}%
          </div>
          <div className="console-vital-desc">Realized model win rate across all sessions</div>
        </div>

        <div className="console-vital-card" style={{ '--card-accent': '#00e5ff' } as React.CSSProperties}>
          <div className="console-vital-header">
            <span>💵 Estimated MRR</span>
            <span>FINANCIALS</span>
          </div>
          <div className="console-vital-value" style={{ color: '#00e5ff' }}>
            ${estimatedMRR}
          </div>
          <div className="console-vital-desc">Projected recurring revenue from subscriptions</div>
        </div>

        <div className="console-vital-card" style={{ '--card-accent': '#ffab00' } as React.CSSProperties}>
          <div className="console-vital-header">
            <span>🟢 Active Online Sessions</span>
            <span>TELEMETRY</span>
          </div>
          <div className="console-vital-value" style={{ color: '#ffab00' }}>
            {onlineTradersCount}
          </div>
          <div className="console-vital-desc">Clients actively streaming live data</div>
        </div>
      </div>

      {/* CLUSTER 1: System Governance & Master Controls */}
      <div className="console-domain-group">
        <div className="console-domain-header font-mono">
          <h2 className="console-domain-title" style={{ '--domain-color': '#b388ff' } as React.CSSProperties}>
            <span>👑</span>
            <span>Root Governance &amp; Multi-Market Infrastructure</span>
          </h2>
          <span className="console-domain-count">Master Telemetry</span>
        </div>

        <div className="console-tiles-grid">
          {/* Tile: Asset Visibility Hub */}
          <div
            className="console-tile vault-card"
            style={{ '--tile-accent': '#6366f1', '--tile-glow': 'rgba(99, 102, 241, 0.15)' } as React.CSSProperties}
            onClick={() => onNavigateTab('assets')}
          >
            <div>
              <div className="console-tile-top font-mono">
                <div className="console-tile-icon-wrap" style={{ borderColor: '#6366f1' }}>🎯</div>
                <div className="console-tile-tag-wrap">
                  <span className="console-tile-category">MARKETS</span>
                  <span className="console-tile-stat-badge">Futures &amp; Forex</span>
                </div>
              </div>
              <div className="console-tile-body" style={{ marginTop: '14px' }}>
                <h3 className="console-tile-title">
                  <span>Multi-Market Asset Visibility</span>
                  <span>→</span>
                </h3>
                <p className="console-tile-desc">
                  Toggle instruments globally or per-market, adjust asset tier restrictions, and configure strategy-to-asset bindings.
                </p>
              </div>
            </div>
            <div className="console-tile-footer font-mono">
              <button type="button" className="console-tile-launch-btn" style={{ color: '#a5b4fc' }}>
                Configure Assets →
              </button>
            </div>
          </div>

          {/* Tile: Notification Governance */}
          <div
            className="console-tile vault-card"
            style={{ '--tile-accent': '#29b6f6', '--tile-glow': 'rgba(41, 182, 246, 0.15)' } as React.CSSProperties}
            onClick={() => onNavigateTab('notifications')}
          >
            <div>
              <div className="console-tile-top font-mono">
                <div className="console-tile-icon-wrap" style={{ borderColor: '#29b6f6' }}>📡</div>
                <div className="console-tile-tag-wrap">
                  <span className="console-tile-category">TELEGRAM</span>
                  <span className="console-tile-stat-badge">Multi-Channel</span>
                </div>
              </div>
              <div className="console-tile-body" style={{ marginTop: '14px' }}>
                <h3 className="console-tile-title">
                  <span>Notification Governance</span>
                  <span>→</span>
                </h3>
                <p className="console-tile-desc">
                  Manage multi-market Telegram broadcast triggers, toggle notification categories, and compile instant SND signal audit PDFs.
                </p>
              </div>
            </div>
            <div className="console-tile-footer font-mono">
              <button type="button" className="console-tile-launch-btn" style={{ color: '#29b6f6' }}>
                Manage Alerts →
              </button>
              {onDownloadAuditPdf && (
                <button
                  type="button"
                  className="console-tile-secondary-btn"
                  onClick={e => { e.stopPropagation(); onDownloadAuditPdf(); }}
                  title="Download Latest Audit Report PDF"
                >
                  📄 Audit #{auditReportNumber || 'Latest'}
                </button>
              )}
            </div>
          </div>

          {/* Tile: Strategy Master Governance */}
          <div
            className="console-tile vault-card"
            style={{ '--tile-accent': '#ffab00', '--tile-glow': 'rgba(255, 171, 0, 0.15)' } as React.CSSProperties}
            onClick={() => onNavigateTab('strategies')}
          >
            <div>
              <div className="console-tile-top font-mono">
                <div className="console-tile-icon-wrap" style={{ borderColor: '#ffab00' }}>⚙️</div>
                <div className="console-tile-tag-wrap">
                  <span className="console-tile-category">ALGORITHMS</span>
                  <span className="console-tile-stat-badge">{strategiesCount} Modules</span>
                </div>
              </div>
              <div className="console-tile-body" style={{ marginTop: '14px' }}>
                <h3 className="console-tile-title">
                  <span>Strategy Master Controls</span>
                  <span>→</span>
                </h3>
                <p className="console-tile-desc">
                  Global strategy switches, killswitches, parameter presets, and algorithm lifecycle governance across the entire platform.
                </p>
              </div>
            </div>
            <div className="console-tile-footer font-mono">
              <button type="button" className="console-tile-launch-btn" style={{ color: '#ffab00' }}>
                Review Strategies →
              </button>
            </div>
          </div>

          {/* Tile: User & Admin Roster */}
          <div
            className="console-tile vault-card"
            style={{ '--tile-accent': '#b388ff', '--tile-glow': 'rgba(179, 136, 255, 0.15)' } as React.CSSProperties}
            onClick={() => onNavigateTab('roster')}
          >
            <div>
              <div className="console-tile-top font-mono">
                <div className="console-tile-icon-wrap" style={{ borderColor: '#b388ff' }}>👥</div>
                <div className="console-tile-tag-wrap">
                  <span className="console-tile-category">STAFF</span>
                  <span className="console-tile-stat-badge">{rosterCount} Total</span>
                </div>
              </div>
              <div className="console-tile-body" style={{ marginTop: '14px' }}>
                <h3 className="console-tile-title">
                  <span>User &amp; Admin Roster</span>
                  <span>→</span>
                </h3>
                <p className="console-tile-desc">
                  Elevated user and staff governance. Promote administrators, revoke administrative privileges, and inspect security access profiles.
                </p>
              </div>
            </div>
            <div className="console-tile-footer font-mono">
              <button type="button" className="console-tile-launch-btn" style={{ color: '#b388ff' }}>
                Inspect Roster →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* CLUSTER 2: Intelligence & Algorithmic R&D */}
      <div className="console-domain-group">
        <div className="console-domain-header font-mono">
          <h2 className="console-domain-title" style={{ '--domain-color': '#ce93d8' } as React.CSSProperties}>
            <span>🧠</span>
            <span>Algorithmic Intelligence &amp; Quantitative Benchmarking</span>
          </h2>
          <span className="console-domain-count">R&amp;D Lab</span>
        </div>

        <div className="console-tiles-grid">
          {/* Tile: Manna Elite Tuning */}
          <div
            className="console-tile vault-card"
            style={{ '--tile-accent': '#ce93d8', '--tile-glow': 'rgba(206, 147, 216, 0.15)' } as React.CSSProperties}
            onClick={() => onNavigateTab('sentinel')}
          >
            <div>
              <div className="console-tile-top font-mono">
                <div className="console-tile-icon-wrap" style={{ borderColor: '#ce93d8' }}>🤖</div>
                <div className="console-tile-tag-wrap">
                  <span className="console-tile-category">TUNING</span>
                  <span className="console-tile-stat-badge">{sentinelSetupsCount} Setups</span>
                </div>
              </div>
              <div className="console-tile-body" style={{ marginTop: '14px' }}>
                <h3 className="console-tile-title">
                  <span>Manna Elite v1.2 Tuning</span>
                  <span>→</span>
                </h3>
                <p className="console-tile-desc">
                  Hyperparameter calibration desk: tune minimum conviction thresholds, concurrent signal caps, and control gradual rollout to traders.
                </p>
              </div>
            </div>
            <div className="console-tile-footer font-mono">
              <button type="button" className="console-tile-launch-btn" style={{ color: '#ce93d8' }}>
                Tune Parameters →
              </button>
            </div>
          </div>

          {/* Tile: Strategy Comparison */}
          <div
            className="console-tile vault-card"
            style={{ '--tile-accent': '#ffab00', '--tile-glow': 'rgba(255, 171, 0, 0.15)' } as React.CSSProperties}
            onClick={() => onNavigateTab('strategy_comparison')}
          >
            <div>
              <div className="console-tile-top font-mono">
                <div className="console-tile-icon-wrap" style={{ borderColor: '#ffab00' }}>⚔️</div>
                <div className="console-tile-tag-wrap">
                  <span className="console-tile-category">BENCHMARK</span>
                  <span className="console-tile-stat-badge">Multi-Model</span>
                </div>
              </div>
              <div className="console-tile-body" style={{ marginTop: '14px' }}>
                <h3 className="console-tile-title">
                  <span>Strategy Analytics &amp; Results</span>
                  <span>→</span>
                </h3>
                <p className="console-tile-desc">
                  Side-by-side comparative analytics, normalized equity curves, maximum drawdown comparison, and cumulative alpha scoring.
                </p>
              </div>
            </div>
            <div className="console-tile-footer font-mono">
              <button type="button" className="console-tile-launch-btn" style={{ color: '#ffab00' }}>
                Compare Models →
              </button>
            </div>
          </div>

          {/* Tile: Client Accuracy */}
          <div
            className="console-tile vault-card"
            style={{ '--tile-accent': '#00e676', '--tile-glow': 'rgba(0, 230, 118, 0.15)' } as React.CSSProperties}
            onClick={() => onNavigateTab('client_accuracy')}
          >
            <div>
              <div className="console-tile-top font-mono">
                <div className="console-tile-icon-wrap" style={{ borderColor: '#00e676' }}>🏷️</div>
                <div className="console-tile-tag-wrap">
                  <span className="console-tile-category">AUDIT</span>
                  <span className="console-tile-stat-badge">Transparency</span>
                </div>
              </div>
              <div className="console-tile-body" style={{ marginTop: '14px' }}>
                <h3 className="console-tile-title">
                  <span>Client Accuracy Intelligence</span>
                  <span>→</span>
                </h3>
                <p className="console-tile-desc">
                  Deep audit comparing engine projected signals against realized client fills, execution slippage, and marketing claims.
                </p>
              </div>
            </div>
            <div className="console-tile-footer font-mono">
              <button type="button" className="console-tile-launch-btn" style={{ color: '#00e676' }}>
                Audit Accuracy →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* CLUSTER 3: Telemetry, Growth & Security Audit */}
      <div className="console-domain-group">
        <div className="console-domain-header font-mono">
          <h2 className="console-domain-title" style={{ '--domain-color': '#00e5ff' } as React.CSSProperties}>
            <span>📊</span>
            <span>Platform Telemetry &amp; Security Auditing</span>
          </h2>
          <span className="console-domain-count">Security &amp; Growth</span>
        </div>

        <div className="console-tiles-grid">
          {/* Tile: Marketing & Funnel */}
          <div
            className="console-tile vault-card"
            style={{ '--tile-accent': '#00e676', '--tile-glow': 'rgba(0, 230, 118, 0.15)' } as React.CSSProperties}
            onClick={() => onNavigateTab('marketing')}
          >
            <div>
              <div className="console-tile-top font-mono">
                <div className="console-tile-icon-wrap" style={{ borderColor: '#00e676' }}>📈</div>
                <div className="console-tile-tag-wrap">
                  <span className="console-tile-category">GROWTH</span>
                  <span className="console-tile-stat-badge">${estimatedMRR} MRR</span>
                </div>
              </div>
              <div className="console-tile-body" style={{ marginTop: '14px' }}>
                <h3 className="console-tile-title">
                  <span>Marketing &amp; Conversion Funnel</span>
                  <span>→</span>
                </h3>
                <p className="console-tile-desc">
                  Visitor landing conversion tracking, trial-to-paid transitions, user lifetime metrics, and subscription retention rates.
                </p>
              </div>
            </div>
            <div className="console-tile-footer font-mono">
              <button type="button" className="console-tile-launch-btn" style={{ color: '#00e676' }}>
                View Funnel →
              </button>
            </div>
          </div>

          {/* Tile: Usage Heatmap */}
          <div
            className="console-tile vault-card"
            style={{ '--tile-accent': '#00e5ff', '--tile-glow': 'rgba(0, 229, 255, 0.15)' } as React.CSSProperties}
            onClick={() => onNavigateTab('heatmap')}
          >
            <div>
              <div className="console-tile-top font-mono">
                <div className="console-tile-icon-wrap" style={{ borderColor: '#00e5ff' }}>📊</div>
                <div className="console-tile-tag-wrap">
                  <span className="console-tile-category">ENGAGEMENT</span>
                  <span className="console-tile-stat-badge">{onlineTradersCount} Live</span>
                </div>
              </div>
              <div className="console-tile-body" style={{ marginTop: '14px' }}>
                <h3 className="console-tile-title">
                  <span>Platform Usage Heatmap</span>
                  <span>→</span>
                </h3>
                <p className="console-tile-desc">
                  Hourly active engagement distributions, trader session density during killzones, and feature interaction heatmaps.
                </p>
              </div>
            </div>
            <div className="console-tile-footer font-mono">
              <button type="button" className="console-tile-launch-btn" style={{ color: '#00e5ff' }}>
                Explore Heatmaps →
              </button>
            </div>
          </div>

          {/* Tile: Admin Audit Trail */}
          <div
            className="console-tile vault-card"
            style={{ '--tile-accent': '#ffab00', '--tile-glow': 'rgba(255, 171, 0, 0.15)' } as React.CSSProperties}
            onClick={() => onNavigateTab('admin_audit')}
          >
            <div>
              <div className="console-tile-top font-mono">
                <div className="console-tile-icon-wrap" style={{ borderColor: '#ffab00' }}>🛡️</div>
                <div className="console-tile-tag-wrap">
                  <span className="console-tile-category">SECURITY</span>
                  <span className="console-tile-stat-badge">{adminLogsCount} Logs</span>
                </div>
              </div>
              <div className="console-tile-body" style={{ marginTop: '14px' }}>
                <h3 className="console-tile-title">
                  <span>Admin Security Audit Trail</span>
                  <span>→</span>
                </h3>
                <p className="console-tile-desc">
                  Immutable security record tracking all administrative operations, password changes, impersonations, and setting alterations.
                </p>
              </div>
            </div>
            <div className="console-tile-footer font-mono">
              <button type="button" className="console-tile-launch-btn" style={{ color: '#ffab00' }}>
                Audit Operations →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
