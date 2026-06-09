// Admin gestione referrer: lista + approva/disattiva/elimina + reset password.
// La registrazione e il login pubblico stanno in src/routes/area-referral.js.

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../lib/db');
const audit = require('../lib/audit');
const { sendMail } = require('../lib/mailer');
const settings = require('../lib/settings');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();
const A = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function genTempPassword() {
  return crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) + 'A1!';
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function sendCodeCreatedEmail(referrer, code, req) {
  const s = await settings.all();
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const dashboardUrl = `${proto}://${host}/area-referral`;
  const siteName = s.site_name || 'Irene Monticelli';

  const discountLabel = code.discountType === 'fixed'
    ? `${code.discountValue} € de descuento`
    : `${code.discountValue}% de descuento`;

  const text =
    `Hola ${referrer.firstName},\n\n` +
    `¡Tienes un nuevo código de afiliado!\n\n` +
    `Código: ${code.code}\n` +
    `Descuento cliente: ${discountLabel}\n` +
    `Tu comisión: ${code.commissionPct}% sobre el neto\n` +
    `${code.maxUses ? `Usos máximos: ${code.maxUses}\n` : ''}` +
    `${code.validUntil ? `Válido hasta: ${new Date(code.validUntil).toLocaleDateString('es-ES')}\n` : ''}` +
    `\nCompártelo con tu comunidad. Por cada venta usando este código, ganarás tu comisión automáticamente.\n\n` +
    `Accede a tu panel personal para ver tus ganancias y el detalle:\n${dashboardUrl}\n\n` +
    `— ${siteName}`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1c1f26;max-width:560px">
      <h2 style="color:#c8970a;font-family:Georgia,serif;font-weight:500;font-size:26px;margin:0 0 14px">🎫 ¡Tu nuevo código está listo!</h2>
      <p>Hola <strong>${escapeHtml(referrer.firstName)}</strong>,</p>
      <p>Acabamos de crear un nuevo código de afiliado para ti. Compártelo con tu comunidad y empieza a ganar.</p>
      <div style="background:linear-gradient(135deg,#fffbe8,#fff);border:2px solid #ead9a8;border-radius:14px;padding:24px;margin:22px 0;text-align:center">
        <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#7a5800;font-weight:700;margin-bottom:10px">Tu código</div>
        <div style="font-family:Manrope,Arial,sans-serif;font-size:32px;font-weight:700;letter-spacing:.06em;color:#1c1f26;margin-bottom:18px;user-select:all">${escapeHtml(code.code)}</div>
        <div style="display:inline-block;background:#fff;border-radius:10px;padding:12px 18px;text-align:left;font-size:13.5px;line-height:1.7;color:#5a5e6a">
          🎁 <strong style="color:#1c1f26">Descuento cliente:</strong> ${escapeHtml(String(discountLabel))}<br>
          💰 <strong style="color:#1c1f26">Tu comisión:</strong> <span style="color:#1b6b3e;font-weight:700">${code.commissionPct}%</span> sobre el neto
          ${code.maxUses ? `<br>📊 <strong style="color:#1c1f26">Usos máximos:</strong> ${code.maxUses}` : ''}
          ${code.validUntil ? `<br>📅 <strong style="color:#1c1f26">Válido hasta:</strong> ${new Date(code.validUntil).toLocaleDateString('es-ES')}` : ''}
        </div>
      </div>
      <p style="font-size:14.5px;line-height:1.65;color:#5a5e6a">
        Cada vez que alguien reserve usando tu código, se generará automáticamente una comisión en tu panel.
        Puedes hacer un seguimiento en tiempo real de tus ganancias y solicitudes pendientes:
      </p>
      <p style="margin:22px 0;text-align:center">
        <a href="${dashboardUrl}" style="display:inline-block;background:#1c1f26;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;letter-spacing:.04em">Ir a mi panel →</a>
      </p>
      <p style="font-size:12.5px;color:#7a8190;line-height:1.6;margin-top:24px">
        💡 <em>Consejo:</em> guarda esta email para tener siempre a mano tu código.
      </p>
      <p style="font-size:12px;color:#888;margin-top:24px">— ${escapeHtml(siteName)}</p>
    </div>`;

  await sendMail({
    to: referrer.email,
    subject: `🎫 Tu nuevo código: ${code.code} · ${siteName}`,
    text, html,
  });
}

async function sendApprovalEmail(referrer, tempPassword, req) {
  const s = await settings.all();
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const loginUrl = `${proto}://${host}/area-referral/login`;
  const siteName = s.site_name || 'Irene Monticelli';

  const text =
    `Ciao ${referrer.firstName},\n\n` +
    `La tua richiesta di adesione al programma referral di ${siteName} è stata APPROVATA.\n\n` +
    `Accedi alla tua area riservata con queste credenziali:\n` +
    `Email: ${referrer.email}\n` +
    `Password: ${tempPassword}\n\n` +
    `Pannello: ${loginUrl}\n\n` +
    `Nell'area riservata potrai vedere i tuoi codici sconto, le iscrizioni che generi e i tuoi guadagni.\n\n` +
    `— ${siteName}`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1c1f26;max-width:560px">
      <h2 style="color:#c8970a">Benvenuto nel programma referral!</h2>
      <p>Ciao <strong>${escapeHtml(referrer.firstName)}</strong>,</p>
      <p>La tua richiesta di adesione al programma referral di <strong>${escapeHtml(siteName)}</strong> è stata <strong style="color:#1b6b3e">APPROVATA</strong>.</p>
      <div style="background:#fffbe8;border:1px solid #ead9a8;border-radius:10px;padding:18px;margin:18px 0">
        <p style="margin:0 0 8px"><strong>Le tue credenziali di accesso:</strong></p>
        <p style="margin:6px 0">Email: <code style="background:#fff;padding:3px 8px;border-radius:5px">${escapeHtml(referrer.email)}</code></p>
        <p style="margin:6px 0">Password: <code style="background:#fff;padding:3px 8px;border-radius:5px;letter-spacing:.5px">${escapeHtml(tempPassword)}</code></p>
      </div>
      <p style="margin:18px 0">
        <a href="${loginUrl}" style="display:inline-block;background:#e0aa00;color:#1c1408;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Accedi all'area riservata →</a>
      </p>
      <p style="font-size:13px;color:#7a8190;line-height:1.6">Nell'area riservata vedrai i tuoi codici sconto da condividere, le iscrizioni generate e i tuoi guadagni.</p>
      <p style="font-size:12px;color:#888;margin-top:24px">— ${escapeHtml(siteName)}</p>
    </div>`;

  await sendMail({
    to: referrer.email,
    subject: `Benvenuto nel programma referral — ${siteName}`,
    text, html,
  });
}

// ============ LISTA ============
router.get('/', requirePermission('referrals.view'), A(async (req, res) => {
  const dt = require('../lib/datatable');
  const params = dt.parseParams(req, {
    defaultSort: 'createdAt',
    allowedSorts: ['firstName', 'lastName', 'email', 'status', 'approvedAt', 'lastLoginAt', 'createdAt'],
  });
  const status = String(req.query.status || '').trim();
  params._extra = { status };

  const where = {};
  if (params.q) {
    where.OR = [
      { firstName: { contains: params.q, mode: 'insensitive' } },
      { lastName: { contains: params.q, mode: 'insensitive' } },
      { email: { contains: params.q, mode: 'insensitive' } },
    ];
  }
  if (status) where.status = status;

  const orderBy = {}; orderBy[params.sort] = params.dir;

  const [totalUnfiltered, total, referrers, counts] = await Promise.all([
    prisma.referrer.count(),
    prisma.referrer.count({ where }),
    prisma.referrer.findMany({ where, orderBy, skip: params.skip, take: params.take }),
    prisma.referrer.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const statusCounts = { pending: 0, approved: 0, disabled: 0 };
  counts.forEach((c) => { statusCounts[c.status] = c._count._all; });

  const totalPages = Math.max(1, Math.ceil(total / params.perPage));
  const links = dt.pageLinks(params.page, totalPages);

  res.render('referrals/list', {
    title: 'Referral',
    referrers, status, statusCounts,
    params, total, totalUnfiltered, totalPages, links,
  });
}));

// ============ DETTAGLIO ============
router.get('/:id(\\d+)/edit', requirePermission('referrals.view'), A(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const r = await prisma.referrer.findUnique({
    where: { id },
    include: {
      codes: { orderBy: { createdAt: 'desc' } },
      _count: { select: { commissions: true } },
    },
  });
  if (!r) return res.redirect('/admin/referrals');
  // Statistiche commissioni
  const [pendingAgg, paidAgg] = await Promise.all([
    prisma.referralCommission.aggregate({ where: { referrerId: id, status: 'pending' }, _sum: { commissionAmt: true } }),
    prisma.referralCommission.aggregate({ where: { referrerId: id, status: 'paid' }, _sum: { commissionAmt: true } }),
  ]);
  const stats = {
    pendingAmount: pendingAgg._sum.commissionAmt || 0,
    paidAmount: paidAgg._sum.commissionAmt || 0,
    totalCommissions: r._count.commissions,
  };
  res.render('referrals/form', { title: `Referrer #${r.id}`, referrer: r, stats });
}));

