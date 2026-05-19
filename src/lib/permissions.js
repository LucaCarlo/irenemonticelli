// Catalogo permessi raggruppato. "*" in un ruolo = tutti i permessi.
// Le aree non ancora implementate sono gi� previste qui cos� i ruoli sono
// pronti quando le costruiremo (eventi, prenotazioni, piani...).

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
    group: 'Sistema',
    items: [
      { key: 'stats.view', label: 'Vedere statistiche' },
      { key: 'backup.manage', label: 'Gestire backup' },
    ],
  },
  // ---- Aree future (gi� mappate, implementazione successiva) ----
  {
    group: 'Contenuti (in arrivo)',
    items: [
      { key: 'events.manage', label: 'Gestire eventi' },
      { key: 'professors.manage', label: 'Gestire professori' },
      { key: 'pages.manage', label: 'Gestire pagine' },
    ],
  },
  {
    group: 'Prenotazioni (in arrivo)',
    items: [
      { key: 'plans.manage', label: 'Gestire piani/pacchetti' },
      { key: 'bookings.manage', label: 'Gestire prenotazioni' },
    ],
  },
  {
    group: 'Comunicazione (in arrivo)',
    items: [
      { key: 'newsletter.manage', label: 'Gestire newsletter' },
      { key: 'messages.manage', label: 'Gestire messaggi di contatto' },
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
