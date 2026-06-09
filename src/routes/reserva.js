// Prenotazione pubblica + pagamento Stripe (Checkout hosted).
const express = require('express');
const prisma = require('../lib/db');
const settings = require('../lib/settings');
const { getStripe, publishableKey } = require('../lib/stripe');
const B = require('../lib/booking');
const MB = require('../lib/multibooking');

const fs = require('fs');
const path = require('path');
const router = express.Router();
const A = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Logo + SHELL del sito (head+header / footer+scripts) presi UNA volta da
// pro-dance.html, per pagine pubbliche dinamiche con header/footer identici.
let LOGO_DEFS = '';
let SHELL_PREFIX = '';
let SHELL_SUFFIX = '';
try {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'pro-dance.html'), 'utf8');
  const ds = src.indexOf('<svg width="0" height="0"');
  const de = src.indexOf('</svg>', src.indexOf('</symbol>')) + 6;
  if (ds >= 0 && de > ds) LOGO_DEFS = src.slice(ds, de);
  const hdrE = src.indexOf('</header>', src.indexOf('<header class="site"')) + '</header>'.length;
  const ftS = src.indexOf('<footer');
  if (hdrE > 10 && ftS > 0) {
    let pre = src.slice(0, hdrE);
    pre = pre.replace(/<title>[\s\S]*?<\/title>/, '<title>Profesores — Irene Monticelli</title>');
    pre = pre.split('id="page-prodance"').join('id="page-profesores"');
    pre = pre.split('data-page="pro-dance"').join('data-page="profesores"');
    pre = pre.split('id="header-prodance"').join('id="header-profesores"');
    pre = pre.split('id="navToggle-prodance"').join('id="navToggle-profesores"');
    pre = pre.split('id="navLinks-prodance"').join('id="navLinks-profesores"');
    SHELL_PREFIX = pre;
    SHELL_SUFFIX = src.slice(ftS);
  }
} catch (e) { /* fallback */ }

async function loadPlan(slug) {
  const plan = await prisma.plan.findUnique({ where: { slug }, include: { event: true } });
  if (!plan || !plan.active) return null;
  return plan;
}
function baseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}

// Pagina prenotazione (dinamica dal DB)
router.get('/reserva/:slug', A(async (req, res) => {
  const plan = await loadPlan(req.params.slug);
  if (!plan) return res.status(404).render('public/notfound', { title: 'Pack no encontrado' });
  const event = plan.event;
  const others = await prisma.plan.findMany({
    where: { active: true, slug: { not: plan.slug } },
    orderBy: { sort: 'asc' },
    select: { slug: true, name: true, price: true, currency: true, pricingJson: true, bookingMode: true },
  });
  function dispPrice(p) {
    const pr = B.pricing(p);
    if (pr.type === 'lessons' && pr.options && pr.options[0]) return pr.options[0].price;
    return B.tierPrice(pr);
  }

  // Lezioni del Programa: arricchiscono il checkout (titolo + professore per ogni orario)
  let lessons = {};
  if (event) {
    const list = await prisma.lesson.findMany({
      where: { eventId: event.id, active: true },
      orderBy: [{ dayIndex: 'asc' }, { sort: 'asc' }],
      include: { professor: { select: { firstName: true, lastName: true } } },
    });
    list.forEach((l) => {
      if (!lessons[l.dayIndex]) lessons[l.dayIndex] = {};
      lessons[l.dayIndex][l.time] = {
        title: l.title,
        professor: l.professor ? `${l.professor.firstName} ${l.professor.lastName.charAt(0)}.` : '',
        professorFull: l.professor ? `${l.professor.firstName} ${l.professor.lastName}` : '',
        isAfternoon: l.isAfternoon,
        isPause: l.isPause,
      };
    });
  }

  const s = await settings.all();
  const refundDays = parseInt(s.refund_days || '15', 10) || 15;
  const bookingsEnabled = (s.bookings_enabled === '1' || s.bookings_enabled === 'true');

  // Extras applicabili (scope ibrido): globali (planId+eventId nulli) + match planId + match eventId
  const extras = await prisma.bookingExtra.findMany({
    where: {
      active: true,
      OR: [
        { planId: null, eventId: null },
        { planId: plan.id, eventId: null },
        { planId: null, eventId: event ? event.id : -1 },
        { planId: plan.id, eventId: event ? event.id : -1 },
      ],
    },
    orderBy: [{ mandatory: 'desc' }, { sort: 'asc' }, { id: 'asc' }],
  });

  res.render('public/reserva', {
    title: plan.name,
    logoDefs: LOGO_DEFS,
    plan,
    event,
    others: others.map((o) => ({ slug: o.slug, name: o.name, price: dispPrice(o), currency: o.currency || 'EUR' })),
    pricing: B.pricing(plan),
    currentPrice: B.tierPrice(B.pricing(plan)),
    days: B.eventDays(event),
    slots: B.eventSlots(event),
    slotIsMorning: B.slotIsMorning,
    lessons,
    refundDays,
    bookingsEnabled,
    contactPhone: s.contact_phone || '',
    contactEmail: s.contact_email || '',
    extras,
    error: req.query.e || null,
    stripePk: await publishableKey(),
  });
}));

