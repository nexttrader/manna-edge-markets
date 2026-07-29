import { useState, useEffect } from 'react';

export function useWatchlist() {
  const [watchlistIds, setWatchlistIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('manna_watchlist_ids');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('manna_watchlist_ids', JSON.stringify(watchlistIds));
  }, [watchlistIds]);

  const toggleWatchlist = (setupId: string) => {
    setWatchlistIds(prev => {
      if (prev.includes(setupId)) {
        return prev.filter(id => id !== setupId);
      } else {
        return [...prev, setupId];
      }
    });
  };

  const isWatchlisted = (setupId: string) => watchlistIds.includes(setupId);

  return { watchlistIds, toggleWatchlist, isWatchlisted };
}
