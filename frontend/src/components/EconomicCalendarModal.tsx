import React, { useEffect, useState } from 'react';
import { API_BASE } from '../config';
import './EconomicCalendarModal.css';

interface EconomicEvent {
  id: string;
  title: string;
  country: string;
  currency: string;
  impact: 'high' | 'medium' | 'low';
  eventTime: string;
  forecast?: string;
  previous?: string;
  actual?: string;
}

interface EconomicCalendarModalProps {
  onClose: () => void;
}

export const EconomicCalendarModal: React.FC<EconomicCalendarModalProps> = ({ onClose }) => {
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState<boolean>(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [currencyFilter, setCurrencyFilter] = useState('ALL');
  const [impactFilter, setImpactFilter] = useState('all');

  const fetchCalendar = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/news/calendar?currency=${currencyFilter}&impact=${impactFilter}`);
      if (!res.ok) return;
      const data = await res.json();
      setEvents(data.events || []);
      setIsLive(data.isLive ?? true);
      setNotice(data.notice || null);
    } catch {
      setIsLive(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalendar();
  }, [currencyFilter, impactFilter]);

  return (
    <div className="econ-modal-backdrop" onClick={onClose}>
      <div className="econ-modal-card animate-scale-up" onClick={e => e.stopPropagation()}>
        <div className="econ-modal-header">
          <div>
            <h3>📅 LIVE ECONOMIC CALENDAR</h3>
            <span className="econ-sub">Real-Time Central Bank Releases & High-Impact News Alerts</span>
          </div>
          <button className="econ-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Filter Controls Bar */}
        <div className="econ-filters-row">
          <div className="econ-filter-group">
            <label>Currency:</label>
            <select value={currencyFilter} onChange={e => setCurrencyFilter(e.target.value)}>
              <option value="ALL">🌐 All Currencies</option>
              <option value="USD">🇺🇸 USD (US Dollar)</option>
              <option value="EUR">🇪🇺 EUR (Euro)</option>
              <option value="GBP">🇬🇧 GBP (British Pound)</option>
            </select>
          </div>

          <div className="econ-filter-group">
            <label>Impact Level:</label>
            <select value={impactFilter} onChange={e => setImpactFilter(e.target.value)}>
              <option value="all">All Impacts</option>
              <option value="high">🔴 High Impact Only (Red Folder)</option>
              <option value="medium">🟠 Medium Impact (Orange)</option>
            </select>
          </div>

          <button className="econ-refresh-btn" onClick={fetchCalendar}>
            🔄 Refresh Feed
          </button>
        </div>

        {!isLive && (
          <div style={{
            background: 'rgba(255, 171, 0, 0.12)',
            border: '1px solid rgba(255, 183, 77, 0.4)',
            borderRadius: '8px',
            padding: '12px 16px',
            margin: '12px 0 16px 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}>
            <div style={{ fontSize: '0.9rem', color: '#ffb74d' }}>
              <strong>⚠️ Live Feed Offline:</strong> {notice || "Calendar stream is currently unreachable. Simulated fallbacks are disabled."}
            </div>
            <a
              href="https://www.forexfactory.com/calendar"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: '#ffb74d',
                color: '#0a0b10',
                padding: '6px 12px',
                borderRadius: '6px',
                fontWeight: 'bold',
                fontSize: '0.85rem',
                textDecoration: 'none',
                whiteSpace: 'nowrap'
              }}
            >
              🔗 Open ForexFactory ↗
            </a>
          </div>
        )}

        {/* Calendar Events List */}
        <div className="econ-events-body">
          {loading ? (
            <div className="econ-loading font-headline">Syncing live economic events...</div>
          ) : events.length === 0 ? (
            <div className="econ-empty font-headline">
              {isLive ? "No economic releases match selected filter." : "Live economic calendar feed is offline. Please use ForexFactory.com link above."}
            </div>
          ) : (
            <div className="econ-events-list">
              {events.map(ev => {
                const dateObj = new Date(ev.eventTime);
                const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
                const dateStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', weekday: 'short' });
                const isPast = dateObj.getTime() < Date.now();

                return (
                  <div key={ev.id} className={`econ-event-card ${ev.impact} ${isPast ? 'is-past' : ''}`}>
                    <div className="econ-event-left">
                      <span className={`impact-dot ${ev.impact}`} title={`${ev.impact.toUpperCase()} Impact`} />
                      <div className="econ-time-box">
                        <span className="ev-time font-mono">{timeStr}</span>
                        <span className="ev-date">{dateStr}</span>
                      </div>
                      <span className="ev-currency">{ev.currency}</span>
                    </div>

                    <div className="econ-event-center">
                      <span className="ev-title">{ev.title}</span>
                      {isPast && <span className="ev-released-badge">RELEASED</span>}
                    </div>

                    <div className="econ-event-right font-mono">
                      {ev.forecast && (
                        <div className="ev-meta">
                          <span className="m-lbl">FORECAST:</span>
                          <span className="m-val">{ev.forecast}</span>
                        </div>
                      )}
                      {ev.previous && (
                        <div className="ev-meta">
                          <span className="m-lbl">PREVIOUS:</span>
                          <span className="m-val">{ev.previous}</span>
                        </div>
                      )}
                      {ev.actual && (
                        <div className="ev-meta">
                          <span className="m-lbl">ACTUAL:</span>
                          <span className="m-val text-gold">{ev.actual}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

