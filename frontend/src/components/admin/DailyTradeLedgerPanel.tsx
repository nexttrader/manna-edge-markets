import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE } from '../../config';
import { useAuth } from '../../context/AuthContext';
import type {
  DailyLedgerSummary,
  DailyLedgerTrade,
  RecordWallPublication,
} from '../../hooks/useRecordWall';
import './DailyTradeLedgerPanel.css';

interface DayIndexItem {
  tradingDay: string;
  totalPublished: number;
  resolvedTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  supersededCount: number;
  invalidatedCount: number;
  liveCount: number;
  pendingCount: number;
  winRate: number;
  totalRealizedR: number;
  publicationStatus: 'published' | 'unpublished' | 'not_published';
  publishedAt: string | null;
  title: string | null;
}

type SortColumn =
  | 'tradeId'
  | 'instrument'
  | 'bias'
  | 'entry'
  | 'statusCategory'
  | 'outcomeLabel'
  | 'realizedR'
  | 'convictionScore'
  | 'createdAt';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export const DailyTradeLedgerPanel: React.FC = () => {
  const { user } = useAuth();
  const adminEmail = user?.email || 'super_admin';

  const [days, setDays] = useState<DayIndexItem[]>([]);
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [marketFilter, setMarketFilter] = useState<'all' | 'futures' | 'forex'>('all');
  const [styleFilter, setStyleFilter] = useState<'all' | 'intraday' | 'scalp' | 'swing'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [summary, setSummary] = useState<DailyLedgerSummary | null>(null);
  const [trades, setTrades] = useState<DailyLedgerTrade[]>([]);
  const [publication, setPublication] = useState<RecordWallPublication | null>(null);
  const [wallEnabled, setWallEnabled] = useState<boolean>(true);

  const [publishTitle, setPublishTitle] = useState<string>('');
  const [publishNotes, setPublishNotes] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const [sortCol, setSortCol] = useState<SortColumn>('createdAt');
  const [sortDir, setSortDir] = useState<'ascending' | 'descending'>('descending');
  const [sortAnnouncement, setSortAnnouncement] = useState<string>('');

  const authHeaders = useMemo(
    () => ({
      'Content-Type': 'application/json',
      'x-user-role': 'super_admin',
      'x-user-email': adminEmail,
    }),
    [adminEmail]
  );

  const fetchDaysIndex = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/super-admin/daily-ledger/days?limit=90&role=super_admin`, {
        headers: authHeaders,
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setDays(json.days || []);
        if (json.wallConfig) {
          setWallEnabled(Boolean(json.wallConfig.enabled));
        }
        if (!selectedDay && json.days?.length > 0) {
          setSelectedDay(json.days[0].tradingDay);
        }
      }
    } catch {
      // ignore transient error
    }
  }, [authHeaders, selectedDay]);

  const fetchDailyLedger = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (selectedDay) qs.set('day', selectedDay);
      if (marketFilter !== 'all') qs.set('market', marketFilter);
      if (styleFilter !== 'all') qs.set('style', styleFilter);
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      if (searchQuery.trim()) qs.set('search', searchQuery.trim());
      qs.set('role', 'super_admin');

      const res = await fetch(`${API_BASE}/api/super-admin/daily-ledger?${qs.toString()}`, {
        headers: authHeaders,
      });
      const json = await res.json();
      if (res.ok && json.success) {
        if (!selectedDay && json.tradingDay) {
          setSelectedDay(json.tradingDay);
        }
        setSummary(json.summary || null);
        setTrades(json.trades || []);
        setPublication(json.publication || null);
        if (json.wallConfig) {
          setWallEnabled(Boolean(json.wallConfig.enabled));
        }
        setPublishTitle(json.publication?.title || `Verified Daily Record — ${json.tradingDay}`);
        setPublishNotes(json.publication?.adminNotes || '');
      }
    } catch {
      // ignore transient error
    } finally {
      setLoading(false);
    }
  }, [authHeaders, selectedDay, marketFilter, styleFilter, statusFilter, searchQuery]);

  useEffect(() => {
    fetchDaysIndex();
  }, [fetchDaysIndex]);

  useEffect(() => {
    fetchDailyLedger();
  }, [fetchDailyLedger]);

  const handleSort = (col: SortColumn, label: string, isNumericOrDate: boolean = false) => {
    let nextDir: 'ascending' | 'descending' = 'ascending';
    if (sortCol === col) {
      nextDir = sortDir === 'ascending' ? 'descending' : 'ascending';
    } else {
      nextDir = isNumericOrDate ? 'descending' : 'ascending';
    }
    setSortCol(col);
    setSortDir(nextDir);
    setSortAnnouncement(`Sorted by ${label}, ${nextDir}`);
  };

  const sortedTrades = useMemo(() => {
    const dir = sortDir === 'ascending' ? 1 : -1;
    return [...trades].sort((a, b) => {
      switch (sortCol) {
        case 'tradeId':
          return collator.compare(a.tradeId, b.tradeId) * dir;
        case 'instrument':
          return collator.compare(`${a.instrument} ${a.tradingStyle}`, `${b.instrument} ${b.tradingStyle}`) * dir;
        case 'bias':
          return collator.compare(`${a.bias} ${a.zoneTimeframe || ''}`, `${b.bias} ${b.zoneTimeframe || ''}`) * dir;
        case 'entry':
          return ((a.entryZoneMid || 0) - (b.entryZoneMid || 0)) * dir;
        case 'statusCategory':
          return collator.compare(a.statusCategory, b.statusCategory) * dir;
        case 'outcomeLabel':
          return collator.compare(a.outcomeLabel, b.outcomeLabel) * dir;
        case 'realizedR': {
          const rA = a.realizedR ?? -999;
          const rB = b.realizedR ?? -999;
          return (rA - rB) * dir;
        }
        case 'convictionScore': {
          const cA = a.convictionScore ?? -1;
          const cB = b.convictionScore ?? -1;
          return (cA - cB) * dir;
        }
        case 'createdAt':
        default: {
          const tA = Date.parse(a.createdAt) || 0;
          const tB = Date.parse(b.createdAt) || 0;
          return (tA - tB) * dir;
        }
      }
    });
  }, [trades, sortCol, sortDir]);

  const handleToggleGlobalWall = async () => {
    setBusyAction('wall-toggle');
    setFeedbackMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/super-admin/daily-ledger/wall-config`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ enabled: !wallEnabled }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to toggle Record Wall');
      }
      setWallEnabled(Boolean(json.config?.enabled));
      setFeedbackMsg(
        json.config?.enabled
          ? 'Public & Client Verified Record Wall is now LIVE.'
          : 'Verified Record Wall has been hidden from public/client view.'
      );
    } catch (err: any) {
      setFeedbackMsg(`Error: ${err.message}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handlePublishDay = async () => {
    const dayToPublish = selectedDay || summary?.tradingDay;
    if (!dayToPublish) return;
    setBusyAction('publish');
    setFeedbackMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/super-admin/daily-ledger/publish`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          day: dayToPublish,
          title: publishTitle,
          adminNotes: publishNotes,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to publish day to Record Wall');
      }
      setPublication(json.publication);
      await fetchDaysIndex();
      setFeedbackMsg(`Published ${dayToPublish} to the Verified Record Wall.`);
    } catch (err: any) {
      setFeedbackMsg(`Error: ${err.message}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleUnpublishDay = async () => {
    const dayToUnpublish = selectedDay || summary?.tradingDay;
    if (!dayToUnpublish) return;
    setBusyAction('unpublish');
    setFeedbackMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/super-admin/daily-ledger/unpublish`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ day: dayToUnpublish }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to unpublish day');
      }
      setPublication(json.publication);
      await fetchDaysIndex();
      setFeedbackMsg(`Removed ${dayToUnpublish} from the public Verified Record Wall.`);
    } catch (err: any) {
      setFeedbackMsg(`Error: ${err.message}`);
    } finally {
      setBusyAction(null);
    }
  };

  const buildExportUrl = (format: 'csv' | 'json') => {
    const qs = new URLSearchParams();
    if (selectedDay) qs.set('day', selectedDay);
    if (marketFilter !== 'all') qs.set('market', marketFilter);
    if (styleFilter !== 'all') qs.set('style', styleFilter);
    if (statusFilter !== 'all') qs.set('status', statusFilter);
    if (searchQuery.trim()) qs.set('search', searchQuery.trim());
    qs.set('format', format);
    qs.set('role', 'super_admin');
    return `${API_BASE}/api/super-admin/daily-ledger/export?${qs.toString()}`;
  };

  const activeDay = selectedDay || summary?.tradingDay || '';
  const isDayPublished = publication?.status === 'published';

  return (
    <div className="daily-ledger-panel font-mono">
      {/* Live region for screen-reader sort announcements */}
      <div role="status" aria-live="polite" className="sr-only">
        {sortAnnouncement}
      </div>

      {/* Hero Header & Global Record Wall Gate */}
      <div className="daily-ledger-hero">
        <div>
          <h2 className="daily-ledger-hero-title">
            <span>📜</span>
            <span>DAILY PUBLISHED TRADES LEDGER &amp; VERIFIED RECORD WALL</span>
          </h2>
          <p className="daily-ledger-hero-sub">
            Complete daily audit of every published setup, its realized outcome (TP1, TP2, Runner @ BE, SL), and every
            superseded trade replaced by fresher price zones. Download full CSV/JSON ledgers or publish verified days
            to the public &amp; client Record Wall.
          </p>
        </div>

        <div className="daily-ledger-wall-gate">
          <div className="daily-ledger-wall-status">
            <span className="daily-ledger-wall-status-label">Public Record Wall Visibility</span>
            <span className={`daily-ledger-wall-status-val ${wallEnabled ? 'is-on' : 'is-off'}`}>
              {wallEnabled ? '🟢 ENABLED FOR USERS' : '🔴 HIDDEN FROM USERS'}
            </span>
          </div>
          <button
            type="button"
            className={`daily-ledger-btn ${wallEnabled ? 'btn-red' : 'btn-green'}`}
            onClick={handleToggleGlobalWall}
            disabled={busyAction === 'wall-toggle'}
          >
            {busyAction === 'wall-toggle'
              ? 'Updating...'
              : wallEnabled
              ? 'Disable Public Wall'
              : 'Enable Public Wall'}
          </button>
          <Link to={`/record-wall${activeDay ? `?day=${activeDay}` : ''}`} className="daily-ledger-btn btn-cyan">
            🏛️ View Record Wall ↗
          </Link>
        </div>
      </div>

      {/* Quick Day Strip */}
      {days.length > 0 && (
        <div className="daily-ledger-day-strip" role="navigation" aria-label="Trading Days">
          {days.slice(0, 21).map((d) => {
            const isSel = d.tradingDay === activeDay;
            return (
              <button
                key={d.tradingDay}
                type="button"
                className={`daily-ledger-day-chip ${isSel ? 'is-selected' : ''}`}
                onClick={() => setSelectedDay(d.tradingDay)}
              >
                <div className="daily-ledger-day-chip-top">
                  <span>{d.tradingDay}</span>
                  {d.publicationStatus === 'published' && (
                    <span title="Published on Record Wall" style={{ color: '#00e676' }}>
                      ● LIVE
                    </span>
                  )}
                </div>
                <div className="daily-ledger-day-chip-meta">
                  {d.totalPublished} pub · {d.supersededCount} sup ·{' '}
                  <span style={{ color: d.totalRealizedR >= 0 ? '#00e676' : '#ff5252', fontWeight: 800 }}>
                    {d.totalRealizedR >= 0 ? '+' : ''}
                    {d.totalRealizedR.toFixed(2)}R
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Filter & Download Bar */}
      <div className="daily-ledger-controls-bar">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end' }}>
          <div className="daily-ledger-control-group">
            <label htmlFor="ledger-day-select" className="daily-ledger-control-label">
              ET Trading Day
            </label>
            <select
              id="ledger-day-select"
              className="daily-ledger-select"
              value={activeDay}
              onChange={(e) => setSelectedDay(e.target.value)}
            >
              {days.map((d) => (
                <option key={d.tradingDay} value={d.tradingDay}>
                  {d.tradingDay} ({d.totalPublished} trades | {d.totalRealizedR >= 0 ? '+' : ''}
                  {d.totalRealizedR.toFixed(2)}R)
                  {d.publicationStatus === 'published' ? ' [WALL LIVE]' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="daily-ledger-control-group">
            <span className="daily-ledger-control-label">Market</span>
            <div className="daily-ledger-pill-row">
              {(['all', 'forex', 'futures'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`daily-ledger-pill ${marketFilter === m ? 'is-active' : ''}`}
                  onClick={() => setMarketFilter(m)}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="daily-ledger-control-group">
            <span className="daily-ledger-control-label">Style</span>
            <div className="daily-ledger-pill-row">
              {(['all', 'intraday', 'scalp', 'swing'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`daily-ledger-pill ${styleFilter === s ? 'is-active' : ''}`}
                  onClick={() => setStyleFilter(s)}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="daily-ledger-control-group">
            <span className="daily-ledger-control-label">Outcome / Status</span>
            <div className="daily-ledger-pill-row">
              {(
                [
                  ['all', 'ALL'],
                  ['won', 'WON'],
                  ['lost', 'LOST'],
                  ['breakeven', 'BE'],
                  ['superseded', 'SUPERSEDED'],
                  ['invalidated', 'INVALIDATED'],
                  ['live', 'LIVE'],
                  ['pending', 'PENDING'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  className={`daily-ledger-pill ${statusFilter === val ? 'is-active' : ''}`}
                  onClick={() => setStatusFilter(val)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="daily-ledger-control-group">
            <label htmlFor="ledger-search-input" className="daily-ledger-control-label">
              Search Instrument / Trade ID
            </label>
            <input
              id="ledger-search-input"
              type="search"
              className="daily-ledger-input"
              placeholder="e.g. EUR/USD or #GBPUSD"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" className="daily-ledger-btn" onClick={() => { fetchDaysIndex(); fetchDailyLedger(); }}>
            🔄 Refresh
          </button>
          <a href={buildExportUrl('csv')} download className="daily-ledger-btn btn-gold">
            📥 Download CSV
          </a>
          <a href={buildExportUrl('json')} download className="daily-ledger-btn btn-cyan">
            📦 Download JSON
          </a>
        </div>
      </div>

      {/* KPI Summary Strip */}
      {summary && (
        <div className="daily-ledger-kpi-grid">
          <div className="daily-ledger-kpi-card">
            <span className="daily-ledger-kpi-label">Total Published</span>
            <span className="daily-ledger-kpi-val">{summary.totalPublished}</span>
            <span className="daily-ledger-kpi-sub">
              Intraday {summary.byStyle.INTRADAY.total} · Scalp {summary.byStyle.SCALP.total} · Swing{' '}
              {summary.byStyle.SWING.total}
            </span>
          </div>

          <div className="daily-ledger-kpi-card">
            <span className="daily-ledger-kpi-label">Resolved Outcomes</span>
            <span className="daily-ledger-kpi-val" style={{ color: '#00e5ff' }}>
              {summary.resolvedTrades}
            </span>
            <span className="daily-ledger-kpi-sub">
              {summary.wins}W · {summary.losses}L · {summary.breakevens}BE
            </span>
          </div>

          <div className="daily-ledger-kpi-card">
            <span className="daily-ledger-kpi-label">Win Rate (Excl. BE)</span>
            <span
              className="daily-ledger-kpi-val"
              style={{ color: summary.winRate >= 55 ? '#00e676' : '#ffd54f' }}
            >
              {summary.winRate.toFixed(1)}%
            </span>
            <span className="daily-ledger-kpi-sub">
              PF: {summary.profitFactor === null ? '∞' : summary.profitFactor.toFixed(2)}
            </span>
          </div>

          <div className="daily-ledger-kpi-card">
            <span className="daily-ledger-kpi-label">Net Realized R (80/20)</span>
            <span
              className="daily-ledger-kpi-val"
              style={{ color: summary.totalRealizedR >= 0 ? '#00e676' : '#ff5252' }}
            >
              {summary.totalRealizedR >= 0 ? '+' : ''}
              {summary.totalRealizedR.toFixed(2)}R
            </span>
            <span className="daily-ledger-kpi-sub">
              Avg {summary.avgRealizedR >= 0 ? '+' : ''}
              {summary.avgRealizedR.toFixed(2)}R / resolved
            </span>
          </div>

          <div className="daily-ledger-kpi-card" style={{ borderColor: 'rgba(255, 171, 0, 0.35)' }}>
            <span className="daily-ledger-kpi-label" style={{ color: '#ffab00' }}>
              Superseded Trades
            </span>
            <span className="daily-ledger-kpi-val" style={{ color: '#ffab00' }}>
              {summary.supersededCount}
            </span>
            <span className="daily-ledger-kpi-sub">Replaced by fresher SnD zone</span>
          </div>

          <div className="daily-ledger-kpi-card">
            <span className="daily-ledger-kpi-label">Pre-Entry Invalidated</span>
            <span className="daily-ledger-kpi-val" style={{ color: '#94a3b8' }}>
              {summary.invalidatedCount}
            </span>
            <span className="daily-ledger-kpi-sub">Unfilled TP1 / SL / Expired</span>
          </div>

          <div className="daily-ledger-kpi-card">
            <span className="daily-ledger-kpi-label">Live &amp; Pending</span>
            <span className="daily-ledger-kpi-val" style={{ color: '#ce93d8' }}>
              {summary.liveCount} / {summary.pendingCount}
            </span>
            <span className="daily-ledger-kpi-sub">Active in market / Awaiting fill</span>
          </div>
        </div>
      )}

      {/* Record Wall Day Publication Controls */}
      <div className="daily-ledger-publish-card">
        <div className="daily-ledger-publish-top">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#ffab00' }}>
                🏛️ RECORD WALL PUBLICATION — {activeDay}
              </h3>
              <span
                className={`ledger-status-badge ${
                  isDayPublished ? 'status-won' : 'status-invalidated'
                }`}
              >
                {isDayPublished ? '● PUBLISHED ON RECORD WALL' : '○ NOT PUBLISHED'}
              </span>
            </div>
            {publication?.publishedAt && (
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '4px' }}>
                Last published {new Date(publication.publishedAt).toUTCString()} by{' '}
                {publication.publishedBy || 'super_admin'}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="daily-ledger-btn btn-green"
              onClick={handlePublishDay}
              disabled={busyAction === 'publish' || !activeDay}
            >
              {busyAction === 'publish'
                ? '⏳ Publishing...'
                : isDayPublished
                ? '🔄 Update Record Wall Snapshot'
                : '🚀 Publish Day to Record Wall'}
            </button>
            {isDayPublished && (
              <button
                type="button"
                className="daily-ledger-btn btn-red"
                onClick={handleUnpublishDay}
                disabled={busyAction === 'unpublish'}
              >
                {busyAction === 'unpublish' ? '⏳ Removing...' : '🚫 Unpublish Day'}
              </button>
            )}
          </div>
        </div>

        <div className="daily-ledger-publish-inputs">
          <div className="daily-ledger-control-group">
            <label htmlFor="wall-pub-title" className="daily-ledger-control-label">
              Record Wall Day Headline
            </label>
            <input
              id="wall-pub-title"
              type="text"
              className="daily-ledger-input"
              value={publishTitle}
              onChange={(e) => setPublishTitle(e.target.value)}
              placeholder={`Verified Daily Record — ${activeDay}`}
            />
          </div>

          <div className="daily-ledger-control-group">
            <label htmlFor="wall-pub-notes" className="daily-ledger-control-label">
              Super Admin Commentary / Desk Notes (Shown on Record Wall)
            </label>
            <input
              id="wall-pub-notes"
              type="text"
              className="daily-ledger-input"
              value={publishNotes}
              onChange={(e) => setPublishNotes(e.target.value)}
              placeholder="Optional session summary or execution notes for traders..."
            />
          </div>
        </div>

        {feedbackMsg && (
          <div
            style={{
              fontSize: '0.78rem',
              padding: '8px 12px',
              borderRadius: '6px',
              background: feedbackMsg.startsWith('Error')
                ? 'rgba(255, 82, 82, 0.14)'
                : 'rgba(0, 230, 118, 0.14)',
              color: feedbackMsg.startsWith('Error') ? '#ff5252' : '#00e676',
              border: '1px solid currentColor',
            }}
          >
            {feedbackMsg}
          </div>
        )}
      </div>

      {/* Responsive & Sortable Daily Ledger Table */}
      <div
        className="daily-ledger-table-wrapper"
        role="region"
        aria-labelledby="daily-ledger-caption"
        tabIndex={0}
      >
        <table className="daily-ledger-table">
          <caption id="daily-ledger-caption">
            Published Trades, Outcomes &amp; Superseded Signals for {activeDay} ({sortedTrades.length}{' '}
            {sortedTrades.length === 1 ? 'record' : 'records'})
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                {...(sortCol === 'tradeId' ? { 'aria-sort': sortDir } : {})}
              >
                <button
                  type="button"
                  className="sort-btn"
                  onClick={() => handleSort('tradeId', 'Trade ID')}
                >
                  Trade ID <span className="sort-icon" aria-hidden="true" />
                </button>
              </th>
              <th
                scope="col"
                {...(sortCol === 'instrument' ? { 'aria-sort': sortDir } : {})}
              >
                <button
                  type="button"
                  className="sort-btn"
                  onClick={() => handleSort('instrument', 'Instrument and Style')}
                >
                  Instrument &amp; Style <span className="sort-icon" aria-hidden="true" />
                </button>
              </th>
              <th
                scope="col"
                {...(sortCol === 'bias' ? { 'aria-sort': sortDir } : {})}
              >
                <button
                  type="button"
                  className="sort-btn"
                  onClick={() => handleSort('bias', 'Direction and Timeframe')}
                >
                  Direction &amp; TF <span className="sort-icon" aria-hidden="true" />
                </button>
              </th>
              <th
                scope="col"
                className="num"
                {...(sortCol === 'entry' ? { 'aria-sort': sortDir } : {})}
              >
                <button
                  type="button"
                  className="sort-btn"
                  onClick={() => handleSort('entry', 'Entry, Stop and Targets', true)}
                >
                  Entry / SL / TP1 / TP2 <span className="sort-icon" aria-hidden="true" />
                </button>
              </th>
              <th
                scope="col"
                {...(sortCol === 'statusCategory' ? { 'aria-sort': sortDir } : {})}
              >
                <button
                  type="button"
                  className="sort-btn"
                  onClick={() => handleSort('statusCategory', 'Status')}
                >
                  Status <span className="sort-icon" aria-hidden="true" />
                </button>
              </th>
              <th
                scope="col"
                {...(sortCol === 'outcomeLabel' ? { 'aria-sort': sortDir } : {})}
              >
                <button
                  type="button"
                  className="sort-btn"
                  onClick={() => handleSort('outcomeLabel', 'Outcome or Superseded Detail')}
                >
                  Outcome / Superseded Detail <span className="sort-icon" aria-hidden="true" />
                </button>
              </th>
              <th
                scope="col"
                className="num"
                {...(sortCol === 'realizedR' ? { 'aria-sort': sortDir } : {})}
              >
                <button
                  type="button"
                  className="sort-btn"
                  onClick={() => handleSort('realizedR', 'Realized R', true)}
                >
                  Realized R <span className="sort-icon" aria-hidden="true" />
                </button>
              </th>
              <th
                scope="col"
                className="num"
                {...(sortCol === 'convictionScore' ? { 'aria-sort': sortDir } : {})}
              >
                <button
                  type="button"
                  className="sort-btn"
                  onClick={() => handleSort('convictionScore', 'Conviction', true)}
                >
                  Conviction <span className="sort-icon" aria-hidden="true" />
                </button>
              </th>
              <th
                scope="col"
                {...(sortCol === 'createdAt' ? { 'aria-sort': sortDir } : {})}
              >
                <button
                  type="button"
                  className="sort-btn"
                  onClick={() => handleSort('createdAt', 'Timestamps', true)}
                >
                  Timestamps (UTC) <span className="sort-icon" aria-hidden="true" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '28px', color: '#94a3b8' }}>
                  ⏳ Loading daily trade ledger...
                </td>
              </tr>
            ) : sortedTrades.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '28px', color: '#94a3b8' }}>
                  No published trades match the selected filters for {activeDay}.
                </td>
              </tr>
            ) : (
              sortedTrades.map((t) => (
                <tr key={`${t.sourceTable}-${t.id}`} className={t.superseded ? 'row-superseded' : ''}>
                  <th scope="row">
                    <div>{t.tradeId}</div>
                    <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 500 }}>
                      {t.killzoneOrigin || t.market.toUpperCase()}
                    </div>
                  </th>
                  <td>
                    <div style={{ fontWeight: 800, color: '#f8fafc' }}>{t.instrument}</div>
                    <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                      {t.tradingStyle} · {t.strategyName}
                    </div>
                  </td>
                  <td>
                    <span
                      style={{
                        fontWeight: 800,
                        color: t.bias === 'long' ? '#00e676' : '#ff5252',
                      }}
                    >
                      {t.bias === 'long' ? '▲ LONG' : '▼ SHORT'}
                    </span>
                    {t.zoneTimeframe && (
                      <span style={{ marginLeft: '6px', color: '#94a3b8', fontSize: '0.72rem' }}>
                        {t.zoneTimeframe}
                      </span>
                    )}
                    {t.nested5mUpgrade && <span className="ledger-upgrade-pill">5M WICK</span>}
                  </td>
                  <td className="num" data-value={t.entryZoneMid}>
                    <div style={{ color: '#e2e8f0', fontWeight: 700 }}>
                      E: {t.entryPrice ?? t.entryZoneMid}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                      SL: <span style={{ color: '#ff5252' }}>{t.stop}</span> · TP1:{' '}
                      <span style={{ color: '#00e676' }}>{t.tp1}</span>
                      {t.tp2 !== null ? ` · TP2: ${t.tp2}` : ''}
                    </div>
                  </td>
                  <td>
                    <span className={`ledger-status-badge status-${t.statusCategory}`}>
                      {t.statusCategory.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 700, color: '#e2e8f0' }}>{t.outcomeLabel}</div>
                    {t.superseded && (
                      <div style={{ fontSize: '0.68rem', color: '#ffab00' }}>
                        {t.supersededByTradeId
                          ? `Replaced by ${t.supersededByTradeId}`
                          : t.invalidationDetail || 'Replaced by newer institutional zone'}
                      </div>
                    )}
                    {!t.superseded && t.invalidationReason && (
                      <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                        Reason: {t.invalidationReason.replace(/_/g, ' ')}
                      </div>
                    )}
                  </td>
                  <td
                    className="num"
                    data-value={t.realizedR ?? -999}
                    style={{
                      fontWeight: 900,
                      color:
                        t.realizedR === null
                          ? '#64748b'
                          : t.realizedR > 0
                          ? '#00e676'
                          : t.realizedR < 0
                          ? '#ff5252'
                          : '#29b6f6',
                    }}
                  >
                    {t.realizedR !== null
                      ? `${t.realizedR >= 0 ? '+' : ''}${t.realizedR.toFixed(2)}R`
                      : '—'}
                  </td>
                  <td className="num" data-value={t.convictionScore ?? -1}>
                    {t.convictionScore !== null ? `${Math.round(t.convictionScore)}%` : '—'}
                  </td>
                  <td data-value={Date.parse(t.createdAt) || 0}>
                    <div style={{ fontSize: '0.7rem', color: '#cbd5e1' }}>
                      Pub: {t.createdAt.slice(11, 16)} UTC
                    </div>
                    {t.filledAt && (
                      <div style={{ fontSize: '0.66rem', color: '#00e5ff' }}>
                        Fill: {t.filledAt.slice(11, 16)} UTC
                      </div>
                    )}
                    {t.resolvedAt && (
                      <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>
                        Exit: {t.resolvedAt.slice(11, 16)} UTC
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
