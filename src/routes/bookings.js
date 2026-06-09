const express = require('express');
const prisma = require('../lib/db');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();
const A = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const STATUSES = ['pending', 'confirmed', 'cancelled'];

router.use(requirePermission('bookings.manage'));

router.get('/', A(async (req, res) => {
  const dt = require('../lib/datatable');
  const params = dt.parseParams(req, { defaultSort: 'createdAt', allowedSorts: ['customerName','customerEmail','amount','status','paymentStatus','createdAt'] });
  const status = STATUSES.includes(req.query.status) ? req.query.status : '';
  const payStatus = String(req.query.paymentStatus || '').trim();
  params._extra = { status, paymentStatus: payStatus };
  const where = {};
  if (status) where.status = status;
  if (payStatus) where.paymentStatus = payStatus;
  if (params.q) where.OR = [
    { customerName: { contains: params.q, mode: 'insensitive' } },
    { customerEmail: { contains: params.q, mode: 'insensitive' } },
    { firstName: { contains: params.q, mode: 'insensitive' } },
    { lastName: { contains: params.q, mode: 'insensitive' } },
    { phone: { contains: params.q, mode: 'insensitive' } },
  ];
  const orderBy = {}; orderBy[params.sort] = params.dir;
  const [totalUnfiltered, total, bookings, counts] = await Promise.all([
    prisma.booking.count(),
    prisma.booking.count({ where }),
    prisma.booking.findMany({ where, include: { plan: true, event: true }, orderBy, skip: params.skip, take: params.take }),
    prisma.booking.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / params.perPage));
  const links = dt.pageLinks(params.page, totalPages);
  res.render('bookings/list', { title: 'Prenotazioni', bookings, status, paymentStatus: payStatus, STATUSES, counts, params, total, totalUnfiltered, totalPages, links });
}));

router.get('/calendar', A(async (req, res) => {
  // Lista eventi per il dropdown filtro
  const events = await prisma.event.findMany({ orderBy: { startDate: 'asc' } });
  const eventId = parseInt(req.query.event, 10) || 0;
  const selectedEvent = eventId ? events.find((e) => e.id === eventId) : null;

  const now = new Date();
  let y, m;
  // Se è stato scelto un evento e non c'è override esplicito → calendario sul mese dell'evento
  if (selectedEvent && selectedEvent.startDate && !req.query.y && !req.query.m) {
    y = new Date(selectedEvent.startDate).getFullYear();
    m = new Date(selectedEvent.startDate).getMonth() + 1;
  } else {
    y = parseInt(req.query.y, 10) || now.getFullYear();
    m = parseInt(req.query.m, 10);
    if (!(m >= 1 && m <= 12)) m = now.getMonth() + 1;
  }
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);

  // Bookings: filtrate per evento se selezionato. Sennò: tutte (le filtriamo per data evento dopo).
  let whereClause = selectedEvent ? { eventId: selectedEvent.id } : {};
  const bookings = await prisma.booking.findMany({
    where: whereClause,
    include: { plan: true, event: true },
    orderBy: { createdAt: 'asc' },
  });

  // Costruisco l'array dei giorni dell'evento (per modalità event-only, con date complete)
  const eventDaysFull = [];
  if (selectedEvent && selectedEvent.startDate && selectedEvent.endDate) {
    const sd = new Date(selectedEvent.startDate);
    const ed = new Date(selectedEvent.endDate);
    const cursor = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate());
    while (cursor <= ed) {
      eventDaysFull.push({
        date: new Date(cursor),
        y: cursor.getFullYear(),
        m: cursor.getMonth() + 1,
        d: cursor.getDate(),
        dow: cursor.getDay(),
        iso: cursor.toISOString().slice(0, 10),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  // Helper: ritorna gli ISO date in cui la prenotazione effettivamente si svolge.
  // - Pack Single: le date delle lezioni selezionate (itemsJson.lessons[].day)
  // - Pack Red: i giorni selezionati (itemsJson.days = {iso: 'AM'|'PM'})
  // - Pack Gold/Junior/altri: tutti i giorni dell'evento (start..end)
  function eventDatesOfBooking(b) {
    const out = new Set();
    let items = {};
    try { items = JSON.parse(b.itemsJson || '{}') || {}; } catch {}
    const mode = b.plan ? b.plan.bookingMode : '';
    if (mode === 'single_lessons' && Array.isArray(items.lessons)) {
      items.lessons.forEach((l) => { if (l && l.day) out.add(String(l.day).slice(0, 10)); });
    } else if (mode === 'red' && items.days && typeof items.days === 'object') {
      Object.keys(items.days).forEach((iso) => out.add(String(iso).slice(0, 10)));
    } else if (b.event && b.event.startDate && b.event.endDate) {
      // Gold/Junior/etc → full event range
      const sd = new Date(b.event.startDate);
      const ed = new Date(b.event.endDate);
      const cur = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate());
      while (cur <= ed) {
        out.add(cur.toISOString().slice(0, 10));
        cur.setDate(cur.getDate() + 1);
      }
    }
    return Array.from(out);
  }

  // Raggruppamento per data evento
  const byDay = {};
  const byIso = {};
  bookings.forEach((b) => {
    const dates = eventDatesOfBooking(b);
    dates.forEach((iso) => {
      (byIso[iso] = byIso[iso] || []).push(b);
      // In vista mensile: includo solo i giorni che cadono nel mese visualizzato
      const dt = new Date(iso + 'T00:00:00');
      if (dt.getFullYear() === y && (dt.getMonth() + 1) === m) {
        (byDay[dt.getDate()] = byDay[dt.getDate()] || []).push(b);
      }
    });
  });

  const firstDow = (start.getDay() + 6) % 7; // lun=0
  const daysInMonth = new Date(y, m, 0).getDate();
  const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };

  res.render('bookings/calendar', {
    title: 'Calendario prenotazioni',
    y, m, byDay, byIso, firstDow, daysInMonth, prev, next,
    total: bookings.length,
    events, eventId, selectedEvent,
    eventDaysFull,
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
