const express = require('express');
const prisma = require('../lib/db');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();
const A = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Sanitizzazione semplice dell'HTML della descrizione: solo tag di formattazione.
function sanitize(html) {
  let s = String(html || '');
  // togli script/style/eventi
  s = s.replace(/<\s*(script|style|iframe|object|embed)[\s\S]*?<\/\s*\1\s*>/gi, '');
  s = s.replace(/ on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  s = s.replace(/javascript:/gi, '');
  // rimuovi tag non in allowlist
  const allow = ['b', 'strong', 'i', 'em', 'u', 'br', 'p', 'ul', 'ol', 'li', 'a', 'span', 'h3', 'h4', 'blockquote'];
  s = s.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (m, tag, attrs) => {
    tag = tag.toLowerCase();
    if (allow.indexOf(tag) < 0) return '';
    if (tag === 'a') {
      const href = (attrs.match(/href\s*=\s*("([^"]*)"|'([^']*)')/i) || [])[0] || '';
      return m[1] === '/' ? '</a>' : `<a ${href} target="_blank" rel="noopener">`;
    }
    return m.startsWith('</') ? `</${tag}>` : `<${tag}>`;
  });
  return s.trim().slice(0, 8000);
}

async function withPhoto(list) {
  const ids = list.map((p) => p.photoMediaId).filter(Boolean);
  const media = ids.length ? await prisma.media.findMany({ where: { id: { in: ids } } }) : [];
  const byId = Object.fromEntries(media.map((m) => [m.id, m]));
  return list.map((p) => ({ ...p, photo: p.photoMediaId ? byId[p.photoMediaId] || null : null }));
}

router.use(requirePermission('professors.manage'));

router.get('/', A(async (req, res) => {
  let profs = await prisma.professor.findMany({ orderBy: [{ sort: 'asc' }, { id: 'asc' }] });
  profs = await withPhoto(profs);
  res.render('professors/list', { title: 'Professori', profs });
}));

router.get('/new', (req, res) => {
  res.render('professors/form', { title: 'Nuovo professore', prof: null, photo: null });
});

router.post('/', A(async (req, res) => {
  const b = req.body;
  await prisma.professor.create({
    data: {
      firstName: (b.firstName || '').trim(),
      lastName: (b.lastName || '').trim(),
      danceType: (b.danceType || '').trim(),
      descriptionHtml: sanitize(b.descriptionHtml),
      photoMediaId: b.photoMediaId ? +b.photoMediaId : null,
      active: b.active ? true : false,
      sort: parseInt(b.sort, 10) || 0,
    },
  });
  req.flash('success', 'Professore creato.');
  res.redirect('/admin/professors');
}));

router.get('/:id(\\d+)/edit', A(async (req, res) => {
  const prof = await prisma.professor.findUnique({ where: { id: +req.params.id } });
  if (!prof) return res.redirect('/admin/professors');
  const photo = prof.photoMediaId ? await prisma.media.findUnique({ where: { id: prof.photoMediaId } }) : null;
  res.render('professors/form', { title: 'Modifica professore', prof, photo });
}));

router.post('/:id(\\d+)', A(async (req, res) => {
  const b = req.body;
  await prisma.professor.update({
    where: { id: +req.params.id },
    data: {
      firstName: (b.firstName || '').trim(),
      lastName: (b.lastName || '').trim(),
      danceType: (b.danceType || '').trim(),
      descriptionHtml: sanitize(b.descriptionHtml),
      photoMediaId: b.photoMediaId ? +b.photoMediaId : null,
      active: b.active ? true : false,
      sort: parseInt(b.sort, 10) || 0,
    },
  });
  req.flash('success', 'Professore aggiornato.');
  res.redirect('/admin/professors');
}));

router.post('/:id(\\d+)/toggle', A(async (req, res) => {
  const p = await prisma.professor.findUnique({ where: { id: +req.params.id } });
  if (p) await prisma.professor.update({ where: { id: p.id }, data: { active: !p.active } });
  req.flash('success', 'Stato aggiornato.');
  res.redirect('/admin/professors');
}));

router.post('/:id(\\d+)/delete', A(async (req, res) => {
  await prisma.professor.delete({ where: { id: +req.params.id } });
  req.flash('success', 'Professore eliminato.');
  res.redirect('/admin/professors');
}));

module.exports = router;
