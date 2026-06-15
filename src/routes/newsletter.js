// Newsletter — admin (campagne + iscritti) + endpoint pubblico unsubscribe.
const express = require('express');
const prisma = require('../lib/db');
const audit = require('../lib/audit');
const nlLib = require('../lib/newsletter');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();
const A = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function baseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}

// ============ ADMIN ============
router.use(requirePermission('newsletter.manage'));

// Dashboard newsletter
router.get('/', A(async (req, res) => {
  const [campaigns, counts] = await Promise.all([
    prisma.newsletterCampaign.findMany({ orderBy: { id: 'desc' }, take: 50 }),
    prisma.newsletterSubscriber.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const subStats = { active: 0, unsubscribed: 0, bounced: 0 };
  counts.forEach((c) => { subStats[c.status] = c._count._all; });
  res.render('newsletter/list', { title: 'Newsletter', campaigns, subStats });
}));

// Composer nuova campagna
router.get('/new', A(async (req, res) => {
  res.render('newsletter/compose', { title: 'Nuova newsletter', campaign: null });
}));

router.get('/:id(\\d+)/edit', A(async (req, res) => {
  const c = await prisma.newsletterCampaign.findUnique({ where: { id: parseInt(req.params.id, 10) } });
  if (!c) return res.redirect('/admin/newsletter');
  res.render('newsletter/compose', { title: 'Modifica campagna', campaign: c });
}));

router.post('/', A(async (req, res) => {
  const b = req.body;
  const data = {
    subject: (b.subject || '').trim().slice(0, 200),
    preheader: (b.preheader || '').trim().slice(0, 200),
    htmlBody: (b.htmlBody || '').trim(),
    audience: (b.audience === 'bookings' || b.audience === 'contacts') ? b.audience : 'all',
    status: 'draft',
  };
  if (!data.subject) { req.flash('error', 'Oggetto obbligatorio.'); return res.redirect('/admin/newsletter/new'); }
  const r = await prisma.newsletterCampaign.create({ data });
  await audit.log(req, 'newsletter.create', { entity: 'NewsletterCampaign', entityId: String(r.id) });
  req.flash('success', 'Campagna salvata come bozza.');
  res.redirect('/admin/newsletter/' + r.id + '/edit');
}));

router.post('/:id(\\d+)', A(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const b = req.body;
  await prisma.newsletterCampaign.update({
    where: { id },
    data: {
      subject: (b.subject || '').trim().slice(0, 200),
      preheader: (b.preheader || '').trim().slice(0, 200),
      htmlBody: (b.htmlBody || '').trim(),
      audience: (b.audience === 'bookings' || b.audience === 'contacts') ? b.audience : 'all',
    },
  });
  await audit.log(req, 'newsletter.update', { entity: 'NewsletterCampaign', entityId: String(id) });
  req.flash('success', 'Bozza aggiornata.');
  res.redirect('/admin/newsletter/' + id + '/edit');
}));

// Preview HTML completo (renderizzato col template wrapper)
router.get('/:id(\\d+)/preview', A(async (req, res) => {
  const c = await prisma.newsletterCampaign.findUnique({ where: { id: parseInt(req.params.id, 10) } });
  if (!c) return res.status(404).send('Not found');
  const html = nlLib.wrapEmail({
    subject: c.subject, preheader: c.preheader, body: c.htmlBody,
    unsubscribeUrl: baseUrl(req) + '/newsletter/unsubscribe/sample-token',
    baseUrl: baseUrl(req),
  });
  res.type('html').send(html);
}));

// Invio test (a un solo indirizzo)
router.post('/:id(\\d+)/test', A(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const to = (req.body.to || '').trim();
  if (!to) { req.flash('error', 'Indirizzo email obbligatorio.'); return res.redirect('/admin/newsletter/' + id + '/edit'); }
  const c = await prisma.newsletterCampaign.findUnique({ where: { id } });
  if (!c) { req.flash('error', 'Campagna non trovata.'); return res.redirect('/admin/newsletter'); }
  const html = nlLib.wrapEmail({
    subject: c.subject, preheader: c.preheader, body: c.htmlBody,
    unsubscribeUrl: baseUrl(req) + '/newsletter/unsubscribe/sample-token',
    baseUrl: baseUrl(req),
  });
  try {
    const { sendMail } = require('../lib/mailer');
    await sendMail({ to, subject: '[TEST] ' + c.subject, html, text: nlLib.htmlToText(c.htmlBody) });
    await audit.log(req, 'newsletter.test', { entity: 'NewsletterCampaign', entityId: String(id), details: { to } });
    req.flash('success', 'Email di test inviata a ' + to);
  } catch (e) {
    req.flash('error', 'Invio test fallito: ' + e.message);
  }
  res.redirect('/admin/newsletter/' + id + '/edit');
}));

