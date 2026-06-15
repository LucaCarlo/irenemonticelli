// /admin/contacts — vista unificata di tutti i contatti del sito (prenotazioni + form + newsletter)
const express = require('express');
const prisma = require('../lib/db');
const dt = require('../lib/datatable');

const router = express.Router();
const A = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function canSee(req, res, next) {
  const perms = (req.user && req.user.role && req.user.role.permissions) ? req.user.role.permissions : '[]';
  let arr = [];
  try { arr = JSON.parse(perms || '[]'); } catch {}
  if (Array.isArray(arr) && (arr.includes('*') || arr.includes('messages.view') || arr.includes('bookings.manage'))) return next();
  return res.status(403).render('error', { title: 'Vietato', code: 403, message: 'Permesso negato.' });
}

router.get('/', canSee, A(async (req, res) => {
  const params = dt.parseParams(req, {
    defaultSort: 'lastSeen',
    allowedSorts: ['name', 'email', 'phone', 'lastSeen', 'firstSeen', 'bookingsCount'],
  });
  // Default = solo clienti che hanno prenotato; per vedere tutti basta selezionare "Tutte le fonti"
  const source = (req.query.source !== undefined) ? String(req.query.source).trim() : 'booking';
  params._extra = { source };

  // Carica i 3 source
  const [bookings, messages, subscribers] = await Promise.all([
    prisma.booking.findMany({
      select: { customerName: true, firstName: true, lastName: true, customerEmail: true, phone: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.contactMessage.findMany({
      select: { name: true, email: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.newsletterSubscriber.findMany({
      select: { name: true, email: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  // Mappa email → contatto unificato
  const map = new Map();
  function add(email, data, src) {
    const key = String(email || '').trim().toLowerCase();
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, {
        email: key, name: '', phone: '', sources: new Set(),
        firstSeen: data.createdAt, lastSeen: data.createdAt,
        bookingsCount: 0, messagesCount: 0, newsletter: false,
      });
    }
    const c = map.get(key);
    if (data.name && !c.name) c.name = data.name;
    if (data.phone && !c.phone) c.phone = data.phone;
    c.sources.add(src);
    if (data.createdAt < c.firstSeen) c.firstSeen = data.createdAt;
    if (data.createdAt > c.lastSeen) c.lastSeen = data.createdAt;
    if (src === 'booking') c.bookingsCount++;
    if (src === 'contact') c.messagesCount++;
    if (src === 'newsletter') c.newsletter = true;
  }

  bookings.forEach((b) => add(b.customerEmail, {
    name: (b.firstName && b.lastName) ? `${b.firstName} ${b.lastName}`.trim() : (b.customerName || ''),
    phone: b.phone || '', createdAt: b.createdAt,
  }, 'booking'));
  messages.forEach((m) => add(m.email, { name: m.name || '', phone: '', createdAt: m.createdAt }, 'contact'));
  subscribers.forEach((s) => add(s.email, { name: s.name || '', phone: '', createdAt: s.createdAt }, 'newsletter'));

  let contacts = Array.from(map.values()).map((c) => ({ ...c, sources: Array.from(c.sources) }));
  const totalUnfiltered = contacts.length;

  // Search
  if (params.q) {
    const q = params.q.toLowerCase();
    contacts = contacts.filter((c) => c.email.includes(q) || c.name.toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q));
  }
  // Filtro per fonte
  if (source) contacts = contacts.filter((c) => c.sources.includes(source));

  // Ordinamento
  const cmp = (a, b) => {
    let va, vb;
    switch (params.sort) {
      case 'name': va = (a.name || '').toLowerCase(); vb = (b.name || '').toLowerCase(); break;
      case 'email': va = a.email; vb = b.email; break;
      case 'phone': va = a.phone || ''; vb = b.phone || ''; break;
      case 'firstSeen': va = a.firstSeen; vb = b.firstSeen; break;
      case 'bookingsCount': va = a.bookingsCount; vb = b.bookingsCount; break;
      default: va = a.lastSeen; vb = b.lastSeen;
    }
    if (va < vb) return params.dir === 'asc' ? -1 : 1;
    if (va > vb) return params.dir === 'asc' ? 1 : -1;
    return 0;
  };
  contacts.sort(cmp);

  const total = contacts.length;
  const totalPages = Math.max(1, Math.ceil(total / params.perPage));
  if (params.page > totalPages) params.page = totalPages;
  const paged = contacts.slice(params.skip, params.skip + params.take);
  const links = dt.pageLinks(params.page, totalPages);

  res.render('contacts/list', {
    title: 'Utenti',
    contacts: paged,
    params, total, totalUnfiltered, totalPages, links,
    source,
  });
}));

module.exports = router;
