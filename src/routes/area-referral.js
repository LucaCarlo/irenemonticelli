// Area PRIVATA referrer: login + dashboard.
// I referrer vengono creati ESCLUSIVAMENTE da Irene dall'admin (/admin/referrals/new).
// Non esiste registrazione pubblica: l'esistenza del programma referral è interna.

const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const prisma = require('../lib/db');
const audit = require('../lib/audit');

const router = express.Router();
const A = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

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

// ---- Rate limit login (anti-bot) ----
const loginLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: 'Demasiados intentos de acceso. Inténtalo en unos minutos.' });

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
    return res.status(401).render('area-referral/login', { title: 'Acceso', error: 'Tu cuenta no está activa. Contacta con la administración.', email });
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

// ============ AGGIORNA IBAN (dal panel del referrer stesso) ============
router.post('/iban', requireReferrer, A(async (req, res) => {
  const iban = String((req.body && req.body.iban) || '').trim().replace(/\s+/g, '').toUpperCase().slice(0, 40);
  await prisma.referrer.update({ where: { id: req.referrer.id }, data: { iban } });
  await audit.log(req, 'referrer.iban.update', { entity: 'Referrer', entityId: String(req.referrer.id) });
  req.session.flashIbanSaved = true;
  res.redirect('/area-referral');
}));

// ============ DASHBOARD (con dati reali) ============
router.get('/', requireReferrer, A(async (req, res) => {
  const referrerId = req.referrer.id;
  const codeIdsRow = await prisma.referralCode.findMany({ where: { referrerId }, select: { id: true } });
  const codeIds = codeIdsRow.map((c) => c.id);

  const [codes, pendingAgg, paidAgg, allCommissions, totalCount,
         clicksTotal, clicksConverted, sourcesData, paidBookingsCount] = await Promise.all([
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
    // Funnel — clic
    codeIds.length ? prisma.referralClick.count({ where: { codeId: { in: codeIds } } }) : 0,
    codeIds.length ? prisma.referralClick.count({ where: { codeId: { in: codeIds }, bookingId: { not: null } } }) : 0,
    // Fonti (top 6)
    codeIds.length ? prisma.referralClick.groupBy({
      by: ['source'],
      where: { codeId: { in: codeIds } },
      _count: { _all: true },
      orderBy: { _count: { source: 'desc' } },
      take: 6,
    }) : [],
    // Booking con codice applicato (anche se NON pagate)
    codeIds.length ? prisma.booking.count({
      where: { referralCodeId: { in: codeIds } },
    }) : 0,
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

  const ibanSaved = !!req.session.flashIbanSaved;
  if (ibanSaved) delete req.session.flashIbanSaved;

  // URL pubblico per costruire i link di share
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const baseUrl = `${proto}://${host}`;

  // KPI funnel
  const paidCount = paidAgg._count._all;
  const funnel = {
    clicks: clicksTotal,
    applied: paidBookingsCount,        // booking con codice applicato (qualsiasi stato)
    paid: paidCount,                    // commissioni status=paid o pending (acquisti pagati)
    conversionRate: clicksTotal > 0 ? +((paidCount + pendingAgg._count._all) / clicksTotal * 100).toFixed(1) : 0,
  };
  const totalSources = sourcesData.reduce((s, x) => s + x._count._all, 0) || 1;
  const sources = sourcesData.map((x) => ({
    source: x.source || 'direct',
    count: x._count._all,
    pct: +((x._count._all / totalSources) * 100).toFixed(1),
  }));

  res.render('area-referral/dashboard', {
    title: 'Panel',
    referrer: req.referrer,
    codes,
    baseUrl,
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
    funnel,
    sources,
    ibanSaved,
  });
}));

module.exports = router;
