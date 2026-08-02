import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';
import './AdminSupportInbox.css';

type AdminSubTab = 'centralised' | 'mine' | 'transfers';

interface Ticket {
  id: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
  userName: string;
  userEmail: string;
  requestedTier?: string;
  currentTier?: string;
  type: string;
  subject: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'unassigned' | 'claimed' | 'pending_transfer' | 'awaiting_payment' | 'resolved' | 'closed';
  claimedBy: string | null;
  claimedByName: string | null;
  claimedAt: string | null;
  transferToEmail: string | null;
  transferToName: string | null;
  transferNote: string | null;
  transferRequestedAt: string | null;
  invoiceSent: boolean;
  invoiceSentAt: string | null;
  invoiceDetails?: any;
  resolvedBy: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  messages: TicketMessage[];
  timeline: TicketEvent[];
  unreadByAdmin: number;
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
  readByAdmin: boolean;
}

interface TicketEvent {
  at: string;
  actorName: string;
  event: string;
  note?: string;
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: '#ff3b3b',
  high: '#ff9800',
  normal: '#00e5ff',
  low: '#aaa'
};

const STATUS_LABEL: Record<string, { label: string; color: string; icon: string }> = {
  unassigned: { label: 'Unassigned', color: '#ff3b3b', icon: '🔴' },
  claimed: { label: 'Claimed', color: '#ffd700', icon: '🟡' },
  pending_transfer: { label: 'Pending Transfer', color: '#00e5ff', icon: '🔄' },
  awaiting_payment: { label: 'Awaiting Payment', color: '#e056fd', icon: '💳' },
  resolved: { label: 'Resolved', color: '#00c853', icon: '✅' },
  closed: { label: 'Closed', color: '#666', icon: '🔒' }
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

function isStale(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() > 24 * 60 * 60 * 1000;
}

export const AdminSupportInbox: React.FC = () => {
  const { user } = useAuth();
  const [subTab, setSubTab] = useState<AdminSubTab>('centralised');
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [myTickets, setMyTickets] = useState<Ticket[]>([]);
  const [transferTickets, setTransferTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(false);

  // Reply state
  const [replyBody, setReplyBody] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);

  // Transfer state
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [allAdmins, setAllAdmins] = useState<any[]>([]);
  const [transferTo, setTransferTo] = useState('');
  const [transferToName, setTransferToName] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);

  // Invoice state
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [invoiceTier, setInvoiceTier] = useState<'forex_only' | 'futures_forex'>('futures_forex');
  const [invoiceAmount, setInvoiceAmount] = useState('297');
  const [invoiceInstructions, setInvoiceInstructions] = useState('Please transfer payment to our designated account. Reference your email address as the payment description.');
  const [invoiceBankDetails, setInvoiceBankDetails] = useState('');
  const [invoiceDueDate, setInvoiceDueDate] = useState('');
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  // Resolve state
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [resolveNote, setResolveNote] = useState('');
  const [upgradeTier, setUpgradeTier] = useState(true);
  const [resolveLoading, setResolveLoading] = useState(false);

  const adminEmail = user?.email || '';
  const adminName = user?.name || '';

  const fetchAll = useCallback(async () => {
    if (!adminEmail) return;
    setLoading(true);
    try {
      const [allRes, mineRes, transRes, adminsRes] = await Promise.all([
        fetch(`${API_BASE}/api/support/tickets`),
        fetch(`${API_BASE}/api/support/tickets/admin/${encodeURIComponent(adminEmail)}`),
        fetch(`${API_BASE}/api/support/tickets/pending-transfer/${encodeURIComponent(adminEmail)}`),
        fetch(`${API_BASE}/api/support/admins`)
      ]);
      const [allData, mineData, transData, adminsData] = await Promise.all([
        allRes.json(), mineRes.json(), transRes.json(), adminsRes.json()
      ]);
      if (allData.tickets) setAllTickets(allData.tickets);
      if (mineData.tickets) setMyTickets(mineData.tickets);
      if (transData.tickets) setTransferTickets(transData.tickets);
      if (adminsData.admins) setAllAdmins(adminsData.admins.filter((a: any) => a.email !== adminEmail));
    } finally {
      setLoading(false);
    }
  }, [adminEmail]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Polling every 15 seconds
  useEffect(() => {
    const interval = setInterval(fetchAll, 15000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const openTicket = (t: Ticket) => {
    setSelectedTicket(t);
    setReplyBody('');
    setShowTransferForm(false);
    setShowInvoiceForm(false);
    setShowResolveForm(false);
    // Mark as read
    fetch(`${API_BASE}/api/support/tickets/${t.id}/read-by-admin`, { method: 'POST' });
  };

  const handleClaim = async (ticketId: string) => {
    const res = await fetch(`${API_BASE}/api/support/tickets/${ticketId}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminEmail, adminName })
    });
    const data = await res.json();
    if (!res.ok) return alert(`⚠️ ${data.error}`);
    if (data.ticket) setSelectedTicket(data.ticket);
    fetchAll();
  };

  const handleReply = async () => {
    if (!replyBody.trim() || !selectedTicket) return;
    setReplyLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/support/tickets/${selectedTicket.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminEmail, adminName, body: replyBody })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSelectedTicket(data.ticket);
      setReplyBody('');
      fetchAll();
    } catch (e: any) {
      alert(`⚠️ ${e.message}`);
    } finally {
      setReplyLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (!transferTo || !selectedTicket) return;
    setTransferLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/support/tickets/${selectedTicket.id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminEmail, adminName, toAdminEmail: transferTo, toAdminName: transferToName, note: transferNote })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSelectedTicket(data.ticket);
      setShowTransferForm(false);
      setTransferTo('');
      setTransferNote('');
      fetchAll();
    } catch (e: any) {
      alert(`⚠️ ${e.message}`);
    } finally {
      setTransferLoading(false);
    }
  };

  const handleAcceptTransfer = async (ticketId: string) => {
    const res = await fetch(`${API_BASE}/api/support/tickets/${ticketId}/accept-transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminEmail, adminName })
    });
    const data = await res.json();
    if (!res.ok) return alert(`⚠️ ${data.error}`);
    if (data.ticket) setSelectedTicket(data.ticket);
    fetchAll();
  };

  const handleDeclineTransfer = async (ticketId: string) => {
    const reason = window.prompt('Reason for declining (optional):') ?? '';
    const res = await fetch(`${API_BASE}/api/support/tickets/${ticketId}/decline-transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminEmail, adminName, reason })
    });
    const data = await res.json();
    if (!res.ok) return alert(`⚠️ ${data.error}`);
    fetchAll();
  };

  const handleSendInvoice = async () => {
    if (!selectedTicket) return;
    setInvoiceLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/support/tickets/${selectedTicket.id}/send-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminEmail, adminName,
          invoice: {
            tier: invoiceTier,
            amount: invoiceAmount,
            currency: 'USD',
            paymentInstructions: invoiceInstructions,
            bankDetails: invoiceBankDetails,
            dueDate: invoiceDueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString()
          }
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSelectedTicket(data.ticket);
      setShowInvoiceForm(false);
      fetchAll();
    } catch (e: any) {
      alert(`⚠️ ${e.message}`);
    } finally {
      setInvoiceLoading(false);
    }
  };

  const handleResolve = async () => {
    if (!selectedTicket) return;
    setResolveLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/support/tickets/${selectedTicket.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminEmail, adminName, note: resolveNote, upgradeTier })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSelectedTicket(data.ticket);
      setShowResolveForm(false);
      fetchAll();
    } catch (e: any) {
      alert(`⚠️ ${e.message}`);
    } finally {
      setResolveLoading(false);
    }
  };

  const handleReopen = async (ticketId: string) => {
    const res = await fetch(`${API_BASE}/api/support/tickets/${ticketId}/reopen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminEmail, adminName })
    });
    const data = await res.json();
    if (!res.ok) return alert(`⚠️ ${data.error}`);
    if (data.ticket) setSelectedTicket(data.ticket);
    fetchAll();
  };

  // Counts for tab badges
  const unassignedCount = allTickets.filter(t => t.status === 'unassigned').length;
  const myCount = myTickets.length;
  const transferCount = transferTickets.length;

  const displayList = subTab === 'centralised' ? allTickets :
                      subTab === 'mine' ? myTickets : transferTickets;

  return (
    <div className="asi-root">
      {/* Sub-tabs */}
      <div className="asi-tabs">
        <button
          className={`asi-tab ${subTab === 'centralised' ? 'active' : ''}`}
          onClick={() => setSubTab('centralised')}
        >
          📬 Central Inbox
          {unassignedCount > 0 && <span className="asi-badge asi-badge-red">{unassignedCount}</span>}
        </button>
        <button
          className={`asi-tab ${subTab === 'mine' ? 'active' : ''}`}
          onClick={() => setSubTab('mine')}
        >
          📋 My Assigned
          {myCount > 0 && <span className="asi-badge asi-badge-gold">{myCount}</span>}
        </button>
        <button
          className={`asi-tab ${subTab === 'transfers' ? 'active' : ''}`}
          onClick={() => setSubTab('transfers')}
        >
          🔄 Pending Transfers
          {transferCount > 0 && <span className="asi-badge asi-badge-cyan">{transferCount}</span>}
        </button>
        <button className="asi-refresh-btn" onClick={fetchAll} title="Refresh">
          {loading ? '⏳' : '🔃'}
        </button>
      </div>

      <div className="asi-body">
        {/* Left panel: ticket list */}
        <div className="asi-list">
          {displayList.length === 0 && (
            <div className="asi-empty">
              {loading ? '⏳ Loading...' : subTab === 'transfers' ? '🎉 No pending transfers for you' : '✅ No tickets here'}
            </div>
          )}
          {displayList.map(ticket => {
            const st = STATUS_LABEL[ticket.status] || STATUS_LABEL['unassigned'];
            const stale = ticket.status === 'unassigned' && isStale(ticket.createdAt);
            const isSelected = selectedTicket?.id === ticket.id;
            const isMine = ticket.claimedBy === adminEmail;
            return (
              <div
                key={ticket.id}
                className={`asi-ticket-card ${isSelected ? 'selected' : ''} ${stale ? 'stale' : ''}`}
                style={{ borderLeftColor: PRIORITY_COLOR[ticket.priority] }}
                onClick={() => openTicket(ticket)}
              >
                <div className="asi-card-header">
                  <span className="asi-card-subject">{ticket.subject}</span>
                  <span className="asi-card-time">{timeAgo(ticket.createdAt)}</span>
                </div>
                <div className="asi-card-meta">
                  <span className="asi-card-user">👤 {ticket.userName}</span>
                  {ticket.requestedTier && (
                    <span className="asi-card-tier" style={{ color: ticket.requestedTier === 'futures_forex' ? '#ffd700' : '#e056fd' }}>
                      {TIER_LABEL[ticket.requestedTier] || ticket.requestedTier}
                    </span>
                  )}
                </div>
                <div className="asi-card-footer">
                  <span className="asi-status-badge" style={{ color: st.color, borderColor: st.color }}>
                    {st.icon} {st.label}
                    {isMine && ticket.status === 'claimed' && ' (you)'}
                    {ticket.status === 'claimed' && !isMine && ticket.claimedByName && ` — ${ticket.claimedByName}`}
                    {ticket.status === 'pending_transfer' && ticket.claimedBy === adminEmail && ` ⏳ awaiting ${ticket.transferToName}`}
                  </span>
                  <span className="asi-priority-badge" style={{ color: PRIORITY_COLOR[ticket.priority] }}>
                    {ticket.priority.toUpperCase()}
                  </span>
                  {stale && <span className="asi-stale-badge">⚠️ STALE</span>}
                  {ticket.unreadByAdmin > 0 && <span className="asi-unread-dot" />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right panel: ticket detail */}
        <div className="asi-detail">
          {!selectedTicket ? (
            <div className="asi-detail-empty">
              <span style={{ fontSize: '3rem' }}>🎫</span>
              <p>Select a ticket from the list to view details</p>
            </div>
          ) : (
            <div className="asi-detail-content">
              {/* Header */}
              <div className="asi-detail-header">
                <div>
                  <div className="asi-detail-subject">{selectedTicket.subject}</div>
                  <div className="asi-detail-meta-row">
                    <span>👤 <strong>{selectedTicket.userName}</strong> — {selectedTicket.userEmail}</span>
                    {selectedTicket.requestedTier && (
                      <span style={{ color: '#ffd700', marginLeft: 12 }}>
                        Requesting: {TIER_LABEL[selectedTicket.requestedTier]}
                      </span>
                    )}
                  </div>
                  <div className="asi-detail-meta-row" style={{ marginTop: 4 }}>
                    <span className="asi-status-badge" style={{ color: STATUS_LABEL[selectedTicket.status]?.color, borderColor: STATUS_LABEL[selectedTicket.status]?.color }}>
                      {STATUS_LABEL[selectedTicket.status]?.icon} {STATUS_LABEL[selectedTicket.status]?.label}
                    </span>
                    <span className="asi-priority-badge" style={{ color: PRIORITY_COLOR[selectedTicket.priority], marginLeft: 8 }}>
                      {selectedTicket.priority.toUpperCase()} PRIORITY
                    </span>
                    <span style={{ color: '#666', fontSize: '0.78rem', marginLeft: 12 }}>
                      Created {timeAgo(selectedTicket.createdAt)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Transfer pending notice for pending_transfer owned by me */}
              {selectedTicket.status === 'pending_transfer' && selectedTicket.claimedBy === adminEmail && (
                <div className="asi-notice asi-notice-cyan">
                  ⏳ Awaiting <strong>{selectedTicket.transferToName}</strong> to accept this transfer.
                  {selectedTicket.transferNote && <div style={{ marginTop: 4, color: '#bbb' }}>Note: {selectedTicket.transferNote}</div>}
                </div>
              )}

              {/* Transfer action for target admin */}
              {selectedTicket.status === 'pending_transfer' && selectedTicket.transferToEmail === adminEmail && (
                <div className="asi-notice asi-notice-gold">
                  🔄 <strong>{selectedTicket.claimedByName}</strong> is transferring this ticket to you.
                  {selectedTicket.transferNote && <div style={{ color: '#bbb', marginTop: 4 }}>Note: "{selectedTicket.transferNote}"</div>}
                  <div className="asi-transfer-actions">
                    <button className="asi-btn asi-btn-green" onClick={() => handleAcceptTransfer(selectedTicket.id)}>✅ Accept Transfer</button>
                    <button className="asi-btn asi-btn-red" onClick={() => handleDeclineTransfer(selectedTicket.id)}>❌ Decline</button>
                  </div>
                </div>
              )}

              {/* Claim button if unassigned */}
              {selectedTicket.status === 'unassigned' && (
                <div className="asi-action-row">
                  <button className="asi-btn asi-btn-gold" onClick={() => handleClaim(selectedTicket.id)}>
                    🙋 Claim This Ticket
                  </button>
                </div>
              )}

              {/* Invoice sent notice */}
              {selectedTicket.invoiceSent && selectedTicket.invoiceDetails && (
                <div className="asi-notice asi-notice-purple">
                  💳 Invoice sent for <strong>{selectedTicket.invoiceDetails.tierLabel}</strong> — ${selectedTicket.invoiceDetails.amount}/mo
                  <span style={{ color: '#aaa', fontSize: '0.78rem', marginLeft: 8 }}>({timeAgo(selectedTicket.invoiceSentAt!)})</span>
                </div>
              )}

              {/* Message thread */}
              <div className="asi-messages">
                {selectedTicket.messages.map(msg => (
                  <div key={msg.id} className={`asi-msg ${msg.fromRole === 'trader' ? 'from-user' : msg.fromRole === 'system' ? 'from-system' : 'from-admin'}`}>
                    <div className="asi-msg-header">
                      <strong>{msg.fromName}</strong>
                      <span className="asi-msg-role">
                        {msg.fromRole === 'trader' ? '(User)' : msg.fromRole === 'system' ? '(System)' : '(Admin)'}
                      </span>
                      <span className="asi-msg-time">{timeAgo(msg.at)}</span>
                      {msg.type === 'invoice' && <span className="asi-invoice-tag">💳 INVOICE</span>}
                    </div>
                    <div className="asi-msg-body">
                      {msg.body.split('\n').map((line, i) => (
                        <span key={i}>{line}<br /></span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Timeline */}
              <details className="asi-timeline-wrap">
                <summary className="asi-timeline-toggle">📋 Activity Timeline ({selectedTicket.timeline.length} events)</summary>
                <div className="asi-timeline">
                  {selectedTicket.timeline.map((ev, i) => (
                    <div key={i} className="asi-timeline-item">
                      <span className="asi-timeline-dot" />
                      <div>
                        <span className="asi-timeline-actor">{ev.actorName}</span>
                        <span className="asi-timeline-event"> — {ev.event.replace(/_/g, ' ')}</span>
                        {ev.note && <div className="asi-timeline-note">"{ev.note}"</div>}
                        <div className="asi-timeline-time">{timeAgo(ev.at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </details>

              {/* Action buttons — only for claimed + claimedBy me, or resolved */}
              {(selectedTicket.status === 'claimed' || selectedTicket.status === 'awaiting_payment') && selectedTicket.claimedBy === adminEmail && (
                <div className="asi-actions">
                  <div className="asi-reply-box">
                    <textarea
                      placeholder="Type a reply to the user..."
                      value={replyBody}
                      onChange={e => setReplyBody(e.target.value)}
                      className="asi-reply-textarea"
                      rows={3}
                    />
                    <button className="asi-btn asi-btn-cyan" onClick={handleReply} disabled={replyLoading || !replyBody.trim()}>
                      {replyLoading ? 'Sending...' : '💬 Send Reply'}
                    </button>
                  </div>

                  <div className="asi-action-row" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
                    {!selectedTicket.invoiceSent && (
                      <button className="asi-btn asi-btn-purple" onClick={() => { setShowInvoiceForm(true); setShowTransferForm(false); setShowResolveForm(false); }}>
                        💳 Send Invoice
                      </button>
                    )}
                    <button className="asi-btn asi-btn-orange" onClick={() => { setShowTransferForm(true); setShowInvoiceForm(false); setShowResolveForm(false); }}>
                      🔄 Transfer Ticket
                    </button>
                    <button className="asi-btn asi-btn-green" onClick={() => { setShowResolveForm(true); setShowInvoiceForm(false); setShowTransferForm(false); }}>
                      ✅ Resolve Ticket
                    </button>
                  </div>

                  {/* Invoice form */}
                  {showInvoiceForm && (
                    <div className="asi-inline-form">
                      <div className="asi-form-title">💳 Send Invoice to {selectedTicket.userName}</div>
                      <div className="asi-form-row">
                        <label>Plan</label>
                        <select value={invoiceTier} onChange={e => setInvoiceTier(e.target.value as any)} className="asi-select">
                          <option value="futures_forex">Futures & Forex VIP</option>
                          <option value="forex_only">Forex Only Pro</option>
                        </select>
                      </div>
                      <div className="asi-form-row">
                        <label>Amount (USD/mo)</label>
                        <input value={invoiceAmount} onChange={e => setInvoiceAmount(e.target.value)} className="asi-input" placeholder="e.g. 297" />
                      </div>
                      <div className="asi-form-row">
                        <label>Payment Instructions</label>
                        <textarea value={invoiceInstructions} onChange={e => setInvoiceInstructions(e.target.value)} className="asi-input" rows={3} />
                      </div>
                      <div className="asi-form-row">
                        <label>Bank / Wallet Details (optional)</label>
                        <textarea value={invoiceBankDetails} onChange={e => setInvoiceBankDetails(e.target.value)} className="asi-input" rows={2} placeholder="e.g. Bank name, account number..." />
                      </div>
                      <div className="asi-form-row">
                        <label>Due Date</label>
                        <input type="date" value={invoiceDueDate} onChange={e => setInvoiceDueDate(e.target.value)} className="asi-input" />
                      </div>
                      <div className="asi-form-actions">
                        <button className="asi-btn asi-btn-ghost" onClick={() => setShowInvoiceForm(false)}>Cancel</button>
                        <button className="asi-btn asi-btn-purple" onClick={handleSendInvoice} disabled={invoiceLoading}>
                          {invoiceLoading ? 'Sending...' : '💳 Send Invoice to User'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Transfer form */}
                  {showTransferForm && (
                    <div className="asi-inline-form">
                      <div className="asi-form-title">🔄 Transfer Ticket to Another Admin</div>
                      <div className="asi-form-row">
                        <label>Transfer to</label>
                        <select
                          value={transferTo}
                          onChange={e => {
                            const selected = allAdmins.find(a => a.email === e.target.value);
                            setTransferTo(e.target.value);
                            setTransferToName(selected?.name || '');
                          }}
                          className="asi-select"
                        >
                          <option value="">Select admin...</option>
                          {allAdmins.map(a => (
                            <option key={a.email} value={a.email}>{a.name} ({a.role})</option>
                          ))}
                        </select>
                      </div>
                      <div className="asi-form-row">
                        <label>Note (optional)</label>
                        <textarea value={transferNote} onChange={e => setTransferNote(e.target.value)} className="asi-input" rows={2} placeholder="Context for the receiving admin..." />
                      </div>
                      <div className="asi-form-actions">
                        <button className="asi-btn asi-btn-ghost" onClick={() => setShowTransferForm(false)}>Cancel</button>
                        <button className="asi-btn asi-btn-orange" onClick={handleTransfer} disabled={!transferTo || transferLoading}>
                          {transferLoading ? 'Transferring...' : '🔄 Request Transfer'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Resolve form */}
                  {showResolveForm && (
                    <div className="asi-inline-form">
                      <div className="asi-form-title">✅ Resolve Ticket</div>
                      <div className="asi-form-row">
                        <label>Resolution note</label>
                        <textarea value={resolveNote} onChange={e => setResolveNote(e.target.value)} className="asi-input" rows={2} placeholder="Brief resolution summary..." />
                      </div>
                      {selectedTicket.requestedTier && (
                        <div className="asi-form-row">
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input type="checkbox" checked={upgradeTier} onChange={e => setUpgradeTier(e.target.checked)} />
                            Confirm user has paid & upgrade their tier to {TIER_LABEL[selectedTicket.requestedTier!]}
                          </label>
                        </div>
                      )}
                      <div className="asi-form-actions">
                        <button className="asi-btn asi-btn-ghost" onClick={() => setShowResolveForm(false)}>Cancel</button>
                        <button className="asi-btn asi-btn-green" onClick={handleResolve} disabled={resolveLoading}>
                          {resolveLoading ? 'Resolving...' : '✅ Mark as Resolved'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Resolved state */}
              {selectedTicket.status === 'resolved' && (
                <div className="asi-resolved-banner">
                  ✅ Resolved by <strong>{selectedTicket.resolvedByName}</strong> {timeAgo(selectedTicket.resolvedAt!)}
                  {selectedTicket.resolutionNote && <div style={{ color: '#bbb', marginTop: 4 }}>"{selectedTicket.resolutionNote}"</div>}
                  <button className="asi-btn asi-btn-ghost" style={{ marginTop: 8 }} onClick={() => handleReopen(selectedTicket.id)}>
                    🔃 Reopen Ticket
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
