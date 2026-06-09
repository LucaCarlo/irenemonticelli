// Catalogo permessi raggruppato. "*" in un ruolo = tutti i permessi.

const CATALOG = [
  {
    group: 'Amministrazione',
    items: [
      { key: 'settings.view', label: 'Vedere impostazioni' },
      { key: 'settings.edit', label: 'Modificare impostazioni' },
      { key: 'users.view', label: 'Vedere utenti admin' },
      { key: 'users.create', label: 'Creare utenti admin' },
      { key: 'users.edit', label: 'Modificare utenti admin' },
      { key: 'users.delete', label: 'Eliminare utenti admin' },
      { key: 'roles.view', label: 'Vedere ruoli' },
      { key: 'roles.create', label: 'Creare ruoli' },
      { key: 'roles.edit', label: 'Modificare ruoli' },
      { key: 'roles.delete', label: 'Eliminare ruoli' },
    ],
  },
  {
    group: 'Media',
    items: [
      { key: 'media.view', label: 'Vedere libreria media' },
      { key: 'media.upload', label: 'Caricare media' },
      { key: 'media.edit', label: 'Modificare metadati media' },
      { key: 'media.delete', label: 'Eliminare media' },
    ],
  },
  {
    group: 'Contenuti',
    items: [
      { key: 'events.manage', label: 'Gestire eventi' },
      { key: 'professors.manage', label: 'Gestire professori' },
      { key: 'lessons.manage', label: 'Gestire programma lezioni' },
      { key: 'pages.manage', label: 'Gestire pagine (video homepage, ...)' },
    ],
  },
  {
    group: 'Prenotazioni',
    items: [
      { key: 'plans.manage', label: 'Gestire piani/pacchetti' },
      { key: 'bookings.manage', label: 'Gestire prenotazioni' },
      { key: 'extras.manage', label: 'Gestire extras/suplementi' },
    ],
  },
  {
    group: 'Comunicazione',
    items: [
      { key: 'messages.view', label: 'Vedere messaggi di contatto' },
      { key: 'messages.delete', label: 'Eliminare messaggi' },
      { key: 'newsletter.manage', label: 'Gestire newsletter (campagne + iscritti)' },
      { key: 'referrals.view', label: 'Vedere referrer' },
      { key: 'referrals.manage', label: 'Approvare/disattivare/eliminare referrer' },
      { key: 'referrals.codes.manage', label: 'Gestire codici sconto referral' },
      { key: 'referrals.commissions.manage', label: 'Vedere e segnare commissioni come pagate' },
    ],
  },
  {
    group: 'Sistema',
    items: [
      { key: 'stats.view', label: 'Vedere statistiche' },
      { key: 'audit.view', label: 'Vedere log attività' },
      { key: 'backup.manage', label: 'Gestire backup' },
    ],
  },
];

const ALL_KEYS = CATALOG.flatMap((g) => g.items.map((i) => i.key));

function hasPermission(user, key) {
  if (!user || !user.role) return false;
  let perms;
  try {
    perms = JSON.parse(user.role.permissions || '[]');
  } catch {
    perms = [];
  }
  if (Array.isArray(perms) && perms.includes('*')) return true;
  return Array.isArray(perms) && perms.includes(key);
}

module.exports = { CATALOG, ALL_KEYS, hasPermission };