// ---- Estrazione validazione+booking per riuso (POST form e POST embedded JSON) ----
async function validateAndCreateBooking(plan, body) {
  let selection = {};
  if (plan.bookingMode === 'single_lessons') {
    const count = parseInt(body.count, 10);
    const lessons = [];
    for (let i = 0; i < count; i++) {
      lessons.push({ day: (body['lesson_day_' + i] || '').trim(), slot: (body['lesson_slot_' + i] || '').trim() });
    }
    selection = { count, lessons };
  } else if (plan.bookingMode === 'red') {
    const days = {};
    B.eventDays(plan.event).forEach((d) => { if (body['day_' + d.iso]) days[d.iso] = body['day_' + d.iso]; });
    selection = { days };
  }
  const calc = B.compute(plan, selection);
  if (!calc.ok) return { error: calc.error };

  const firstName = (body.firstName || '').trim();
  const lastName = (body.lastName || '').trim();
  const email = (body.email || '').trim();
  const phone = (body.phone || '').trim();
  const birth = body.birthDate ? new Date(body.birthDate) : null;
  if (firstName.length < 2 || lastName.length < 2) return { error: 'Nombre y apellidos obligatorios' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Email no válido' };
  if (!phone) return { error: 'Teléfono obligatorio' };
  if (!birth || isNaN(birth)) return { error: 'Fecha de nacimiento obligatoria' };
  const age = B.ageYears(birth);
  const isMinor = age != null && age < 18;
  const parentalConsent = !!body.parentalConsent;
  const imageConsent = !!body.imageConsent;
  const dataConsent = !!body.dataConsent;
  const healthConsent = !!body.healthConsent;
  if (isMinor && !parentalConsent) return { error: 'Para menores de 18 es obligatorio el consentimiento de los padres' };
  if (!imageConsent) return { error: 'Debes autorizar el uso de imágenes y vídeos' };
  if (!dataConsent) return { error: 'Debes aceptar las condiciones de participación' };
  if (!healthConsent) return { error: 'Debes declarar el nivel adecuado de salud física' };

  // ---- EXTRAS: valida e somma al totale ----
  // Carico tutti gli extras applicabili a questo plan/evento.
  const allExtras = await prisma.bookingExtra.findMany({
    where: {
      active: true,
      OR: [
        { planId: null, eventId: null },
        { planId: plan.id, eventId: null },
        { planId: null, eventId: plan.eventId || -1 },
        { planId: plan.id, eventId: plan.eventId || -1 },
      ],
    },
  });
  // ID degli opzionali selezionati dal cliente (sempre array, gestisco anche stringa singola)
  let selectedIds = body.extras || [];
  if (!Array.isArray(selectedIds)) selectedIds = [selectedIds];
  selectedIds = selectedIds.map((v) => parseInt(v, 10)).filter((n) => Number.isInteger(n));
  // Includo SEMPRE tutti i mandatory + i selezionati opzionali (intersect con allExtras)
  const chosen = allExtras.filter((x) => x.mandatory || selectedIds.includes(x.id));
  const extrasTotal = chosen.reduce((s, x) => s + (x.price || 0), 0);
  const extrasSnapshot = chosen.map((x) => ({
    id: x.id, name: x.name, price: x.price, mandatory: x.mandatory,
  }));

  const totalAmount = Math.round((calc.amount + extrasTotal) * 100) / 100;

  const booking = await prisma.booking.create({
    data: {
      firstName, lastName, customerName: `${firstName} ${lastName}`,
      customerEmail: email, phone,
      birthDate: birth, isMinor, parentalConsent, imageConsent, dataConsent, healthConsent,
      planId: plan.id, eventId: plan.eventId || null,
      dateLabel: calc.label, itemsJson: JSON.stringify(calc.items || {}),
      extrasJson: JSON.stringify(extrasSnapshot),
      amount: totalAmount, currency: plan.currency || 'EUR',
      status: 'pending', paymentStatus: 'unpaid',
    },
  });
  return { booking, calc, chosenExtras: chosen };
}

// ---- NUOVO: Embedded Checkout (JSON) — il pagamento appare INLINE nella colonna sinistra ----
router.post('/reserva/:slug/embedded-session', A(async (req, res) => {
  // Safety lato server: se le prenotazioni sono disabilitate, blocca anche se il client tentasse
  const s = await settings.all();
  const enabled = (s.bookings_enabled === '1' || s.bookings_enabled === 'true');
  if (!enabled) {
    return res.status(403).json({ ok: false, error: 'bookings_disabled', message: 'Las reservas online están temporalmente desactivadas.' });
  }

  const plan = await loadPlan(req.params.slug);
  if (!plan) return res.status(404).json({ ok: false, error: 'Pack no encontrado' });

  const r = await validateAndCreateBooking(plan, req.body);
  if (r.error) return res.status(400).json({ ok: false, error: r.error });
  const { booking, calc, chosenExtras } = r;

  let stripe;
  try { stripe = await getStripe(); }
  catch (e) { return res.status(500).json({ ok: false, error: 'Pagos no disponibles: ' + e.message }); }

  // Line items: pacchetto + un line item per ogni extra (così Stripe genera la ricevuta dettagliata)
  const currency = (plan.currency || 'eur').toLowerCase();
  const lineItems = [{
    quantity: 1,
    price_data: {
      currency,
      unit_amount: Math.round(calc.amount * 100),
      product_data: { name: `${plan.name} — ${calc.label}`, description: (plan.event && plan.event.title) || '' },
    },
  }];
  (chosenExtras || []).forEach((x) => {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency,
        unit_amount: Math.round((x.price || 0) * 100),
        product_data: {
          name: x.name + (x.mandatory ? ' (obligatorio)' : ''),
          description: x.description || '',
        },
      },
    });
  });

  const url = baseUrl(req);
  const session = await stripe.checkout.sessions.create({
    ui_mode: 'embedded',
    mode: 'payment',
    customer_email: booking.customerEmail,
    line_items: lineItems,
    metadata: { bookingId: String(booking.id), planSlug: plan.slug },
    return_url: `${url}/reserva/success?b=${booking.id}&cs={CHECKOUT_SESSION_ID}`,
  });
  await prisma.booking.update({ where: { id: booking.id }, data: { stripeSessionId: session.id } });

  res.json({ ok: true, clientSecret: session.client_secret, bookingId: booking.id });
}));

