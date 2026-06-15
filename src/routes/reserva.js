// Prenotazione pubblica + pagamento Stripe (Checkout hosted).
const express = require('express');
const prisma = require('../lib/db');
const settings = require('../lib/settings');
const { getStripe, publishableKey } = require('../lib/stripe');
const B = require('../lib/booking');
const MB = require('../lib/multibooking');
const LC = require('../lib/lesson-capacity');

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

  // Resume: se ?resume=<token>, carica la booking pending e precompila il form (JS lato client)
  let resumeData = null;
  if (req.query.resume) {
    const rb = await prisma.booking.findUnique({
      where: { resumeToken: String(req.query.resume) },
      include: { participants: { include: { tutorBlock: true } }, tutorBlocks: true },
    });
    if (rb && rb.planId === plan.id && rb.paymentStatus !== 'paid' && rb.paymentStatus !== 'refunded' && rb.status !== 'cancelled') {
      let resumeItems = {};
      let resumeExtras = [];
      try { resumeItems = rb.itemsJson ? JSON.parse(rb.itemsJson) : {}; } catch (_) {}
      try { resumeExtras = rb.extrasJson ? JSON.parse(rb.extrasJson) : []; } catch (_) {}
      resumeData = {
        token: rb.resumeToken,
        bookingId: rb.id,
        firstName: rb.firstName, lastName: rb.lastName,
        email: rb.customerEmail, phone: rb.phone,
        birthDate: rb.birthDate ? new Date(rb.birthDate).toISOString().slice(0, 10) : '',
        participantsCount: rb.participantsCount || 1,
        classesPerParticipant: rb.classesPerParticipant || 1,
        items: resumeItems,
        extras: Array.isArray(resumeExtras) ? resumeExtras.filter((x) => !x.mandatory).map((x) => x.id) : [],
        referralCodeSnap: rb.referralCodeSnap || '',
        participants: (rb.participants || []).map((p) => ({
          firstName: p.firstName, lastName: p.lastName,
          birthDate: p.birthDate ? new Date(p.birthDate).toISOString().slice(0, 10) : '',
          email: p.email || '', phone: p.phone || '',
          address: p.address || '', city: p.city || '', zip: p.zip || '', country: p.country || 'ES',
          isMinor: !!p.isMinor,
        })),
        tutors: (rb.tutorBlocks || []).map((t) => ({
          firstName: t.firstName, lastName: t.lastName,
          email: t.email, phone: t.phone, relationship: t.relationship,
        })),
        paymentStatus: rb.paymentStatus,
        stripeError: rb.stripeError || '',
      };
    }
  }

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
    refCookieCode: res.locals.refCookieCode || '',
    resumeData,
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

  // Anti overbook (single flow legacy: 1 partecipante)
  if (plan.eventId) {
    const sel = (plan.bookingMode === 'single_lessons')
      ? { lessons: (calc.items && calc.items.lessons) || [] }
      : (plan.bookingMode === 'red')
        ? { days: (calc.items && calc.items.days) || {} }
        : {};
    const cap = await LC.assertCapacity({ eventId: plan.eventId, plan, selection: sel, requestedCount: 1 });
    if (!cap.ok) return { error: cap.error };
  }

  const booking = await prisma.booking.create({
    data: {
      firstName, lastName, customerName: `${firstName} ${lastName}`,
      customerEmail: email, phone,
      birthDate: birth, isMinor, parentalConsent, imageConsent, dataConsent, healthConsent,
      planId: plan.id, eventId: plan.eventId || null,
      dateLabel: calc.label, itemsJson: JSON.stringify(calc.items || {}),
      extrasJson: JSON.stringify(extrasSnapshot),
      amount: totalAmount, currency: plan.currency || 'EUR',
      resumeToken: require('crypto').randomBytes(16).toString('hex'),
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
    payment_intent_data: {
      metadata: { bookingId: String(booking.id), planSlug: plan.slug },
    },
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
    payment_intent_data: {
      metadata: { bookingId: String(booking.id), planSlug: plan.slug, participantsCount: String(N) },
    },
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
  // Plan opzionale: se passato (slug), valida che il codice sia applicabile a quel pack.
  const planSlug = String((req.body && req.body.planSlug) || '').trim();
  let plan = null;
  if (planSlug) {
    plan = await prisma.plan.findUnique({ where: { slug: planSlug }, select: { id: true } });
  }
  const r = await MB.resolveReferralCode(codeStr, plan);
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

// ---- AUTOSAVE SERVER-SIDE: bozza pre-pagamento ----
// Crea o aggiorna una Booking marcata isDraft=true con i dati che il cliente
// sta compilando. Apparira' in /admin/abandoned-carts come "Bozza salvata".
router.post('/reserva/:slug/draft', express.json(), A(async (req, res) => {
  const sSet = await settings.all();
  const enabled = (sSet.bookings_enabled === '1' || sSet.bookings_enabled === 'true');
  if (!enabled) return res.json({ ok: false });

  const plan = await prisma.plan.findUnique({ where: { slug: req.params.slug } });
  if (!plan) return res.json({ ok: false, error: 'plan not found' });

  const body = req.body || {};
  const payer = (body.payer && typeof body.payer === 'object') ? body.payer : {};
  const fn = String(payer.firstName || '').trim().slice(0, 100);
  const ln = String(payer.lastName  || '').trim().slice(0, 100);
  const em = String(payer.email     || '').trim().slice(0, 200).toLowerCase();
  const ph = String(payer.phone     || '').trim().slice(0, 60);

  // Soglia minima per salvare lato server: nome+email validi.
  if (!fn || em.length < 5 || em.indexOf('@') < 1) {
    return res.json({ ok: false, error: 'minimum data not reached' });
  }

  // Snapshot extras per la lista admin (id + name + price)
  let extrasSnap = [];
  try {
    if (Array.isArray(body.extras) && body.extras.length) {
      const ids = body.extras.map((x) => parseInt(x, 10)).filter(Boolean);
      if (ids.length) {
        const xs = await prisma.bookingExtra.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, price: true } });
        extrasSnap = xs.map((x) => ({ id: x.id, name: x.name, price: x.price, mandatory: false }));
      }
    }
  } catch (_) {}

  // itemsJson: lessons (single) o days (red)
  let itemsJson = '{}';
  try {
    if (plan.bookingMode === 'single_lessons' && Array.isArray(body.lessons)) {
      itemsJson = JSON.stringify({ lessons: body.lessons, count: body.classesPerParticipant || body.lessons.length });
    } else if (plan.bookingMode === 'red' && body.days && typeof body.days === 'object') {
      itemsJson = JSON.stringify({ days: body.days });
    }
  } catch (_) {}

  // Cerca bozza esistente: priorità a resumeToken (mandato dal client), poi email+planId
  const tokenIn = String(body.resumeToken || '').trim();
  let existing = null;
  if (tokenIn) {
    existing = await prisma.booking.findUnique({ where: { resumeToken: tokenIn } });
    if (existing && (existing.paymentStatus === 'paid' || existing.paymentStatus === 'refunded' || existing.status === 'cancelled')) {
      existing = null; // non riusare booking gia' completate
    }
  }
  if (!existing) {
    existing = await prisma.booking.findFirst({
      where: {
        planId: plan.id,
        customerEmail: em,
        isDraft: true,
        status: 'pending',
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  const participantsCount = Math.max(1, Math.min(20, parseInt(body.participants && body.participants.length, 10) || 1));
  const classesPerParticipant = parseInt(body.classesPerParticipant, 10) || 1;

  const data = {
    customerName: (fn + ' ' + ln).trim(),
    firstName: fn,
    lastName: ln,
    customerEmail: em,
    phone: ph,
    planId: plan.id,
    eventId: plan.eventId || null,
    itemsJson,
    extrasJson: JSON.stringify(extrasSnap),
    participantsCount,
    classesPerParticipant,
    referralCodeSnap: String(body.referralCode || '').trim().toUpperCase().slice(0, 60),
    isDraft: true,
    status: 'pending',
    paymentStatus: 'unpaid',
    notes: '[autosave bozza]',
  };

  let booking;
  if (existing) {
    booking = await prisma.booking.update({ where: { id: existing.id }, data });
  } else {
    data.resumeToken = require('crypto').randomBytes(16).toString('hex');
    booking = await prisma.booking.create({ data });
  }

  // Setta cookie rv_resume così la pillola "Continuar reserva" funziona anche per le bozze
  res.cookie('rv_resume', booking.resumeToken, {
    maxAge: 24 * 60 * 60 * 1000,  // 24h come il localStorage
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
  });

  res.json({ ok: true, bookingId: booking.id, resumeToken: booking.resumeToken });
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

  // Resume: se il body contiene un resumeToken valido di una booking pending/failed,
  // marco la vecchia booking come 'cancelled' prima di crearne una nuova
  // (evita di accumulare booking duplicate per ogni tentativo di ripresa).
  const resumeToken = String((req.body && req.body.resumeToken) || '').trim();
  if (resumeToken) {
    const old = await prisma.booking.findUnique({ where: { resumeToken }, select: { id: true, paymentStatus: true, status: true } });
    if (old && old.paymentStatus !== 'paid' && old.paymentStatus !== 'refunded' && old.status !== 'cancelled') {
      await prisma.booking.update({
        where: { id: old.id },
        data: { status: 'cancelled', notes: '[auto] superata dalla ripresa carrello' },
      }).catch(() => {});
    }
  }

  let mb;
  try { mb = await MB.createMultiBooking(plan, req.body || {}); }
  catch (e) { console.error('[reserva PI] createMultiBooking failed:', e); return res.status(500).json({ ok: false, error: 'Errore interno' }); }
  if (mb.error) return res.status(400).json({ ok: false, error: mb.error });
  const { booking, breakdown } = mb;

  // Chiude il funnel: collega il click di questa sessione alla booking (se ha referralCodeId)
  if (booking.referralCodeId) {
    try {
      const sessionId = (req.headers.cookie || '').match(/ref_sid=([a-f0-9]{12,})/);
      const sid = sessionId ? sessionId[1] : '';
      if (sid) {
        await prisma.referralClick.updateMany({
          where: { sessionId: sid, codeId: booking.referralCodeId, bookingId: null },
          data: { bookingId: booking.id },
        });
      }
    } catch (e) { /* non bloccare il pagamento */ }
  }

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

  // Setta cookie "rv_resume" (TTL 7g) → l'header pubblico mostrera' l'icona "Riprendi reserva"
  if (booking.resumeToken) {
    res.cookie('rv_resume', booking.resumeToken, {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: false,  // accessibile a JS dell'header per mostrare l'icona
      sameSite: 'lax',
      path: '/',
    });
  }

  res.json({
    ok: true,
    clientSecret: pi.client_secret,
    bookingId: booking.id,
    resumeToken: booking.resumeToken,
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
    payment_intent_data: {
      metadata: { bookingId: String(booking.id), planSlug: plan.slug },
    },
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
  // Pagamento andato a buon fine → pulisco il cookie di ripresa
  res.clearCookie('rv_resume', { path: '/' });
  res.render('public/success', { title: 'Reserva confirmada', booking });
}));

// ---- Resume di un checkout abbandonato ----
// /reserva/resume/:token  → redirect al pack giusto con query param ?resume=<token>
router.get('/reserva/resume/:token', A(async (req, res) => {
  const token = String(req.params.token || '').trim();
  if (!token) return res.redirect('/');
  const booking = await prisma.booking.findUnique({
    where: { resumeToken: token },
    include: { plan: true },
  });
  if (!booking || !booking.plan) {
    res.clearCookie('rv_resume', { path: '/' });
    return res.redirect('/');
  }
  // Solo per booking non ancora pagate (paid/refunded → niente ripresa)
  if (booking.paymentStatus === 'paid' || booking.paymentStatus === 'refunded' || booking.status === 'cancelled') {
    res.clearCookie('rv_resume', { path: '/' });
    return res.redirect('/');
  }
  return res.redirect(`/reserva/${booking.plan.slug}?resume=${token}`);
}));

// ---- API per l'header pubblico: dato un token, ritorna info sintetica della booking da riprendere ----
router.get('/api/booking/resume-info', A(async (req, res) => {
  const token = String((req.query && req.query.t) || (req.cookies && req.cookies.rv_resume) || '').trim();
  if (!token) return res.json({ ok: false });
  const b = await prisma.booking.findUnique({
    where: { resumeToken: token },
    include: { plan: { select: { slug: true, name: true } } },
  });
  if (!b || !b.plan) return res.json({ ok: false });
  if (b.paymentStatus === 'paid' || b.paymentStatus === 'refunded' || b.status === 'cancelled') {
    return res.json({ ok: false });
  }
  res.json({
    ok: true,
    bookingId: b.id,
    planName: b.plan.name,
    planSlug: b.plan.slug,
    amount: b.amount,
    currency: b.currency,
    resumeUrl: `/reserva/resume/${b.resumeToken}`,
    paymentStatus: b.paymentStatus,  // 'unpaid' | 'failed'
    stripeError: b.stripeError || '',
  });
}));

// API pubblica: disponibilità lezioni per evento (per UI checkout, gold/red barrato).
// Risponde { eventId, lessons: [{id, dayIndex, time, title, isAfternoon, capacity, occupied, remaining, full}] }
router.get('/api/lessons/availability/:eventId(\\d+)', A(async (req, res) => {
  const eventId = parseInt(req.params.eventId, 10);
  if (!eventId) return res.status(400).json({ ok: false, error: 'invalid eventId' });
  const status = await LC.getEventCapacityStatus(eventId);
  if (!status.event) return res.status(404).json({ ok: false, error: 'event not found' });
  res.json({ ok: true, eventId, lessons: status.lessons });
}));

module.exports = router;
