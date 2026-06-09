// Endpoint pubblico per il footer dinamico + pagine Privacy/Cookies in Spagnolo.
const express = require('express');
const fs = require('fs');
const path = require('path');
const settings = require('../lib/settings');
const { PRIVACY_DEFAULT_HTML, COOKIES_DEFAULT_HTML, fillVars } = require('../lib/legal-defaults');

const router = express.Router();
const A = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---- Riusa lo shell del sito (header + footer) di pro-dance.html ----
let LOGO_DEFS = '';
let SHELL_PREFIX_PRIVACY = '';
let SHELL_PREFIX_COOKIES = '';
let SHELL_SUFFIX = '';
try {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'pro-dance.html'), 'utf8');
  const ds = src.indexOf('<svg width="0" height="0"');
  const de = src.indexOf('</svg>', src.indexOf('</symbol>')) + 6;
  if (ds >= 0 && de > ds) LOGO_DEFS = src.slice(ds, de);
  const hdrE = src.indexOf('</header>', src.indexOf('<header class="site"')) + '</header>'.length;
  const ftS = src.indexOf('<footer');
  if (hdrE > 10 && ftS > 0) {
    function makePrefix(title, pageId) {
      let pre = src.slice(0, hdrE);
      pre = pre.replace(/<title>[\s\S]*?<\/title>/, `<title>${title} — Irene Monticelli</title>`);
      pre = pre.split('id="page-prodance"').join(`id="page-${pageId}"`);
      pre = pre.split('data-page="pro-dance"').join(`data-page="${pageId}"`);
      pre = pre.split('id="header-prodance"').join(`id="header-${pageId}"`);
      pre = pre.split('id="navToggle-prodance"').join(`id="navToggle-${pageId}"`);
      pre = pre.split('id="navLinks-prodance"').join(`id="navLinks-${pageId}"`);
      return pre;
    }
    SHELL_PREFIX_PRIVACY = makePrefix('Política de Privacidad', 'privacidad');
    SHELL_PREFIX_COOKIES = makePrefix('Política de Cookies', 'cookies');
    SHELL_SUFFIX = src.slice(ftS);
  }
} catch (e) { /* fallback */ }

// ---- API pubblica: dati dinamici del footer ----
router.get('/api/site-footer.json', A(async (req, res) => {
  const s = await settings.all();
  res.json({
    creditHtml: s.footer_credit_html || '© 2026 Irene Monticelli',
  });
}));

// ---- API pubblica: programma lezioni (per /pro-dance e checkout) ----
const prisma = require('../lib/db');
router.get('/api/programa.json', A(async (req, res) => {
  // Trova evento attivo (il primo active, oppure il prossimo per data)
  const event = await prisma.event.findFirst({
    where: { active: true },
    orderBy: { startDate: 'asc' },
  });
  if (!event) return res.json({ event: null, days: [] });

  const lessons = await prisma.lesson.findMany({
    where: { eventId: event.id, active: true },
    orderBy: [{ dayIndex: 'asc' }, { sort: 'asc' }],
    include: {
      professor: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  // Raggruppa per giorno
  const dayMap = {};
  lessons.forEach((l) => {
    if (!dayMap[l.dayIndex]) dayMap[l.dayIndex] = [];
    dayMap[l.dayIndex].push({
      time: l.time,
      title: l.title,
      professor: l.professor ? `${l.professor.firstName} ${l.professor.lastName.charAt(0)}.` : '',
      professorFull: l.professor ? `${l.professor.firstName} ${l.professor.lastName}` : '',
      isAfternoon: l.isAfternoon,
      isPause: l.isPause,
    });
  });
  const days = Object.keys(dayMap).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).map((k) => ({
    index: parseInt(k, 10),
    lessons: dayMap[k],
  }));

  res.json({
    event: { title: event.title, location: event.location, startDate: event.startDate, endDate: event.endDate },
    days,
  });
}));

// ---- Pagine Legali ----
function legalVars(s) {
  return {
    company: s.legal_company || 'Irene Monticelli',
    email: s.legal_email || 'info@irenemonticelli.com',
    address: s.legal_address || 'Santa Pola, Alicante, España',
    authority: s.legal_authority || 'Agencia Española de Protección de Datos (AEPD)',
  };
}

router.get('/privacidad', A(async (req, res) => {
  const s = await settings.all();
  const vars = legalVars(s);
  const bodyHtml = fillVars(s.privacy_html || PRIVACY_DEFAULT_HTML, vars);
  res.render('public/privacidad', {
    title: 'Política de Privacidad',
    logoDefs: LOGO_DEFS,
    shellPrefix: SHELL_PREFIX_PRIVACY,
    shellSuffix: SHELL_SUFFIX,
    bodyHtml,
  });
}));

router.get('/cookies', A(async (req, res) => {
  const s = await settings.all();
  const vars = legalVars(s);
  const bodyHtml = fillVars(s.cookies_html || COOKIES_DEFAULT_HTML, vars);
  res.render('public/cookies', {
    title: 'Política de Cookies',
    logoDefs: LOGO_DEFS,
    shellPrefix: SHELL_PREFIX_COOKIES,
    shellSuffix: SHELL_SUFFIX,
    bodyHtml,
  });
}));

module.exports = router;