// ---- V2: Embedded Checkout multi-partecipante ----
// Body JSON atteso: vedi src/lib/multibooking.js
// Crea Booking + N Participants + M TutorBlocks in transazione, poi Stripe session.
router.post('/reserva/:slug/embedded-session-v2', A(async (req, res) => {
  const s = await settings.all();
  const enabled = (s.bookings_enabled === '1' || s.bookings_enabled === 'true');
  if (!enabled) {
    return res.status(403).json({ ok: false, error: 'bookings_disabled', message: 'Las reservas online están temporalmente desactivadas.' });
  }

  const plan = await loadPlan(req.params.slug);
  if (!plan) return res.status(404).json({ ok: false, error: 'Pack no encontrado' });

  let mb;
  try {
    mb = await MB.createMultiBooking(plan, req.body || {});
  } catch (e) {
    console.error('[reserva v2] createMultiBooking failed:', e);
    return res.status(500).json({ ok: false, error: 'Errore interno durante la creazione della prenotazione' });
  }
  if (mb.error) return res.status(400).json({ ok: false, error: mb.error });
  const { booking, breakdown } = mb;
  const N = breakdown.N;

  let stripe;
  try { stripe = await getStripe(); }
  catch (e) { return res.status(500).json({ ok: false, error: 'Pagos no disponibles: ' + e.message }); }

  const currency = (plan.currency || 'eur').toLowerCase();
  // Pack: quantity = numero partecipanti, unit_amount = prezzo per partecipante.
  // Se c'è sconto, riduco il prezzo per partecipante per riflettere il prezzo netto.
  const netSubtotalCent = Math.round((breakdown.subtotal - breakdown.discountAmount) * 100);
  const unitAmount = Math.round(netSubtotalCent / N);
  const packDescription = breakdown.discountApplied
    ? `${(plan.event && plan.event.title) || ''}  (incluye ${breakdown.discountInfo.label})`.trim()
    : ((plan.event && plan.event.title) || '');
  const lineItems = [{
    quantity: N,
    price_data: {
      currency,
      unit_amount: unitAmount,
      product_data: {
        name: `${plan.name} — ${breakdown.label}`,
        description: packDescription,
      },
    },
  }];
  // Extras: stesso schema, quantity = N partecipanti per ognuno (es. assicurazione 20€ × N)
  (breakdown.chosenExtras || []).forEach((x) => {
    lineItems.push({
      quantity: N,
      price_data: {
        currency,
        unit_amount: Math.round((x.price || 0) * 100),
        product_data: {
          name: x.name + (x.mandatory ? ' (obligatorio)' : '') + (N > 1 ? ` × ${N}` : ''),
          description: x.description || '',
        },
      },
    });
  });

  const url = baseUrl(req);
  const session = await stripe.checkout.sessions.create({
    ui_mode: 'embedded',
    mode: 'payment',
    customer_email: booking.customerEmail,
    line_items: lineItems,
    metadata: { bookingId: String(booking.id), planSlug: plan.slug, participantsCount: String(N) },
    return_url: `${url}/reserva/success?b=${booking.id}&cs={CHECKOUT_SESSION_ID}`,
  });
  await prisma.booking.update({ where: { id: booking.id }, data: { stripeSessionId: session.id } });

  res.json({
    ok: true,
    clientSecret: session.client_secret,
    bookingId: booking.id,
    breakdown: {
      perParticipantBase: breakdown.perParticipantBase,
      participantsCount: breakdown.N,
      subtotal: breakdown.subtotal,
      extrasTotal: breakdown.extrasTotal,
      total: breakdown.total,
    },
  });
}));

