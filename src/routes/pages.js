// Pagine: video homepage + Privacy/Cookies policy.
const express = require('express');
const prisma = require('../lib/db');
const settings = require('../lib/settings');
const audit = require('../lib/audit');
const { requirePermission } = require('../middleware/rbac');
const { PRIVACY_DEFAULT_HTML, COOKIES_DEFAULT_HTML } = require('../lib/legal-defaults');

const router = express.Router();
const A = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', requirePermission('pages.manage'), A(async (req, res) => {
  const s = await settings.all();
  const homeVideoId = parseInt(s.home_video_media_id || '0', 10) || 0;
  const homeVideo = homeVideoId ? await prisma.media.findUnique({ where: { id: homeVideoId } }) : null;
  const allowedTabs = ['home', 'privacy', 'cookies'];
  const activeTab = allowedTabs.includes(req.query.tab) ? req.query.tab : 'home';
  res.render('pages/list', {
    title: 'Pagine',
    activeTab,
    homeVideo,
    defaultVideoNote: 'Se vuoto, il sito usa il video di base (Foto sito Irene Monticelli/Video Sito.mp4).',
    privacyHtml: s.privacy_html || PRIVACY_DEFAULT_HTML,
    cookiesHtml: s.cookies_html || COOKIES_DEFAULT_HTML,
    privacyUsesDefault: !s.privacy_html,
    cookiesUsesDefault: !s.cookies_html,
  });
}));

router.post('/home-video', requirePermission('pages.manage'), A(async (req, res) => {
  const id = String(req.body.home_video_media_id || '').trim();
  await settings.setMany({ home_video_media_id: id }, 'pages');
  await audit.log(req, 'pages.home_video.save', { details: { mediaId: id } });
  req.flash('success', id ? 'Video homepage aggiornato.' : 'Video homepage ripristinato al default.');
  res.redirect('/admin/pages?tab=home');
}));

router.post('/privacy', requirePermission('pages.manage'), A(async (req, res) => {
  const html = String(req.body.privacy_html || '').trim();
  await settings.setMany({ privacy_html: html }, 'pages');
  await audit.log(req, 'pages.privacy.save', { details: { bytes: html.length } });
  req.flash('success', html ? 'Política de Privacidad salvata.' : 'Política de Privacidad: tornata al default.');
  res.redirect('/admin/pages?tab=privacy');
}));

router.post('/cookies', requirePermission('pages.manage'), A(async (req, res) => {
  const html = String(req.body.cookies_html || '').trim();
  await settings.setMany({ cookies_html: html }, 'pages');
  await audit.log(req, 'pages.cookies.save', { details: { bytes: html.length } });
  req.flash('success', html ? 'Política de Cookies salvata.' : 'Política de Cookies: tornata al default.');
  res.redirect('/admin/pages?tab=cookies');
}));

// Endpoint pubblico (usato da index.html con fetch JS) per ottenere
// il media corrente del video; ritorna {url} o {default:true}
const publicRouter = express.Router();
publicRouter.get('/api/home-video.json', A(async (req, res) => {
  const s = await settings.all();
  const id = parseInt(s.home_video_media_id || '0', 10) || 0;
  if (!id) return res.json({ default: true });
  const m = await prisma.media.findUnique({ where: { id } });
  if (!m) return res.json({ default: true });
  res.json({ url: m.path, mime: m.mime || 'video/mp4' });
}));

module.exports = router;
module.exports.publicRouter = publicRouter;
