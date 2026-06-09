// Endpoint pubblico per il tracker analytics. Riceve un piccolo JSON e
// salva una riga PageView (con GeoIP + parsing UA). Sopporta beacon su unload
// per registrare la durata della visita.
const express = require('express');
const prisma = require('../lib/db');
const { ipHash, deviceFromUA, geoFromIp, refererHost } = require('../lib/analytics');

const router = express.Router();

function clientIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.ip ||
    (req.connection && req.connection.remoteAddress) ||
    ''
  );
}

router.post('/track', express.json({ limit: '8kb' }), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.sessionId || !b.path) return res.json({ ok: true, ignored: true });
    const ip = clientIp(req);
    const ua = req.headers['user-agent'] || '';
    const dev = deviceFromUA(ua);
    if (dev.isBot) return res.json({ ok: true, bot: true });
    const geo = geoFromIp(ip);
    await prisma.pageView.create({
      data: {
        sessionId: String(b.sessionId).slice(0, 64),
        visitorId: String(b.visitorId || '').slice(0, 64),
        path: String(b.path || '').slice(0, 240),
        title: String(b.title || '').slice(0, 200),
        referrer: String(b.referrer || '').slice(0, 500),
        referrerHost: refererHost(b.referrer || ''),
        country: geo.country,
        countryCode: geo.countryCode,
        region: geo.region,
        city: geo.city,
        deviceType: dev.deviceType,
        browser: dev.browser,
        browserVer: dev.browserVer,
        os: dev.os,
        durationMs: Math.max(0, parseInt(b.durationMs, 10) || 0),
        isBot: false,
        ipHash: ipHash(ip),
      },
    });
    res.json({ ok: true });
  } catch (e) {
    // Mai bloccare: silenziosamente ok
    res.json({ ok: true, err: 1 });
  }
});

// Aggiorna SOLO la duration dell'ultimo pageview di una sessione/path
// (chiamato in unload via navigator.sendBeacon)
router.post('/track/duration', express.json({ limit: '4kb' }), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.sessionId || !b.path || !b.durationMs) return res.json({ ok: true });
    const ms = Math.max(0, Math.min(1800000, parseInt(b.durationMs, 10) || 0)); // cap 30min
    const last = await prisma.pageView.findFirst({
      where: { sessionId: String(b.sessionId).slice(0, 64), path: String(b.path).slice(0, 240) },
      orderBy: { id: 'desc' },
    });
    if (last) await prisma.pageView.update({ where: { id: last.id }, data: { durationMs: ms } });
    res.json({ ok: true });
  } catch {
    res.json({ ok: true });
  }
});

module.exports = router;
