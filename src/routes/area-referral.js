// Area pubblica referrer: registrazione + login + dashboard.
// La registrazione crea un Referrer in status=pending, Irene lo approva da
// /admin/referrals e il sistema invia email con credenziali generate.

const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const prisma = require('../lib/db');
const audit = require('../lib/audit');
const settings = require('../lib/settings');
const { sendMail } = require('../lib/mailer');

const router = express.Router();
const A = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ---- Middleware: carica referrer dalla sessione ----
async function loadReferrer(req, res, next) {
  res.locals.referrer = null;
  if (req.session && req.session.referrerId) {
    const ref = await prisma.referrer.findUnique({ where: { id: req.session.referrerId } });
    if (ref && ref.status === 'approved') {
      req.referrer = ref;
      res.locals.referrer = ref;
    } else {
      // disattivato o eliminato → distruggi sessione
      delete req.session.referrerId;
    }
  }
  next();
}

function requireReferrer(req, res, next) {
  if (!req.referrer) {
    if (req.method === 'GET') req.session.refReturnTo = req.originalUrl;
    return res.redirect('/area-referral/login');
  }
  next();
}

router.use(loadReferrer);

// ---- Rate limit per registrazione/login (anti-bot) ----
const regLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 8, standardHeaders: true, legacyHeaders: false,
  message: 'Demasiadas solicitudes de registro. Inténtalo más tarde.' });
const loginLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: 'Demasiados intentos de acceso. Inténtalo en unos minutos.' });

// ============ REGISTRAZIONE ============
router.get('/register', (req, res) => {
  if (req.referrer) return res.redirect('/area-referral');
  res.render('area-referral/register', { title: 'Conviértete en referido', errors: [], form: {}, submitted: false });
});

