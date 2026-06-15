// Messaggi contatto: POST pubblico /contacto + admin /admin/messages
const express = require('express');
const prisma = require('../lib/db');
const settings = require('../lib/settings');
const { sendMail } = require('../lib/mailer');
const { requirePermission } = require('../middleware/rbac');
const audit = require('../lib/audit');

const router = express.Router();
const A = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function clientIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.ip ||
    (req.connection && req.connection.remoteAddress) ||
    ''
  );
}

// ---- PUBBLICO ----
const publicRouter = express.Router();

publicRouter.post('/contacto', A(async (req, res) => {
  const b = req.body || {};
  const name = (b.name || '').trim();
  const email = (b.email || '').trim();
  const subject = (b.subject || '').trim();
  const body = (b.message || b.body || '').trim();
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || body.length < 4) {
    return res.status(400).json({ ok: false, error: 'Dati non validi' });
  }
  const msg = await prisma.contactMessage.create({
    data: {
      name: name.slice(0, 120),
      email: email.slice(0, 200),
      subject: subject.slice(0, 200),
      body: body.slice(0, 5000),
      ip: clientIp(req).slice(0, 64),
      userAgent: String(req.headers['user-agent'] || '').slice(0, 240),
    },
  });

  // Auto-iscrizione newsletter (chi compila form contatti dà consenso implicito)
  try {
    const { ensureSubscriber } = require('../lib/newsletter');
    ensureSubscriber({ email: msg.email, name: msg.name, source: 'contact' });
  } catch (e) { console.error('[newsletter] auto-subscribe contact fallita:', e.message); }

  // Email all'admin (non blocca la risposta se SMTP è off)
  try {
    const s = await settings.all();
    const adminEmail = s.contact_email || s.smtp_from_email || '';
    if (adminEmail) {
      const text =
        `Nuovo messaggio dal sito\n\n` +
        `Nome: ${msg.name}\nEmail: ${msg.email}\nOggetto: ${msg.subject || '(senza oggetto)'}\n\n` +
        `${msg.body}\n\n— Inviato da irenemonticelli.com (#${msg.id})`;
      const html =
        `<div style="font-family:Arial,Helvetica,sans-serif;color:#1c1f26;max-width:560px">
          <h2 style="color:#c8970a">Nuovo messaggio dal sito</h2>
          <p><strong>Da:</strong> ${escapeHtml(msg.name)} &lt;${escapeHtml(msg.email)}&gt;</p>
          ${msg.subject ? `<p><strong>Oggetto:</strong> ${escapeHtml(msg.subject)}</p>` : ''}
          <p style="white-space:pre-wrap;background:#f7f8fa;padding:14px;border-radius:8px">${escapeHtml(msg.body)}</p>
          <p style="font-size:12px;color:#888">Riferimento: #${msg.id} · ${new Date().toLocaleString('it-IT')}</p>
        </div>`;
      await sendMail({
        to: adminEmail,
        subject: `[Contatto] ${msg.subject || msg.name}`,
        text, html,
      });
    }
  } catch (e) {
    console.error('[messages] invio email admin fallito:', e.message);
  }

  res.json({ ok: true, id: msg.id });
}));

// ---- ADMIN ----
router.get('/', requirePermission('messages.view'), A(async (req, res) => {
  const dt = require('../lib/datatable');
  const params = dt.parseParams(req, { defaultSort: 'createdAt', allowedSorts: ['name','email','subject','status','createdAt'] });
  const status = String(req.query.status || '').trim();
  params._extra = { status };
  const where = {};
  if (status) where.status = status;
  if (params.q) where.OR = [
    { name: { contains: params.q, mode: 'insensitive' } },
    { email: { contains: params.q, mode: 'insensitive' } },
    { subject: { contains: params.q, mode: 'insensitive' } },
    { body: { contains: params.q, mode: 'insensitive' } },
  ];
  const orderBy = {}; orderBy[params.sort] = params.dir;
  const [totalUnfiltered, total, items, counts] = await Promise.all([
    prisma.contactMessage.count(),
    prisma.contactMessage.count({ where }),
    prisma.contactMessage.findMany({ where, orderBy, skip: params.skip, take: params.take }),
    prisma.contactMessage.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
  const totalPages = Math.max(1, Math.ceil(total / params.perPage));
  const links = dt.pageLinks(params.page, totalPages);
  res.render('messages/list', {
    title: 'Messaggi di contatto',
    items, status,
    counts: { new: byStatus.new || 0, read: byStatus.read || 0, archived: byStatus.archived || 0 },
    params, total, totalUnfiltered, totalPages, links,
  });
}));

router.get('/:id(\\d+)', requirePermission('messages.view'), A(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const item = await prisma.contactMessage.findUnique({ where: { id } });
  if (!item) return res.status(404).render('error', { title: 'Non trovato', code: 404, message: 'Messaggio non trovato' });
  // segna come letto al primo accesso
  if (item.status === 'new') {
    await prisma.contactMessage.update({ where: { id }, data: { status: 'read' } });
    item.status = 'read';
  }
  res.render('messages/detail', { title: `Messaggio #${item.id}`, item });
}));

router.post('/:id(\\d+)/status', requirePermission('messages.view'), A(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const s = req.body.status === 'archived' ? 'archived' : req.body.status === 'new' ? 'new' : 'read';
  await prisma.contactMessage.update({ where: { id }, data: { status: s } });
  await audit.log(req, 'message.status', { entity: 'ContactMessage', entityId: String(id), details: { status: s } });
  req.flash('success', 'Stato aggiornato.');
  res.redirect('/admin/messages/' + id);
}));

router.post('/:id(\\d+)/delete', requirePermission('messages.delete'), A(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await prisma.contactMessage.delete({ where: { id } }).catch(() => {});
  await audit.log(req, 'message.delete', { entity: 'ContactMessage', entityId: String(id) });
  req.flash('success', 'Messaggio eliminato.');
  res.redirect('/admin/messages');
}));

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

module.exports = router;
module.exports.publicRouter = publicRouter;
