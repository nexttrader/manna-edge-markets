import { v4 as uuidv4 } from 'uuid';
import { queryDb, isPg } from './database.js';

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const now = () => new Date().toISOString();

function recalcUnread(ticket: SupportTicket): void {
  ticket.unreadByUser = ticket.messages.filter(m => !m.readByUser && m.fromRole !== 'trader').length;
  ticket.unreadByAdmin = ticket.messages.filter(m => !m.readByAdmin && m.fromRole === 'trader').length;
}

async function pushEvent(ticketId: string, actor: string, actorName: string, event: string, note?: string) {
  const at = now();
  await queryDb(
    'INSERT INTO ticket_timeline (ticket_id, at, actor, actor_name, event, note) VALUES (?, ?, ?, ?, ?, ?)',
    [ticketId, at, actor, actorName, event, note || null]
  );
  await queryDb('UPDATE support_tickets SET updated_at = ? WHERE id = ?', [at, ticketId]);
}

async function addMessage(msg: TicketMessage) {
  await queryDb(
    `INSERT INTO ticket_messages (id, ticket_id, at, from_email, from_name, from_role, body, type, invoice_details, read_by_user, read_by_admin)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      msg.id, msg.ticketId, msg.at, msg.fromEmail, msg.fromName, msg.fromRole, msg.body, msg.type,
      msg.invoiceDetails ? JSON.stringify(msg.invoiceDetails) : null,
      msg.readByUser ? 1 : 0, msg.readByAdmin ? 1 : 0
    ]
  );
  await queryDb('UPDATE support_tickets SET updated_at = ? WHERE id = ?', [msg.at, msg.ticketId]);
}

async function getFullTicket(id: string): Promise<SupportTicket | undefined> {
  const tRows = await queryDb('SELECT * FROM support_tickets WHERE id = ?', [id]);
  if (!tRows || tRows.length === 0) return undefined;
  const t = tRows[0];

  const mRows = await queryDb('SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY at ASC', [id]);
  const eRows = await queryDb('SELECT * FROM ticket_timeline WHERE ticket_id = ? ORDER BY at ASC', [id]);

  const messages = mRows.map((m: any) => ({
    id: m.id,
    ticketId: m.ticket_id,
    at: m.at,
    fromEmail: m.from_email,
    fromName: m.from_name,
    fromRole: m.from_role,
    body: m.body,
    type: m.type,
    invoiceDetails: m.invoice_details ? JSON.parse(m.invoice_details) : undefined,
    readByUser: Boolean(m.read_by_user),
    readByAdmin: Boolean(m.read_by_admin)
  }));

  const timeline = eRows.map((e: any) => ({
    at: e.at,
    actor: e.actor,
    actorName: e.actor_name,
    event: e.event,
    note: e.note
  }));

  const ticket: SupportTicket = {
    id: t.id,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    userId: t.user_id,
    userName: t.user_name,
    userEmail: t.user_email,
    requestedTier: t.requested_tier,
    currentTier: t.current_tier,
    type: t.type,
    subject: t.subject,
    priority: t.priority,
    status: t.status,
    claimedBy: t.claimed_by,
    claimedByName: t.claimed_by_name,
    claimedAt: t.claimed_at,
    transferToEmail: t.transfer_to_email,
    transferToName: t.transfer_to_name,
    transferRequestedAt: t.transfer_requested_at,
    transferNote: t.transfer_note,
    invoiceSent: Boolean(t.invoice_sent),
    invoiceSentAt: t.invoice_sent_at,
    invoiceDetails: t.invoice_details ? JSON.parse(t.invoice_details) : undefined,
    resolvedBy: t.resolved_by,
    resolvedByName: t.resolved_by_name,
    resolvedAt: t.resolved_at,
    resolutionNote: t.resolution_note,
    messages,
    timeline,
    unreadByUser: 0,
    unreadByAdmin: 0
  };

  recalcUnread(ticket);
  return ticket;
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

export async function createTicket(input: CreateTicketInput): Promise<SupportTicket> {
  const tierLabel = input.requestedTier === 'futures_forex' ? 'Futures & Forex VIP' :
                    input.requestedTier === 'forex_only' ? 'Forex Only Pro' : 'Plan Upgrade';

  const autoSubject = input.subject || `Tier Upgrade Request — ${tierLabel}`;
  const autoBody = input.body ||
    `${input.userName} has requested an upgrade to the ${tierLabel} plan. ` +
    `Please review, send an invoice, and activate their account once payment is confirmed.`;

  const autoPriority: TicketPriority = input.priority ||
    (input.requestedTier === 'futures_forex' ? 'urgent' :
     input.requestedTier === 'forex_only' ? 'high' : 'normal');

  const ticketId = uuidv4();
  const createdAt = now();

  await queryDb(
    `INSERT INTO support_tickets (
      id, created_at, updated_at, user_id, user_name, user_email, requested_tier, current_tier,
      type, subject, priority, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ticketId, createdAt, createdAt, input.userId, input.userName, input.userEmail, input.requestedTier || null, input.currentTier || null,
      input.type || 'tier_upgrade_request', autoSubject, autoPriority, 'unassigned'
    ]
  );

  const openingMsg: TicketMessage = {
    id: uuidv4(),
    ticketId: ticketId,
    at: createdAt,
    fromEmail: input.userEmail,
    fromName: input.userName,
    fromRole: 'trader',
    body: autoBody,
    type: 'message',
    readByUser: true,
    readByAdmin: false
  };

  await addMessage(openingMsg);
  await pushEvent(ticketId, input.userEmail, input.userName, 'ticket_created', autoSubject);

  return (await getFullTicket(ticketId))!;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getAllTickets(): Promise<SupportTicket[]> {
  const rows = await queryDb('SELECT id FROM support_tickets');
  const tickets: SupportTicket[] = [];
  for (const row of rows) {
    const t = await getFullTicket(row.id);
    if (t) tickets.push(t);
  }
  
  return tickets.sort((a, b) => {
    const pOrder = { urgent: 3, high: 2, normal: 1, low: 0 };
    const pDiff = (pOrder[b.priority] || 0) - (pOrder[a.priority] || 0);
    if (pDiff !== 0) return pDiff;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); // oldest first
  });
}

