import { v4 as uuidv4 } from 'uuid';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TicketType = 'tier_upgrade_request' | 'general_support' | 'billing' | 'access_issue';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketStatus = 'unassigned' | 'claimed' | 'pending_transfer' | 'awaiting_payment' | 'resolved' | 'closed';
export type MessageType = 'message' | 'invoice' | 'status_update' | 'system';

export interface InvoiceDetails {
  tier: 'forex_only' | 'futures_forex';
  tierLabel: string;
  amount: string;
  currency: string;
  paymentInstructions: string;
  bankDetails?: string;
  dueDate: string;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  at: string;
  fromEmail: string;
  fromName: string;
  fromRole: 'trader' | 'admin' | 'super_admin' | 'system';
  body: string;
  type: MessageType;
  invoiceDetails?: InvoiceDetails;
  readByUser: boolean;
  readByAdmin: boolean;
}

export interface TicketEvent {
  at: string;
  actor: string;
  actorName: string;
  event: string;
  note?: string;
}

export interface SupportTicket {
  id: string;
  createdAt: string;
  updatedAt: string;

  // Requester
  userId: string;
  userName: string;
  userEmail: string;
  requestedTier?: 'forex_only' | 'futures_forex';
  currentTier?: string;

  // Ticket info
  type: TicketType;
  subject: string;
  priority: TicketPriority;

  // Assignment
  status: TicketStatus;
  claimedBy: string | null;
  claimedByName: string | null;
  claimedAt: string | null;

  // Transfer
  transferToEmail: string | null;
  transferToName: string | null;
  transferRequestedAt: string | null;
  transferNote: string | null;

  // Invoice
  invoiceSent: boolean;
  invoiceSentAt: string | null;
  invoiceDetails?: InvoiceDetails;

  // Resolution
  resolvedBy: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;

  // Thread & Timeline
  messages: TicketMessage[];
  timeline: TicketEvent[];

  // Unread counts (convenience)
  unreadByUser: number;
  unreadByAdmin: number;
}

// ─── In-memory store ──────────────────────────────────────────────────────────

let tickets: SupportTicket[] = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const now = () => new Date().toISOString();

function recalcUnread(ticket: SupportTicket): void {
  ticket.unreadByUser = ticket.messages.filter(m => !m.readByUser && m.fromRole !== 'trader').length;
  ticket.unreadByAdmin = ticket.messages.filter(m => !m.readByAdmin && m.fromRole === 'trader').length;
}

function pushEvent(ticket: SupportTicket, actor: string, actorName: string, event: string, note?: string) {
  ticket.timeline.push({ at: now(), actor, actorName, event, note });
  ticket.updatedAt = now();
}

// ─── Create ───────────────────────────────────────────────────────────────────

export interface CreateTicketInput {
  userId: string;
  userName: string;
  userEmail: string;
  requestedTier?: 'forex_only' | 'futures_forex';
  currentTier?: string;
  type?: TicketType;
  subject?: string;
  body?: string;
  priority?: TicketPriority;
}

