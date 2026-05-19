// Prenotazione pubblica + pagamento Stripe (Checkout hosted).
const express = require('express');
const prisma = require('../lib/db');
const settings = require('../lib/settings');
const { getStripe } = require('../lib/stripe');
const B = require('../lib/booking');

const router = express.Router();
const A = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

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
  res.render('public/reserva', {
    title: plan.name,
    plan,
    event,
    pricing: B.pricing(plan),
    currentPrice: B.tierPrice(B.pricing(plan)),
    days: B.eventDays(event),
    slots: B.eventSlots(event),
    slotIsMorning: B.slotIsMorning,
    error: req.query.e || null,
  });
}));

router.post('/reserva/:slug', A(async (req, res) => {
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
  if (isMinor && !parentalConsent) return back('Para menores de 18 es obligatorio el consentimiento de los padres');
  if (!imageConsent) return back('El consentimiento de imagen es obligatorio');

  const booking = await prisma.booking.create({
    data: {
      firstName, lastName, customerName: `${firstName} ${lastName}`,
      customerEmail: email, phone,
      birthDate: birth, isMinor, parentalConsent, imageConsent,
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

router.get('/reserva/success', A(async (req, res) => {
  const booking = await prisma.booking.findUnique({
    where: { id: parseInt(req.query.b, 10) || 0 }, include: { plan: true, event: true },
  });
  res.render('public/success', { title: 'Reserva confirmada', booking });
}));

module.exports = router;
