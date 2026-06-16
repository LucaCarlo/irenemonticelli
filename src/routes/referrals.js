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
  const shareUrl = `${proto}://${host}/pro-dance?ref=${code.code}`;
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
    `\nCompártelo con tu comunidad. Tienes dos opciones:\n\n` +
    `1) Comparte el CÓDIGO (${code.code}) — lo introducen manualmente en el checkout.\n` +
    `2) Comparte el ENLACE personalizado — se aplica automáticamente:\n   ${shareUrl}\n\n` +
    `Por cada venta usando tu código (o tu enlace) ganarás tu comisión automáticamente.\n` +
    `Accede a tu panel personal para ver clics, ventas y ganancias:\n${dashboardUrl}\n\n` +
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
      <div style="background:#fafbfc;border:1px solid var(--line,#e6e8ed);border-radius:12px;padding:20px;margin:22px 0">
        <p style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#7a5800;font-weight:700;margin:0 0 10px">🔗 Tu enlace personalizado</p>
        <p style="margin:0 0 6px;font-size:13.5px;color:#5a5e6a;line-height:1.55">Si tu seguidor abre este enlace, el código se aplica automáticamente en el checkout (válido 30 días):</p>
        <code style="display:inline-block;background:#fff;border:1px solid #ead9a8;padding:10px 14px;border-radius:8px;font-family:Manrope,monospace;font-size:13px;color:#1c1f26;word-break:break-all;user-select:all">${escapeHtml(shareUrl)}</code>
      </div>
      <p style="font-size:14.5px;line-height:1.65;color:#5a5e6a">
        Cada vez que alguien reserve usando tu código <strong>o tu enlace</strong>, se generará automáticamente una comisión.
        Puedes hacer un seguimiento en tiempo real de clics, ventas y ganancias:
      </p>
      <p style="margin:22px 0;text-align:center">
        <a href="${dashboardUrl}" style="display:inline-block;background:#1c1f26;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;letter-spacing:.04em">Ir a mi panel →</a>
      </p>
      <p style="font-size:12.5px;color:#7a8190;line-height:1.6;margin-top:24px">
        💡 <em>Consejo:</em> guarda esta email para tener siempre a mano tu código y tu enlace.
      </p>
      <p style="font-size:12px;color:#888;margin-top:24px">— ${escapeHtml(siteName)}</p>
    </div>`;

  await sendMail({
    to: referrer.email,
    subject: `🎫 Tu nuevo código: ${code.code} · ${siteName}`,
    text, html,
    kind: 'referrer.code_created', entity: 'ReferralCode', entityId: code.id,
  });
}

// Email inviata quando Irene crea il referrer dall'admin: include le credenziali per accedere.
async function sendWelcomeEmail(referrer, tempPassword, req) {
  const s = await settings.all();
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const loginUrl = `${proto}://${host}/area-referral/login`;
  const siteName = s.site_name || 'Irene Monticelli';

  const text =
    `Hola ${referrer.firstName},\n\n` +
    `Te damos la bienvenida al Programa de Referidos de ${siteName}.\n\n` +
    `Irene te ha activado una cuenta personal donde podrás ver, en tiempo real, las inscripciones que generes y tus comisiones.\n\n` +
    `Tus credenciales de acceso:\n` +
    `Email: ${referrer.email}\n` +
    `Contraseña: ${tempPassword}\n\n` +
    `Acceso al panel: ${loginUrl}\n\n` +
    `En las próximas horas (o días) recibirás un segundo correo con tu(s) código(s) de descuento personal(es) listos para compartir.\n\n` +
    `— ${siteName}`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1c1f26;max-width:560px">
      <h2 style="color:#c8970a;font-family:Georgia,serif;font-weight:500;font-size:26px;margin:0 0 14px">Bienvenida al Programa de Referidos</h2>
      <p>Hola <strong>${escapeHtml(referrer.firstName)}</strong>,</p>
      <p>Irene te ha activado una cuenta personal en el <strong>Programa de Referidos de ${escapeHtml(siteName)}</strong>. Desde tu panel privado podrás ver en tiempo real las inscripciones que generes y tus comisiones.</p>
      <div style="background:#fffbe8;border:1px solid #ead9a8;border-radius:10px;padding:20px;margin:22px 0">
        <p style="margin:0 0 12px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#7a5800;font-weight:700">Tus credenciales</p>
        <p style="margin:8px 0">Email: <code style="background:#fff;padding:4px 10px;border-radius:5px;font-family:Manrope,monospace">${escapeHtml(referrer.email)}</code></p>
        <p style="margin:8px 0">Contraseña: <code style="background:#fff;padding:4px 10px;border-radius:5px;font-family:Manrope,monospace;letter-spacing:.5px">${escapeHtml(tempPassword)}</code></p>
      </div>
      <p style="margin:22px 0;text-align:center">
        <a href="${loginUrl}" style="display:inline-block;background:#1c1f26;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;letter-spacing:.04em">Acceder al panel →</a>
      </p>
      <p style="font-size:13.5px;color:#5a5e6a;line-height:1.65">Recibirás un segundo correo con tu(s) código(s) de descuento personal(es) en cuanto Irene los active.</p>
      <p style="font-size:12.5px;color:#7a8190;line-height:1.6;margin-top:24px">💡 <em>Consejo:</em> guarda esta email para tener siempre a mano tus credenciales.</p>
      <p style="font-size:12px;color:#888;margin-top:24px">— ${escapeHtml(siteName)}</p>
    </div>`;

  await sendMail({
    to: referrer.email,
    subject: `Bienvenida al Programa de Referidos · ${siteName}`,
    text, html,
    kind: 'referrer.welcome', entity: 'Referrer', entityId: referrer.id,
  });
}

// Alias retro-compat per chiamate esistenti (reset password, ecc.).
const sendApprovalEmail = sendWelcomeEmail;

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

  // Aggrega click + commissioni per referrer mostrato in pagina
  const refIds = referrers.map((r) => r.id);
  let analyticsByRef = {};
  if (refIds.length) {
    const [clicksByRef, paidByRef] = await Promise.all([
      prisma.$queryRawUnsafe(
        `SELECT c.referrerId as referrerId, COUNT(rc.id) as clicks
         FROM ReferralCode c
         LEFT JOIN ReferralClick rc ON rc.codeId = c.id
         WHERE c.referrerId IN (${refIds.join(',')})
         GROUP BY c.referrerId`
      ),
      prisma.referralCommission.groupBy({
        by: ['referrerId'],
        where: { referrerId: { in: refIds }, status: { in: ['pending', 'paid'] } },
        _count: { _all: true },
      }),
    ]);
    refIds.forEach((id) => { analyticsByRef[id] = { clicks: 0, paid: 0, conv: 0 }; });
    (clicksByRef || []).forEach((r) => { analyticsByRef[r.referrerId] = { ...analyticsByRef[r.referrerId], clicks: Number(r.clicks) }; });
    (paidByRef || []).forEach((r) => {
      analyticsByRef[r.referrerId].paid = r._count._all;
    });
    Object.keys(analyticsByRef).forEach((id) => {
      const a = analyticsByRef[id];
      a.conv = a.clicks > 0 ? +((a.paid / a.clicks) * 100).toFixed(1) : 0;
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / params.perPage));
  const links = dt.pageLinks(params.page, totalPages);

  res.render('referrals/list', {
    title: 'Referral',
    referrers, status, statusCounts, analyticsByRef,
    params, total, totalUnfiltered, totalPages, links,
  });
}));

// ============ NUOVO REFERRER (form) ============
router.get('/new', requirePermission('referrals.manage'), (req, res) => {
  res.render('referrals/new', { title: 'Nuovo referrer', errors: [], form: {} });
});

// ============ NUOVO REFERRER (create) — genera password + email credenziali ============
router.post('/', requirePermission('referrals.manage'), A(async (req, res) => {
  const b = req.body || {};
  const form = {
    firstName: String(b.firstName || '').trim(),
    lastName: String(b.lastName || '').trim(),
    email: String(b.email || '').toLowerCase().trim(),
    phone: String(b.phone || '').trim(),
    iban: String(b.iban || '').trim().replace(/\s+/g, '').toUpperCase(),
    internalNotes: String(b.internalNotes || '').trim(),
  };
  const errors = [];
  if (form.firstName.length < 2) errors.push('Nome obbligatorio.');
  if (form.lastName.length < 2) errors.push('Cognome obbligatorio.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.push('Email non valida.');
  if (errors.length) {
    return res.status(400).render('referrals/new', { title: 'Nuovo referrer', errors, form });
  }
  const existing = await prisma.referrer.findUnique({ where: { email: form.email } });
  if (existing) {
    return res.status(400).render('referrals/new', {
      title: 'Nuovo referrer',
      errors: ['Esiste già un referrer con questa email.'],
      form,
    });
  }
  const tempPassword = genTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  const created = await prisma.referrer.create({
    data: {
      firstName: form.firstName.slice(0, 80),
      lastName: form.lastName.slice(0, 80),
      email: form.email.slice(0, 200),
      phone: form.phone.slice(0, 50),
      iban: form.iban.slice(0, 40),
      internalNotes: form.internalNotes.slice(0, 2000),
      status: 'approved',
      passwordHash,
      mustChangePw: false,
      approvedAt: new Date(),
      approvedById: req.user.id,
    },
  });
  let emailOk = true, emailErr = '';
  try { await sendWelcomeEmail(created, tempPassword, req); }
  catch (e) { emailOk = false; emailErr = e.message; }
  await audit.log(req, 'referrer.create', { entity: 'Referrer', entityId: String(created.id), details: { emailSent: emailOk } });
  if (emailOk) {
    req.flash('success', `Referrer ${created.firstName} ${created.lastName} creato. Email con credenziali inviata a ${created.email}.`);
  } else {
    req.flash('error', `Referrer creato ma invio email fallito (${emailErr}). Password temporanea: ${tempPassword}`);
  }
  res.redirect('/admin/referrals');
}));

// ============ DETTAGLIO ============
router.get('/:id(\\d+)/edit', requirePermission('referrals.view'), A(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const r = await prisma.referrer.findUnique({
    where: { id },
    include: {
      codes: {
        orderBy: { createdAt: 'desc' },
        include: { plans: { select: { id: true, slug: true, name: true } } },
      },
      _count: { select: { commissions: true } },
    },
  });
  if (!r) return res.redirect('/admin/referrals');
  const plans = await prisma.plan.findMany({
    where: { active: true },
    orderBy: { sort: 'asc' },
    select: { id: true, slug: true, name: true },
  });
  const codeIds = r.codes.map((c) => c.id);

  // Statistiche commissioni + funnel
  const [pendingAgg, paidAgg, totalClicks, convertedClicks, sourcesData, appliedBookingsCount, clicksByCode] = await Promise.all([
    prisma.referralCommission.aggregate({ where: { referrerId: id, status: 'pending' }, _sum: { commissionAmt: true } }),
    prisma.referralCommission.aggregate({ where: { referrerId: id, status: 'paid' }, _sum: { commissionAmt: true } }),
    codeIds.length ? prisma.referralClick.count({ where: { codeId: { in: codeIds } } }) : 0,
    codeIds.length ? prisma.referralClick.count({ where: { codeId: { in: codeIds }, bookingId: { not: null } } }) : 0,
    codeIds.length ? prisma.referralClick.groupBy({
      by: ['source'], where: { codeId: { in: codeIds } },
      _count: { _all: true }, orderBy: { _count: { source: 'desc' } }, take: 6,
    }) : [],
    codeIds.length ? prisma.booking.count({ where: { referralCodeId: { in: codeIds } } }) : 0,
    codeIds.length ? prisma.referralClick.groupBy({
      by: ['codeId'], where: { codeId: { in: codeIds } },
      _count: { _all: true },
    }) : [],
  ]);
  const clicksMap = {};
  clicksByCode.forEach((x) => { clicksMap[x.codeId] = x._count._all; });
  r.codes.forEach((c) => { c.clicks = clicksMap[c.id] || 0; });

  const totalSources = sourcesData.reduce((s, x) => s + x._count._all, 0) || 1;
  const sources = sourcesData.map((x) => ({
    source: x.source || 'direct',
    count: x._count._all,
    pct: +((x._count._all / totalSources) * 100).toFixed(1),
  }));
  const paidCount = paidAgg._sum.commissionAmt > 0 ? r._count.commissions : 0; // approx; below recompute
  const stats = {
    pendingAmount: pendingAgg._sum.commissionAmt || 0,
    paidAmount: paidAgg._sum.commissionAmt || 0,
    totalCommissions: r._count.commissions,
    clicks: totalClicks,
    convertedClicks,
    applied: appliedBookingsCount,
    paid: r._count.commissions,
    conversionRate: totalClicks > 0 ? +(r._count.commissions / totalClicks * 100).toFixed(1) : 0,
  };
  res.render('referrals/form', { title: `Referrer ${r.firstName} ${r.lastName}`, referrer: r, stats, sources, plans });
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
      iban: String(b.iban || '').trim().replace(/\s+/g, '').toUpperCase().slice(0, 40),
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
  // Auto-iscrizione newsletter (i referrer approvati partecipano al programma)
  try {
    const { ensureSubscriber } = require('../lib/newsletter');
    ensureSubscriber({ email: ref.email, name: (ref.firstName + ' ' + ref.lastName).trim(), source: 'manual' });
  } catch (e) { /* best-effort */ }
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
  // Pacchetti su cui il coupon è applicabile (array di Plan.id). Vuoto = tutti.
  let planIds = Array.isArray(b.planIds) ? b.planIds : (b.planIds ? [b.planIds] : []);
  planIds = planIds.map((v) => parseInt(v, 10)).filter((n) => Number.isInteger(n));
  // Se l'admin ha spuntato TUTTI i pack attivi, normalizza a [] = "vale per tutti"
  // (così un futuro pack nuovo viene incluso automaticamente).
  const totalActivePlans = await prisma.plan.count({ where: { active: true } });
  if (planIds.length >= totalActivePlans) planIds = [];
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
      plans: planIds.length ? { connect: planIds.map((id) => ({ id })) } : undefined,
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
  // Pacchetti applicabili: set completo (vuoto = vale per tutti).
  let planIds = Array.isArray(b.planIds) ? b.planIds : (b.planIds ? [b.planIds] : []);
  planIds = planIds.map((v) => parseInt(v, 10)).filter((n) => Number.isInteger(n));
  // Se l'admin ha lasciato tutti i pack attivi spuntati → normalizza a [] (vale per tutti)
  const totalActivePlansU = await prisma.plan.count({ where: { active: true } });
  if (planIds.length >= totalActivePlansU) planIds = [];
  await prisma.referralCode.update({
    where: { id: codeId },
    data: {
      discountType: b.discountType === 'fixed' ? 'fixed' : 'percent',
      discountValue: parseFloat(b.discountValue) || 0,
      commissionPct: parseFloat(b.commissionPct) || 0,
      maxUses: b.maxUses ? parseInt(b.maxUses, 10) : null,
      validUntil: b.validUntil ? new Date(b.validUntil) : null,
      internalNotes: String(b.internalNotes || '').slice(0, 500),
      plans: { set: planIds.map((id) => ({ id })) },
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

// ============ COUPON: LISTA GLOBALE (tutti i ReferralCode con relativo referrer) ============
router.get('/coupons', requirePermission('referrals.codes.manage'), A(async (req, res) => {
  const dt = require('../lib/datatable');
  const params = dt.parseParams(req, {
    defaultSort: 'createdAt',
    allowedSorts: ['code', 'discountValue', 'commissionPct', 'usedCount', 'active', 'createdAt'],
  });
  const status = String(req.query.status || '').trim(); // all | active | inactive | exhausted | expired

  // Costruzione where
  const where = {};
  if (status === 'active') where.active = true;
  if (status === 'inactive') where.active = false;
  if (params.q) {
    where.OR = [
      { code: { contains: params.q.toUpperCase() } },
      { referrer: { firstName: { contains: params.q, mode: 'insensitive' } } },
      { referrer: { lastName: { contains: params.q, mode: 'insensitive' } } },
      { referrer: { email: { contains: params.q, mode: 'insensitive' } } },
    ];
  }

  const orderBy = {}; orderBy[params.sort] = params.dir;
  const [totalUnfiltered, total, codes, allPlans] = await Promise.all([
    prisma.referralCode.count(),
    prisma.referralCode.count({ where }),
    prisma.referralCode.findMany({
      where,
      include: {
        referrer: { select: { id: true, firstName: true, lastName: true, email: true, status: true } },
        plans: { select: { id: true, slug: true, name: true } },
        _count: { select: { bookings: true, commissions: true, clicks: true } },
      },
      orderBy,
      skip: params.skip,
      take: params.take,
    }),
    prisma.plan.count({ where: { active: true } }),
  ]);

  // KPI aggregati su tutti i coupon (non solo paginati)
  const kpi = await prisma.referralCode.aggregate({
    _count: { _all: true },
    _sum: { usedCount: true },
  });
  const activeCount = await prisma.referralCode.count({ where: { active: true } });

  const totalPages = Math.max(1, Math.ceil(total / params.perPage));
  const links = dt.pageLinks(params.page, totalPages);
  params._extra = { status };

  res.render('referrals/coupons', {
    title: 'Coupon',
    codes, status, params, total, totalUnfiltered, totalPages, links,
    allPlans, kpi: { totalCodes: kpi._count._all, activeCodes: activeCount, totalUses: kpi._sum.usedCount || 0 },
  });
}));

// ============ COUPON: DETTAGLIO + lista clienti che l'hanno usato ============
router.get('/coupons/:id(\\d+)', requirePermission('referrals.codes.manage'), A(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const code = await prisma.referralCode.findUnique({
    where: { id },
    include: {
      referrer: true,
      plans: { select: { id: true, slug: true, name: true } },
      _count: { select: { bookings: true, commissions: true, clicks: true } },
    },
  });
  if (!code) return res.redirect('/admin/referrals/coupons');

  // Tutte le booking che hanno usato questo coupon
  const bookings = await prisma.booking.findMany({
    where: { referralCodeId: id },
    include: {
      plan: { select: { name: true, slug: true } },
      commission: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Aggregati
  const stats = {
    totalRevenue: bookings.filter((b) => b.paymentStatus === 'paid').reduce((s, b) => s + (b.amount || 0), 0),
    totalDiscount: bookings.filter((b) => b.paymentStatus === 'paid').reduce((s, b) => s + (b.referralDiscount || 0), 0),
    totalCommission: bookings.filter((b) => b.commission).reduce((s, b) => s + (b.commission.commissionAmt || 0), 0),
    paidBookings: bookings.filter((b) => b.paymentStatus === 'paid').length,
    pendingBookings: bookings.filter((b) => b.paymentStatus !== 'paid').length,
  };

  res.render('referrals/coupon_detail', {
    title: 'Coupon ' + code.code,
    code, bookings, stats,
  });
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
