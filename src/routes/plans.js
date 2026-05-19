const express = require('express');
const prisma = require('../lib/db');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();
const A = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const MODES = [
  { v: 'none', l: 'Nessuna scelta (pacchetto intero)' },
  { v: 'time', l: 'Scelta orario' },
  { v: 'three_days_ampm', l: '3 giorni — mattina o pomeriggio' },
  { v: 'date_time', l: 'Data + orario' },
];

router.use(requirePermission('plans.manage'));

router.get('/', A(async (req, res) => {
  const plans = await prisma.plan.findMany({ orderBy: [{ sort: 'asc' }, { id: 'asc' }] });
  res.render('plans/list', { title: 'Piani / Pacchetti', plans, MODES });
}));

router.get('/new', (req, res) => {
  res.render('plans/form', { title: 'Nuovo piano', plan: null, MODES });
});

router.post('/', A(async (req, res) => {
  const b = req.body;
  await prisma.plan.create({
    data: {
      slug: String(b.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
      name: b.name,
      price: parseFloat(b.price) || 0,
      currency: b.currency || 'EUR',
      badge: b.badge || '',
      description: b.description || '',
      bookingMode: b.bookingMode || 'date_time',
      ctaLabel: b.ctaLabel || 'Reserva',
      active: b.active ? true : false,
      sort: parseInt(b.sort, 10) || 0,
    },
  });
  req.flash('success', 'Piano creato.');
  res.redirect('/admin/plans');
}));

router.get('/:id(\\d+)/edit', A(async (req, res) => {
  const plan = await prisma.plan.findUnique({ where: { id: +req.params.id } });
  if (!plan) return res.redirect('/admin/plans');
  res.render('plans/form', { title: 'Modifica piano', plan, MODES });
}));

router.post('/:id(\\d+)', A(async (req, res) => {
  const b = req.body;
  await prisma.plan.update({
    where: { id: +req.params.id },
    data: {
      slug: String(b.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
      name: b.name,
      price: parseFloat(b.price) || 0,
      currency: b.currency || 'EUR',
      badge: b.badge || '',
      description: b.description || '',
      bookingMode: b.bookingMode || 'date_time',
      ctaLabel: b.ctaLabel || 'Reserva',
      active: b.active ? true : false,
      sort: parseInt(b.sort, 10) || 0,
    },
  });
  req.flash('success', 'Piano aggiornato.');
  res.redirect('/admin/plans');
}));

router.post('/:id(\\d+)/delete', A(async (req, res) => {
  const count = await prisma.booking.count({ where: { planId: +req.params.id } });
  if (count > 0) {
    req.flash('error', `Ci sono ${count} prenotazioni legate a questo piano: non eliminabile.`);
    return res.redirect('/admin/plans');
  }
  await prisma.plan.delete({ where: { id: +req.params.id } });
  req.flash('success', 'Piano eliminato.');
  res.redirect('/admin/plans');
}));

router.post('/:id(\\d+)/toggle', A(async (req, res) => {
  const p = await prisma.plan.findUnique({ where: { id: +req.params.id } });
  await prisma.plan.update({ where: { id: p.id }, data: { active: !p.active } });
  req.flash('success', 'Stato piano aggiornato.');
  res.redirect('/admin/plans');
}));

module.exports = router;
