const express = require('express');
const prisma = require('../lib/db');
const settings = require('../lib/settings');
const backup = require('../lib/backup');
const { sendMail } = require('../lib/mailer');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();

// ---- Impostazioni (tabs per gruppo) ----
router.get('/', requirePermission('settings.view'), async (req, res) => {
  const values = await settings.all();
  const mediaIds = ['logo_media_id', 'favicon_media_id']
    .map((k) => parseInt(values[k], 10))
    .filter(Boolean);
  const pickedMedia = mediaIds.length
    ? await prisma.media.findMany({ where: { id: { in: mediaIds } } })
    : [];
  res.render('settings', {
    title: 'Impostazioni',
    active: req.query.tab || 'general',
    values,
    pickedMedia: Object.fromEntries(pickedMedia.map((m) => [m.id, m])),
  });
});

router.post('/:group', requirePermission('settings.edit'), async (req, res) => {
  const group = req.params.group;
  if (!settings.SCHEMA[group]) {
    req.flash('error', 'Gruppo impostazioni non valido.');
    return res.redirect('/admin/settings');
  }
  const data = {};
  for (const f of settings.SCHEMA[group].fields) {
    if (f.type === 'bool') {
      data[f.key] = req.body[f.key] ? '1' : '0';
    } else if (req.body[f.key] !== undefined) {
      data[f.key] = req.body[f.key];
    }
  }
  await settings.setMany(data, group);
  req.flash('success', `Impostazioni "${settings.SCHEMA[group].label}" salvate.`);
  res.redirect('/admin/settings?tab=' + group);
});

router.post('/test-email', requirePermission('settings.edit'), async (req, res) => {
  try {
    await sendMail({
      to: req.body.to || req.user.email,
      subject: 'Test SMTP — Irene Monticelli Admin',
      text: 'Se leggi questa email, la configurazione SMTP funziona correttamente.',
    });
    req.flash('success', 'Email di test inviata a ' + (req.body.to || req.user.email));
  } catch (e) {
    req.flash('error', 'Invio fallito: ' + e.message);
  }
  res.redirect('/admin/settings?tab=smtp');
});

// ---- Statistiche sito ----
router.get('/stats', requirePermission('stats.view'), async (req, res) => {
  const [users, activeUsers, roles, media, images, agg, byUploader] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.role.count(),
    prisma.media.count(),
    prisma.media.count({ where: { isImage: true } }),
    prisma.media.aggregate({ _sum: { sizeBytes: true, smallBytes: true } }),
    prisma.media.groupBy({ by: ['uploadedById'], _count: { _all: true } }),
  ]);
  res.render('stats', {
    title: 'Statistiche',
    data: {
      users,
      activeUsers,
      roles,
      media,
      images,
      storageBytes: (agg._sum.sizeBytes || 0) + (agg._sum.smallBytes || 0),
      uploaders: byUploader.length,
    },
  });
});

// ---- Backup ----
router.get('/backup', requirePermission('backup.manage'), (req, res) => {
  res.render('backup', { title: 'Backup', backups: backup.list() });
});

router.post('/backup/create', requirePermission('backup.manage'), async (req, res) => {
  try {
    const r = await backup.create();
    req.flash('success', `Backup creato: ${r.name}`);
  } catch (e) {
    req.flash('error', 'Backup fallito: ' + e.message);
  }
  res.redirect('/admin/settings/backup');
});

router.get('/backup/download/:name', requirePermission('backup.manage'), (req, res) => {
  const fp = backup.filePath(req.params.name);
  if (!fp) return res.status(404).send('Backup non trovato');
  res.download(fp);
});

router.post('/backup/delete/:name', requirePermission('backup.manage'), (req, res) => {
  backup.remove(req.params.name);
  req.flash('success', 'Backup eliminato.');
  res.redirect('/admin/settings/backup');
});

module.exports = router;
