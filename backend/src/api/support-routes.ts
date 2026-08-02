import express, { Request, Response } from 'express';
import {
  createTicket,
  getAllTickets,
  getTicketsByAdmin,
  getPendingTransfersForAdmin,
  getTicketsByUser,
  getTicketById,
  getUserUnreadCount,
  claimTicket,
  replyToTicket,
  sendInvoice,
  transferTicket,
  acceptTransfer,
  declineTransfer,
  resolveTicket,
  reopenTicket,
  markTicketMessagesReadByUser,
  markTicketMessagesReadByAdmin,
  CreateTicketInput,
  InvoiceDetails
} from '../db/ticket-store';
import { getAllUsers } from '../db/user-store';

const router = express.Router();

// Helper: normalise Express params (always returns a string)
const p = (param: string | string[]): string => Array.isArray(param) ? param[0] : param;

// ─── User-facing Routes ───────────────────────────────────────────────────────

// Create a ticket (user submitting upgrade request or support query)
router.post('/tickets', (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    if (!body.userId || !body.userEmail || !body.userName) {
      return res.status(400).json({ error: 'userId, userEmail, and userName are required' });
    }

    const ticket = createTicket(body as CreateTicketInput);
    res.json({ success: true, ticket });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create ticket', details: err.message });
  }
});

// User replies to their ticket
router.post('/tickets/:id/user-reply', (req: Request, res: Response) => {
  try {
    const id = p(req.params.id);
    const { userEmail, userName, body: msgBody } = req.body || {};
    if (!userEmail || !userName || !msgBody) {
      return res.status(400).json({ error: 'userEmail, userName, and body are required' });
    }

    const ticket = getTicketById(id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (ticket.userEmail !== userEmail) return res.status(403).json({ error: 'Access denied' });

    const result = replyToTicket(id, { email: userEmail, name: userName }, msgBody, 'trader');
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ success: true, ticket: result.ticket });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to reply', details: err.message });
  }
});

// Get tickets for a specific user
router.get('/tickets/user/:userEmail', (req: Request, res: Response) => {
  try {
    const userEmail = p(req.params.userEmail);
    const tickets = getTicketsByUser(decodeURIComponent(userEmail));
    const unreadCount = getUserUnreadCount(decodeURIComponent(userEmail));
    res.json({ success: true, tickets, unreadCount });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch user tickets', details: err.message });
  }
});

// Mark all messages in a ticket as read by user
router.post('/tickets/:id/read-by-user', (req: Request, res: Response) => {
  markTicketMessagesReadByUser(p(req.params.id));
  res.json({ success: true });
});

// ─── Admin-facing Routes ──────────────────────────────────────────────────────

// Get all tickets (centralised inbox)
router.get('/tickets', (_req: Request, res: Response) => {
  res.json({ success: true, tickets: getAllTickets() });
});

// Get tickets claimed by a specific admin (personal box)
router.get('/tickets/admin/:adminEmail', (req: Request, res: Response) => {
  const tickets = getTicketsByAdmin(decodeURIComponent(p(req.params.adminEmail)));
  res.json({ success: true, tickets });
});

// Get pending transfers for a specific admin
router.get('/tickets/pending-transfer/:adminEmail', (req: Request, res: Response) => {
  const tickets = getPendingTransfersForAdmin(decodeURIComponent(p(req.params.adminEmail)));
  res.json({ success: true, tickets });
});

// Get a single ticket
router.get('/tickets/:id', (req: Request, res: Response) => {
  const ticket = getTicketById(p(req.params.id));
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json({ success: true, ticket });
});

// Claim a ticket
router.post('/tickets/:id/claim', (req: Request, res: Response) => {
  try {
    const { adminEmail, adminName } = req.body || {};
    if (!adminEmail || !adminName) return res.status(400).json({ error: 'adminEmail and adminName are required' });
    const result = claimTicket(p(req.params.id), { email: adminEmail, name: adminName });
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ success: true, ticket: result.ticket });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to claim ticket', details: err.message });
  }
});

// Admin reply to a ticket
router.post('/tickets/:id/reply', (req: Request, res: Response) => {
  try {
    const { adminEmail, adminName, body: msgBody } = req.body || {};
    if (!adminEmail || !adminName || !msgBody) return res.status(400).json({ error: 'adminEmail, adminName, and body are required' });
    const result = replyToTicket(p(req.params.id), { email: adminEmail, name: adminName }, msgBody, 'admin');
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ success: true, ticket: result.ticket });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to reply', details: err.message });
  }
});

