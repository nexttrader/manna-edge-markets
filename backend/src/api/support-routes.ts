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
import { sendNotificationToUser, recordAuditLog } from '../db/user-management-store';
import { telegramBotService } from '../notifications/telegram-bot';

const router = express.Router();

// Helper: normalise Express params (always returns a string)
const p = (param: string | string[]): string => Array.isArray(param) ? param[0] : param;

// ─── User-facing Routes ───────────────────────────────────────────────────────

// Create a ticket (user submitting upgrade request or support query)
router.post('/tickets', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    if (!body.userId || !body.userEmail || !body.userName) {
      return res.status(400).json({ error: 'userId, userEmail, and userName are required' });
    }

    const ticket = await createTicket(body as CreateTicketInput);
    res.json({ success: true, ticket });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create ticket', details: err.message });
  }
});

// Dedicated Access Request for Expired 14-Day Trial Users
router.post('/request-access', async (req: Request, res: Response) => {
  try {
    const { userId, userEmail, userName, requestedTier, contactInfo, message } = req.body || {};
    if (!userEmail || !userName) {
      return res.status(400).json({ error: 'userEmail and userName are required' });
    }

    const tierLabel = requestedTier === 'futures_forex' ? 'Futures & Forex VIP' :
                      requestedTier === 'forex_only' ? 'Forex Only Pro' :
                      requestedTier === 'custom' ? 'Custom Extension' : (requestedTier || 'Full Trading Desk Access');

    const ticketSubject = `🔒 14-Day Trial Expired: Access Request - ${userName} (${tierLabel})`;
    
    const formattedBody = `[14-DAY TRIAL EXPIRED ACCESS REQUEST]\n\n` +
      `👤 Trader: ${userName} (${userEmail})\n` +
      `👑 Desired Access / Tier: ${tierLabel}\n` +
      (contactInfo ? `📱 Phone / Telegram: ${contactInfo}\n` : '') +
      `\n💬 Private Message to Admins:\n"${message || 'I would like to request continued access to Manna Edge Markets.'}"\n\n` +
      `⚡ Action Required: An admin can review this request, send an invoice, or extend the user's trial in the Support Command Centre.`;

    const ticket = await createTicket({
      userId: userId || `usr_${Date.now()}`,
      userName,
      userEmail,
      requestedTier: (requestedTier === 'futures_forex' || requestedTier === 'forex_only') ? requestedTier : 'futures_forex',
      type: 'access_issue',
      subject: ticketSubject,
      body: formattedBody,
      priority: 'urgent'
    });

    // 1. Post private in-app notification to all Admins & Super Admins
    try {
      const allUsers = await getAllUsers();
      const adminUsers = allUsers.filter((u: any) => u.role === 'admin' || u.role === 'super_admin');
      for (const admin of adminUsers) {
        await sendNotificationToUser(
          admin.id,
          `🚨 Access Request: ${userName}`,
          `${userName} (${userEmail}) completed their 14-day trial and requested access (${tierLabel}). Message: "${message || 'Requested continued access.'}"`,
          'access_request'
        );
      }
    } catch (notifErr: any) {
      console.warn('Failed to send in-app notification to admins:', notifErr.message);
    }

    // 2. Broadcast private alert to Telegram admin channel if active
    try {
      const tgMsg = `🚨 <b>[MANNA EDGE] 14-DAY TRIAL EXPIRED — ACCESS REQUEST</b>\n\n` +
        `👤 <b>Trader:</b> ${userName}\n` +
        `📧 <b>Email:</b> ${userEmail}\n` +
        `👑 <b>Requested Tier:</b> ${tierLabel}\n` +
        (contactInfo ? `📱 <b>Contact:</b> ${contactInfo}\n` : '') +
        `💬 <b>Message:</b>\n<i>"${message || 'Requested continued access.'}"</i>\n\n` +
        `👉 <i>Log in to Admin Command Centre (/admin) to review, reply, or grant access.</i>`;
      telegramBotService.sendMessage(tgMsg).catch(() => {});
    } catch (tgErr: any) {
      console.warn('Failed to send Telegram alert:', tgErr.message);
    }

    // 3. Record in audit logs
    try {
      await recordAuditLog({
        adminEmail: userEmail,
        adminRole: 'trader',
        action: '14DAY_TRIAL_ACCESS_REQUESTED',
        targetUserId: userId,
        detailsJson: JSON.stringify({ userName, userEmail, requestedTier, contactInfo, message })
      });
    } catch (_e) {}

    res.json({ success: true, ticket });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to submit access request', details: err.message });
  }
});

// User replies to their ticket
router.post('/tickets/:id/user-reply', async (req: Request, res: Response) => {
  try {
    const id = p(req.params.id);
    const { userEmail, userName, body: msgBody } = req.body || {};
    if (!userEmail || !userName || !msgBody) {
      return res.status(400).json({ error: 'userEmail, userName, and body are required' });
    }

    const ticket = await getTicketById(id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (ticket.userEmail !== userEmail) return res.status(403).json({ error: 'Access denied' });

    const result = await replyToTicket(id, { email: userEmail, name: userName }, msgBody, 'trader');
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ success: true, ticket: result.ticket });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to reply', details: err.message });
  }
});

// Get tickets for a specific user
router.get('/tickets/user/:userEmail', async (req: Request, res: Response) => {
  try {
    const userEmail = p(req.params.userEmail);
    const tickets = await getTicketsByUser(decodeURIComponent(userEmail));
    const unreadCount = await getUserUnreadCount(decodeURIComponent(userEmail));
    res.json({ success: true, tickets, unreadCount });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch user tickets', details: err.message });
  }
});

