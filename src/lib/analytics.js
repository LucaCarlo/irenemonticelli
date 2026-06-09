// Parser user-agent + GeoIP via geoip-lite. Usato dal route /track.
const crypto = require('crypto');

let geoip = null;
try { geoip = require('geoip-lite'); } catch { /* opzionale */ }

let UAParser = null;
try { UAParser = require('ua-parser-js'); } catch { /* opzionale */ }

const BOT_RE = /bot|crawl|spider|slurp|fetcher|preview|wget|curl|headless|monitor|uptime|pingdom|lighthouse/i;

function ipHash(ip) {
  if (!ip) return '';
  return crypto.createHash('sha256').update(String(ip) + '|im-salt-2026').digest('hex').slice(0, 24);
}

function deviceFromUA(uaStr) {
  if (!uaStr) return { deviceType: '', browser: '', browserVer: '', os: '', isBot: false };
  const isBot = BOT_RE.test(uaStr);
  let info = { deviceType: 'desktop', browser: '', browserVer: '', os: '' };
  if (UAParser) {
    try {
      const u = new UAParser(uaStr).getResult();
      info.browser = (u.browser && u.browser.name) || '';
      info.browserVer = (u.browser && u.browser.version) || '';
      info.os = (u.os && u.os.name) || '';
      const dt = (u.device && u.device.type) || '';
      // ua-parser usa: mobile, tablet, smarttv, console, wearable, embedded. Altrimenti desktop.
      info.deviceType = dt === 'mobile' || dt === 'tablet' ? dt : 'desktop';
    } catch { /* ignore */ }
  } else {
    // fallback grezzo
    if (/mobile|iphone|android.+mobile/i.test(uaStr)) info.deviceType = 'mobile';
    else if (/ipad|tablet/i.test(uaStr)) info.deviceType = 'tablet';
  }
  if (isBot) info.deviceType = 'bot';
  return { ...info, isBot };
}

function geoFromIp(ip) {
  if (!geoip || !ip) return { country: '', countryCode: '', region: '', city: '' };
  try {
    // geoip-lite vuole un IP "puro" (no porta)
    const clean = String(ip).replace(/^::ffff:/, '').split(',')[0].trim().split(':')[0];
    const g = geoip.lookup(clean);
    if (!g) return { country: '', countryCode: '', region: '', city: '' };
    return {
      countryCode: g.country || '',
      country: countryName(g.country) || g.country || '',
      region: g.region || '',
      city: g.city || '',
    };
  } catch { return { country: '', countryCode: '', region: '', city: '' }; }
}

// Mini mappa nome stati (solo i più probabili per IT/ES)
const CC = {
  IT: 'Italia', ES: 'España', FR: 'Francia', DE: 'Germania', GB: 'Regno Unito', US: 'Stati Uniti',
  NL: 'Paesi Bassi', BE: 'Belgio', CH: 'Svizzera', AT: 'Austria', PT: 'Portogallo', PL: 'Polonia',
  IE: 'Irlanda', SE: 'Svezia', NO: 'Norvegia', DK: 'Danimarca', FI: 'Finlandia', CZ: 'Cechia',
  RO: 'Romania', HU: 'Ungheria', GR: 'Grecia', BR: 'Brasile', AR: 'Argentina', MX: 'Messico',
  CO: 'Colombia', PE: 'Perù', CL: 'Cile', UY: 'Uruguay', VE: 'Venezuela', CA: 'Canada',
  AU: 'Australia', NZ: 'Nuova Zelanda', JP: 'Giappone', CN: 'Cina', IN: 'India', RU: 'Russia',
  UA: 'Ucraina', TR: 'Turchia', IL: 'Israele', AE: 'Emirati Arabi Uniti', MA: 'Marocco',
  EG: 'Egitto', ZA: 'Sudafrica',
};
function countryName(code) { return CC[code] || ''; }

function refererHost(ref) {
  if (!ref) return '';
  try { return new URL(ref).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

module.exports = { ipHash, deviceFromUA, geoFromIp, refererHost };