export function createTicket(input: CreateTicketInput): SupportTicket {
  const tierLabel = input.requestedTier === 'futures_forex' ? 'Futures & Forex VIP' :
                    input.requestedTier === 'forex_only' ? 'Forex Only Pro' : 'Plan Upgrade';

  const autoSubject = input.subject || `Tier Upgrade Request — ${tierLabel}`;
  const autoBody = input.body ||
    `${input.userName} has requested an upgrade to the ${tierLabel} plan. ` +
    `Please review, send an invoice, and activate their account once payment is confirmed.`;

  const autoPriority: TicketPriority = input.priority ||
    (input.requestedTier === 'futures_forex' ? 'urgent' :
     input.requestedTier === 'forex_only' ? 'high' : 'normal');

  const openingMsg: TicketMessage = {
    id: uuidv4(),
    ticketId: '',
    at: now(),
    fromEmail: input.userEmail,
    fromName: input.userName,
    fromRole: 'trader',
    body: autoBody,
    type: 'message',
    readByUser: true,
    readByAdmin: false
  };

  const ticket: SupportTicket = {
    id: uuidv4(),
    createdAt: now(),
    updatedAt: now(),
    userId: input.userId,
    userName: input.userName,
    userEmail: input.userEmail,
    requestedTier: input.requestedTier,
    currentTier: input.currentTier,
    type: input.type || 'tier_upgrade_request',
    subject: autoSubject,
    priority: autoPriority,
    status: 'unassigned',
    claimedBy: null,
    claimedByName: null,
    claimedAt: null,
    transferToEmail: null,
    transferToName: null,
    transferRequestedAt: null,
    transferNote: null,
    invoiceSent: false,
    invoiceSentAt: null,
    resolvedBy: null,
    resolvedByName: null,
    resolvedAt: null,
    resolutionNote: null,
    messages: [],
    timeline: [],
    unreadByUser: 0,
    unreadByAdmin: 0
  };

  openingMsg.ticketId = ticket.id;
  ticket.messages.push(openingMsg);
  pushEvent(ticket, input.userEmail, input.userName, 'ticket_created', autoSubject);
  recalcUnread(ticket);

  tickets.push(ticket);
  return ticket;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export function getAllTickets(): SupportTicket[] {
  return tickets.slice().sort((a, b) => {
    // Priority order: urgent=3, high=2, normal=1, low=0
    const pOrder = { urgent: 3, high: 2, normal: 1, low: 0 };
    const pDiff = (pOrder[b.priority] || 0) - (pOrder[a.priority] || 0);
    if (pDiff !== 0) return pDiff;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); // oldest first
  });
}

export function getTicketsByAdmin(adminEmail: string): SupportTicket[] {
  return tickets.filter(t => t.claimedBy === adminEmail && t.status !== 'resolved' && t.status !== 'closed');
}

export function getPendingTransfersForAdmin(adminEmail: string): SupportTicket[] {
  return tickets.filter(t => t.status === 'pending_transfer' && t.transferToEmail === adminEmail);
}