router.post('/register', regLimiter, A(async (req, res) => {
  const b = req.body || {};
  const form = {
    firstName: String(b.firstName || '').trim(),
    lastName: String(b.lastName || '').trim(),
    email: String(b.email || '').toLowerCase().trim(),
    phone: String(b.phone || '').trim(),
    notes: String(b.notes || '').trim(),
  };
  const errors = [];
  if (form.firstName.length < 2) errors.push('El nombre es obligatorio.');
  if (form.lastName.length < 2) errors.push('Los apellidos son obligatorios.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.push('Email no válido.');
  if (!b.privacy) errors.push('Debes aceptar la política de privacidad.');

  if (errors.length) {
    return res.status(400).render('area-referral/register', { title: 'Conviértete en referido', errors, form, submitted: false });
  }

  // Email già usata?
  const existing = await prisma.referrer.findUnique({ where: { email: form.email } });
  if (existing) {
    return res.status(400).render('area-referral/register', {
      title: 'Conviértete en referido',
      errors: ['Ya existe una solicitud o cuenta con este email. Si has olvidado la contraseña contacta con la administración.'],
      form, submitted: false,
    });
  }

  await prisma.referrer.create({
    data: {
      firstName: form.firstName.slice(0, 80),
      lastName: form.lastName.slice(0, 80),
      email: form.email.slice(0, 200),
      phone: form.phone.slice(0, 50),
      notes: form.notes.slice(0, 2000),
      status: 'pending',
    },
  });

  await audit.log(req, 'referrer.register', { details: { email: form.email } });

  // Email di conferma al referrer ("solicitud recibida, en espera") — best-effort
  try {
    const s = await settings.all();
    const siteName = s.site_name || 'Irene Monticelli';
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#1c1f26;max-width:560px">
        <h2 style="color:#c8970a;font-family:Georgia,serif;font-weight:500;font-size:26px;margin:0 0 14px">¡Hemos recibido tu solicitud!</h2>
        <p>Hola <strong>${escapeHtml(form.firstName)}</strong>,</p>
        <p>Gracias por querer formar parte del <strong>Programa de Referidos de ${escapeHtml(siteName)}</strong>.</p>
        <div style="background:#fffbe8;border:1px solid #ead9a8;border-radius:10px;padding:18px;margin:18px 0">
          <p style="margin:0 0 6px"><strong>¿Y ahora qué?</strong></p>
          <p style="margin:6px 0;font-size:14px;line-height:1.6">
            Irene revisará personalmente tu solicitud. En cuanto sea <strong style="color:#1b6b3e">aprobada</strong>,
            recibirás un segundo correo con tus credenciales de acceso al panel privado.
          </p>
          <p style="margin:6px 0;font-size:13px;color:#7a5800">
            ⏳ El proceso suele tardar entre 1 y 5 días laborables.
          </p>
        </div>
        <p style="font-size:13.5px;color:#5a5e6a;line-height:1.6">
          No tienes que hacer nada más por ahora. Si tienes alguna duda urgente puedes escribir a
          <a href="mailto:info@irenemonticelli.com" style="color:#c8970a">info@irenemonticelli.com</a>.
        </p>
        <p style="font-size:12px;color:#888;margin-top:24px">— ${escapeHtml(siteName)}</p>
      </div>`;
    const text =
      `Hola ${form.firstName},\n\n` +
      `¡Hemos recibido tu solicitud para el Programa de Referidos de ${siteName}!\n\n` +
      `Irene revisará personalmente tu solicitud. En cuanto sea aprobada, recibirás un segundo correo con tus credenciales de acceso al panel privado.\n\n` +
      `El proceso suele tardar entre 1 y 5 días laborables.\n\n` +
      `Si tienes alguna duda urgente puedes escribir a info@irenemonticelli.com.\n\n` +
      `— ${siteName}`;
    await sendMail({
      to: form.email,
      subject: `Tu solicitud al programa de referidos · ${siteName}`,
      text, html,
    });
  } catch (e) {
    console.error('[area-referral] email conferma referrer fallita:', e.message);
  }

  // Notifica admin (best-effort)
  try {
    const s = await settings.all();
    const adminEmail = s.contact_email || s.smtp_from_email || '';
    if (adminEmail) {
      const adminUrl = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.headers.host}/admin/referrals?status=pending`;
      await sendMail({
        to: adminEmail,
        subject: `[Referral] Nuova richiesta da ${form.firstName} ${form.lastName}`,
        text: `Nuova richiesta di adesione referral:\n\nNome: ${form.firstName} ${form.lastName}\nEmail: ${form.email}\nTelefono: ${form.phone}\n\nMessaggio:\n${form.notes || '(nessuno)'}\n\nApprova o rifiuta su: ${adminUrl}`,
        html: `
          <div style="font-family:Arial,Helvetica,sans-serif;color:#1c1f26;max-width:560px">
            <h2 style="color:#c8970a">Nuova richiesta referral</h2>
            <p><strong>Nome:</strong> ${escapeHtml(form.firstName)} ${escapeHtml(form.lastName)}</p>
            <p><strong>Email:</strong> ${escapeHtml(form.email)}</p>
            <p><strong>Telefono:</strong> ${escapeHtml(form.phone || '—')}</p>
            ${form.notes ? `<p><strong>Messaggio:</strong></p><p style="background:#fafbfc;padding:12px;border-radius:8px;white-space:pre-wrap">${escapeHtml(form.notes)}</p>` : ''}
            <p style="margin:18px 0"><a href="${adminUrl}" style="background:#e0aa00;color:#1c1408;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Vai alle richieste pending →</a></p>
          </div>`,
      });
    }
  } catch (e) {
    console.error('[area-referral] notifica admin fallita:', e.message);
  }

  res.render('area-referral/register', { title: 'Conviértete en referido', errors: [], form: {}, submitted: true });
}));

// ============ LOGIN ============
router.get('/login', (req, res) => {
  if (req.referrer) return res.redirect('/area-referral');
  res.render('area-referral/login', { title: 'Acceso', error: null, email: '' });
});

