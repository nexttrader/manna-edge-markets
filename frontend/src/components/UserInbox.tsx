import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';
import './UserInbox.css';

interface Ticket {
  id: string;
  createdAt: string;
  updatedAt: string;
  subject: string;
  status: string;
  priority: string;
  requestedTier?: string;
  invoiceSent: boolean;
  invoiceDetails?: any;
  claimedByName: string | null;
  messages: TicketMessage[];
  unreadByUser: number;
}

interface TicketMessage {
  id: string;
  at: string;
  fromName: string;
  fromEmail: string;
  fromRole: string;
  body: string;
  type: string;
  invoiceDetails?: any;
  readByUser: boolean;
}

const STATUS_META: Record<string, { label: string; color: string; icon: string }> = {
  unassigned:       { label: 'Awaiting Admin', color: '#ff9800', icon: '⏳' },
  claimed:          { label: 'Admin Assigned', color: '#ffd700', icon: '🟡' },
  pending_transfer: { label: 'Being Transferred', color: '#00e5ff', icon: '🔄' },
  awaiting_payment: { label: 'Awaiting Your Payment', color: '#e056fd', icon: '💳' },
  resolved:         { label: 'Resolved', color: '#00c853', icon: '✅' },
  closed:           { label: 'Closed', color: '#666', icon: '🔒' }
};