// Invio reale a tutti gli iscritti (audience eventualmente sovrascritto dal form)
router.post('/:id(\\d+)/send', A(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    // Se il form invia un'audience, la salvo sulla campagna prima di inviare
    const aud = req.body.audience;
    if (aud === 'all' || aud === 'bookings' || aud === 'contacts') {
      await prisma.newsletterCampaign.update({ where: { id }, data: { audience: aud } });
    }
    const r = await nlLib.sendCampaign(id, baseUrl(req));
    await audit.log(req, 'newsletter.send', { entity: 'NewsletterCampaign', entityId: String(id), details: r });
    req.flash('success', `Newsletter inviata: ${r.success} riusciti, ${r.failure} falliti su ${r.total} iscritti.`);
  } catch (e) {
    req.flash('error', 'Invio fallito: ' + e.message);
  }
  res.redirect('/admin/newsletter');
}));

router.post('/:id(\\d+)/delete', A(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await prisma.newsletterCampaign.delete({ where: { id } }).catch(() => {});
  await audit.log(req, 'newsletter.delete', { entity: 'NewsletterCampaign', entityId: String(id) });
  req.flash('success', 'Campagna eliminata.');
  res.redirect('/admin/newsletter');
}));

// ===== Iscritti =====
router.get('/subscribers', A(async (req, res) => {
  const dt = require('../lib/datatable');
  const params = dt.parseParams(req, { defaultSort: 'createdAt', allowedSorts: ['email','name','source','status','createdAt','lastSentAt'] });
  const status = String(req.query.status || '').trim();
  const source = String(req.query.source || '').trim();
  params._extra = { status, source };
  const where = {};
  if (status) where.status = status;
  if (source) where.source = source;
  if (params.q) where.OR = [
    { email: { contains: params.q, mode: 'insensitive' } },
    { name: { contains: params.q, mode: 'insensitive' } },
  ];
  const orderBy = {}; orderBy[params.sort] = params.dir;
  const [totalUnfiltered, total, subs, activeC, unsubC, bouncedC] = await Promise.all([
    prisma.newsletterSubscriber.count(),
    prisma.newsletterSubscriber.count({ where }),
    prisma.newsletterSubscriber.findMany({ where, orderBy, skip: params.skip, take: params.take }),
    prisma.newsletterSubscriber.count({ where: { status: 'active' } }),
    prisma.newsletterSubscriber.count({ where: { status: 'unsubscribed' } }),
    prisma.newsletterSubscriber.count({ where: { status: 'bounced' } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / params.perPage));
  const links = dt.pageLinks(params.page, totalPages);
  res.render('newsletter/subscribers', {
    title: 'Iscritti newsletter',
    subs, status, source,
    params, total, totalUnfiltered, totalPages, links,
    counts: { active: activeC, unsubscribed: unsubC, bounced: bouncedC },
  });
}));

router.post('/subscribers', A(async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const name = (req.body.name || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    req.flash('error', 'Email non valida.');
    return res.redirect('/admin/newsletter/subscribers');
  }
  try {
    await prisma.newsletterSubscriber.create({
      data: { email, name, source: 'manual', unsubscribeToken: nlLib.genToken() },
    });
    req.flash('success', 'Iscritto aggiunto.');
  } catch (e) {
    req.flash('error', e.message.includes('Unique') ? 'Email già presente.' : 'Errore: ' + e.message);
  }
  res.redirect('/admin/newsletter/subscribers');
}));

router.post('/subscribers/import', A(async (req, res) => {
  const added = await nlLib.importFromBookings();
  await audit.log(req, 'newsletter.subscribers.import', { details: { added } });
  req.flash('success', `Importati ${added} nuovi iscritti dalle prenotazioni.`);
  res.redirect('/admin/newsletter/subscribers');
}));

router.post('/subscribers/:id(\\d+)/delete', A(async (req, res) => {
  await prisma.newsletterSubscriber.delete({ where: { id: parseInt(req.params.id, 10) } }).catch(() => {});
  req.flash('success', 'Iscritto eliminato.');
  res.redirect('/admin/newsletter/subscribers');
}));

// ============ PUBBLICO: unsubscribe ============
const publicRouter = express.Router();
publicRouter.get('/newsletter/unsubscribe/:token', A(async (req, res) => {
  const token = String(req.params.token || '');
  const sub = await prisma.newsletterSubscriber.findUnique({ where: { unsubscribeToken: token } });
  if (!sub) return res.status(404).render('public/unsubscribed', { ok: false, email: '' });
  res.render('public/unsubscribed', { ok: true, email: sub.email, alreadyOff: sub.status === 'unsubscribed' });
}));
publicRouter.post('/newsletter/unsubscribe/:token', A(async (req, res) => {
  const token = String(req.params.token || '');
  const sub = await prisma.newsletterSubscriber.findUnique({ where: { unsubscribeToken: token } });
  if (sub && sub.status !== 'unsubscribed') {
    await prisma.newsletterSubscriber.update({ where: { id: sub.id }, data: { status: 'unsubscribed', unsubscribedAt: new Date() } });
  }
  res.render('public/unsubscribed', { ok: true, email: sub ? sub.email : '', alreadyOff: true, justConfirmed: true });
}));

module.exports = router;
module.exports.publicRouter = publicRouter;