// Send invoice to user
router.post('/tickets/:id/send-invoice', (req: Request, res: Response) => {
  try {
    const { adminEmail, adminName, invoice } = req.body || {};
    if (!adminEmail || !adminName || !invoice) return res.status(400).json({ error: 'adminEmail, adminName, and invoice are required' });
    if (!invoice.tier || !invoice.amount || !invoice.paymentInstructions || !invoice.dueDate) {
      return res.status(400).json({ error: 'invoice.tier, amount, paymentInstructions, and dueDate are required' });
    }
    const invoiceDetails: InvoiceDetails = {
      tier: invoice.tier,
      tierLabel: invoice.tier === 'futures_forex' ? 'Futures & Forex VIP' : 'Forex Only Pro',
      amount: invoice.amount,
      currency: invoice.currency || 'USD',
      paymentInstructions: invoice.paymentInstructions,
      bankDetails: invoice.bankDetails,
      dueDate: invoice.dueDate
    };
    const result = sendInvoice(p(req.params.id), { email: adminEmail, name: adminName }, invoiceDetails);
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ success: true, ticket: result.ticket });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to send invoice', details: err.message });
  }
});

// Transfer ticket to another admin
router.post('/tickets/:id/transfer', (req: Request, res: Response) => {
  try {
    const { adminEmail, adminName, toAdminEmail, toAdminName, note } = req.body || {};
    if (!adminEmail || !adminName || !toAdminEmail || !toAdminName) {
      return res.status(400).json({ error: 'adminEmail, adminName, toAdminEmail, toAdminName required' });
    }
    const result = transferTicket(p(req.params.id), { email: adminEmail, name: adminName }, toAdminEmail, toAdminName, note || '');
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ success: true, ticket: result.ticket });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to transfer ticket', details: err.message });
  }
});

// Accept transfer
router.post('/tickets/:id/accept-transfer', (req: Request, res: Response) => {
  try {
    const { adminEmail, adminName } = req.body || {};
    if (!adminEmail || !adminName) return res.status(400).json({ error: 'adminEmail and adminName required' });
    const result = acceptTransfer(p(req.params.id), { email: adminEmail, name: adminName });
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ success: true, ticket: result.ticket });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to accept transfer', details: err.message });
  }
});

// Decline transfer
router.post('/tickets/:id/decline-transfer', (req: Request, res: Response) => {
  try {
    const { adminEmail, adminName, reason } = req.body || {};
    if (!adminEmail || !adminName) return res.status(400).json({ error: 'adminEmail and adminName required' });
    const result = declineTransfer(p(req.params.id), { email: adminEmail, name: adminName }, reason);
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ success: true, ticket: result.ticket });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to decline transfer', details: err.message });
  }
});

// Resolve ticket
router.post('/tickets/:id/resolve', (req: Request, res: Response) => {
  try {
    const { adminEmail, adminName, note, upgradeTier } = req.body || {};
    if (!adminEmail || !adminName) return res.status(400).json({ error: 'adminEmail and adminName required' });
    const result = resolveTicket(p(req.params.id), { email: adminEmail, name: adminName }, note || '', upgradeTier);
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ success: true, ticket: result.ticket });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to resolve ticket', details: err.message });
  }
});

// Reopen ticket
router.post('/tickets/:id/reopen', (req: Request, res: Response) => {
  try {
    const { adminEmail, adminName } = req.body || {};
    if (!adminEmail || !adminName) return res.status(400).json({ error: 'adminEmail and adminName required' });
    const result = reopenTicket(p(req.params.id), { email: adminEmail, name: adminName });
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ success: true, ticket: result.ticket });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to reopen ticket', details: err.message });
  }
});

// Mark messages read by admin
router.post('/tickets/:id/read-by-admin', (req: Request, res: Response) => {
  markTicketMessagesReadByAdmin(p(req.params.id));
  res.json({ success: true });
});

// Get all admin accounts (for transfer dropdown)
router.get('/admins', (_req: Request, res: Response) => {
  try {
    const allUsers = getAllUsers();
    const admins = allUsers
      .filter((u: any) => u.role === 'admin' || u.role === 'super_admin')
      .map((u: any) => ({ id: u.id, name: u.name, email: u.email, role: u.role }));
    res.json({ success: true, admins });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch admins', details: err.message });
  }
});

export default router;
