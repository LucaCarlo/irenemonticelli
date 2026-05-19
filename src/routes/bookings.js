const express = require('express');
const prisma = require('../lib/db');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();
const A = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const STATUSES = ['pending', 'confirmed', 'cancelled'];

router.use(requirePermission('bookings.manage'));

router.get('/', A(async (req, res) => {
  const status = STATUSES.includes(req.query.status) ? req.query.status : '';
  const where = status ? { status } : {};
  const bookings = await prisma.booking.findMany({
    where,
    include: { plan: true, event: true },
    orderBy: { createdAt: 'desc' },
  });
  const counts = await prisma.booking.groupBy({ by: ['status'], _count: { _all: true } });
  res.render('bookings/list', { title: 'Prenotazioni', bookings, status, STATUSES, counts });
}));

router.get('/calendar', A(async (req, res) => {
  const now = new Date();
  let y = parseInt(req.query.y, 10) || now.getFullYear();
  let m = parseInt(req.query.m, 10); // 1-12
  if (!(m >= 1 && m <= 12)) m = now.getMonth() + 1;
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  const bookings = await prisma.booking.findMany({
    where: { createdAt: { gte: start, lt: end } },
    include: { plan: true },
    orderBy: { createdAt: 'asc' },
  });
  const byDay = {};
  bookings.forEach((b) => {
    const d = new Date(b.createdAt).getDate();
    (byDay[d] = byDay[d] || []).push(b);
  });
  const firstDow = (start.getDay() + 6) % 7; // lun=0
  const daysInMonth = new Date(y, m, 0).getDate();
  const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  res.render('bookings/calendar', {
    title: 'Calendario prenotazioni',
    y, m, byDay, firstDow, daysInMonth, prev, next, total: bookings.length,
  });
}));

router.get('/new', A(async (req, res) => {
  const [plans, events] = await Promise.all([
    prisma.plan.findMany({ orderBy: { sort: 'asc' } }),
    prisma.event.findMany({ orderBy: { sort: 'asc' } }),
  ]);
  res.render('bookings/form', { title: 'Nuova prenotazione', booking: null, plans, events, STATUSES });
}));

router.post('/', A(async (req, res) => {
  const b = req.body;
  await prisma.booking.create({
    data: {
      customerName: b.customerName,
      customerEmail: b.customerEmail,
      phone: b.phone || '',
      planId: b.planId ? +b.planId : null,
      eventId: b.eventId ? +b.eventId : null,
      dateLabel: b.dateLabel || '',
      slot: b.slot || '',
      method: b.method || '',
      amount: parseFloat(b.amount) || 0,
      status: STATUSES.includes(b.status) ? b.status : 'pending',
      notes: b.notes || '',
    },
  });
  req.flash('success', 'Prenotazione creata.');
  res.redirect('/admin/bookings');
}));

router.get('/:id(\\d+)/edit', A(async (req, res) => {
  const booking = await prisma.booking.findUnique({ where: { id: +req.params.id } });
  if (!booking) return res.redirect('/admin/bookings');
  const [plans, events] = await Promise.all([
    prisma.plan.findMany({ orderBy: { sort: 'asc' } }),
    prisma.event.findMany({ orderBy: { sort: 'asc' } }),
  ]);
  res.render('bookings/form', { title: 'Modifica prenotazione', booking, plans, events, STATUSES });
}));

router.post('/:id(\\d+)', A(async (req, res) => {
  const b = req.body;
  await prisma.booking.update({
    where: { id: +req.params.id },
    data: {
      customerName: b.customerName,
      customerEmail: b.customerEmail,
      phone: b.phone || '',
      planId: b.planId ? +b.planId : null,
      eventId: b.eventId ? +b.eventId : null,
      dateLabel: b.dateLabel || '',
      slot: b.slot || '',
      method: b.method || '',
      amount: parseFloat(b.amount) || 0,
      status: STATUSES.includes(b.status) ? b.status : 'pending',
      notes: b.notes || '',
    },
  });
  req.flash('success', 'Prenotazione aggiornata.');
  res.redirect('/admin/bookings');
}));

router.post('/:id(\\d+)/status', A(async (req, res) => {
  const s = STATUSES.includes(req.body.status) ? req.body.status : 'pending';
  await prisma.booking.update({ where: { id: +req.params.id }, data: { status: s } });
  req.flash('success', 'Stato prenotazione aggiornato.');
  res.redirect('/admin/bookings');
}));

router.post('/:id(\\d+)/delete', A(async (req, res) => {
  await prisma.booking.delete({ where: { id: +req.params.id } });
  req.flash('success', 'Prenotazione eliminata.');
  res.redirect('/admin/bookings');
}));

module.exports = router;
