import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';

export function useTaggedSignals() {
  const { user } = useAuth();
  const [taggedIds, setTaggedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const fetchTags = useCallback(async () => {
    if (!user?.id && !user?.email) return;
    try {
      const userId = encodeURIComponent((user as any).id || user.email || '');
      const res = await fetch(`${API_BASE}/api/admin/my-tags?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setTaggedIds(new Set(Array.isArray(data.taggedIds) ? data.taggedIds : []));
      }
    } catch { /* silent */ }
  }, [user]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const isTagged = useCallback((setupId: string) => taggedIds.has(setupId), [taggedIds]);

  const toggleTag = useCallback(async (setupId: string, setup: any) => {
    if (!user?.id && !user?.email) return;

    // Optimistic update
    setTaggedIds(prev => {
      const next = new Set(prev);
      if (next.has(setupId)) next.delete(setupId);
      else next.add(setupId);
      return next;
    });

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/admin/tag-signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: (user as any).id || user.email,
          userEmail: user.email,
          setupId,
          market: setup?.market || 'futures',
          instrument: setup?.instrument || '',
          bias: setup?.bias || 'long',
          conviction_score: setup?.conviction_score,
          strategy_id: setup?.strategy_id || 'sentinel_v2'
        })
      });
      if (!res.ok) {
        await fetchTags(); // rollback on failure
      }
    } catch {
      await fetchTags();
    } finally {
      setLoading(false);
    }
  }, [user, fetchTags]);

  return { taggedIds: Array.from(taggedIds), isTagged, toggleTag, loading, refetch: fetchTags };
}