export async function getTicketsByAdmin(adminEmail: string): Promise<SupportTicket[]> {
  const rows = await queryDb('SELECT id FROM support_tickets WHERE claimed_by = ? AND status NOT IN ("resolved", "closed")', [adminEmail]);
  const tickets: SupportTicket[] = [];
  for (const row of rows) {
    const t = await getFullTicket(row.id);
    if (t) tickets.push(t);
  }
  return tickets;
}

export async function getPendingTransfersForAdmin(adminEmail: string): Promise<SupportTicket[]> {
  const rows = await queryDb('SELECT id FROM support_tickets WHERE status = "pending_transfer" AND transfer_to_email = ?', [adminEmail]);
  const tickets: SupportTicket[] = [];
  for (const row of rows) {
    const t = await getFullTicket(row.id);
    if (t) tickets.push(t);
  }
  return tickets;
}

export async function getTicketsByUser(userEmail: string): Promise<SupportTicket[]> {
  const rows = await queryDb('SELECT id FROM support_tickets WHERE user_email = ?', [userEmail]);
  const tickets: SupportTicket[] = [];
  for (const row of rows) {
    const t = await getFullTicket(row.id);
    if (t) tickets.push(t);
  }
  return tickets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getTicketById(id: string): Promise<SupportTicket | undefined> {
  return await getFullTicket(id);
}

export async function getUserUnreadCount(userEmail: string): Promise<number> {
  const tickets = await getTicketsByUser(userEmail);
  return tickets.reduce((sum, t) => sum + t.unreadByUser, 0);
}

// ─── Admin Actions ────────────────────────────────────────────────────────────

export interface AdminActorInfo {
  email: string;
  name: string;
}

export async function claimTicket(ticketId: string, admin: AdminActorInfo): Promise<{ success: boolean; ticket?: SupportTicket; error?: string }> {
  const t = await getFullTicket(ticketId);
  if (!t) return { success: false, error: 'Ticket not found' };
  if (t.status !== 'unassigned') return { success: false, error: 'Ticket is not available to claim' };

  await queryDb(
    'UPDATE support_tickets SET status = ?, claimed_by = ?, claimed_by_name = ?, claimed_at = ?, updated_at = ? WHERE id = ?',
    ['claimed', admin.email, admin.name, now(), now(), ticketId]
  );
  
  await pushEvent(ticketId, admin.email, admin.name, 'claimed', `Claimed by ${admin.name}`);
  await addSystemMessage(ticketId, `Your ticket has been picked up by ${admin.name}. They will be in touch shortly.`);

  return { success: true, ticket: await getFullTicket(ticketId) };
}

export async function replyToTicket(ticketId: string, actor: AdminActorInfo, body: string, fromRole: 'trader' | 'admin' | 'super_admin'): Promise<{ success: boolean; ticket?: SupportTicket; error?: string }> {
  const t = await getFullTicket(ticketId);
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
    readByUser: fromRole !== 'trader' ? false : true,
    readByAdmin: fromRole === 'trader' ? false : true
  };

  await addMessage(msg);
  await pushEvent(ticketId, actor.email, actor.name, fromRole === 'trader' ? 'user_replied' : 'admin_replied');
  
  return { success: true, ticket: await getFullTicket(ticketId) };
}