// ---- V2-PaymentIntent: ritorna clientSecret di un PaymentIntent (per Stripe Elements inline) ----
// Validazione codice referral (AJAX, prima del pagamento)
router.post('/reserva/validate-code', express.json(), A(async (req, res) => {
  const codeStr = String((req.body && req.body.code) || '').trim();
  if (!codeStr) return res.json({ ok: false, error: 'Inserta un código' });
  const r = await MB.resolveReferralCode(codeStr);
  if (r.error || !r.code) return res.json({ ok: false, error: r.error || 'Código no válido' });
  // Auto-uso bloccato: un referrer non può usare il proprio codice
  const currentRefId = req.session && req.session.referrerId;
  if (currentRefId && currentRefId === r.code.referrerId) {
    return res.json({ ok: false, error: 'No puedes usar tu propio código' });
  }
  res.json({
    ok: true,
    code: r.code.code,
    discountType: r.code.discountType,
    discountValue: r.code.discountValue,
    label: r.code.discountType === 'fixed'
      ? `−${r.code.discountValue}€ sobre el paquete`
      : `−${r.code.discountValue}% sobre el paquete`,
  });
}));

router.post('/reserva/:slug/payment-intent', A(async (req, res) => {
  const s = await settings.all();
  const enabled = (s.bookings_enabled === '1' || s.bookings_enabled === 'true');
  if (!enabled) return res.status(403).json({ ok: false, error: 'bookings_disabled' });
  const plan = await loadPlan(req.params.slug);
  if (!plan) return res.status(404).json({ ok: false, error: 'Pack no encontrado' });

  // Anti auto-uso: se il referrer loggato in sessione possiede il codice, rifiuta
  if (req.body && req.body.referralCode && req.session && req.session.referrerId) {
    const codeUpper = String(req.body.referralCode).trim().toUpperCase().replace(/\s+/g, '');
    if (codeUpper) {
      const ownCode = await prisma.referralCode.findFirst({
        where: { code: codeUpper, referrerId: req.session.referrerId },
        select: { id: true },
      });
      if (ownCode) return res.status(400).json({ ok: false, error: 'No puedes usar tu propio código' });
    }
  }

  let mb;
  try { mb = await MB.createMultiBooking(plan, req.body || {}); }
  catch (e) { console.error('[reserva PI] createMultiBooking failed:', e); return res.status(500).json({ ok: false, error: 'Errore interno' }); }
  if (mb.error) return res.status(400).json({ ok: false, error: mb.error });
  const { booking, breakdown } = mb;

  let stripe;
  try { stripe = await getStripe(); }
  catch (e) { return res.status(500).json({ ok: false, error: 'Pagos no disponibles: ' + e.message }); }

  const currency = (plan.currency || 'eur').toLowerCase();
  const totalCents = Math.round(breakdown.total * 100);

  const pi = await stripe.paymentIntents.create({
    amount: totalCents,
    currency,
    automatic_payment_methods: { enabled: true },
    receipt_email: booking.customerEmail,
    description: `${plan.name} — ${breakdown.label} — ${breakdown.N} participante(s) — booking #${booking.id}`,
    metadata: { bookingId: String(booking.id), planSlug: plan.slug, participantsCount: String(breakdown.N) },
  });
  await prisma.booking.update({ where: { id: booking.id }, data: { stripePaymentIntent: pi.id } });

  res.json({
    ok: true,
    clientSecret: pi.client_secret,
    bookingId: booking.id,
    publishableKey: await publishableKey(),
    breakdown: { participantsCount: breakdown.N, subtotal: breakdown.subtotal, extrasTotal: breakdown.extrasTotal, total: breakdown.total },
  });
}));

