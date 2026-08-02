import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';

interface UserInboxBannerProps {
  onOpenInbox: () => void;
}

export const UserInboxBanner: React.FC<UserInboxBannerProps> = ({ onOpenInbox }) => {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [lastSeenCount, setLastSeenCount] = useState(0);

  const fetchUnread = useCallback(async () => {
    if (!user?.email || user.role === 'admin' || user.role === 'super_admin') return;
    try {
      const res = await fetch(`${API_BASE}/api/support/tickets/user/${encodeURIComponent(user.email)}`);
      const data = await res.json();
      if (data.tickets !== undefined) {
        const total: number = data.tickets.reduce((sum: number, t: any) => sum + (t.unreadByUser || 0), 0);
        setUnreadCount(total);
        // Show banner when new unread arrive
        if (total > lastSeenCount && total > 0) {
          setDismissed(false);
          setVisible(true);
        }
        setLastSeenCount(prev => {
          if (total < prev) return total; // reset when they read
          return prev;
        });
      }
    } catch { /* ignore */ }
  }, [user?.email, user?.role, lastSeenCount]);

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 20000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  useEffect(() => {
    if (unreadCount > 0 && !dismissed) {
      setVisible(true);
    } else if (unreadCount === 0) {
      setVisible(false);
    }
  }, [unreadCount, dismissed]);

  const handleDismiss = () => {
    setDismissed(true);
    setVisible(false);
    setLastSeenCount(unreadCount);
  };

  const handleOpen = () => {
    onOpenInbox();
    handleDismiss();
  };

  if (!user || user.role === 'admin' || user.role === 'super_admin') return null;
  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        background: 'linear-gradient(135deg, #0f0620 0%, #1a0940 100%)',
        border: '1px solid rgba(0, 229, 255, 0.5)',
        borderRadius: '14px',
        padding: '16px 20px',
        maxWidth: '340px',
        width: '100%',
        boxShadow: '0 0 30px rgba(0,229,255,0.2), 0 8px 32px rgba(0,0,0,0.4)',
        animation: 'banner-slide-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        fontFamily: "'Space Mono', 'Courier New', monospace"
      }}
    >
      <style>{`
        @keyframes banner-slide-in {
          from { transform: translateY(100px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes banner-pulse {
          0%, 100% { box-shadow: 0 0 30px rgba(0,229,255,0.2), 0 8px 32px rgba(0,0,0,0.4); }
          50%       { box-shadow: 0 0 50px rgba(0,229,255,0.4), 0 8px 32px rgba(0,0,0,0.4); }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>📬</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, color: '#00e5ff', fontSize: '0.88rem', marginBottom: '3px' }}>
            New message from Admin
          </div>
          <div style={{ color: '#bbb', fontSize: '0.78rem', lineHeight: 1.4 }}>
            {unreadCount === 1
              ? 'You have 1 new message in your inbox.'
              : `You have ${unreadCount} new messages in your inbox.`}
          </div>
        </div>
        <button
          onClick={handleDismiss}
          style={{
            background: 'transparent', border: 'none', color: '#555',
            fontSize: '1.1rem', cursor: 'pointer', padding: '0', lineHeight: 1,
            flexShrink: 0
          }}
          title="Dismiss"
        >
          ✕
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={handleOpen}
          style={{
            flex: 1, background: '#00e5ff', color: '#000', border: 'none',
            padding: '9px 16px', borderRadius: '8px',
            fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 900, cursor: 'pointer',
            transition: 'all 0.15s'
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#40eeff')}
          onMouseLeave={e => (e.currentTarget.style.background = '#00e5ff')}
        >
          📬 Open Inbox
        </button>
        <button
          onClick={handleDismiss}
          style={{
            background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
            color: '#888', padding: '9px 14px', borderRadius: '8px',
            fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
            transition: 'all 0.15s'
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={e => (e.currentTarget.style.color = '#888')}
        >
          Later
        </button>
      </div>
    </div>
  );
};
