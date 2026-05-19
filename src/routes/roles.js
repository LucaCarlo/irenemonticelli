const express = require('express');
const prisma = require('../lib/db');
const { CATALOG, ALL_KEYS } = require('../lib/permissions');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();

function parsePerms(body) {
  let selected = body.permissions || [];
  if (!Array.isArray(selected)) selected = [selected];
  return selected.filter((k) => ALL_KEYS.includes(k));
}

router.get('/', requirePermission('roles.view'), async (req, res) => {
  const roles = await prisma.role.findMany({
    include: { _count: { select: { users: true } } },
    orderBy: { id: 'asc' },
  });
  res.render('roles/list', { title: 'Ruoli', roles });
});

router.get('/new', requirePermission('roles.create'), (req, res) => {
  res.render('roles/form', { title: 'Nuovo ruolo', role: null, CATALOG, selected: [] });
});

router.post('/', requirePermission('roles.create'), async (req, res) => {
  const { name, description } = req.body;
  const exists = await prisma.role.findUnique({ where: { name: String(name).trim() } });
  if (exists) {
    req.flash('error', 'Esiste gia un ruolo con questo nome.');
    return res.redirect('/admin/roles/new');
  }
  await prisma.role.create({
    data: {
      name: String(name).trim(),
      description: description || '',
      permissions: JSON.stringify(parsePerms(req.body)),
      isSystem: false,
    },
  });
  req.flash('success', 'Ruolo creato.');
  res.redirect('/admin/roles');
});

router.get('/:id/edit', requirePermission('roles.edit'), async (req, res) => {
  const role = await prisma.role.findUnique({ where: { id: parseInt(req.params.id, 10) } });
  if (!role) return res.redirect('/admin/roles');
  let selected = [];
  try {
    selected = JSON.parse(role.permissions || '[]');
  } catch {}
  res.render('roles/form', { title: 'Modifica ruolo', role, CATALOG, selected });
});

router.post('/:id', requirePermission('roles.edit'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) return res.redirect('/admin/roles');
  if (role.isSystem) {
    req.flash('error', 'Il ruolo di sistema "Super Admin" non e modificabile.');
    return res.redirect('/admin/roles');
  }
  await prisma.role.update({
    where: { id },
    data: {
      name: String(req.body.name).trim(),
      description: req.body.description || '',
      permissions: JSON.stringify(parsePerms(req.body)),
    },
  });
  req.flash('success', 'Ruolo aggiornato.');
  res.redirect('/admin/roles');
});

router.post('/:id/delete', requirePermission('roles.delete'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const role = await prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
  if (!role) return res.redirect('/admin/roles');
  if (role.isSystem) {
    req.flash('error', 'Il ruolo di sistema non puo essere eliminato.');
    return res.redirect('/admin/roles');
  }
  if (role._count.users > 0) {
    req.flash('error', `Ci sono ${role._count.users} utenti con questo ruolo. Riassegnali prima di eliminarlo.`);
    return res.redirect('/admin/roles');
  }
  await prisma.role.delete({ where: { id } });
  req.flash('success', 'Ruolo eliminato.');
  res.redirect('/admin/roles');
});

module.exports = router;
