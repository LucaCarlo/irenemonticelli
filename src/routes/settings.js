const express = require('express');
const prisma = require('../lib/db');
const settings = require('../lib/settings');
const backup = require('../lib/backup');
const { sendMail } = require('../lib/mailer');
const { requirePermission } = require('../middleware/rbac');
const audit = require('../lib/audit');

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
  // Audit log: registra il gruppo e le chiavi modificate (NON i valori, che possono contenere segreti)
  await audit.log(req, 'settings.save', { entity: 'Setting', entityId: group, details: { keys: Object.keys(data) } });
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

// ---- Statistiche sito (analytics dettagliato) ----
router.get('/stats', requirePermission('stats.view'), async (req, res) => {
  // Range supportati:
  //   ?range=1|7|30|365  → ultimi N giorni
  //   ?range=all          → da quando esistono i primi dati (calcolato dinamicamente)
  //   ?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD  → intervallo personalizzato
  const rangeRaw = String(req.query.range || '30').toLowerCase();
  let since, until = new Date();
  let days = 30;
  let rangeKey = rangeRaw; // valore usato nella view per evidenziare il pulsante attivo
  let customFrom = '', customTo = '';

  if (rangeRaw === 'all') {
    const oldest = await prisma.pageView.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
    since = oldest ? oldest.createdAt : new Date(Date.now() - 30 * 86400 * 1000);
    days = Math.max(1, Math.ceil((until.getTime() - since.getTime()) / 86400000));
  } else if (rangeRaw === 'custom' && req.query.from && req.query.to) {
    const f = new Date(String(req.query.from) + 'T00:00:00');
    const t = new Date(String(req.query.to)   + 'T23:59:59');
    if (!isNaN(f) && !isNaN(t) && f <= t) {
      since = f; until = t;
      days = Math.max(1, Math.ceil((until.getTime() - since.getTime()) / 86400000));
      customFrom = req.query.from; customTo = req.query.to;
    } else {
      // fallback se date invalide
      rangeKey = '30';
      since = new Date(Date.now() - 30 * 86400 * 1000);
      days = 30;
    }
  } else {
    const n = parseInt(rangeRaw, 10);
    days = Math.max(1, Math.min(1825, isFinite(n) ? n : 30));   // max 5 anni di sicurezza
    rangeKey = String(days);
    since = new Date(Date.now() - days * 86400 * 1000);
  }

  const [
    overviewBase, totalPV, totalSessions, totalVisitors,
    bookingsTotal, bookingsConfirmed, contactMessages,
  ] = await Promise.all([
    prisma.media.aggregate({ _sum: { sizeBytes: true, smallBytes: true } }),
    prisma.pageView.count({ where: { createdAt: { gte: since, lte: until } } }),
    prisma.pageView.groupBy({ by: ['sessionId'], where: { createdAt: { gte: since, lte: until } }, _count: { _all: true } }),
    prisma.pageView.groupBy({ by: ['visitorId'], where: { createdAt: { gte: since, lte: until }, visitorId: { not: '' } }, _count: { _all: true } }),
    // Esclude bozze autosalvate (isDraft) dai conteggi "prenotazioni totali"
    prisma.booking.count({ where: { createdAt: { gte: since, lte: until }, isDraft: false } }),
    prisma.booking.count({ where: { createdAt: { gte: since, lte: until }, status: 'confirmed', paymentStatus: 'paid' } }),
    prisma.contactMessage.count({ where: { createdAt: { gte: since, lte: until } } }),
  ]);

  // Pageview per giorno (per line chart)
  const allViews = await prisma.pageView.findMany({
    where: { createdAt: { gte: since, lte: until } },
    select: { sessionId: true, visitorId: true, path: true, country: true, countryCode: true, city: true,
      deviceType: true, browser: true, os: true, durationMs: true, referrerHost: true, createdAt: true },
  });

  // Aggrega per giorno (YYYY-MM-DD)
  const byDay = {};
  const dayStart = new Date(since.getFullYear(), since.getMonth(), since.getDate());
  for (let i = 0; i <= days; i++) {
    const d = new Date(dayStart.getTime() + i * 86400 * 1000);
    if (d > until) break;
    byDay[d.toISOString().slice(0, 10)] = { pv: 0, sessions: new Set(), visitors: new Set() };
  }
  const sessionPageCount = {}; // sessionId -> count
  const topPages = {}, topCountries = {}, topDevices = {}, topBrowsers = {}, topOS = {}, topReferrers = {}, topCities = {};
  let totalDuration = 0, durationCount = 0;
  for (const v of allViews) {
    const k = v.createdAt.toISOString().slice(0, 10);
    if (byDay[k]) {
      byDay[k].pv++;
      if (v.sessionId) byDay[k].sessions.add(v.sessionId);
      if (v.visitorId) byDay[k].visitors.add(v.visitorId);
    }
    sessionPageCount[v.sessionId] = (sessionPageCount[v.sessionId] || 0) + 1;
    if (v.path) topPages[v.path] = (topPages[v.path] || 0) + 1;
    if (v.country) topCountries[v.country] = (topCountries[v.country] || 0) + 1;
    if (v.city) topCities[v.city] = (topCities[v.city] || 0) + 1;
    if (v.deviceType) topDevices[v.deviceType] = (topDevices[v.deviceType] || 0) + 1;
    if (v.browser) topBrowsers[v.browser] = (topBrowsers[v.browser] || 0) + 1;
    if (v.os) topOS[v.os] = (topOS[v.os] || 0) + 1;
    if (v.referrerHost) topReferrers[v.referrerHost] = (topReferrers[v.referrerHost] || 0) + 1;
    if (v.durationMs > 0) { totalDuration += v.durationMs; durationCount++; }
  }

  // Bounce rate = sessioni con 1 sola pageview / sessioni totali
  const sessionsArr = Object.values(sessionPageCount);
  const bounces = sessionsArr.filter((c) => c === 1).length;
  const totalSess = sessionsArr.length;
  const bounceRate = totalSess ? Math.round((bounces / totalSess) * 100) : 0;

  // Funnel: visitatori che hanno toccato in ordine landing -> pro-dance -> reserva/* -> reserva/success
  // (basato su unique sessionId)
  const sessPaths = {};
  for (const v of allViews) {
    if (!sessPaths[v.sessionId]) sessPaths[v.sessionId] = new Set();
    sessPaths[v.sessionId].add(v.path);
  }
  let stepLand = 0, stepProD = 0, stepReserva = 0, stepSuccess = 0;
  for (const sid of Object.keys(sessPaths)) {
    const p = sessPaths[sid];
    stepLand++;
    const sawProDance = Array.from(p).some((x) => x === '/pro-dance' || x === '/pro-dance.html');
    if (sawProDance) stepProD++;
    const sawReserva = Array.from(p).some((x) => /^\/reserva(\/|$)/.test(x));
    if (sawReserva) stepReserva++;
    const sawSuccess = p.has('/reserva/success');
    if (sawSuccess) stepSuccess++;
  }

  const series = Object.keys(byDay).map((d) => ({
    date: d,
    pv: byDay[d].pv,
    sessions: byDay[d].sessions.size,
    visitors: byDay[d].visitors.size,
  }));

  const toTopN = (obj, n = 10) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);

  res.render('stats', {
    title: 'Statistiche',
    days, rangeKey, customFrom, customTo,
    sinceISO: since.toISOString().slice(0, 10),
    untilISO: until.toISOString().slice(0, 10),
    data: {
      // Riepilogo storage/utenti
      storageBytes: (overviewBase._sum.sizeBytes || 0) + (overviewBase._sum.smallBytes || 0),
      // Periodo
      totalPageviews: totalPV,
      totalSessions: totalSess,
      totalVisitors: totalVisitors.length,
      bounceRate,
      avgDurationSec: durationCount ? Math.round(totalDuration / durationCount / 1000) : 0,
      bookingsTotal,
      bookingsConfirmed,
      conversionRate: totalSess ? Math.round((bookingsConfirmed / totalSess) * 10000) / 100 : 0,
      contactMessages,
      // Series
      series,
      topPages: toTopN(topPages, 15),
      topCountries: toTopN(topCountries, 10),
      topCities: toTopN(topCities, 10),
      topDevices: toTopN(topDevices, 5),
      topBrowsers: toTopN(topBrowsers, 8),
      topOS: toTopN(topOS, 8),
      topReferrers: toTopN(topReferrers, 10),
      funnel: [
        { label: 'Visitatori (landing)', count: stepLand },
        { label: 'Hanno visto Pro Dance', count: stepProD },
        { label: 'Hanno aperto un /reserva', count: stepReserva },
        { label: 'Pagamento confermato', count: stepSuccess },
      ],
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