export function getTicketsByUser(userEmail: string): SupportTicket[] {
  return tickets
    .filter(t => t.userEmail === userEmail)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getTicketById(id: string): SupportTicket | undefined {
  return tickets.find(t => t.id === id);
}

export function getUserUnreadCount(userEmail: string): number {
  return tickets
    .filter(t => t.userEmail === userEmail)
    .reduce((sum, t) => sum + t.unreadByUser, 0);
}

// ─── Admin Actions ────────────────────────────────────────────────────────────

export interface AdminActorInfo {
  email: string;
  name: string;
}

export function claimTicket(ticketId: string, admin: AdminActorInfo): { success: boolean; ticket?: SupportTicket; error?: string } {
  const t = tickets.find(t => t.id === ticketId);
  if (!t) return { success: false, error: 'Ticket not found' };
  if (t.status !== 'unassigned') return { success: false, error: 'Ticket is not available to claim' };

  t.status = 'claimed';
  t.claimedBy = admin.email;
  t.claimedByName = admin.name;
  t.claimedAt = now();
  t.updatedAt = now();
  pushEvent(t, admin.email, admin.name, 'claimed', `Claimed by ${admin.name}`);

  // System message to user
  addSystemMessage(t, `Your ticket has been picked up by ${admin.name}. They will be in touch shortly.`);

  return { success: true, ticket: t };
}

export function replyToTicket(ticketId: string, actor: AdminActorInfo, body: string, fromRole: 'trader' | 'admin' | 'super_admin'): { success: boolean; ticket?: SupportTicket; error?: string } {
  const t = tickets.find(t => t.id === ticketId);
  if (!t) return { success: false, error: 'Ticket not found' };

  const msg: TicketMessage = {
    id: uuidv4(),
    ticketId: t.id,
    at: now(),
    fromEmail: actor.email,
    fromName: actor.name,
    fromRole,
    body,
    type: 'message',
    readByUser: fromRole !== 'trader' ? false : true, // admin reply = unread for user
    readByAdmin: fromRole === 'trader' ? false : true  // user reply = unread for admin
  };

  t.messages.push(msg);
  recalcUnread(t);
  pushEvent(t, actor.email, actor.name, fromRole === 'trader' ? 'user_replied' : 'admin_replied');
  t.updatedAt = now();
  return { success: true, ticket: t };
}

export function sendInvoice(ticketId: string, admin: AdminActorInfo, invoice: InvoiceDetails): { success: boolean; ticket?: SupportTicket; error?: string } {
  const t = tickets.find(t => t.id === ticketId);
  if (!t) return { success: false, error: 'Ticket not found' };

  const invoiceBody = `📋 **Invoice for ${invoice.tierLabel} Subscription**\n\n` +
    `Amount: **${invoice.currency} ${invoice.amount}/month**\n\n` +
    `Payment Instructions:\n${invoice.paymentInstructions}` +
    (invoice.bankDetails ? `\n\nBank Details:\n${invoice.bankDetails}` : '') +
    `\n\nDue Date: **${invoice.dueDate}**\n\n` +
    `Once we confirm your payment, your account will be upgraded immediately. Please reply to this ticket if you have any questions.`;

  const msg: TicketMessage = {
    id: uuidv4(),
    ticketId: t.id,
    at: now(),
    fromEmail: admin.email,
    fromName: admin.name,
    fromRole: 'admin',
    body: invoiceBody,
    type: 'invoice',
    invoiceDetails: invoice,
    readByUser: false,
    readByAdmin: true
  };

  t.messages.push(msg);
  t.invoiceSent = true;
  t.invoiceSentAt = now();
  t.invoiceDetails = invoice;
  t.status = 'awaiting_payment';
  recalcUnread(t);
  pushEvent(t, admin.email, admin.name, 'invoice_sent', `Invoice sent for ${invoice.tierLabel} — ${invoice.currency} ${invoice.amount}`);
  t.updatedAt = now();
  return { success: true, ticket: t };
}

export function transferTicket(ticketId: string, fromAdmin: AdminActorInfo, toAdminEmail: string, toAdminName: string, note: string): { success: boolean; ticket?: SupportTicket; error?: string } {
  const t = tickets.find(t => t.id === ticketId);
  if (!t) return { success: false, error: 'Ticket not found' };
  if (t.claimedBy !== fromAdmin.email) return { success: false, error: 'You do not own this ticket' };

  t.status = 'pending_transfer';
  t.transferToEmail = toAdminEmail;
  t.transferToName = toAdminName;
  t.transferRequestedAt = now();
  t.transferNote = note;
  t.updatedAt = now();
  pushEvent(t, fromAdmin.email, fromAdmin.name, 'transfer_requested', `Transfer requested to ${toAdminName}${note ? `: "${note}"` : ''}`);
  return { success: true, ticket: t };
}

export function acceptTransfer(ticketId: string, admin: AdminActorInfo): { success: boolean; ticket?: SupportTicket; error?: string } {
  const t = tickets.find(t => t.id === ticketId);
  if (!t) return { success: false, error: 'Ticket not found' };
  if (t.transferToEmail !== admin.email) return { success: false, error: 'Transfer not addressed to you' };

  const prevAdmin = t.claimedByName || 'Previous Admin';
  t.status = 'claimed';
  t.claimedBy = admin.email;
  t.claimedByName = admin.name;
  t.claimedAt = now();
  t.transferToEmail = null;
  t.transferToName = null;
  t.transferRequestedAt = null;
  t.transferNote = null;
  t.updatedAt = now();
  pushEvent(t, admin.email, admin.name, 'transfer_accepted', `Transfer accepted from ${prevAdmin}`);
  addSystemMessage(t, `Your ticket has been transferred to ${admin.name} who will continue assisting you.`);
  return { success: true, ticket: t };
}

export function declineTransfer(ticketId: string, admin: AdminActorInfo, reason?: string): { success: boolean; ticket?: SupportTicket; error?: string } {
  const t = tickets.find(t => t.id === ticketId);
  if (!t) return { success: false, error: 'Ticket not found' };
  if (t.transferToEmail !== admin.email) return { success: false, error: 'Transfer not addressed to you' };

  t.status = 'claimed';
  const prev = t.claimedBy || '';
  const prevName = t.claimedByName || 'Original Admin';
  t.transferToEmail = null;
  t.transferToName = null;
  t.transferRequestedAt = null;
  t.transferNote = null;
  t.updatedAt = now();
  pushEvent(t, admin.email, admin.name, 'transfer_declined', `Transfer declined by ${admin.name}${reason ? `: "${reason}"` : ''}`);

  // Revert to original claimer — if they're different
  if (prev && prev !== admin.email) {
    t.claimedBy = prev;
    t.claimedByName = prevName;
  }

  return { success: true, ticket: t };
}

export function resolveTicket(ticketId: string, admin: AdminActorInfo, note: string, upgradeTier?: boolean): { success: boolean; ticket?: SupportTicket; error?: string } {
  const t = tickets.find(t => t.id === ticketId);
  if (!t) return { success: false, error: 'Ticket not found' };

  t.status = 'resolved';
  t.resolvedBy = admin.email;
  t.resolvedByName = admin.name;
  t.resolvedAt = now();
  t.resolutionNote = note;
  t.updatedAt = now();
  pushEvent(t, admin.email, admin.name, 'resolved', note);

  const resolveMsg = upgradeTier
    ? `✅ Great news! Your account has been upgraded to **${t.invoiceDetails?.tierLabel || 'the requested plan'}**. You now have full access. Thank you for your payment!`
    : `✅ Your support ticket has been resolved. ${note || ''}`;

  addSystemMessage(t, resolveMsg);
  return { success: true, ticket: t };
}

export function reopenTicket(ticketId: string, actor: AdminActorInfo): { success: boolean; ticket?: SupportTicket; error?: string } {
  const t = tickets.find(t => t.id === ticketId);
  if (!t) return { success: false, error: 'Ticket not found' };

  t.status = t.claimedBy ? 'claimed' : 'unassigned';
  t.resolvedBy = null;
  t.resolvedByName = null;
  t.resolvedAt = null;
  t.resolutionNote = null;
  t.updatedAt = now();
  pushEvent(t, actor.email, actor.name, 'reopened');
  return { success: true, ticket: t };
}

// ─── User Actions ─────────────────────────────────────────────────────────────

export function markTicketMessagesReadByUser(ticketId: string): void {
  const t = tickets.find(t => t.id === ticketId);
  if (!t) return;
  t.messages.forEach(m => { m.readByUser = true; });
  recalcUnread(t);
}

export function markTicketMessagesReadByAdmin(ticketId: string): void {
  const t = tickets.find(t => t.id === ticketId);
  if (!t) return;
  t.messages.forEach(m => { m.readByAdmin = true; });
  recalcUnread(t);
}

// ─── Internals ────────────────────────────────────────────────────────────────

function addSystemMessage(ticket: SupportTicket, body: string) {
  const msg: TicketMessage = {
    id: uuidv4(),
    ticketId: ticket.id,
    at: now(),
    fromEmail: 'system@mannaedge.com',
    fromName: 'Manna Edge Support',
    fromRole: 'system',
    body,
    type: 'system',
    readByUser: false,
    readByAdmin: true
  };
  ticket.messages.push(msg);
  recalcUnread(ticket);
}