export async function sendInvoice(ticketId: string, admin: AdminActorInfo, invoice: InvoiceDetails): Promise<{ success: boolean; ticket?: SupportTicket; error?: string }> {
  const t = await getFullTicket(ticketId);
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

  await queryDb(
    'UPDATE support_tickets SET invoice_sent = 1, invoice_sent_at = ?, invoice_details = ?, status = ?, updated_at = ? WHERE id = ?',
    [now(), JSON.stringify(invoice), 'awaiting_payment', now(), ticketId]
  );

  await addMessage(msg);
  await pushEvent(ticketId, admin.email, admin.name, 'invoice_sent', `Invoice sent for ${invoice.tierLabel} — ${invoice.currency} ${invoice.amount}`);
  
  return { success: true, ticket: await getFullTicket(ticketId) };
}

export async function transferTicket(ticketId: string, fromAdmin: AdminActorInfo, toAdminEmail: string, toAdminName: string, note: string): Promise<{ success: boolean; ticket?: SupportTicket; error?: string }> {
  const t = await getFullTicket(ticketId);
  if (!t) return { success: false, error: 'Ticket not found' };
  if (t.claimedBy !== fromAdmin.email) return { success: false, error: 'You do not own this ticket' };

  await queryDb(
    'UPDATE support_tickets SET status = ?, transfer_to_email = ?, transfer_to_name = ?, transfer_requested_at = ?, transfer_note = ?, updated_at = ? WHERE id = ?',
    ['pending_transfer', toAdminEmail, toAdminName, now(), note, now(), ticketId]
  );
  
  await pushEvent(ticketId, fromAdmin.email, fromAdmin.name, 'transfer_requested', `Transfer requested to ${toAdminName}${note ? `: "${note}"` : ''}`);
  return { success: true, ticket: await getFullTicket(ticketId) };
}

export async function acceptTransfer(ticketId: string, admin: AdminActorInfo): Promise<{ success: boolean; ticket?: SupportTicket; error?: string }> {
  const t = await getFullTicket(ticketId);
  if (!t) return { success: false, error: 'Ticket not found' };
  if (t.transferToEmail !== admin.email) return { success: false, error: 'Transfer not addressed to you' };

  const prevAdmin = t.claimedByName || 'Previous Admin';
  
  await queryDb(
    'UPDATE support_tickets SET status = ?, claimed_by = ?, claimed_by_name = ?, claimed_at = ?, transfer_to_email = NULL, transfer_to_name = NULL, transfer_requested_at = NULL, transfer_note = NULL, updated_at = ? WHERE id = ?',
    ['claimed', admin.email, admin.name, now(), now(), ticketId]
  );
  
  await pushEvent(ticketId, admin.email, admin.name, 'transfer_accepted', `Transfer accepted from ${prevAdmin}`);
  await addSystemMessage(ticketId, `Your ticket has been transferred to ${admin.name} who will continue assisting you.`);
  
  return { success: true, ticket: await getFullTicket(ticketId) };
}

