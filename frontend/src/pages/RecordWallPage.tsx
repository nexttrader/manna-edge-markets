import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { API_BASE } from '../config';
import { useAuth } from '../context/AuthContext';
import { useRecordWall } from '../hooks/useRecordWall';
import '../components/admin/DailyTradeLedgerPanel.css';
import './RecordWallPage.css';

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

export const RecordWallPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialDay = searchParams.get('day') || undefined;

  const [selectedDay, setSelectedDay] = useState<string | undefined>(initialDay);
  const [marketFilter, setMarketFilter] = useState<'all' | 'futures' | 'forex'>('all');
  const [styleFilter, setStyleFilter] = useState<'all' | 'intraday' | 'scalp' | 'swing'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [sortCol, setSortCol] = useState<SortColumn>('createdAt');
  const [sortDir, setSortDir] = useState<'ascending' | 'descending'>('descending');
  const [sortAnnouncement, setSortAnnouncement] = useState<string>('');

  const { data, loading, refresh } = useRecordWall({
    day: selectedDay,
    market: marketFilter,
    style: styleFilter,
    status: statusFilter,
  });

  const activeDay = data?.selectedDay || selectedDay || '';
  const ledger = data?.ledger || null;
  const summary = ledger?.summary || null;
  const publication = ledger?.publication || null;
  const overall = data?.overallStats;

  const handleSelectDay = (day: string) => {
    setSelectedDay(day);
    setSearchParams({ day });
  };

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

  const filteredAndSortedTrades = useMemo(() => {
    const raw = ledger?.trades || [];
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? raw.filter((t) =>
          `${t.instrument} ${t.tradeId} ${t.strategyName} ${t.outcomeLabel} ${t.supersededByTradeId || ''}`
            .toLowerCase()
            .includes(q)
        )
      : raw;

    const dir = sortDir === 'ascending' ? 1 : -1;
    return [...filtered].sort((a, b) => {
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
  }, [ledger?.trades, searchQuery, sortCol, sortDir]);

  const exportCsvUrl = useMemo(() => {
    if (!activeDay) return '#';
    const qs = new URLSearchParams();
    if (marketFilter !== 'all') qs.set('market', marketFilter);
    if (styleFilter !== 'all') qs.set('style', styleFilter);
    if (statusFilter !== 'all') qs.set('status', statusFilter);
    const queryStr = qs.toString();
    return `${API_BASE}/api/record-wall/${activeDay}/export${queryStr ? `?${queryStr}` : ''}`;
  }, [activeDay, marketFilter, styleFilter, statusFilter]);

  return (
    <div className="record-wall-page font-mono">
      {/* Screen-reader live region for table sort announcements */}
      <div role="status" aria-live="polite" className="sr-only">
        {sortAnnouncement}
      </div>

      {/* Top Navigation Bar */}
      <header className="record-wall-topbar">
        <Link to={user ? '/dashboard' : '/'} className="record-wall-brand">
          <span style={{ fontWeight: 900, fontSize: '1.05rem', letterSpacing: '0.06em' }}>
            MANNA EDGE MARKETS
          </span>
          <span className="record-wall-brand-badge">VERIFIED RECORD WALL</span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {user?.role === 'super_admin' && (
            <Link to="/vault-5287?tab=daily_ledger" className="daily-ledger-btn btn-gold">
              ⚙️ Super Admin Ledger Controls
            </Link>
          )}
          {user ? (
            <Link to="/dashboard" className="daily-ledger-btn btn-cyan">
              ← Back to Live Signals
            </Link>
          ) : (
            <>
              <Link to="/" className="daily-ledger-btn">
                ← Home
              </Link>
              <Link to="/signup" className="daily-ledger-btn btn-green">
                Start 14-Day Free Trial →
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="record-wall-container">
        {!loading && (!data?.enabled || (data?.days?.length ?? 0) === 0) ? (
          <div className="record-wall-empty-card">
            <div style={{ fontSize: '2.2rem', marginBottom: '10px' }}>🏛️</div>
            <h1 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', color: '#f8fafc' }}>
              Verified Record Wall
            </h1>
            <p style={{ margin: '0 0 20px 0', fontSize: '0.84rem', color: '#94a3b8', lineHeight: 1.5 }}>
              Daily verified trading ledgers appear here once reviewed and published by the Manna Super Admin desk.
            </p>
            <Link to={user ? '/dashboard' : '/'} className="daily-ledger-btn btn-cyan">
              Return to {user ? 'Live Dashboard' : 'Home'}
            </Link>
          </div>
        ) : (
          <>
            {/* Cumulative Verified KPI Banner */}
            <section className="record-wall-hero" aria-label="Verified Cumulative Performance">
              <div className="record-wall-hero-header">
                <div>
                  <h1 className="record-wall-title">
                    🏛️ Official Verified Trade Record Wall
                  </h1>
                  <p className="record-wall-subtitle">
                    Full transparency ledger displaying every published trade, its realized 80/20 R outcome, and every
                    superseded setup replaced before fill across Super Admin–verified trading sessions.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button type="button" className="daily-ledger-btn" onClick={refresh}>
                    🔄 Refresh Wall
                  </button>
                  {activeDay && (
                    <a href={exportCsvUrl} download className="daily-ledger-btn btn-gold">
                      📥 Download {activeDay} CSV
                    </a>
                  )}
                </div>
              </div>

              {overall && (
                <div className="record-wall-overall-grid">
                  <div className="record-wall-overall-card">
                    <span className="record-wall-overall-label">Verified Days Published</span>
                    <span className="record-wall-overall-val" style={{ color: '#00e5ff' }}>
                      {overall.daysPublished}
                    </span>
                  </div>
                  <div className="record-wall-overall-card">
                    <span className="record-wall-overall-label">Total Published Signals</span>
                    <span className="record-wall-overall-val">{overall.totalPublished}</span>
                  </div>
                  <div className="record-wall-overall-card">
                    <span className="record-wall-overall-label">Settled Trades</span>
                    <span className="record-wall-overall-val">
                      {overall.resolvedTrades}{' '}
                      <span style={{ fontSize: '0.76rem', color: '#94a3b8', fontWeight: 600 }}>
                        ({overall.wins}W / {overall.losses}L / {overall.breakevens}BE)
                      </span>
                    </span>
                  </div>
                  <div className="record-wall-overall-card">
                    <span className="record-wall-overall-label">Verified Win Rate</span>
                    <span
                      className="record-wall-overall-val"
                      style={{ color: overall.winRate >= 55 ? '#00e676' : '#ffd54f' }}
                    >
                      {overall.winRate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="record-wall-overall-card">
                    <span className="record-wall-overall-label">Cumulative Realized R</span>
                    <span
                      className="record-wall-overall-val"
                      style={{ color: overall.totalRealizedR >= 0 ? '#00e676' : '#ff5252' }}
                    >
                      {overall.totalRealizedR >= 0 ? '+' : ''}
                      {overall.totalRealizedR.toFixed(2)}R
                    </span>
                  </div>
                  <div className="record-wall-overall-card">
                    <span className="record-wall-overall-label">Superseded Setups Logged</span>
                    <span className="record-wall-overall-val" style={{ color: '#ffab00' }}>
                      {overall.supersededCount}
                    </span>
                  </div>
                </div>
              )}
            </section>

            {/* Published Day Selector Strip */}
            {data?.days && data.days.length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 800,
                    color: '#94a3b8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.07em',
                    marginBottom: '8px',
                  }}
                >
                  Select Verified Trading Day ({data.days.length} Published)
                </div>
                <div className="daily-ledger-day-strip" role="navigation" aria-label="Published Trading Days">
                  {data.days.map((d) => {
                    const isSel = d.tradingDay === activeDay;
                    return (
                      <button
                        key={d.tradingDay}
                        type="button"
                        className={`daily-ledger-day-chip ${isSel ? 'is-selected' : ''}`}
                        onClick={() => handleSelectDay(d.tradingDay)}
                      >
                        <div className="daily-ledger-day-chip-top">
                          <span>{d.tradingDay}</span>
                          <span style={{ color: '#00e676' }}>✓ VERIFIED</span>
                        </div>
                        <div className="daily-ledger-day-chip-meta">
                          {d.summary.totalPublished} trades · {d.summary.wins}W/{d.summary.losses}L ·{' '}
                          {d.summary.supersededCount} sup ·{' '}
                          <span
                            style={{
                              color: d.summary.totalRealizedR >= 0 ? '#00e676' : '#ff5252',
                              fontWeight: 800,
                            }}
                          >
                            {d.summary.totalRealizedR >= 0 ? '+' : ''}
                            {d.summary.totalRealizedR.toFixed(2)}R
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Selected Day Desk Commentary & Headline */}
            {publication && (
              <div className="record-wall-notes-banner">
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <strong style={{ color: '#00e5ff', fontSize: '0.92rem' }}>
                    {publication.title || `Verified Daily Record — ${activeDay}`}
                  </strong>
                  {publication.publishedAt && (
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                      Verified {new Date(publication.publishedAt).toUTCString()}
                    </span>
                  )}
                </div>
                {publication.adminNotes && (
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#e2e8f0' }}>
                    Desk Notes: {publication.adminNotes}
                  </p>
                )}
              </div>
            )}

            {/* Selected Day KPI Summary */}
            {summary && (
              <div className="daily-ledger-kpi-grid">
                <div className="daily-ledger-kpi-card">
                  <span className="daily-ledger-kpi-label">{activeDay} Published</span>
                  <span className="daily-ledger-kpi-val">{summary.totalPublished}</span>
                  <span className="daily-ledger-kpi-sub">
                    Intraday {summary.byStyle.INTRADAY.total} · Scalp {summary.byStyle.SCALP.total} · Swing{' '}
                    {summary.byStyle.SWING.total}
                  </span>
                </div>
                <div className="daily-ledger-kpi-card">
                  <span className="daily-ledger-kpi-label">{activeDay} Outcomes</span>
                  <span className="daily-ledger-kpi-val" style={{ color: '#00e5ff' }}>
                    {summary.wins}W / {summary.losses}L / {summary.breakevens}BE
                  </span>
                  <span className="daily-ledger-kpi-sub">{summary.resolvedTrades} filled &amp; closed</span>
                </div>
                <div className="daily-ledger-kpi-card">
                  <span className="daily-ledger-kpi-label">{activeDay} Win Rate</span>
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
                  <span className="daily-ledger-kpi-label">{activeDay} Realized R</span>
                  <span
                    className="daily-ledger-kpi-val"
                    style={{ color: summary.totalRealizedR >= 0 ? '#00e676' : '#ff5252' }}
                  >
                    {summary.totalRealizedR >= 0 ? '+' : ''}
                    {summary.totalRealizedR.toFixed(2)}R
                  </span>
                  <span className="daily-ledger-kpi-sub">80% TP1 / 20% TP2 runner accounting</span>
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
                  <span className="daily-ledger-kpi-label">Unfilled / Pre-Entry</span>
                  <span className="daily-ledger-kpi-val" style={{ color: '#94a3b8' }}>
                    {summary.invalidatedCount}
                  </span>
                  <span className="daily-ledger-kpi-sub">Target reached or expired pre-fill</span>
                </div>
              </div>
            )}

            {/* Filter Bar */}
            <div className="daily-ledger-controls-bar">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end' }}>
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
                  <span className="daily-ledger-control-label">Filter by Outcome / Superseded</span>
                  <div className="daily-ledger-pill-row">
                    {(
                      [
                        ['all', 'ALL'],
                        ['won', 'WON'],
                        ['lost', 'LOST'],
                        ['breakeven', 'BE'],
                        ['superseded', 'SUPERSEDED'],
                        ['invalidated', 'UNFILLED / INVALIDATED'],
                        ['live', 'LIVE'],
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
                  <label htmlFor="wall-search-input" className="daily-ledger-control-label">
                    Search Instrument / Trade ID
                  </label>
                  <input
                    id="wall-search-input"
                    type="search"
                    className="daily-ledger-input"
                    placeholder="e.g. EUR/USD or #NQ"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Accessible Responsive & Sortable Ledger Table */}
            <div
              className="daily-ledger-table-wrapper"
              role="region"
              aria-labelledby="record-wall-table-caption"
              tabIndex={0}
            >
              <table className="daily-ledger-table">
                <caption id="record-wall-table-caption">
                  Verified Trade Ledger for {activeDay} — Published Trades, Outcomes &amp; Superseded Setups (
                  {filteredAndSortedTrades.length}{' '}
                  {filteredAndSortedTrades.length === 1 ? 'record' : 'records'})
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
                        ⏳ Loading verified trade ledger...
                      </td>
                    </tr>
                  ) : filteredAndSortedTrades.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '28px', color: '#94a3b8' }}>
                        No trades match the active filter for {activeDay}.
                      </td>
                    </tr>
                  ) : (
                    filteredAndSortedTrades.map((t) => (
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
                                : 'Replaced by newer institutional zone'}
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
          </>
        )}
      </main>
    </div>
  );
};
