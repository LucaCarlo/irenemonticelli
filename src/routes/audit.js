// Visualizzazione log attività con paginazione e filtri.
const express = require('express');
const prisma = require('../lib/db');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();
const A = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', requirePermission('audit.view'), A(async (req, res) => {
  const dt = require('../lib/datatable');
  const params = dt.parseParams(req, { defaultSort: 'id', allowedSorts: ['id','userEmail','action','entity','createdAt'] });
  const action = String(req.query.action || '').trim();
  params._extra = { action };
  const where = {};
  if (action) where.action = { contains: action };
  if (params.q) where.OR = [
    { userEmail: { contains: params.q } },
    { entity: { contains: params.q } },
    { entityId: { contains: params.q } },
    { details: { contains: params.q } },
  ];
  const orderBy = {}; orderBy[params.sort] = params.dir;
  const [totalUnfiltered, total, items, actions] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy, skip: params.skip, take: params.take }),
    prisma.auditLog.groupBy({ by: ['action'], _count: { _all: true }, orderBy: { _count: { action: 'desc' } }, take: 30 }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / params.perPage));
  const links = dt.pageLinks(params.page, totalPages);
  res.render('audit/list', {
    title: 'Log attività',
    items, action, actions,
    params, total, totalUnfiltered, totalPages, links,
  });
}));

module.exports = router;
