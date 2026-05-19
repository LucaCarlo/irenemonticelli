const express = require('express');
const prisma = require('../lib/db');
const upload = require('../middleware/upload');
const { processUpload, deleteFiles } = require('../lib/images');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();

// Wrapper: inoltra gli errori async all'error handler (niente crash di processo)
const A = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// CSRF verificato dopo multer (che parsa il multipart e popola req.body)
function csrfAfterMulter(req, res, next) {
  const token = (req.body && req.body._csrf) || req.headers['x-csrf-token'];
  if (token && req.session && token === req.session.csrf) return next();
  res.status(403);
  if ((req.headers.accept || '').includes('application/json')) return res.json({ ok: false, error: 'CSRF non valido' });
  return res.render('error', { title: 'CSRF', code: 403, message: 'Token di sicurezza non valido. Riprova.' });
}

router.get(
  '/',
  requirePermission('media.view'),
  A(async (req, res) => {
    const q = (req.query.q || '').trim();
    const where = q
      ? { OR: [{ originalName: { contains: q } }, { title: { contains: q } }, { alt: { contains: q } }] }
      : {};
    const media = await prisma.media.findMany({
      where,
      include: { uploadedBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.render('media/list', { title: 'Media', media, q });
  })
);

// JSON: media picker (es. logo/favicon nelle impostazioni)
router.get(
  '/picker.json',
  requirePermission('media.view'),
  A(async (req, res) => {
    const media = await prisma.media.findMany({
      where: { isImage: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(media);
  })
);

// ---- Upload ----
router.post(
  '/upload',
  requirePermission('media.upload'),
  upload.array('files', 30),
  csrfAfterMulter,
  A(async (req, res) => {
    const wantsJson = req.xhr || (req.headers.accept || '').includes('application/json');
    try {
      const created = [];
      for (const file of req.files || []) {
        const info = await processUpload(file.buffer, file.originalname, file.mimetype);
        const m = await prisma.media.create({
          data: {
            filename: info.filename,
            originalName: info.originalName,
            title: '',
            alt: '',
            mime: info.mime,
            ext: info.ext,
            width: info.width,
            height: info.height,
            sizeBytes: info.sizeBytes,
            smallBytes: info.smallBytes,
            path: info.path,
            smallPath: info.smallPath,
            isImage: info.isImage,
            uploadedById: req.user.id,
          },
        });
        created.push(m);
      }
      if (wantsJson) return res.json({ ok: true, media: created });
      req.flash('success', `${created.length} file caricati e convertiti in WebP.`);
      res.redirect('/admin/media');
    } catch (e) {
      if (wantsJson) return res.status(500).json({ ok: false, error: e.message });
      req.flash('error', 'Upload fallito: ' + e.message);
      res.redirect('/admin/media');
    }
  })
);

// ---- Bulk (DEVE stare prima delle route /:id per non collidere) ----
router.post(
  '/bulk/delete',
  requirePermission('media.delete'),
  A(async (req, res) => {
    let ids = req.body.ids || [];
    if (!Array.isArray(ids)) ids = [ids];
    ids = ids.map((i) => parseInt(i, 10)).filter((n) => Number.isInteger(n));
    const items = await prisma.media.findMany({ where: { id: { in: ids } } });
    for (const m of items) deleteFiles(m);
    await prisma.media.deleteMany({ where: { id: { in: ids } } });
    req.flash('success', `${items.length} media eliminati.`);
    res.redirect('/admin/media');
  })
);

// ---- Singolo media (id numerico) ----
router.get(
  '/:id(\\d+).json',
  requirePermission('media.view'),
  A(async (req, res) => {
    const m = await prisma.media.findUnique({
      where: { id: parseInt(req.params.id, 10) },
      include: { uploadedBy: { select: { name: true } } },
    });
    if (!m) return res.status(404).json({ error: 'not found' });
    res.json(m);
  })
);

router.post(
  '/:id(\\d+)/delete',
  requirePermission('media.delete'),
  A(async (req, res) => {
    const m = await prisma.media.findUnique({ where: { id: parseInt(req.params.id, 10) } });
    if (m) {
      deleteFiles(m);
      await prisma.media.delete({ where: { id: m.id } });
    }
    req.flash('success', 'Media eliminato.');
    res.redirect('/admin/media');
  })
);

router.post(
  '/:id(\\d+)',
  requirePermission('media.edit'),
  A(async (req, res) => {
    await prisma.media.update({
      where: { id: parseInt(req.params.id, 10) },
      data: { title: req.body.title || '', alt: req.body.alt || '' },
    });
    if (req.xhr) return res.json({ ok: true });
    req.flash('success', 'Metadati aggiornati.');
    res.redirect('/admin/media');
  })
);

module.exports = router;
