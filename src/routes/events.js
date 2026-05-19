const express = require('express');
const prisma = require('../lib/db');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();
const A = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

router.use(requirePermission('events.manage'));

router.get('/', A(async (req, res) => {
  const events = await prisma.event.findMany({
    orderBy: [{ sort: 'asc' }, { startDate: 'asc' }],
    include: { _count: { select: { bookings: true } } },
  });
  res.render('events/list', { title: 'Eventi', events });
}));

router.get('/new', (req, res) => {
  res.render('events/form', { title: 'Nuovo evento', ev: null });
});

router.post('/', A(async (req, res) => {
  const b = req.body;
  await prisma.event.create({
    data: {
      title: b.title,
      subtitle: b.subtitle || '',
      startDate: parseDate(b.startDate),
      endDate: parseDate(b.endDate),
      location: b.location || '',
      description: b.description || '',
      active: b.active ? true : false,
      sort: parseInt(b.sort, 10) || 0,
    },
  });
  req.flash('success', 'Evento creato.');
  res.redirect('/admin/events');
}));

router.get('/:id(\\d+)/edit', A(async (req, res) => {
  const ev = await prisma.event.findUnique({ where: { id: +req.params.id } });
  if (!ev) return res.redirect('/admin/events');
  res.render('events/form', { title: 'Modifica evento', ev });
}));

router.post('/:id(\\d+)', A(async (req, res) => {
  const b = req.body;
  await prisma.event.update({
    where: { id: +req.params.id },
    data: {
      title: b.title,
      subtitle: b.subtitle || '',
      startDate: parseDate(b.startDate),
      endDate: parseDate(b.endDate),
      location: b.location || '',
      description: b.description || '',
      active: b.active ? true : false,
      sort: parseInt(b.sort, 10) || 0,
    },
  });
  req.flash('success', 'Evento aggiornato.');
  res.redirect('/admin/events');
}));

router.post('/:id(\\d+)/delete', A(async (req, res) => {
  const count = await prisma.booking.count({ where: { eventId: +req.params.id } });
  if (count > 0) {
    req.flash('error', `Ci sono ${count} prenotazioni legate a questo evento: non eliminabile.`);
    return res.redirect('/admin/events');
  }
  await prisma.event.delete({ where: { id: +req.params.id } });
  req.flash('success', 'Evento eliminato.');
  res.redirect('/admin/events');
}));

router.post('/:id(\\d+)/toggle', A(async (req, res) => {
  const e = await prisma.event.findUnique({ where: { id: +req.params.id } });
  await prisma.event.update({ where: { id: e.id }, data: { active: !e.active } });
  req.flash('success', 'Stato evento aggiornato.');
  res.redirect('/admin/events');
}));

module.exports = router;
