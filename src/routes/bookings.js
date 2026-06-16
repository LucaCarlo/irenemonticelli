const express = require('express');
const prisma = require('../lib/db');
const { requirePermission } = require('../middleware/rbac');
const audit = require('../lib/audit');

const router = express.Router();
const A = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const STATUSES = ['pending', 'confirmed', 'cancelled'];

router.use(requirePermission('bookings.manage'));

router.get('/', A(async (req, res) => {
  const dt = require('../lib/datatable');
  const params = dt.parseParams(req, { defaultSort: 'createdAt', allowedSorts: ['customerName','customerEmail','amount','status','paymentStatus','createdAt'] });
  // Vista "Prenotazioni" = SOLO pagate (le altre vivono in /admin/abandoned-carts).
  const where = { paymentStatus: 'paid', status: 'confirmed' };
  if (params.q) where.OR = [
    { customerName: { contains: params.q, mode: 'insensitive' } },
    { customerEmail: { contains: params.q, mode: 'insensitive' } },
    { firstName: { contains: params.q, mode: 'insensitive' } },
    { lastName: { contains: params.q, mode: 'insensitive' } },
    { phone: { contains: params.q, mode: 'insensitive' } },
  ];
  const orderBy = {}; orderBy[params.sort] = params.dir;
  const [totalUnfiltered, total, bookings, abandonedCount] = await Promise.all([
    prisma.booking.count({ where: { paymentStatus: 'paid', status: 'confirmed' } }),
    prisma.booking.count({ where }),
    prisma.booking.findMany({ where, include: { plan: true, event: true }, orderBy, skip: params.skip, take: params.take }),
    prisma.booking.count({ where: { NOT: { AND: [{ paymentStatus: 'paid' }, { status: 'confirmed' }] } } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / params.perPage));
  const links = dt.pageLinks(params.page, totalPages);
  res.render('bookings/list', { title: 'Prenotazioni pagate', bookings, STATUSES, params, total, totalUnfiltered, totalPages, links, abandonedCount });
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
  const id = +req.params.id;
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      plan: true,
      event: true,
      participants: { orderBy: { sort: 'asc' }, include: { tutorBlock: true } },
      tutorBlocks: { include: { participants: true } },
      referralCode: { include: { referrer: true } },
      commission: true,
    },
  });
  if (!booking) return res.redirect('/admin/bookings');

  const [plans, events] = await Promise.all([
    prisma.plan.findMany({ orderBy: { sort: 'asc' } }),
    prisma.event.findMany({ orderBy: { sort: 'asc' } }),
  ]);

  // Parsing JSON sicuro
  let items = {}, extras = [];
  try { items = booking.itemsJson ? JSON.parse(booking.itemsJson) : {}; } catch (_) {}
  try { extras = booking.extrasJson ? JSON.parse(booking.extrasJson) : []; } catch (_) {}
  if (!Array.isArray(extras)) extras = [];

  // Risolvi lezioni della booking in base al bookingMode del pack.
  //   single_lessons: items.lessons = [{day, slot}, ...]                 → match esatto day+slot
  //   red:            items.days    = {iso: 'AM'|'PM', ...}              → tutte le lezioni del giorno + segmento
  //   gold/junior:    nessuna selezione                                    → tutte le lezioni attive non-pausa dell'evento
  let lessonsResolved = [];   // per single_lessons + red: lista esplicita
  let lessonsAuto = [];       // per gold/junior: lista derivata dall'evento
  if (booking.eventId && booking.plan) {
    const ev = await prisma.event.findUnique({
      where: { id: booking.eventId },
      include: { lessons: { include: { professor: true }, orderBy: [{ dayIndex: 'asc' }, { sort: 'asc' }] } },
    });
    const allLessons = (ev && ev.lessons) || [];
    function isoForDayIndex(dayIdx) {
      if (!ev || !ev.startDate) return null;
      const dt = new Date(ev.startDate);
      dt.setDate(dt.getDate() + (dayIdx - 1));
      return dt.toISOString().slice(0, 10);
    }
    function dayIndexForIso(iso) {
      if (!ev || !ev.startDate || !iso) return null;
      const start = new Date(ev.startDate);
      const target = new Date(iso + 'T00:00:00');
      const diff = Math.round((target - start) / 86400000);
      return diff >= 0 ? diff + 1 : null;
    }

    const mode = booking.plan.bookingMode;

    if (mode === 'single_lessons' && items && Array.isArray(items.lessons)) {
      lessonsResolved = items.lessons.map((sel) => {
        const match = allLessons.find((L) => isoForDayIndex(L.dayIndex) === sel.day && L.time === sel.slot && !L.isPause);
        return { day: sel.day, slot: sel.slot, segment: '', lesson: match || null };
      });
    } else if (mode === 'red' && items && items.days && typeof items.days === 'object') {
      Object.keys(items.days).sort().forEach((iso) => {
        const segment = items.days[iso];   // 'AM' | 'PM'
        const di = dayIndexForIso(iso);
        if (!di) return;
        const matches = allLessons.filter((L) => {
          if (L.isPause || !L.active) return false;
          if (L.dayIndex !== di) return false;
          const isMorning = !L.isAfternoon;
          return (segment === 'AM' && isMorning) || (segment === 'PM' && L.isAfternoon);
        });
        matches.forEach((L) => {
          lessonsResolved.push({
            day: iso,
            slot: L.time,
            segment: segment === 'AM' ? 'Mañana' : 'Tarde',
            lesson: L,
          });
        });
      });
    } else if (mode === 'gold' || mode === 'junior') {
      lessonsAuto = allLessons
        .filter((L) => L.active && !L.isPause)
        .map((L) => ({
          day: isoForDayIndex(L.dayIndex),
          slot: L.time,
          segment: L.isAfternoon ? 'Tarde' : 'Mañana',
          lesson: L,
        }));
    }
  }

  // Audit log per questa booking (ultimi 25)
  let auditEntries = [];
  try {
    auditEntries = await prisma.auditLog.findMany({
      where: { entity: 'booking', entityId: String(id) },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
  } catch (_) {}

  // Calcoli derivati (IVA, netto)
  const IVA_RATE = 0.21;
  const subtotal = booking.subtotal || 0;
  const discountAmount = booking.discountAmount || 0;
  const referralDiscount = booking.referralDiscount || 0;
  const extrasTotal = booking.extrasTotal || 0;
  const total = booking.amount || 0;
  const totalNet = +(total / (1 + IVA_RATE)).toFixed(2);
  const totalIva = +(total - totalNet).toFixed(2);
  const computedTotal = +(subtotal - discountAmount - referralDiscount + extrasTotal).toFixed(2);
  const totalMatches = Math.abs(computedTotal - total) < 0.02;

  res.render('bookings/form', {
    title: ((booking.status === 'confirmed' && booking.paymentStatus === 'paid') ? 'Prenotazione' : 'Carrello') + ' di ' + (booking.customerName || booking.customerEmail || '#'+booking.id),
    activeSection: (booking.status === 'confirmed' && booking.paymentStatus === 'paid') ? 'bookings' : 'abandoned-carts',
    booking, plans, events, STATUSES,
    items, extras, lessonsResolved, lessonsAuto, auditEntries,
    breakdown: { subtotal, discountAmount, referralDiscount, extrasTotal, total, totalNet, totalIva, computedTotal, totalMatches, ivaRate: IVA_RATE },
  });
}));

// Mappa il "comboStatus" leggibile a (status, paymentStatus)
function comboToDb(combo) {
  switch (combo) {
    case 'paid':          return { status: 'confirmed', paymentStatus: 'paid' };
    case 'payment_error': return { status: 'pending',   paymentStatus: 'failed' };
    case 'refunded':      return { status: 'confirmed', paymentStatus: 'refunded' };
    case 'cancelled':     return { status: 'cancelled', paymentStatus: 'unpaid' };
    case 'abandoned':
    default:              return { status: 'pending',   paymentStatus: 'unpaid' };
  }
}

router.post('/:id(\\d+)', A(async (req, res) => {
  const b = req.body;
  const dbData = {
    customerName: b.customerName,
    customerEmail: b.customerEmail,
    phone: b.phone || '',
    planId: b.planId ? +b.planId : null,
    eventId: b.eventId ? +b.eventId : null,
    dateLabel: b.dateLabel || '',
    slot: b.slot || '',
    method: b.method || '',
    amount: parseFloat(b.amount) || 0,
    notes: b.notes || '',
  };
  // Combo status (UI nuova) → mapping a status + paymentStatus. Compat con vecchio campo "status".
  if (b.comboStatus) {
    Object.assign(dbData, comboToDb(b.comboStatus));
  } else if (b.status) {
    dbData.status = STATUSES.includes(b.status) ? b.status : 'pending';
  }
  await prisma.booking.update({ where: { id: +req.params.id }, data: dbData });
  req.flash('success', 'Prenotazione aggiornata.');
  res.redirect('/admin/bookings/' + req.params.id + '/edit');
}));

// POST: aggiorna la selezione mañana/tarde per ogni giorno (solo pack RED).
// Body: day_<YYYY-MM-DD>=AM|PM, uno per ogni giorno dell'evento.
router.post('/:id(\\d+)/red-days', A(async (req, res) => {
  const id = +req.params.id;
  const b = await prisma.booking.findUnique({ where: { id }, include: { plan: true } });
  if (!b || !b.plan || b.plan.bookingMode !== 'red') {
    req.flash('error', 'Operación válida solo para Pack RED.');
    return res.redirect('/admin/bookings/' + id + '/edit');
  }
  // Estrae tutti i campi day_<iso> dal body
  const days = {};
  Object.keys(req.body || {}).forEach((k) => {
    if (!k.startsWith('day_')) return;
    const iso = k.slice(4);
    const v = String(req.body[k] || '').toUpperCase().trim();
    if ((v === 'AM' || v === 'PM') && /^\d{4}-\d{2}-\d{2}$/.test(iso)) days[iso] = v;
  });
  if (!Object.keys(days).length) {
    req.flash('error', 'Selecciona Mañana o Tarde para al menos un día.');
    return res.redirect('/admin/bookings/' + id + '/edit');
  }
  // Conserva eventuali altri campi presenti in itemsJson (per sicurezza)
  let items = {};
  try { items = b.itemsJson ? JSON.parse(b.itemsJson) : {}; } catch (_) {}
  items.days = days;
  await prisma.booking.update({ where: { id }, data: { itemsJson: JSON.stringify(items) } });
  audit.log(req, 'booking.red_days.update', {
    entity: 'booking', entityId: String(id), details: { days },
  }).catch(() => {});
  req.flash('success', 'Fasce Mañana/Tarde aggiornate.');
  res.redirect('/admin/bookings/' + id + '/edit');
}));

router.post('/:id(\\d+)/status', A(async (req, res) => {
  const id = +req.params.id;
  const s = STATUSES.includes(req.body.status) ? req.body.status : 'pending';
  const before = await prisma.booking.findUnique({
    where: { id },
    select: { status: true, paymentStatus: true, customerEmail: true, amount: true },
  });
  await prisma.booking.update({ where: { id }, data: { status: s } });
  if (before && before.status !== s) {
    audit.log(req, 'booking.status.change', {
      entity: 'booking', entityId: String(id),
      details: { from: before.status, to: s, paymentStatus: before.paymentStatus, customerEmail: before.customerEmail, amount: before.amount },
    }).catch(() => {});
  }
  req.flash('success', 'Stato prenotazione aggiornato.');
  res.redirect('/admin/bookings');
}));

router.post('/:id(\\d+)/delete', A(async (req, res) => {
  await prisma.booking.delete({ where: { id: +req.params.id } });
  req.flash('success', 'Prenotazione eliminata.');
  res.redirect('/admin/bookings');
}));

module.exports = router;