// Mark all messages in a ticket as read by user
router.post('/tickets/:id/read-by-user', async (req: Request, res: Response) => {
  await markTicketMessagesReadByUser(p(req.params.id));
  res.json({ success: true });
});

// ─── Admin-facing Routes ──────────────────────────────────────────────────────

// Get all tickets (centralised inbox)
router.get('/tickets', async (_req: Request, res: Response) => {
  res.json({ success: true, tickets: await getAllTickets() });
});

// Get tickets claimed by a specific admin (personal box)
router.get('/tickets/admin/:adminEmail', async (req: Request, res: Response) => {
  const tickets = await getTicketsByAdmin(decodeURIComponent(p(req.params.adminEmail)));
  res.json({ success: true, tickets });
});

// Get pending transfers for a specific admin
router.get('/tickets/pending-transfer/:adminEmail', async (req: Request, res: Response) => {
  const tickets = await getPendingTransfersForAdmin(decodeURIComponent(p(req.params.adminEmail)));
  res.json({ success: true, tickets });
});

// Get a single ticket
router.get('/tickets/:id', async (req: Request, res: Response) => {
  const ticket = await getTicketById(p(req.params.id));
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json({ success: true, ticket });
});

// Claim a ticket
router.post('/tickets/:id/claim', async (req: Request, res: Response) => {
  try {
    const { adminEmail, adminName } = req.body || {};
    if (!adminEmail || !adminName) return res.status(400).json({ error: 'adminEmail and adminName are required' });
    const result = await claimTicket(p(req.params.id), { email: adminEmail, name: adminName });
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ success: true, ticket: result.ticket });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to claim ticket', details: err.message });
  }
});

// Admin reply to a ticket
router.post('/tickets/:id/reply', async (req: Request, res: Response) => {
  try {
    const { adminEmail, adminName, body: msgBody } = req.body || {};
    if (!adminEmail || !adminName || !msgBody) return res.status(400).json({ error: 'adminEmail, adminName, and body are required' });
    const result = await replyToTicket(p(req.params.id), { email: adminEmail, name: adminName }, msgBody, 'admin');
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ success: true, ticket: result.ticket });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to reply', details: err.message });
  }
});

// Send invoice to user
router.post('/tickets/:id/send-invoice', async (req: Request, res: Response) => {
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
    const result = await sendInvoice(p(req.params.id), { email: adminEmail, name: adminName }, invoiceDetails);
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ success: true, ticket: result.ticket });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to send invoice', details: err.message });
  }
});

// Transfer ticket to another admin
router.post('/tickets/:id/transfer', async (req: Request, res: Response) => {
  try {
    const { adminEmail, adminName, toAdminEmail, toAdminName, note } = req.body || {};
    if (!adminEmail || !adminName || !toAdminEmail || !toAdminName) {
      return res.status(400).json({ error: 'adminEmail, adminName, toAdminEmail, toAdminName required' });
    }
    const result = await transferTicket(p(req.params.id), { email: adminEmail, name: adminName }, toAdminEmail, toAdminName, note || '');
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ success: true, ticket: result.ticket });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to transfer ticket', details: err.message });
  }
});

// Accept transfer
router.post('/tickets/:id/accept-transfer', async (req: Request, res: Response) => {
  try {
    const { adminEmail, adminName } = req.body || {};
    if (!adminEmail || !adminName) return res.status(400).json({ error: 'adminEmail and adminName required' });
    const result = await acceptTransfer(p(req.params.id), { email: adminEmail, name: adminName });
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ success: true, ticket: result.ticket });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to accept transfer', details: err.message });
  }
});

// Decline transfer
router.post('/tickets/:id/decline-transfer', async (req: Request, res: Response) => {
  try {
    const { adminEmail, adminName, reason } = req.body || {};
    if (!adminEmail || !adminName) return res.status(400).json({ error: 'adminEmail and adminName required' });
    const result = await declineTransfer(p(req.params.id), { email: adminEmail, name: adminName }, reason);
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ success: true, ticket: result.ticket });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to decline transfer', details: err.message });
  }
});

// Resolve ticket
router.post('/tickets/:id/resolve', async (req: Request, res: Response) => {
  try {
    const { adminEmail, adminName, note, upgradeTier } = req.body || {};
    if (!adminEmail || !adminName) return res.status(400).json({ error: 'adminEmail and adminName required' });
    const result = await resolveTicket(p(req.params.id), { email: adminEmail, name: adminName }, note || '', upgradeTier);
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ success: true, ticket: result.ticket });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to resolve ticket', details: err.message });
  }
});

// Reopen ticket
router.post('/tickets/:id/reopen', async (req: Request, res: Response) => {
  try {
    const { adminEmail, adminName } = req.body || {};
    if (!adminEmail || !adminName) return res.status(400).json({ error: 'adminEmail and adminName required' });
    const result = await reopenTicket(p(req.params.id), { email: adminEmail, name: adminName });
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ success: true, ticket: result.ticket });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to reopen ticket', details: err.message });
  }
});

// Mark messages read by admin
router.post('/tickets/:id/read-by-admin', async (req: Request, res: Response) => {
  await markTicketMessagesReadByAdmin(p(req.params.id));
  res.json({ success: true });
});

// Get all admin accounts (for transfer dropdown)
router.get('/admins', async (_req: Request, res: Response) => {
  try {
    const allUsers = await getAllUsers();
    const admins = allUsers
      .filter((u: any) => u.role === 'admin' || u.role === 'super_admin')
      .map((u: any) => ({ id: u.id, name: u.name, email: u.email, role: u.role }));
    res.json({ success: true, admins });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch admins', details: err.message });
  }
});

export default router;