router.post('/:id(\\d+)', requirePermission('referrals.manage'), A(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const b = req.body || {};
  await prisma.referrer.update({
    where: { id },
    data: {
      firstName: String(b.firstName || '').trim(),
      lastName: String(b.lastName || '').trim(),
      email: String(b.email || '').toLowerCase().trim(),
      phone: String(b.phone || '').trim(),
      internalNotes: String(b.internalNotes || '').trim(),
    },
  });
  await audit.log(req, 'referrer.update', { entity: 'Referrer', entityId: String(id) });
  req.flash('success', 'Referrer aggiornato.');
  res.redirect('/admin/referrals');
}));

// ============ APPROVA (manda email con password) ============
router.post('/:id(\\d+)/approve', requirePermission('referrals.manage'), A(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ref = await prisma.referrer.findUnique({ where: { id } });
  if (!ref) {
    req.flash('error', 'Referrer non trovato.');
    return res.redirect('/admin/referrals');
  }
  if (ref.status === 'approved') {
    req.flash('error', 'Già approvato.');
    return res.redirect('/admin/referrals');
  }
  const tempPassword = genTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  await prisma.referrer.update({
    where: { id },
    data: {
      status: 'approved',
      passwordHash,
      mustChangePw: false,
      approvedAt: new Date(),
      approvedById: req.user.id,
    },
  });
  let emailOk = true, emailErr = '';
  try { await sendApprovalEmail(ref, tempPassword, req); }
  catch (e) { emailOk = false; emailErr = e.message; }
  await audit.log(req, 'referrer.approve', { entity: 'Referrer', entityId: String(id), details: { emailSent: emailOk } });
  if (emailOk) {
    req.flash('success', `Referrer approvato. Email con credenziali inviata a ${ref.email}.`);
  } else {
    req.flash('error', `Approvato ma invio email fallito (${emailErr}). Password temporanea: ${tempPassword}`);
  }
  res.redirect('/admin/referrals');
}));

