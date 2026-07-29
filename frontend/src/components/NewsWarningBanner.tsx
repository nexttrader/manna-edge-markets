import React, { useEffect, useState } from 'react';
import { API_BASE } from '../config';
import './NewsWarningBanner.css';

interface NewsEvent {
  id: string;
  title: string;
  currency: string;
  impact: string;
  eventTime: string;
  forecast?: string;
  previous?: string;
}

export const NewsWarningBanner: React.FC = () => {
  const [nearestEvent, setNearestEvent] = useState<NewsEvent | null>(null);
  const [minutesUntil, setMinutesUntil] = useState<number | null>(null);

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/news/events`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.nearestEvent) {
          setNearestEvent(data.nearestEvent);
          const diffMs = new Date(data.nearestEvent.eventTime).getTime() - Date.now();
          setMinutesUntil(Math.round(diffMs / 60000));
        }
      } catch {}
    };

    fetchNews();
    const interval = setInterval(fetchNews, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (!nearestEvent || minutesUntil === null || minutesUntil > 60 || minutesUntil < -30) {
    return null;
  }

  const isImminent = minutesUntil <= 30 && minutesUntil >= -15;

  return (
    <div className={`news-warning-banner ${isImminent ? 'imminent' : ''}`}>
      <div className="container news-banner-content">
        <span className="news-badge">⚠️ HIGH IMPACT NEWS ALERT</span>
        <span className="news-title">
          <strong>{nearestEvent.currency} {nearestEvent.title}</strong>
        </span>
        <span className="news-timer font-mono">
          {minutesUntil > 0
            ? `Releasing in ${minutesUntil} min`
            : `Released ${Math.abs(minutesUntil)} min ago (Volatility Active)`}
        </span>
        {nearestEvent.forecast && (
          <span className="news-meta">
            Forecast: {nearestEvent.forecast} | Prev: {nearestEvent.previous}
          </span>
        )}
      </div>
    </div>
  );
};