export async function declineTransfer(ticketId: string, admin: AdminActorInfo, reason?: string): Promise<{ success: boolean; ticket?: SupportTicket; error?: string }> {
  const t = await getFullTicket(ticketId);
  if (!t) return { success: false, error: 'Ticket not found' };
  if (t.transferToEmail !== admin.email) return { success: false, error: 'Transfer not addressed to you' };

  const prev = t.claimedBy || '';
  const prevName = t.claimedByName || 'Original Admin';
  
  await queryDb(
    'UPDATE support_tickets SET status = ?, claimed_by = ?, claimed_by_name = ?, transfer_to_email = NULL, transfer_to_name = NULL, transfer_requested_at = NULL, transfer_note = NULL, updated_at = ? WHERE id = ?',
    ['claimed', prev || null, prevName || null, now(), ticketId]
  );
  
  await pushEvent(ticketId, admin.email, admin.name, 'transfer_declined', `Transfer declined by ${admin.name}${reason ? `: "${reason}"` : ''}`);

  return { success: true, ticket: await getFullTicket(ticketId) };
}

export async function resolveTicket(ticketId: string, admin: AdminActorInfo, note: string, upgradeTier?: boolean): Promise<{ success: boolean; ticket?: SupportTicket; error?: string }> {
  const t = await getFullTicket(ticketId);
  if (!t) return { success: false, error: 'Ticket not found' };

  await queryDb(
    'UPDATE support_tickets SET status = ?, resolved_by = ?, resolved_by_name = ?, resolved_at = ?, resolution_note = ?, updated_at = ? WHERE id = ?',
    ['resolved', admin.email, admin.name, now(), note, now(), ticketId]
  );
  
  await pushEvent(ticketId, admin.email, admin.name, 'resolved', note);

  const resolveMsg = upgradeTier
    ? `✅ Great news! Your account has been upgraded to **${t.invoiceDetails?.tierLabel || 'the requested plan'}**. You now have full access. Thank you for your payment!`
    : `✅ Your support ticket has been resolved. ${note || ''}`;

  await addSystemMessage(ticketId, resolveMsg);
  
  return { success: true, ticket: await getFullTicket(ticketId) };
}

export async function reopenTicket(ticketId: string, actor: AdminActorInfo): Promise<{ success: boolean; ticket?: SupportTicket; error?: string }> {
  const t = await getFullTicket(ticketId);
  if (!t) return { success: false, error: 'Ticket not found' };

  const status = t.claimedBy ? 'claimed' : 'unassigned';
  await queryDb(
    'UPDATE support_tickets SET status = ?, resolved_by = NULL, resolved_by_name = NULL, resolved_at = NULL, resolution_note = NULL, updated_at = ? WHERE id = ?',
    [status, now(), ticketId]
  );
  
  await pushEvent(ticketId, actor.email, actor.name, 'reopened');
  return { success: true, ticket: await getFullTicket(ticketId) };
}

// ─── User Actions ─────────────────────────────────────────────────────────────

export async function markTicketMessagesReadByUser(ticketId: string): Promise<void> {
  await queryDb('UPDATE ticket_messages SET read_by_user = 1 WHERE ticket_id = ? AND read_by_user = 0', [ticketId]);
}

export async function markTicketMessagesReadByAdmin(ticketId: string): Promise<void> {
  await queryDb('UPDATE ticket_messages SET read_by_admin = 1 WHERE ticket_id = ? AND read_by_admin = 0', [ticketId]);
}

// ─── Internals ────────────────────────────────────────────────────────────────

async function addSystemMessage(ticketId: string, body: string) {
  const msg: TicketMessage = {
    id: uuidv4(),
    ticketId,
    at: now(),
    fromEmail: 'system@mannaedge.com',
    fromName: 'Manna Edge Support',
    fromRole: 'system',
    body,
    type: 'system',
    readByUser: false,
    readByAdmin: true
  };
  await addMessage(msg);
}
