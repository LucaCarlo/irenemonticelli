// Impostazioni sito: key-value su tabella Setting, con cache in memoria.
// I valori sono stringhe; i campi sensibili (password SMTP, chiavi Stripe)
// sono salvati cosi come sono (DB locale/interno). TODO futuro: cifratura.
const prisma = require('./db');

// Schema impostazioni: gruppo -> [{key,label,type,placeholder,help}]
const SCHEMA = {
  general: {
    label: 'Generali',
    fields: [
      { key: 'site_name', label: 'Nome sito', type: 'text', def: 'Irene Monticelli' },
      { key: 'site_tagline', label: 'Sottotitolo', type: 'text', def: 'Bailarina, Coreografa, Profesora' },
      { key: 'admin_title', label: 'Titolo area admin', type: 'text', def: 'Irene Monticelli — Admin' },
      { key: 'logo_media_id', label: 'Logo (media)', type: 'media', help: 'Mostrato nella sidebar admin' },
      { key: 'favicon_media_id', label: 'Favicon (media)', type: 'media', help: 'Usata sia in admin che nel sito pubblico' },
    ],
  },
  contatti: {
    label: 'Contatti',
    fields: [
      { key: 'contact_phone', label: 'Telefono', type: 'text', def: '+34 672047938' },
      { key: 'contact_email', label: 'Email', type: 'text', def: 'info@irenemonticelli.com' },
      { key: 'contact_academia', label: 'Academia', type: 'text', def: 'Academia New Dance Life' },
      { key: 'contact_ciudad', label: 'Ciudad', type: 'text', def: 'Santa Pola - Alicante' },
    ],
  },
  smtp: {
    label: 'SMTP / Email',
    fields: [
      { key: 'smtp_host', label: 'Host SMTP', type: 'text', placeholder: 'smtp.dominio.it' },
      { key: 'smtp_port', label: 'Porta', type: 'number', def: '587' },
      { key: 'smtp_secure', label: 'Connessione sicura (SSL/TLS)', type: 'bool', def: '0' },
      { key: 'smtp_user', label: 'Utente', type: 'text' },
      { key: 'smtp_pass', label: 'Password', type: 'password' },
      { key: 'smtp_from_name', label: 'Mittente (nome)', type: 'text', def: 'Irene Monticelli' },
      { key: 'smtp_from_email', label: 'Mittente (email)', type: 'text', def: 'info@irenemonticelli.com' },
    ],
  },
  stripe: {
    label: 'Stripe',
    fields: [
      { key: 'stripe_mode', label: 'Modalita', type: 'select', options: ['test', 'live'], def: 'test' },
      { key: 'stripe_publishable_key', label: 'Publishable key', type: 'text' },
      { key: 'stripe_secret_key', label: 'Secret key', type: 'password' },
      { key: 'stripe_webhook_secret', label: 'Webhook secret', type: 'password' },
    ],
  },
  recaptcha: {
    label: 'reCAPTCHA Enterprise',
    fields: [
      { key: 'recaptcha_enabled', label: 'Attivo', type: 'bool', def: '0' },
      { key: 'recaptcha_site_key', label: 'Site key', type: 'text' },
      { key: 'recaptcha_project_id', label: 'Project ID (GCP)', type: 'text' },
      { key: 'recaptcha_api_key', label: 'API key', type: 'password' },
    ],
  },
  analytics: {
    label: 'Analytics',
    fields: [
      { key: 'ga_measurement_id', label: 'Google Analytics 4 (G-XXXX)', type: 'text' },
      { key: 'gtm_id', label: 'Google Tag Manager (GTM-XXXX)', type: 'text' },
      { key: 'meta_pixel_id', label: 'Meta Pixel ID', type: 'text' },
    ],
  },
  social: {
    label: 'Social media',
    fields: [
      { key: 'social_instagram', label: 'Instagram (URL)', type: 'text' },
      { key: 'social_facebook', label: 'Facebook (URL)', type: 'text' },
      { key: 'social_youtube', label: 'YouTube (URL)', type: 'text' },
      { key: 'social_tiktok', label: 'TikTok (URL)', type: 'text' },
      { key: 'social_linkedin', label: 'LinkedIn (URL)', type: 'text' },
    ],
  },
};

let cache = null;

async function loadAll() {
  const rows = await prisma.setting.findMany();
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  // applica default mancanti
  for (const g of Object.values(SCHEMA)) {
    for (const f of g.fields) {
      if (map[f.key] === undefined) map[f.key] = f.def !== undefined ? f.def : '';
    }
  }
  cache = map;
  return map;
}

async function all() {
  if (!cache) await loadAll();
  return cache;
}

async function get(key, fallback = '') {
  const a = await all();
  return a[key] !== undefined && a[key] !== '' ? a[key] : fallback;
}

async function setMany(obj, group = 'general') {
  const entries = Object.entries(obj);
  for (const [key, value] of entries) {
    await prisma.setting.upsert({
      where: { key },
      update: { value: String(value), group },
      create: { key, value: String(value), group },
    });
  }
  cache = null; // invalida cache
}

function invalidate() {
  cache = null;
}

module.exports = { SCHEMA, all, get, setMany, invalidate };