// ============ DISATTIVA / RIATTIVA ============
router.post('/:id(\\d+)/toggle', requirePermission('referrals.manage'), A(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ref = await prisma.referrer.findUnique({ where: { id } });
  if (!ref) return res.redirect('/admin/referrals');
  if (ref.status === 'pending') {
    req.flash('error', 'Approva prima il referrer per poterlo attivare/disattivare.');
    return res.redirect('/admin/referrals');
  }
  const newStatus = ref.status === 'approved' ? 'disabled' : 'approved';
  await prisma.referrer.update({ where: { id }, data: { status: newStatus } });
  await audit.log(req, 'referrer.toggle', { entity: 'Referrer', entityId: String(id), details: { newStatus } });
  req.flash('success', newStatus === 'approved' ? 'Referrer riattivato.' : 'Referrer disattivato.');
  res.redirect('/admin/referrals');
}));

// ============ RESET PASSWORD ============
router.post('/:id(\\d+)/reset-password', requirePermission('referrals.manage'), A(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ref = await prisma.referrer.findUnique({ where: { id } });
  if (!ref || ref.status !== 'approved') {
    req.flash('error', 'Reset disponibile solo per referrer approvati.');
    return res.redirect('/admin/referrals');
  }
  const tempPassword = genTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  await prisma.referrer.update({ where: { id }, data: { passwordHash } });
  let emailOk = true, emailErr = '';
  try { await sendApprovalEmail({ ...ref, passwordHash }, tempPassword, req); }
  catch (e) { emailOk = false; emailErr = e.message; }
  await audit.log(req, 'referrer.reset-password', { entity: 'Referrer', entityId: String(id) });
  if (emailOk) req.flash('success', `Password reimpostata e inviata via email a ${ref.email}.`);
  else req.flash('error', `Password reimpostata ma email fallita (${emailErr}). Temp: ${tempPassword}`);
  res.redirect('/admin/referrals');
}));

