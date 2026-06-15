// Carrelli abbandonati: tutte le booking NON arrivate a "confirmed+paid".
// Classifico in 4 tipi:
//   - refunded      → paymentStatus='refunded'
//   - payment_error → paymentStatus='failed' (con stripeError dettagliato)
//   - abandoned     → paymentStatus='unpaid' && status='pending'
//   - cancelled     → status='cancelled'
const express = require('express');
const prisma = require('../lib/db');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();
const A = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.use(requirePermission('bookings.manage'));

function classify(b) {
  if (b.isDraft && b.status === 'pending') return 'draft';
  if (b.status === 'cancelled') return 'cancelled';
  if (b.paymentStatus === 'refunded') return 'refunded';
  if (b.paymentStatus === 'failed') return 'payment_error';
  if (b.paymentStatus === 'unpaid' && b.status === 'pending') return 'abandoned';
  return 'other';
}

router.get('/', A(async (req, res) => {
  const dt = require('../lib/datatable');
  const params = dt.parseParams(req, {
    defaultSort: 'createdAt',
    allowedSorts: ['customerName', 'customerEmail', 'amount', 'paymentStatus', 'createdAt'],
  });
  const filter = String(req.query.kind || '').trim();
  params._extra = { kind: filter };

  // Vista carrelli = tutto ciò che NON è (paymentStatus=paid + status=confirmed)
  const baseWhere = { NOT: { AND: [{ paymentStatus: 'paid' }, { status: 'confirmed' }] } };

  let where = baseWhere;
  if (filter === 'refunded') where = { ...baseWhere, paymentStatus: 'refunded' };
  else if (filter === 'payment_error') where = { ...baseWhere, paymentStatus: 'failed' };
  else if (filter === 'draft') where = { ...baseWhere, isDraft: true, status: 'pending' };
  else if (filter === 'abandoned') where = { ...baseWhere, paymentStatus: 'unpaid', status: 'pending', isDraft: false };
  else if (filter === 'cancelled') where = { ...baseWhere, status: 'cancelled' };

  if (params.q) where.OR = [
    { customerName: { contains: params.q, mode: 'insensitive' } },
    { customerEmail: { contains: params.q, mode: 'insensitive' } },
  ];

  const orderBy = {}; orderBy[params.sort] = params.dir;

  // Conteggi per i filtri/tab
  const [allCount, refundedCount, paymentErrorCount, draftCount, abandonedCount, cancelledCount, total, totalUnfiltered, items] = await Promise.all([
    prisma.booking.count({ where: baseWhere }),
    prisma.booking.count({ where: { ...baseWhere, paymentStatus: 'refunded' } }),
    prisma.booking.count({ where: { ...baseWhere, paymentStatus: 'failed' } }),
    prisma.booking.count({ where: { ...baseWhere, isDraft: true, status: 'pending' } }),
    prisma.booking.count({ where: { ...baseWhere, paymentStatus: 'unpaid', status: 'pending', isDraft: false } }),
    prisma.booking.count({ where: { ...baseWhere, status: 'cancelled' } }),
    prisma.booking.count({ where }),
    prisma.booking.count({ where: baseWhere }),
    prisma.booking.findMany({
      where,
      include: { plan: true, event: true },
      orderBy,
      skip: params.skip,
      take: params.take,
    }),
  ]);

  // Arricchimento: aggiungo "kind" per la view
  items.forEach((b) => { b._kind = classify(b); });

  const totalPages = Math.max(1, Math.ceil(total / params.perPage));
  const links = dt.pageLinks(params.page, totalPages);

  res.render('bookings/abandoned', {
    title: 'Carrelli abbandonati',
    items, filter, params, total, totalUnfiltered, totalPages, links,
    counts: { all: allCount, refunded: refundedCount, payment_error: paymentErrorCount, draft: draftCount, abandoned: abandonedCount, cancelled: cancelledCount },
  });
}));

module.exports = router;