const TIER_LABEL: Record<string, string> = {
  futures_forex: 'Futures & Forex VIP',
  forex_only: 'Forex Only Pro',
  free: 'Free Tier'
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface UserInboxProps {
  onUnreadChange?: (count: number) => void;
}

export const UserInbox: React.FC<UserInboxProps> = ({ onUnreadChange }) => {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  // New ticket form state
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newType, setNewType] = useState<'general_support' | 'billing' | 'access_issue' | 'tier_upgrade_request'>('general_support');
  const [newTicketLoading, setNewTicketLoading] = useState(false);

  const userEmail = user?.email || '';
  const userName = user?.name || '';
  const userId = user?.id || '';

  const fetchTickets = useCallback(async () => {
    if (!userEmail) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/support/tickets/user/${encodeURIComponent(userEmail)}`);
      const data = await res.json();
      if (data.tickets) {
        setTickets(data.tickets);
        const totalUnread = data.tickets.reduce((sum: number, t: Ticket) => sum + (t.unreadByUser || 0), 0);
        onUnreadChange?.(totalUnread);
      }
    } finally {
      setLoading(false);
    }
  }, [userEmail, onUnreadChange]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  // Poll every 20s for new replies
  useEffect(() => {
    const interval = setInterval(fetchTickets, 20000);
    return () => clearInterval(interval);
  }, [fetchTickets]);

  const openTicket = async (t: Ticket) => {
    setSelectedTicket(t);
    setReplyBody('');
    // Mark messages as read
    await fetch(`${API_BASE}/api/support/tickets/${t.id}/read-by-user`, { method: 'POST' });
    // Update local state
    setTickets(prev => prev.map(tk => tk.id === t.id ? { ...tk, unreadByUser: 0 } : tk));
    const totalUnread = tickets.reduce((sum, tk) => sum + (tk.id === t.id ? 0 : (tk.unreadByUser || 0)), 0);
    onUnreadChange?.(totalUnread);
  };

  const handleReply = async () => {
    if (!replyBody.trim() || !selectedTicket) return;
    setReplyLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/support/tickets/${selectedTicket.id}/user-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userEmail, userName, body: replyBody })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSelectedTicket(data.ticket);
      setReplyBody('');
      fetchTickets();
    } catch (e: any) {
      alert(`⚠️ ${e.message}`);
    } finally {
      setReplyLoading(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim() || !newBody.trim()) return;
    setNewTicketLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/support/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          userName,
          userEmail,
          type: newType,
          subject: newSubject.trim(),
          body: newBody.trim(),
          priority: newType === 'tier_upgrade_request' ? 'urgent' : newType === 'billing' ? 'high' : 'normal'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // Reset form
      setNewSubject('');
      setNewBody('');
      setNewType('general_support');
      setShowNewTicket(false);
      // Refresh + open the new ticket
      await fetchTickets();
      if (data.ticket) setSelectedTicket(data.ticket);
    } catch (e: any) {
      alert(`⚠️ ${e.message}`);
    } finally {
      setNewTicketLoading(false);
    }
  };

  const [activeTab, setActiveTab] = useState<'support' | 'reports'>('support');
  const [perfReports, setPerfReports] = useState<any[]>([]);

  const fetchPerfReports = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/user/performance-reports`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.reports) setPerfReports(data.reports);
    } catch {}
  }, []);

  useEffect(() => {
    fetchPerfReports();
  }, [fetchPerfReports]);

  const totalUnread = tickets.reduce((sum, t) => sum + (t.unreadByUser || 0), 0);

  return (
    <div className="ui-root">
      <div className="ui-header">
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            className="font-mono"
            onClick={() => setActiveTab('support')}
            style={{
              background: activeTab === 'support' ? 'rgba(0, 229, 255, 0.2)' : 'transparent',
              border: activeTab === 'support' ? '1px solid #00e5ff' : '1px solid rgba(255, 255, 255, 0.1)',
              color: activeTab === 'support' ? '#00e5ff' : '#888',
              padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 800, fontSize: '0.85rem'
            }}
          >
            📬 Support Tickets {totalUnread > 0 && `(${totalUnread})`}
          </button>
          <button
            type="button"
            className="font-mono"
            onClick={() => setActiveTab('reports')}
            style={{
              background: activeTab === 'reports' ? 'rgba(255, 215, 0, 0.2)' : 'transparent',
              border: activeTab === 'reports' ? '1px solid #ffd700' : '1px solid rgba(255, 255, 255, 0.1)',
              color: activeTab === 'reports' ? '#ffd700' : '#888',
              padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 800, fontSize: '0.85rem'
            }}
          >
            📊 Performance Reports ({perfReports.length})
          </button>
        </div>

        {activeTab === 'support' && (
          <button className="ui-new-ticket-btn" onClick={() => { setShowNewTicket(true); setSelectedTicket(null); }}>
            + New Ticket
          </button>
        )}
        <button className="ui-refresh-btn" onClick={fetchTickets} title="Refresh">{loading ? '⏳' : '🔃'}</button>
      </div>

      <div className="ui-body">
        {/* Left: ticket list */}
        <div className="ui-list">
          {!showNewTicket && tickets.length === 0 && (
            <div className="ui-empty">
              {loading ? '⏳ Loading...' : (
                <div>
                  <div style={{ fontSize: '2rem', marginBottom: 8 }}>📭</div>
                  <div>No support tickets yet.</div>
                  <div style={{ color: '#555', fontSize: '0.78rem', marginTop: 4 }}>
                    Click <strong style={{ color: '#00e5ff' }}>✏️ New Ticket</strong> above to contact admin support.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* New Ticket Form (shows when creating) */}
          {showNewTicket && (
            <form className="ui-new-ticket-form" onSubmit={handleCreateTicket}>
              <div className="ui-new-ticket-title">✏️ New Support Ticket</div>

              <div className="ui-form-row">
                <label>Category</label>
                <select value={newType} onChange={e => setNewType(e.target.value as any)} className="ui-form-select">
                  <option value="general_support">💬 General Support</option>
                  <option value="billing">💳 Billing Question</option>
                  <option value="access_issue">🔐 Access / Login Issue</option>
                  <option value="tier_upgrade_request">⬆️ Plan Upgrade Request</option>
                </select>
              </div>

              <div className="ui-form-row">
                <label>Subject</label>
                <input type="text" value={newSubject} onChange={e => setNewSubject(e.target.value)}
                  placeholder="Brief summary of your issue..." className="ui-form-input" required maxLength={120} />
              </div>

              <div className="ui-form-row">
                <label>Message</label>
                <textarea value={newBody} onChange={e => setNewBody(e.target.value)}
                  placeholder="Describe your issue in detail..."
                  className="ui-form-textarea" rows={5} required />
              </div>

              <div className="ui-form-actions">
                <button type="button" className="ui-form-cancel" onClick={() => setShowNewTicket(false)}>Cancel</button>
                <button type="submit" className="ui-form-submit"
                  disabled={newTicketLoading || !newSubject.trim() || !newBody.trim()}>
                  {newTicketLoading ? '⏳ Submitting...' : '📬 Submit Ticket'}
                </button>
              </div>
            </form>
          )}

          {/* Ticket list (shows when not in new ticket mode) */}
          {!showNewTicket && tickets.map(t => {
            const st = STATUS_META[t.status] || STATUS_META['unassigned'];
            const hasUnread = t.unreadByUser > 0;
            const isSelected = selectedTicket?.id === t.id;
            return (
              <div
                key={t.id}
                className={`ui-ticket-card ${isSelected ? 'selected' : ''} ${hasUnread ? 'has-unread' : ''}`}
                onClick={() => openTicket(t)}
              >
                <div className="ui-card-header">
                  <span className="ui-card-subject">{t.subject}</span>
                  {hasUnread && <span className="ui-unread-badge">{t.unreadByUser}</span>}
                </div>
                <div className="ui-card-meta">
                  <span className="ui-status" style={{ color: st.color }}>
                    {st.icon} {st.label}
                  </span>
                  <span className="ui-time">{timeAgo(t.updatedAt)}</span>
                </div>
                {t.claimedByName && t.status !== 'unassigned' && (
                  <div className="ui-card-assigned">Assigned to: {t.claimedByName}</div>
                )}
                {t.invoiceSent && (
                  <div className="ui-invoice-indicator">💳 Invoice received</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right: ticket detail */}
        <div className="ui-detail">
          {!selectedTicket ? (
            <div className="ui-detail-empty">
              <span style={{ fontSize: '2.5rem' }}>📬</span>
              <p>Select a ticket to read messages</p>
            </div>
          ) : (
            <div className="ui-detail-content">
              <div className="ui-detail-header">
                <div className="ui-detail-subject">{selectedTicket.subject}</div>
                <div className="ui-detail-status">
                  <span style={{ color: STATUS_META[selectedTicket.status]?.color }}>
                    {STATUS_META[selectedTicket.status]?.icon} {STATUS_META[selectedTicket.status]?.label}
                  </span>
                  {selectedTicket.requestedTier && (
                    <span className="ui-detail-tier">
                      Requested: {TIER_LABEL[selectedTicket.requestedTier] || selectedTicket.requestedTier}
                    </span>
                  )}
                </div>
              </div>

              {/* Invoice awaiting payment notice */}
              {selectedTicket.status === 'awaiting_payment' && selectedTicket.invoiceDetails && (
                <div className="ui-invoice-notice">
                  <div className="ui-invoice-title">💳 Invoice Received — Payment Required</div>
                  <div className="ui-invoice-body">
                    Your account will be upgraded to <strong>{selectedTicket.invoiceDetails.tierLabel}</strong> immediately after we confirm your payment of <strong>{selectedTicket.invoiceDetails.currency} {selectedTicket.invoiceDetails.amount}/month</strong>.
                  </div>
                  <div className="ui-invoice-instructions">
                    {selectedTicket.invoiceDetails.paymentInstructions}
                    {selectedTicket.invoiceDetails.bankDetails && (
                      <div className="ui-invoice-bank">{selectedTicket.invoiceDetails.bankDetails}</div>
                    )}
                  </div>
                  <div className="ui-invoice-due">Due: {selectedTicket.invoiceDetails.dueDate}</div>
                </div>
              )}

              {/* Unassigned waiting notice */}
              {selectedTicket.status === 'unassigned' && (
                <div className="ui-waiting-notice">
                  ⏳ Your request is in the queue. An admin will pick it up and get back to you shortly.
                </div>
              )}

              {/* Messages */}
              <div className="ui-messages">
                {selectedTicket.messages.map(msg => (
                  <div key={msg.id} className={`ui-msg ${msg.fromRole === 'trader' ? 'from-me' : msg.fromRole === 'system' ? 'from-system' : 'from-admin'}`}>
                    <div className="ui-msg-header">
                      <strong>{msg.fromRole === 'trader' ? 'You' : msg.fromRole === 'system' ? 'Manna Edge Support' : msg.fromName}</strong>
                      {msg.type === 'invoice' && <span className="ui-invoice-tag">💳 INVOICE</span>}
                      <span className="ui-msg-time">{timeAgo(msg.at)}</span>
                    </div>
                    <div className="ui-msg-body">
                      {msg.body.split('\n').map((line, i) => (
                        <span key={i}>{line}<br /></span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Reply box — only if not resolved/closed */}
              {selectedTicket.status !== 'resolved' && selectedTicket.status !== 'closed' && (
                <div className="ui-reply-box">
                  <textarea
                    placeholder="Type a reply to your admin..."
                    value={replyBody}
                    onChange={e => setReplyBody(e.target.value)}
                    className="ui-reply-textarea"
                    rows={3}
                  />
                  <button
                    className="ui-reply-btn"
                    onClick={handleReply}
                    disabled={replyLoading || !replyBody.trim()}
                  >
                    {replyLoading ? 'Sending...' : '💬 Reply'}
                  </button>
                </div>
              )}

              {selectedTicket.status === 'resolved' && (
                <div className="ui-resolved-notice">
                  ✅ This ticket has been resolved. If you need further help, open a new request.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
