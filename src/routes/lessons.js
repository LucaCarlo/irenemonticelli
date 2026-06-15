// CRUD admin per le lezioni del Programa Pro Dance.
const express = require('express');
const prisma = require('../lib/db');
const audit = require('../lib/audit');
const LC = require('../lib/lesson-capacity');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();
const A = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.use(requirePermission('lessons.manage'));

router.get('/', A(async (req, res) => {
  const events = await prisma.event.findMany({ orderBy: { startDate: 'asc' } });
  const activeEvent = events.find((e) => e.active) || events[0];
  const evId = parseInt(req.query.event, 10) || (activeEvent ? activeEvent.id : 0);

  const lessons = evId ? await prisma.lesson.findMany({
    where: { eventId: evId },
    orderBy: [{ dayIndex: 'asc' }, { sort: 'asc' }],
    include: { professor: true },
  }) : [];

  // Occupancy attuale per ogni lezione (solo confirmed+paid)
  let occupancyById = new Map();
  if (evId) {
    try {
      const status = await LC.getEventCapacityStatus(evId);
      occupancyById = new Map(status.lessons.map((s) => [s.id, s]));
    } catch (_) {}
  }

  // Raggruppa per giorno
  const byDay = {};
  lessons.forEach((l) => {
    const occ = occupancyById.get(l.id);
    l._occupied = occ ? occ.occupied : 0;
    l._remaining = occ ? occ.remaining : (l.capacity || 0);
    l._full = occ ? occ.full : false;
    if (!byDay[l.dayIndex]) byDay[l.dayIndex] = [];
    byDay[l.dayIndex].push(l);
  });

  const professors = await prisma.professor.findMany({
    where: { active: true },
    orderBy: [{ sort: 'asc' }, { firstName: 'asc' }],
  });

  res.render('lessons/list', {
    title: 'Programma lezioni',
    events, evId, byDay, professors,
  });
}));

router.post('/', A(async (req, res) => {
  const b = req.body;
  const data = {
    eventId: parseInt(b.eventId, 10),
    dayIndex: parseInt(b.dayIndex, 10) || 1,
    time: String(b.time || '').trim(),
    title: String(b.title || '').trim(),
    professorId: b.professorId ? parseInt(b.professorId, 10) : null,
    isAfternoon: !!b.isAfternoon,
    isPause: !!b.isPause,
    capacity: Math.max(0, parseInt(b.capacity, 10) || 100),
    sort: parseInt(b.sort, 10) || 0,
    active: b.active !== '0',
  };
  if (!data.eventId || !data.time || !data.title) {
    req.flash('error', 'Evento, orario e titolo sono obbligatori.');
    return res.redirect('/admin/lessons?event=' + (data.eventId || ''));
  }
  const r = await prisma.lesson.create({ data });
  await audit.log(req, 'lesson.create', { entity: 'Lesson', entityId: String(r.id), details: data });
  req.flash('success', 'Lezione creata.');
  res.redirect('/admin/lessons?event=' + data.eventId);
}));

router.post('/:id(\\d+)', A(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const b = req.body;
  const data = {
    dayIndex: parseInt(b.dayIndex, 10) || 1,
    time: String(b.time || '').trim(),
    title: String(b.title || '').trim(),
    professorId: b.professorId ? parseInt(b.professorId, 10) : null,
    isAfternoon: !!b.isAfternoon,
    isPause: !!b.isPause,
    capacity: Math.max(0, parseInt(b.capacity, 10) || 100),
    sort: parseInt(b.sort, 10) || 0,
    active: b.active !== '0',
  };
  const r = await prisma.lesson.update({ where: { id }, data });
  await audit.log(req, 'lesson.update', { entity: 'Lesson', entityId: String(id) });
  req.flash('success', 'Lezione aggiornata.');
  res.redirect('/admin/lessons?event=' + r.eventId);
}));

// Riordino drag&drop: riceve { items: [{id, dayIndex, sort}] }
router.post('/reorder', express.json(), A(async (req, res) => {
  const items = Array.isArray(req.body && req.body.items) ? req.body.items : [];
  if (!items.length) return res.json({ ok: true, updated: 0 });
  const ids = items.map((it) => parseInt(it.id, 10)).filter(Boolean);
  if (!ids.length) return res.json({ ok: true, updated: 0 });
  // Carica le lezioni per verificare appartenenza allo stesso evento (evita riassegnamenti tra eventi)
  const lessons = await prisma.lesson.findMany({ where: { id: { in: ids } }, select: { id: true, eventId: true } });
  const evIds = Array.from(new Set(lessons.map((l) => l.eventId)));
  if (evIds.length !== 1) {
    return res.status(400).json({ ok: false, error: 'multi-event reorder not allowed' });
  }
  await prisma.$transaction(items.map((it) => prisma.lesson.update({
    where: { id: parseInt(it.id, 10) },
    data: {
      dayIndex: Math.max(1, parseInt(it.dayIndex, 10) || 1),
      sort: parseInt(it.sort, 10) || 0,
    },
  })));
  await audit.log(req, 'lesson.reorder', { entity: 'Lesson', details: { count: items.length, eventId: evIds[0] } });
  res.json({ ok: true, updated: items.length });
}));

router.post('/:id(\\d+)/delete', A(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const r = await prisma.lesson.findUnique({ where: { id } });
  if (r) {
    await prisma.lesson.delete({ where: { id } });
    await audit.log(req, 'lesson.delete', { entity: 'Lesson', entityId: String(id) });
  }
  req.flash('success', 'Lezione eliminata.');
  res.redirect('/admin/lessons?event=' + (r ? r.eventId : ''));
}));

module.exports = router;
