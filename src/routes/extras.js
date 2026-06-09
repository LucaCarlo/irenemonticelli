// CRUD admin per gli Extras/Suplementi (es. assicurazione obbligatoria).
const express = require('express');
const prisma = require('../lib/db');
const audit = require('../lib/audit');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();
const A = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.use(requirePermission('extras.manage'));

router.get('/', A(async (req, res) => {
  const dt = require('../lib/datatable');
  const params = dt.parseParams(req, { defaultSort: 'sort', allowedSorts: ['name','price','mandatory','active','sort'] });
  const status = String(req.query.status || '').trim();
  const mandatory = String(req.query.mandatory || '').trim();
  params._extra = { status, mandatory };
  const where = {};
  if (params.q) where.OR = [
    { name: { contains: params.q, mode: 'insensitive' } },
    { description: { contains: params.q, mode: 'insensitive' } },
  ];
  if (status === 'active') where.active = true;
  if (status === 'inactive') where.active = false;
  if (mandatory === 'yes') where.mandatory = true;
  if (mandatory === 'no') where.mandatory = false;
  const orderBy = {}; orderBy[params.sort] = params.dir;
  const [totalUnfiltered, total, extras, plans, events] = await Promise.all([
    prisma.bookingExtra.count(),
    prisma.bookingExtra.count({ where }),
    prisma.bookingExtra.findMany({ where, orderBy, skip: params.skip, take: params.take, include: { plan: { select: { name: true } }, event: { select: { title: true } } } }),
    prisma.plan.findMany({ where: { active: true }, orderBy: { sort: 'asc' } }),
    prisma.event.findMany({ where: { active: true }, orderBy: { startDate: 'asc' } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / params.perPage));
  const links = dt.pageLinks(params.page, totalPages);
  res.render('extras/list', { title: 'Extras / Suplementi', extras, plans, events, params, total, totalUnfiltered, totalPages, links, status, mandatory });
}));

router.get('/new', A(async (req, res) => {
  const [plans, events] = await Promise.all([
    prisma.plan.findMany({ where: { active: true }, orderBy: { sort: 'asc' } }),
    prisma.event.findMany({ where: { active: true }, orderBy: { startDate: 'asc' } }),
  ]);
  res.render('extras/form', { title: 'Nuovo extra', extra: null, plans, events });
}));

router.get('/:id(\\d+)/edit', A(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const [extra, plans, events] = await Promise.all([
    prisma.bookingExtra.findUnique({ where: { id } }),
    prisma.plan.findMany({ where: { active: true }, orderBy: { sort: 'asc' } }),
    prisma.event.findMany({ where: { active: true }, orderBy: { startDate: 'asc' } }),
  ]);
  if (!extra) return res.redirect('/admin/extras');
  res.render('extras/form', { title: 'Modifica extra', extra, plans, events });
}));

router.post('/', A(async (req, res) => {
  const b = req.body;
  const name = (b.name || '').trim();
  const price = parseFloat(b.price);
  if (!name || isNaN(price) || price < 0) {
    req.flash('error', 'Nome e prezzo (>= 0) sono obbligatori.');
    return res.redirect('/admin/extras');
  }
  const data = {
    name, description: (b.description || '').trim(),
    price, mandatory: !!b.mandatory,
    planId: b.planId ? parseInt(b.planId, 10) : null,
    eventId: b.eventId ? parseInt(b.eventId, 10) : null,
    sort: parseInt(b.sort, 10) || 0,
    active: b.active !== '0',
  };
  const r = await prisma.bookingExtra.create({ data });
  await audit.log(req, 'extra.create', { entity: 'BookingExtra', entityId: String(r.id), details: data });
  req.flash('success', 'Extra creato.');
  res.redirect('/admin/extras');
}));

router.post('/:id(\\d+)', A(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const b = req.body;
  const data = {
    name: (b.name || '').trim(),
    description: (b.description || '').trim(),
    price: parseFloat(b.price) || 0,
    mandatory: !!b.mandatory,
    planId: b.planId ? parseInt(b.planId, 10) : null,
    eventId: b.eventId ? parseInt(b.eventId, 10) : null,
    sort: parseInt(b.sort, 10) || 0,
    active: b.active !== '0',
  };
  await prisma.bookingExtra.update({ where: { id }, data });
  await audit.log(req, 'extra.update', { entity: 'BookingExtra', entityId: String(id) });
  req.flash('success', 'Extra aggiornato.');
  res.redirect('/admin/extras');
}));

router.post('/:id(\\d+)/delete', A(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await prisma.bookingExtra.delete({ where: { id } }).catch(() => {});
  await audit.log(req, 'extra.delete', { entity: 'BookingExtra', entityId: String(id) });
  req.flash('success', 'Extra eliminato.');
  res.redirect('/admin/extras');
}));

module.exports = router;