router.post('/reserva/:slug', A(async (req, res) => {
  // Safety lato server: se prenotazioni off, blocca anche il form POST tradizionale
  const sSet = await settings.all();
  if (!(sSet.bookings_enabled === '1' || sSet.bookings_enabled === 'true')) {
    return res.redirect(`/reserva/${req.params.slug}?e=${encodeURIComponent('Las reservas online están temporalmente desactivadas.')}`);
  }

  const plan = await loadPlan(req.params.slug);
  if (!plan) return res.status(404).render('public/notfound', { title: 'Pack no encontrado' });
  const b = req.body;
  const back = (msg) => res.redirect(`/reserva/${plan.slug}?e=${encodeURIComponent(msg)}`);

  // Selezione per modalità
  let selection = {};
  if (plan.bookingMode === 'single_lessons') {
    const count = parseInt(b.count, 10);
    const lessons = [];
    for (let i = 0; i < count; i++) {
      lessons.push({ day: (b['lesson_day_' + i] || '').trim(), slot: (b['lesson_slot_' + i] || '').trim() });
    }
    selection = { count, lessons };
  } else if (plan.bookingMode === 'red') {
    const days = {};
    B.eventDays(plan.event).forEach((d) => { if (b['day_' + d.iso]) days[d.iso] = b['day_' + d.iso]; });
    selection = { days };
  }
  const calc = B.compute(plan, selection);
  if (!calc.ok) return back(calc.error);

  // Dati cliente + consensi
  const firstName = (b.firstName || '').trim();
  const lastName = (b.lastName || '').trim();
  const email = (b.email || '').trim();
  const phone = (b.phone || '').trim();
  const birth = b.birthDate ? new Date(b.birthDate) : null;
  if (firstName.length < 2 || lastName.length < 2) return back('Nombre y apellidos obligatorios');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return back('Email no válido');
  if (!phone) return back('Teléfono obligatorio');
  if (!birth || isNaN(birth)) return back('Fecha de nacimiento obligatoria');
  const age = B.ageYears(birth);
  const isMinor = age != null && age < 18;
  const parentalConsent = !!b.parentalConsent;
  const imageConsent = !!b.imageConsent;
  const dataConsent = !!b.dataConsent;
  const healthConsent = !!b.healthConsent;
  if (isMinor && !parentalConsent) return back('Para menores de 18 es obligatorio el consentimiento de los padres');
  if (!imageConsent) return back('Debes autorizar el uso de imágenes y vídeos');
  if (!dataConsent) return back('Debes aceptar las condiciones de participación');
  if (!healthConsent) return back('Debes declarar el nivel adecuado de salud física');

  const booking = await prisma.booking.create({
    data: {
      firstName, lastName, customerName: `${firstName} ${lastName}`,
      customerEmail: email, phone,
      birthDate: birth, isMinor, parentalConsent, imageConsent, dataConsent, healthConsent,
      planId: plan.id, eventId: plan.eventId || null,
      dateLabel: calc.label, itemsJson: JSON.stringify(calc.items || {}),
      amount: calc.amount, currency: plan.currency || 'EUR',
      status: 'pending', paymentStatus: 'unpaid',
    },
  });

  // Stripe Checkout
  let stripe;
  try { stripe = await getStripe(); }
  catch (e) { return back('Pagos no disponibles: ' + e.message); }
  const url = baseUrl(req);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: email,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: (plan.currency || 'eur').toLowerCase(),
        unit_amount: Math.round(calc.amount * 100),
        product_data: { name: `${plan.name} — ${calc.label}`, description: (plan.event && plan.event.title) || '' },
      },
    }],
    metadata: { bookingId: String(booking.id), planSlug: plan.slug },
    success_url: `${url}/reserva/success?b=${booking.id}&cs={CHECKOUT_SESSION_ID}`,
    cancel_url: `${url}/reserva/${plan.slug}?e=${encodeURIComponent('Pago cancelado')}`,
  });
  await prisma.booking.update({ where: { id: booking.id }, data: { stripeSessionId: session.id } });
  res.redirect(303, session.url);
}));

// Pagina pubblica Profesores (dinamica dal DB)
router.get('/profesores', A(async (req, res) => {
  let profs = await prisma.professor.findMany({
    where: { active: true },
    orderBy: [{ sort: 'asc' }, { id: 'asc' }],
  });
  const ids = profs.map((p) => p.photoMediaId).filter(Boolean);
  const media = ids.length ? await prisma.media.findMany({ where: { id: { in: ids } } }) : [];
  const byId = Object.fromEntries(media.map((m) => [m.id, m]));
  profs = profs.map((p) => ({ ...p, photo: p.photoMediaId ? byId[p.photoMediaId] || null : null }));
  res.render('public/profesores', {
    title: 'Profesores', profs,
    shellPrefix: SHELL_PREFIX, shellSuffix: SHELL_SUFFIX,
  });
}));

router.get('/reserva/success', A(async (req, res) => {
  const booking = await prisma.booking.findUnique({
    where: { id: parseInt(req.query.b, 10) || 0 }, include: { plan: true, event: true },
  });
  res.render('public/success', { title: 'Reserva confirmada', booking });
}));

module.exports = router;