// ============ ELIMINA ============
router.post('/:id(\\d+)/delete', requirePermission('referrals.manage'), A(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await prisma.referrer.delete({ where: { id } }).catch(() => {});
  await audit.log(req, 'referrer.delete', { entity: 'Referrer', entityId: String(id) });
  req.flash('success', 'Referrer eliminato.');
  res.redirect('/admin/referrals');
}));

// ============ CODICI: CREATE ============
router.post('/:id(\\d+)/codes', requirePermission('referrals.codes.manage'), A(async (req, res) => {
  const referrerId = parseInt(req.params.id, 10);
  const ref = await prisma.referrer.findUnique({ where: { id: referrerId } });
  if (!ref) return res.redirect('/admin/referrals');
  const b = req.body || {};
  let code = String(b.code || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!code) {
    const { suggestCode } = require('../lib/referral-calc');
    code = suggestCode(ref.firstName, ref.lastName);
  }
  // unicità
  const dup = await prisma.referralCode.findUnique({ where: { code } });
  if (dup) {
    req.flash('error', `Codice "${code}" già usato. Scegli un altro.`);
    return res.redirect(`/admin/referrals/${referrerId}/edit`);
  }
  const newCode = await prisma.referralCode.create({
    data: {
      code,
      referrerId,
      discountType: b.discountType === 'fixed' ? 'fixed' : 'percent',
      discountValue: parseFloat(b.discountValue) || 0,
      commissionPct: parseFloat(b.commissionPct) || 0,
      maxUses: b.maxUses ? parseInt(b.maxUses, 10) : null,
      validUntil: b.validUntil ? new Date(b.validUntil) : null,
      active: true,
      internalNotes: String(b.internalNotes || '').slice(0, 500),
    },
  });
  await audit.log(req, 'referrer.code.create', { entity: 'ReferralCode', details: { code, referrerId } });
  // Email al referrer (best-effort)
  let emailOk = true;
  try { await sendCodeCreatedEmail(ref, newCode, req); }
  catch (e) { emailOk = false; console.error('[referrals] sendCodeCreatedEmail failed:', e.message); }
  req.flash('success', emailOk
    ? `Codice "${code}" creato. Email inviata a ${ref.email}.`
    : `Codice "${code}" creato (email NON inviata: ${ref.email}).`);
  res.redirect(`/admin/referrals/${referrerId}/edit`);
}));

// ============ CODICI: UPDATE ============
router.post('/codes/:codeId(\\d+)', requirePermission('referrals.codes.manage'), A(async (req, res) => {
  const codeId = parseInt(req.params.codeId, 10);
  const existing = await prisma.referralCode.findUnique({ where: { id: codeId } });
  if (!existing) return res.redirect('/admin/referrals');
  const b = req.body || {};
  await prisma.referralCode.update({
    where: { id: codeId },
    data: {
      discountType: b.discountType === 'fixed' ? 'fixed' : 'percent',
      discountValue: parseFloat(b.discountValue) || 0,
      commissionPct: parseFloat(b.commissionPct) || 0,
      maxUses: b.maxUses ? parseInt(b.maxUses, 10) : null,
      validUntil: b.validUntil ? new Date(b.validUntil) : null,
      internalNotes: String(b.internalNotes || '').slice(0, 500),
    },
  });
  await audit.log(req, 'referrer.code.update', { entity: 'ReferralCode', entityId: String(codeId) });
  req.flash('success', 'Codice aggiornato.');
  res.redirect(`/admin/referrals/${existing.referrerId}/edit`);
}));

// ============ CODICI: TOGGLE ============
router.post('/codes/:codeId(\\d+)/toggle', requirePermission('referrals.codes.manage'), A(async (req, res) => {
  const codeId = parseInt(req.params.codeId, 10);
  const c = await prisma.referralCode.findUnique({ where: { id: codeId } });
  if (!c) return res.redirect('/admin/referrals');
  await prisma.referralCode.update({ where: { id: codeId }, data: { active: !c.active } });
  await audit.log(req, 'referrer.code.toggle', { entity: 'ReferralCode', entityId: String(codeId), details: { active: !c.active } });
  res.redirect(`/admin/referrals/${c.referrerId}/edit`);
}));

