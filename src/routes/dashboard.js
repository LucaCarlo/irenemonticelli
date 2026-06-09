const express = require('express');
const prisma = require('../lib/db');
const settings = require('../lib/settings');

const router = express.Router();

router.get('/', async (req, res) => {
  const now = new Date();
  const last30 = new Date(now.getTime() - 30 * 86400 * 1000);
  const last7 = new Date(now.getTime() - 7 * 86400 * 1000);

  const [
    bookingsTotal, bookingsConfirmed, bookingsPending, bookings30,
    revenue30Arr, revenueAll,
    newMessages, totalMessages,
    pageviews7, uniqueVisitors7,
    activeSubscribers,
    recentBookings, recentMessages, recentAudit,
    activeEvents,
    s,
    mediaCount, mediaAgg,
    pageviewsForChart, bookingsForChart,
  ] = await Promise.all([
    prisma.booking.count(),
    prisma.booking.count({ where: { status: 'confirmed' } }),
    prisma.booking.count({ where: { status: 'pending' } }),
    prisma.booking.count({ where: { createdAt: { gte: last30 } } }),
    prisma.booking.aggregate({ _sum: { amount: true }, where: { paymentStatus: 'paid', createdAt: { gte: last30 } } }),
    prisma.booking.aggregate({ _sum: { amount: true }, where: { paymentStatus: 'paid' } }),
    prisma.contactMessage.count({ where: { status: 'new' } }),
    prisma.contactMessage.count(),
    prisma.pageView.count({ where: { createdAt: { gte: last7 } } }),
    prisma.pageView.groupBy({ by: ['visitorId'], where: { createdAt: { gte: last7 }, visitorId: { not: '' } }, _count: { _all: true } }),
    prisma.newsletterSubscriber.count({ where: { status: 'active' } }),
    prisma.booking.findMany({ orderBy: { id: 'desc' }, take: 6, include: { plan: { select: { name: true } }, event: { select: { title: true } } } }),
    prisma.contactMessage.findMany({ orderBy: { id: 'desc' }, take: 4 }),
    prisma.auditLog.findMany({ orderBy: { id: 'desc' }, take: 8 }),
    prisma.event.findMany({ where: { active: true }, orderBy: { startDate: 'asc' }, include: { _count: { select: { bookings: true } } }, take: 3 }),
    settings.all(),
    prisma.media.count(),
    prisma.media.aggregate({ _sum: { sizeBytes: true, smallBytes: true } }),
    prisma.pageView.findMany({ where: { createdAt: { gte: last30 } }, select: { createdAt: true } }),
    prisma.booking.findMany({ where: { createdAt: { gte: last30 } }, select: { createdAt: true } }),
  ]);

  const revenue30 = revenue30Arr._sum.amount || 0;
  const revenueAllAmount = revenueAll._sum.amount || 0;

  // Costruisci serie giornaliere per 30 giorni
  const days = [];
  const dayPv = {}, dayBk = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400 * 1000);
    const k = d.toISOString().slice(0, 10);
    days.push(k);
    dayPv[k] = 0;
    dayBk[k] = 0;
  }
  pageviewsForChart.forEach((v) => {
    const k = v.createdAt.toISOString().slice(0, 10);
    if (dayPv[k] !== undefined) dayPv[k]++;
  });
  bookingsForChart.forEach((b) => {
    const k = b.createdAt.toISOString().slice(0, 10);
    if (dayBk[k] !== undefined) dayBk[k]++;
  });
  const chart = {
    labels: days.map((d) => d.slice(5)), // MM-DD
    pageviews: days.map((d) => dayPv[d]),
    bookings: days.map((d) => dayBk[d]),
  };

  const configAlerts = [];
  if (!(s.bookings_enabled === '1' || s.bookings_enabled === 'true')) {
    configAlerts.push({ type: 'warn', msg: 'Le prenotazioni online sono <strong>disattivate</strong>. Attivale in Impostazioni → Generali.', href: '/admin/settings?tab=general' });
  }
  if (!s.stripe_secret_key || !s.stripe_webhook_secret) {
    configAlerts.push({ type: 'error', msg: 'Stripe non completamente configurato (mancano chiavi o webhook).', href: '/admin/settings?tab=stripe' });
  }
  if (!s.smtp_host || !s.smtp_user) {
    configAlerts.push({ type: 'warn', msg: 'SMTP non configurato — niente email di conferma né newsletter.', href: '/admin/settings?tab=smtp' });
  }

  res.render('dashboard', {
    title: 'Dashboard',
    kpi: {
      bookingsTotal, bookingsConfirmed, bookingsPending, bookings30,
      revenue30, revenueAllAmount,
      newMessages, totalMessages,
      pageviews7, uniqueVisitors7: uniqueVisitors7.length,
      activeSubscribers,
      mediaCount,
      storageBytes: (mediaAgg._sum.sizeBytes || 0) + (mediaAgg._sum.smallBytes || 0),
    },
    chart,
    recentBookings, recentMessages, recentAudit,
    activeEvents,
    configAlerts,
  });
});

module.exports = router;