router.post('/login', loginLimiter, A(async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  const password = String(req.body.password || '');
  const ref = await prisma.referrer.findUnique({ where: { email } });

  if (!ref || !ref.passwordHash) {
    await audit.log(req, 'referrer.login.failed', { details: { email, reason: 'not-found' } });
    return res.status(401).render('area-referral/login', { title: 'Acceso', error: 'Credenciales no válidas.', email });
  }
  if (ref.status !== 'approved') {
    await audit.log(req, 'referrer.login.failed', { details: { email, reason: 'status:' + ref.status } });
    var msg = ref.status === 'pending'
      ? 'Tu solicitud aún está pendiente de aprobación. Recibirás un correo cuando esté activa.'
      : 'Tu cuenta ha sido desactivada. Contacta con la administración.';
    return res.status(401).render('area-referral/login', { title: 'Acceso', error: msg, email });
  }
  const ok = await bcrypt.compare(password, ref.passwordHash);
  if (!ok) {
    await audit.log(req, 'referrer.login.failed', { details: { email, reason: 'wrong-password' } });
    return res.status(401).render('area-referral/login', { title: 'Acceso', error: 'Credenciales no válidas.', email });
  }

  await prisma.referrer.update({ where: { id: ref.id }, data: { lastLoginAt: new Date() } });
  req.session.referrerId = ref.id;
  await audit.log(req, 'referrer.login.success', { entity: 'Referrer', entityId: String(ref.id) });

  const dest = req.session.refReturnTo || '/area-referral';
  delete req.session.refReturnTo;
  res.redirect(dest);
}));

router.post('/logout', A(async (req, res) => {
  if (req.referrer) await audit.log(req, 'referrer.logout', { entity: 'Referrer', entityId: String(req.referrer.id) });
  delete req.session.referrerId;
  res.redirect('/area-referral/login');
}));

// ============ DASHBOARD (con dati reali) ============
router.get('/', requireReferrer, A(async (req, res) => {
  const referrerId = req.referrer.id;
  const [codes, pendingAgg, paidAgg, allCommissions, totalCount] = await Promise.all([
    prisma.referralCode.findMany({ where: { referrerId }, orderBy: { createdAt: 'desc' } }),
    prisma.referralCommission.aggregate({ where: { referrerId, status: 'pending' }, _sum: { commissionAmt: true }, _count: { _all: true } }),
    prisma.referralCommission.aggregate({ where: { referrerId, status: 'paid' }, _sum: { commissionAmt: true }, _count: { _all: true } }),
    prisma.referralCommission.findMany({
      where: { referrerId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { code: true, booking: { select: { customerName: true, amount: true, createdAt: true } } },
    }),
    prisma.referralCommission.count({ where: { referrerId } }),
  ]);

  // Serie mensile per Chart.js (ultimi 6 mesi)
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('es-ES', { month: 'short' }),
      year: d.getFullYear(),
      month: d.getMonth(),
    });
  }
  const monthlyTotals = {};
  months.forEach((m) => { monthlyTotals[m.key] = 0; });
  // Tutte le commissioni degli ultimi 6 mesi per il grafico
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const allChartData = await prisma.referralCommission.findMany({
    where: { referrerId, createdAt: { gte: sixMonthsAgo } },
    select: { commissionAmt: true, createdAt: true },
  });
  allChartData.forEach((c) => {
    const k = `${c.createdAt.getFullYear()}-${String(c.createdAt.getMonth() + 1).padStart(2, '0')}`;
    if (monthlyTotals[k] !== undefined) monthlyTotals[k] += c.commissionAmt;
  });
  const chart = {
    labels: months.map((m) => m.label),
    data: months.map((m) => +monthlyTotals[m.key].toFixed(2)),
  };

  res.render('area-referral/dashboard', {
    title: 'Panel',
    referrer: req.referrer,
    codes,
    stats: {
      totalCommissions: totalCount,
      pendingAmount: pendingAgg._sum.commissionAmt || 0,
      pendingCount: pendingAgg._count._all,
      paidAmount: paidAgg._sum.commissionAmt || 0,
      paidCount: paidAgg._count._all,
      totalEarnings: (pendingAgg._sum.commissionAmt || 0) + (paidAgg._sum.commissionAmt || 0),
    },
    commissions: allCommissions,
    chart,
  });
}));

module.exports = router;
