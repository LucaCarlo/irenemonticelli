// Middleware tracking referral: intercetta qualsiasi GET con `?ref=CODE`
// - Logga un ReferralClick (1 per sessione: stessa sessione che torna non duplica)
// - Setta cookie `ref_code` valido 30 giorni
// - Detecta fonte (instagram/whatsapp/tiktok/direct) dal referer header

const crypto = require('crypto');
const prisma = require('../lib/db');

const REF_COOKIE = 'ref_code';
const COOKIE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 giorni
const SESSION_COOKIE = 'ref_sid';

function hashIp(ip) {
  return crypto.createHash('sha256').update(String(ip || '')).digest('hex').slice(0, 32);
}

function detectSource(referer) {
  const r = String(referer || '').toLowerCase();
  if (!r) return 'direct';
  if (/instagram\.com|l\.instagram/.test(r)) return 'instagram';
  if (/whatsapp|wa\.me|api\.whatsapp/.test(r)) return 'whatsapp';
  if (/tiktok\.com/.test(r)) return 'tiktok';
  if (/facebook\.com|fb\.com/.test(r)) return 'facebook';
  if (/twitter\.com|x\.com|t\.co/.test(r)) return 'twitter';
  if (/youtube\.com|youtu\.be/.test(r)) return 'youtube';
  if (/google\.com|bing|duckduckgo/.test(r)) return 'search';
  return 'other';
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  raw.split(';').forEach((p) => {
    const [k, v] = p.split('=');
    if (k && v) out[k.trim()] = decodeURIComponent(v.trim());
  });
  return out;
}

function clientIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.ip ||
    (req.connection && req.connection.remoteAddress) ||
    ''
  );
}

async function refTracker(req, res, next) {
  try {
    if (req.method !== 'GET') return next();

    const cookies = parseCookies(req);
    let refCode = String(req.query.ref || '').trim().toUpperCase().replace(/\s+/g, '');
    const cookieCode = cookies[REF_COOKIE] || '';
    let sessionId = cookies[SESSION_COOKIE] || '';

    // Genera sessionId se mancante
    if (!sessionId) {
      sessionId = crypto.randomBytes(12).toString('hex');
      res.append('Set-Cookie', `${SESSION_COOKIE}=${sessionId}; Path=/; Max-Age=${30 * 24 * 60 * 60}; SameSite=Lax`);
    }

    // Esporta il codice attivo (URL > cookie) per le view (es. pre-fill checkout)
    res.locals.refCookieCode = refCode || cookieCode || '';

    // Se non c'è ?ref nuovo nell'URL, fine.
    if (!refCode) return next();

    // Valida il codice nel DB (deve esistere, attivo, referrer approvato)
    const code = await prisma.referralCode.findUnique({
      where: { code: refCode },
      include: { referrer: { select: { status: true } } },
    });
    if (!code || !code.active || !code.referrer || code.referrer.status !== 'approved') {
      return next(); // codice invalid → niente cookie, niente click
    }

    // Setta/aggiorna il cookie ref_code (TTL 30g, refresh ogni visita con ?ref valido)
    res.append('Set-Cookie',
      `${REF_COOKIE}=${refCode}; Path=/; Max-Age=${COOKIE_TTL_MS / 1000}; SameSite=Lax`);

    // Salva click in DB (1 per sessione: se la stessa sessione torna con stesso codice, non duplica)
    const existing = await prisma.referralClick.findFirst({
      where: { sessionId, codeId: code.id },
      select: { id: true },
    });
    if (!existing) {
      const referer = req.headers['referer'] || req.headers['referrer'] || '';
      await prisma.referralClick.create({
        data: {
          codeId: code.id,
          sessionId,
          ipHash: hashIp(clientIp(req)),
          userAgent: String(req.headers['user-agent'] || '').slice(0, 240),
          referrerUrl: String(referer).slice(0, 240),
          source: detectSource(referer),
          country: String(req.headers['cf-ipcountry'] || req.headers['x-country'] || '').slice(0, 4),
          landingPath: String(req.path || '/').slice(0, 200),
        },
      }).catch(() => {}); // best-effort: non bloccare la pagina
    }
  } catch (e) {
    console.error('[refTracker]', e.message);
  }
  next();
}

module.exports = { refTracker, REF_COOKIE, SESSION_COOKIE };
