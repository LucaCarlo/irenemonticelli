const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../lib/db');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();

router.get('/', requirePermission('users.view'), async (req, res) => {
  const dt = require('../lib/datatable');
  const params = dt.parseParams(req, {
    defaultSort: 'createdAt',
    allowedSorts: ['name', 'email', 'lastLoginAt', 'createdAt', 'role.name'],
  });
  const roleId = parseInt(req.query.roleId, 10) || 0;
  const status = String(req.query.status || '').trim();
  params._extra = { roleId: roleId || '', status };

  const where = {};
  if (params.q) {
    where.OR = [
      { name: { contains: params.q, mode: 'insensitive' } },
      { email: { contains: params.q, mode: 'insensitive' } },
    ];
  }
  if (roleId) where.roleId = roleId;
  if (status === 'active') where.isActive = true;
  if (status === 'inactive') where.isActive = false;

  let orderBy = {};
  if (params.sort === 'role.name') orderBy = { role: { name: params.dir } };
  else orderBy[params.sort] = params.dir;

  const [totalUnfiltered, total, users, roles] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where }),
    prisma.user.findMany({ where, include: { role: true }, orderBy, skip: params.skip, take: params.take }),
    prisma.role.findMany({ orderBy: { name: 'asc' } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / params.perPage));
  const links = dt.pageLinks(params.page, totalPages);
  res.render('users/list', { title: 'Amministratori', users, params, total, totalUnfiltered, totalPages, links, roles, roleId, status });
});

router.get('/new', requirePermission('users.create'), async (req, res) => {
  const roles = await prisma.role.findMany({ orderBy: { name: 'asc' } });
  res.render('users/form', { title: 'Nuovo utente', user: null, roles, generatedPassword: null });
});

router.post('/', requirePermission('users.create'), async (req, res) => {
  const { name, email, roleId } = req.body;
  const exists = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } });
  if (exists) {
    req.flash('error', 'Esiste gia un utente con questa email.');
    return res.redirect('/admin/users/new');
  }
  const tempPassword =
    req.body.password && req.body.password.length >= 8
      ? req.body.password
      : crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '') + 'A1!';
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  await prisma.user.create({
    data: {
      name,
      email: String(email).toLowerCase().trim(),
      passwordHash,
      roleId: parseInt(roleId, 10),
      isActive: req.body.isActive ? true : false,
      mustChangePassword: false,
    },
  });
  req.flash('success', `Utente creato. Password temporanea: ${tempPassword}`);
  res.redirect('/admin/users');
});

router.get('/:id/edit', requirePermission('users.edit'), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: parseInt(req.params.id, 10) } });
  if (!user) return res.redirect('/admin/users');
  const roles = await prisma.role.findMany({ orderBy: { name: 'asc' } });
  res.render('users/form', { title: 'Modifica utente', user, roles, generatedPassword: null });
});

router.post('/:id', requirePermission('users.edit'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name, email, roleId } = req.body;
  await prisma.user.update({
    where: { id },
    data: {
      name,
      email: String(email).toLowerCase().trim(),
      roleId: parseInt(roleId, 10),
      isActive: req.body.isActive ? true : false,
    },
  });
  req.flash('success', 'Utente aggiornato.');
  res.redirect('/admin/users');
});

router.post('/:id/reset-password', requirePermission('users.edit'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const tempPassword = crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '') + 'A1!';
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  await prisma.user.update({ where: { id }, data: { passwordHash, mustChangePassword: false } });
  req.flash('success', `Password reimpostata. Nuova password: ${tempPassword}`);
  res.redirect('/admin/users');
});

router.post('/:id/toggle', requirePermission('users.edit'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id === req.user.id) {
    req.flash('error', 'Non puoi disattivare te stesso.');
    return res.redirect('/admin/users');
  }
  const u = await prisma.user.findUnique({ where: { id } });
  await prisma.user.update({ where: { id }, data: { isActive: !u.isActive } });
  req.flash('success', 'Stato utente aggiornato.');
  res.redirect('/admin/users');
});

router.post('/:id/delete', requirePermission('users.delete'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id === req.user.id) {
    req.flash('error', 'Non puoi eliminare te stesso.');
    return res.redirect('/admin/users');
  }
  const remaining = await prisma.user.count();
  if (remaining <= 1) {
    req.flash('error', 'Deve restare almeno un utente.');
    return res.redirect('/admin/users');
  }
  await prisma.user.delete({ where: { id } });
  req.flash('success', 'Utente eliminato.');
  res.redirect('/admin/users');
});

module.exports = router;
