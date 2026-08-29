import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../config';
import './AssetControlHub.css';

export interface AssetStat {
  symbol: string;
  market: string;
  name: string;
  display_enabled: boolean;
  tracking_enabled: boolean;
  created_at: string;
  updated_at: string;
  stats?: {
    totalSetups: number;
    activeSetups: number;
    resolvedSetups: number;
    invalidatedSetups: number;
    totalTrades: number;
    wins: number;
    losses: number;
    breakevens: number;
    totalRealizedR: number;
    winRate: number;
    lastSignalAt: string | null;
  };
}

interface AssetControlResponse {
  success: boolean;
  assets: AssetStat[];
  summary: {
    totalAssets: number;
    displayedCount: number;
    hiddenCount: number;
    allTrackingActive: boolean;
  };
}

export const AssetControlHub: React.FC = () => {
  const [assets, setAssets] = useState<AssetStat[]>([]);
  const [summary, setSummary] = useState<{ totalAssets: number; displayedCount: number; hiddenCount: number } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [savingSymbol, setSavingSymbol] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedMarketTab, setSelectedMarketTab] = useState<'all' | 'futures' | 'forex'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'displayed' | 'hidden'>('all');

  // Custom Asset Modal State
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newSymbol, setNewSymbol] = useState<string>('');
  const [newMarket, setNewMarket] = useState<'futures' | 'forex'>('futures');
  const [newName, setNewName] = useState<string>('');
  const [addLoading, setAddLoading] = useState<boolean>(false);

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/super-admin/assets`);
      if (res.ok) {
        const json: AssetControlResponse = await res.json();
        if (json.success) {
          setAssets(json.assets || []);
          setSummary(json.summary || null);
        }
      }
    } catch (err) {
      console.error('Failed to fetch asset settings', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, []);

  const handleToggleDisplay = async (symbol: string, currentDisplay: boolean) => {
    const nextDisplay = !currentDisplay;
    setSavingSymbol(symbol);

    // Optimistic UI update
    setAssets(prev => prev.map(a => a.symbol === symbol ? { ...a, display_enabled: nextDisplay } : a));
    setSummary(prev => prev ? {
      ...prev,
      displayedCount: prev.displayedCount + (nextDisplay ? 1 : -1),
      hiddenCount: prev.hiddenCount + (nextDisplay ? -1 : 1)
    } : null);

    try {
      const res = await fetch(`${API_BASE}/api/super-admin/assets/toggle-display`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, display_enabled: nextDisplay })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.assets) {
          setAssets(json.assets);
        } else {
          await fetchAssets();
        }
      } else {
        // Revert on failure
        setAssets(prev => prev.map(a => a.symbol === symbol ? { ...a, display_enabled: currentDisplay } : a));
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to update asset visibility');
      }
    } catch (err: any) {
      // Revert on network failure
      setAssets(prev => prev.map(a => a.symbol === symbol ? { ...a, display_enabled: currentDisplay } : a));
      alert(`Error updating asset: ${err.message}`);
    } finally {
      setSavingSymbol(null);
    }
  };

  const handleBulkToggle = async (market: string | undefined, display_enabled: boolean) => {
    setSavingSymbol('bulk');

    // Optimistic update
    setAssets(prev => prev.map(a => {
      if (!market || a.market.toLowerCase() === market.toLowerCase()) {
        return { ...a, display_enabled };
      }
      return a;
    }));

    try {
      const res = await fetch(`${API_BASE}/api/super-admin/assets/bulk-toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market, display_enabled })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.assets) {
          setAssets(json.assets);
        } else {
          await fetchAssets();
        }
      } else {
        await fetchAssets();
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to execute bulk update');
      }
    } catch (err: any) {
      await fetchAssets();
      alert(`Error in bulk update: ${err.message}`);
    } finally {
      setSavingSymbol(null);
    }
  };

  const handleAddCustomAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbol.trim()) return;
    setAddLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/super-admin/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: newSymbol.trim().toUpperCase(),
          market: newMarket,
          name: newName.trim() || newSymbol.trim().toUpperCase()
        })
      });
      if (res.ok) {
        setNewSymbol('');
        setNewName('');
        setShowAddModal(false);
        await fetchAssets();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to register asset');
      }
    } catch (err: any) {
      alert(`Error adding asset: ${err.message}`);
    } finally {
      setAddLoading(false);
    }
  };

  // Filtered asset list
  const filteredAssets = assets.filter(a => {
    const matchesMarket = selectedMarketTab === 'all' || a.market.toLowerCase() === selectedMarketTab;
    const matchesSearch =
      a.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'displayed' && a.display_enabled) ||
      (statusFilter === 'hidden' && !a.display_enabled);
    return matchesMarket && matchesSearch && matchesStatus;
  });

  const futuresAssets = filteredAssets.filter(a => a.market.toLowerCase() === 'futures');
  const forexAssets = filteredAssets.filter(a => a.market.toLowerCase() === 'forex');

  return (
    <div className="asset-hub-container font-mono">
      {/* ── Top Metric Highlights ── */}
      <div className="asset-hub-metrics-grid">
        <div className="asset-hub-metric-card primary">
          <div className="metric-header">
            <span className="metric-icon">🌐</span>
            <span className="metric-title">TOTAL TRACKED ASSETS</span>
          </div>
          <div className="metric-value">{summary?.totalAssets || assets.length}</div>
          <div className="metric-sub">
            <span className="badge-pulse green"></span> 100% Background Signal & Outcome Tracking
          </div>
        </div>

        <div className="asset-hub-metric-card success">
          <div className="metric-header">
            <span className="metric-icon">👁️</span>
            <span className="metric-title">PUBLICLY DISPLAYED</span>
          </div>
          <div className="metric-value text-emerald">
            {summary?.displayedCount !== undefined ? summary.displayedCount : assets.filter(a => a.display_enabled).length}
          </div>
          <div className="metric-sub">Visible to Clients, Admins & Telegram Feed</div>
        </div>

        <div className="asset-hub-metric-card warning">
          <div className="metric-header">
            <span className="metric-icon">🕶️</span>
            <span className="metric-title">STEALTH / TURNED-OFF</span>
          </div>
          <div className="metric-value text-amber">
            {summary?.hiddenCount !== undefined ? summary.hiddenCount : assets.filter(a => !a.display_enabled).length}
          </div>
          <div className="metric-sub">Hidden from Clients & Admins • Tracked for Super Admin</div>
        </div>

        <div className="asset-hub-metric-card info">
          <div className="metric-header">
            <span className="metric-icon">🛡️</span>
            <span className="metric-title">TRACKING INTEGRITY</span>
          </div>
          <div className="metric-value text-cyan">ACTIVE (24/7)</div>
          <div className="metric-sub">Signals, Stops, Hits & R Recorded Continuously</div>
        </div>
      </div>

      {/* ── Filter & Action Control Toolbar ── */}
      <div className="asset-hub-toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search by symbol or asset name..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="search-input"
            />
            {searchTerm && (
              <button className="clear-btn" onClick={() => setSearchTerm('')}>✕</button>
            )}
          </div>

          <div className="pill-group">
            <button
              className={`pill-btn ${selectedMarketTab === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedMarketTab('all')}
            >
              All Markets ({assets.length})
            </button>
            <button
              className={`pill-btn ${selectedMarketTab === 'futures' ? 'active' : ''}`}
              onClick={() => setSelectedMarketTab('futures')}
            >
              Futures ({assets.filter(a => a.market.toLowerCase() === 'futures').length})
            </button>
            <button
              className={`pill-btn ${selectedMarketTab === 'forex' ? 'active' : ''}`}
              onClick={() => setSelectedMarketTab('forex')}
            >
              Forex ({assets.filter(a => a.market.toLowerCase() === 'forex').length})
            </button>
          </div>

          <div className="pill-group">
            <button
              className={`pill-btn ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              All Statuses
            </button>
            <button
              className={`pill-btn ${statusFilter === 'displayed' ? 'active' : ''}`}
              onClick={() => setStatusFilter('displayed')}
            >
              🟢 Displayed
            </button>
            <button
              className={`pill-btn ${statusFilter === 'hidden' ? 'active' : ''}`}
              onClick={() => setStatusFilter('hidden')}
            >
              🕶️ Turned Off
            </button>
          </div>
        </div>

        <div className="toolbar-right">
          <button
            className="action-btn secondary"
            onClick={() => handleBulkToggle(undefined, true)}
            disabled={savingSymbol === 'bulk'}
            title="Display all assets across all markets"
          >
            ⚡ Display All
          </button>
          <button
            className="action-btn secondary"
            onClick={() => handleBulkToggle(undefined, false)}
            disabled={savingSymbol === 'bulk'}
            title="Turn off display for all assets"
          >
            🕶️ Hide All
          </button>
          <button
            className="action-btn primary"
            onClick={() => setShowAddModal(true)}
          >
            ➕ Add Asset
          </button>
        </div>
      </div>

      {/* ── Asset Content Sections ── */}
      {loading ? (
        <div className="asset-hub-loading">
          <div className="spinner"></div>
          <p>Loading Asset Governance & Tracking Telemetry...</p>
        </div>
      ) : (
        <div className="asset-tables-wrapper">
          {/* Futures Section */}
          {(selectedMarketTab === 'all' || selectedMarketTab === 'futures') && (
            <div className="market-asset-section">
              <div className="section-header">
                <div className="section-title">
                  <span className="market-tag futures">FUTURES ASSETS</span>
                  <span className="section-count">{futuresAssets.length} Instruments</span>
                </div>
                <div className="section-actions">
                  <button
                    className="bulk-micro-btn on"
                    onClick={() => handleBulkToggle('futures', true)}
                    disabled={savingSymbol === 'bulk'}
                  >
                    Display All Futures
                  </button>
                  <button
                    className="bulk-micro-btn off"
                    onClick={() => handleBulkToggle('futures', false)}
                    disabled={savingSymbol === 'bulk'}
                  >
                    Hide All Futures
                  </button>
                </div>
              </div>

              <div className="asset-cards-grid">
                {futuresAssets.map(asset => (
                  <AssetControlCard
                    key={asset.symbol}
                    asset={asset}
                    isSaving={savingSymbol === asset.symbol}
                    onToggle={() => handleToggleDisplay(asset.symbol, asset.display_enabled)}
                  />
                ))}
                {futuresAssets.length === 0 && (
                  <div className="empty-assets">No futures instruments matched your filter.</div>
                )}
              </div>
            </div>
          )}

          {/* Forex Section */}
          {(selectedMarketTab === 'all' || selectedMarketTab === 'forex') && (
            <div className="market-asset-section">
              <div className="section-header">
                <div className="section-title">
                  <span className="market-tag forex">FOREX ASSETS</span>
                  <span className="section-count">{forexAssets.length} Pairs</span>
                </div>
                <div className="section-actions">
                  <button
                    className="bulk-micro-btn on"
                    onClick={() => handleBulkToggle('forex', true)}
                    disabled={savingSymbol === 'bulk'}
                  >
                    Display All Forex
                  </button>
                  <button
                    className="bulk-micro-btn off"
                    onClick={() => handleBulkToggle('forex', false)}
                    disabled={savingSymbol === 'bulk'}
                  >
                    Hide All Forex
                  </button>
                </div>
              </div>

              <div className="asset-cards-grid">
                {forexAssets.map(asset => (
                  <AssetControlCard
                    key={asset.symbol}
                    asset={asset}
                    isSaving={savingSymbol === asset.symbol}
                    onToggle={() => handleToggleDisplay(asset.symbol, asset.display_enabled)}
                  />
                ))}
                {forexAssets.length === 0 && (
                  <div className="empty-assets">No forex currency pairs matched your filter.</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Add Custom Asset Modal ── */}
      {showAddModal && (
        <div className="asset-modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="asset-modal-content" onClick={e => e.stopPropagation()}>
            <div className="asset-modal-header">
              <div className="modal-title-group">
                <span className="modal-icon">➕</span>
                <h3>Register Custom Asset</h3>
              </div>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAddCustomAsset} className="asset-modal-form">
              <div className="form-group">
                <label>Symbol / Ticker</label>
                <input
                  type="text"
                  placeholder="e.g. BTC, ETH, USD/CHF, DAX"
                  value={newSymbol}
                  onChange={e => setNewSymbol(e.target.value)}
                  required
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label>Market Category</label>
                <select
                  value={newMarket}
                  onChange={e => setNewMarket(e.target.value as 'futures' | 'forex')}
                  className="form-select"
                >
                  <option value="futures">Futures / Indices / Commodities</option>
                  <option value="forex">Forex (FX Currency Pairs)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Display Name / Description</label>
                <input
                  type="text"
                  placeholder="e.g. Bitcoin Futures, Swiss Franc"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="modal-info-callout">
                <span className="callout-icon">💡</span>
                <p>
                  Newly registered assets will automatically be tracked 24/7 by the discovery engine. You can toggle public visibility on or off anytime.
                </p>
              </div>

              <div className="asset-modal-actions">
                <button
                  type="button"
                  className="modal-btn cancel"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="modal-btn submit"
                  disabled={addLoading || !newSymbol.trim()}
                >
                  {addLoading ? 'Registering...' : 'Register Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

interface AssetControlCardProps {
  asset: AssetStat;
  isSaving: boolean;
  onToggle: () => void;
}

const AssetControlCard: React.FC<AssetControlCardProps> = ({ asset, isSaving, onToggle }) => {
  const isDisplayed = asset.display_enabled;
  const stats = asset.stats || {
    totalSetups: 0,
    activeSetups: 0,
    totalTrades: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    totalRealizedR: 0
  };

  const isProfitable = (stats.totalRealizedR || 0) >= 0;

  return (
    <div className={`asset-card ${isDisplayed ? 'displayed' : 'hidden-mode'}`}>
      <div className="asset-card-top">
        <div className="asset-symbol-info">
          <div className="symbol-row">
            <span className="symbol-ticker">{asset.symbol}</span>
            <span className={`visibility-pill ${isDisplayed ? 'live' : 'stealth'}`}>
              {isDisplayed ? '🟢 Client Visible' : '🕶️ Stealth Mode'}
            </span>
          </div>
          <div className="symbol-name">{asset.name}</div>
        </div>

        {/* Toggle Switch */}
        <div className="toggle-switch-wrapper">
          <label className="switch" title={isDisplayed ? 'Click to turn off display for clients/admins' : 'Click to display to clients/admins'}>
            <input
              type="checkbox"
              checked={isDisplayed}
              onChange={onToggle}
              disabled={isSaving}
            />
            <span className="slider round"></span>
          </label>
        </div>
      </div>

      {/* Tracking telemetry pill */}
      <div className="tracking-status-bar">
        <span className="tracking-indicator">📡 Background Tracking: Active</span>
        <span className="active-signals-count">
          {stats.activeSetups > 0 ? (
            <span className="active-tag">{stats.activeSetups} Active Setup{stats.activeSetups > 1 ? 's' : ''}</span>
          ) : (
            <span className="idle-tag">0 Active</span>
          )}
        </span>
      </div>

      {/* Stats Summary Grid */}
      <div className="asset-stats-grid">
        <div className="stat-item">
          <span className="stat-label">WIN RATE</span>
          <span className={`stat-val ${stats.winRate >= 50 ? 'text-emerald' : stats.winRate > 0 ? 'text-amber' : 'text-muted'}`}>
            {stats.winRate}%
          </span>
        </div>

        <div className="stat-item">
          <span className="stat-label">TOTAL R</span>
          <span className={`stat-val ${isProfitable ? 'text-emerald' : 'text-rose'}`}>
            {stats.totalRealizedR > 0 ? `+${stats.totalRealizedR}R` : `${stats.totalRealizedR}R`}
          </span>
        </div>

        <div className="stat-item">
          <span className="stat-label">RESOLVED</span>
          <span className="stat-val text-cyan">
            {stats.wins}W / {stats.losses}L
          </span>
        </div>

        <div className="stat-item">
          <span className="stat-label">ALL SETUPS</span>
          <span className="stat-val text-gray">
            {stats.totalSetups}
          </span>
        </div>
      </div>

      {/* Bottom Footer Notice */}
      <div className="asset-card-footer">
        {isDisplayed ? (
          <span className="footer-notice displayed-note">
            ✓ Displayed on client dashboard, admin feed, and Telegram alerts.
          </span>
        ) : (
          <span className="footer-notice stealth-note">
            🕶️ Hidden from clients & admins. Outcomes & signals tracked for Super Admin only.
          </span>
        )}
      </div>
    </div>
  );
};