// ============ CODICI: DELETE ============
router.post('/codes/:codeId(\\d+)/delete', requirePermission('referrals.codes.manage'), A(async (req, res) => {
  const codeId = parseInt(req.params.codeId, 10);
  const c = await prisma.referralCode.findUnique({ where: { id: codeId }, include: { _count: { select: { bookings: true, commissions: true } } } });
  if (!c) return res.redirect('/admin/referrals');
  if (c._count.bookings > 0 || c._count.commissions > 0) {
    req.flash('error', `Codice "${c.code}" usato in ${c._count.bookings} prenotazioni: non eliminabile. Disattivalo invece.`);
    return res.redirect(`/admin/referrals/${c.referrerId}/edit`);
  }
  await prisma.referralCode.delete({ where: { id: codeId } });
  await audit.log(req, 'referrer.code.delete', { entity: 'ReferralCode', entityId: String(codeId) });
  req.flash('success', `Codice "${c.code}" eliminato.`);
  res.redirect(`/admin/referrals/${c.referrerId}/edit`);
}));

// ============ COMMISSIONI: LISTA GLOBALE ============
router.get('/commissions', requirePermission('referrals.commissions.manage'), A(async (req, res) => {
  const dt = require('../lib/datatable');
  const params = dt.parseParams(req, {
    defaultSort: 'createdAt',
    allowedSorts: ['commissionAmt', 'status', 'createdAt'],
  });
  const status = String(req.query.status || '').trim();
  const referrerId = parseInt(req.query.referrerId, 10) || 0;
  params._extra = { status, referrerId: referrerId || '' };
  const where = {};
  if (status) where.status = status;
  if (referrerId) where.referrerId = referrerId;
  if (params.q) where.OR = [
    { paidNote: { contains: params.q, mode: 'insensitive' } },
    { referrer: { firstName: { contains: params.q, mode: 'insensitive' } } },
    { referrer: { lastName: { contains: params.q, mode: 'insensitive' } } },
    { code: { code: { contains: params.q.toUpperCase() } } },
  ];
  const orderBy = {}; orderBy[params.sort] = params.dir;
  const [totalUnfiltered, total, items, refs, counts, pendingSum, paidSum] = await Promise.all([
    prisma.referralCommission.count(),
    prisma.referralCommission.count({ where }),
    prisma.referralCommission.findMany({
      where, orderBy, skip: params.skip, take: params.take,
      include: { referrer: true, code: true, booking: { select: { id: true, customerName: true, customerEmail: true, amount: true } } },
    }),
    prisma.referrer.findMany({ orderBy: { firstName: 'asc' } }),
    prisma.referralCommission.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.referralCommission.aggregate({ _sum: { commissionAmt: true }, where: { status: 'pending' } }),
    prisma.referralCommission.aggregate({ _sum: { commissionAmt: true }, where: { status: 'paid' } }),
  ]);
  const statusCounts = { pending: 0, paid: 0, cancelled: 0 };
  counts.forEach((c) => { statusCounts[c.status] = c._count._all; });
  const totalPages = Math.max(1, Math.ceil(total / params.perPage));
  const links = dt.pageLinks(params.page, totalPages);
  res.render('referrals/commissions', {
    title: 'Commissioni referral',
    items, status, referrerId, refs,
    statusCounts,
    pendingAmount: pendingSum._sum.commissionAmt || 0,
    paidAmount: paidSum._sum.commissionAmt || 0,
    params, total, totalUnfiltered, totalPages, links,
  });
}));

// ============ COMMISSIONE: SEGNA COME PAGATA ============
router.post('/commissions/:id(\\d+)/pay', requirePermission('referrals.commissions.manage'), A(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const note = String((req.body && req.body.paidNote) || '').slice(0, 240);
  const c = await prisma.referralCommission.findUnique({ where: { id } });
  if (!c) return res.redirect('/admin/referrals/commissions');
  await prisma.referralCommission.update({
    where: { id },
    data: { status: 'paid', paidAt: new Date(), paidNote: note },
  });
  await audit.log(req, 'referrer.commission.pay', { entity: 'ReferralCommission', entityId: String(id), details: { amount: c.commissionAmt, note } });
  req.flash('success', `Commissione di ${c.commissionAmt.toFixed(2)}€ segnata come pagata.`);
  res.redirect('/admin/referrals/commissions');
}));

// Ripristina a "pending" se sbagliato
router.post('/commissions/:id(\\d+)/unpay', requirePermission('referrals.commissions.manage'), A(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await prisma.referralCommission.update({ where: { id }, data: { status: 'pending', paidAt: null, paidNote: '' } });
  await audit.log(req, 'referrer.commission.unpay', { entity: 'ReferralCommission', entityId: String(id) });
  req.flash('success', 'Commissione tornata a "in attesa".');
  res.redirect('/admin/referrals/commissions');
}));

module.exports = router;
