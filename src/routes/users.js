const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../lib/db');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();

router.get('/', requirePermission('users.view'), async (req, res) => {
  const users = await prisma.user.findMany({
    include: { role: true },
    orderBy: { createdAt: 'asc' },
  });
  res.render('users/list', { title: 'Utenti admin', users });
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
      mustChangePassword: true,
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
  await prisma.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } });
  req.flash('success', `Password reimpostata. Nuova password temporanea: ${tempPassword}`);
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
