// Logica multi-partecipante per booking: pricing engine puro + createMultiBooking.
//
// Schema input atteso da createMultiBooking (body JSON):
// {
//   payer: { firstName, lastName, email, phone, imageConsent, dataConsent, healthConsent },
//   classesPerParticipant: 6,                   // SOLO per single_lessons (1/3/6)
//   lessons: [{day:'2026-07-29', slot:'9:30'}], // SOLO per single_lessons, length = classesPerParticipant
//   participants: [
//     { firstName, lastName, birthDate, address, city, zip, country,
//       email?, phone?, tutorIndex? }            // email/phone solo se maggiorenne; tutorIndex solo se minore
//   ],
//   tutors: [
//     { firstName, lastName, email, phone, relationship }
//   ],
//   extras: [extraId, ...]                       // opzionali selezionati (i mandatory sono sempre inclusi)
// }
//
// Output:
//   - { ok: false, error: '...' }
//   - { ok: true, booking, breakdown: { perParticipantBase, subtotal, extrasTotal, total, N, chosenExtras } }

const crypto = require('crypto');
const prisma = require('./db');
const B = require('./booking');
const RC = require('./referral-calc');
const LC = require('./lesson-capacity');

const MAX_PARTICIPANTS = 20;

function round2(n) { return Math.round(Number(n) * 100) / 100; }

// Token random URL-safe per il deep-link "Riprendi pagamento"
function genResumeToken() {
  return crypto.randomBytes(16).toString('hex');
}

function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || '');
}

function ageFromBirth(birth) {
  const a = B.ageYears(birth);
  return a == null ? null : a;
}

// Pricing engine puro: nessuna I/O, solo calcolo.
// extras = array completo di {id,name,price,mandatory,active}
function computeMultiTotal({ plan, classesPerParticipant, participantsCount, extras = [] }) {
  const N = Math.max(1, parseInt(participantsCount, 10) || 1);

  let perParticipantBase = 0;
  let label = plan.name;

  if (plan.bookingMode === 'single_lessons') {
    const pr = B.pricing(plan);
    const opt = (pr.options || []).find((o) => Number(o.count) === Number(classesPerParticipant));
    if (!opt) {
      return { ok: false, error: 'Numero di classi non valido per questo pacchetto' };
    }
    perParticipantBase = Number(opt.price);
    label = `${opt.count} classes`;
  } else {
    perParticipantBase = B.tierPrice(B.pricing(plan));
  }

  const subtotal = round2(perParticipantBase * N);

  // ---- Sconto quantità (per pacchetto): % sul subtotal solo se N >= soglia ----
  // NON si applica agli extras (assicurazione resta full × N).
  let discountAmount = 0;
  let discountApplied = false;
  let discountInfo = null;
  if (plan.discountThreshold && plan.discountThreshold > 0 && plan.discountPercent > 0 && N >= plan.discountThreshold) {
    discountAmount = round2(subtotal * Number(plan.discountPercent) / 100);
    discountApplied = true;
    discountInfo = {
      threshold: plan.discountThreshold,
      percent: plan.discountPercent,
      amount: discountAmount,
      label: '−' + plan.discountPercent + '% (' + plan.discountThreshold + '+ partecipanti)',
    };
  }

  const extrasUnit = (extras || []).reduce((s, e) => s + Number(e.price || 0), 0);
  const extrasTotal = round2(extrasUnit * N);
  const total = round2(subtotal - discountAmount + extrasTotal);

  return {
    ok: true,
    N,
    perParticipantBase,
    subtotal,
    discountAmount,
    discountApplied,
    discountInfo,
    extrasTotal,
    total,
    label,
  };
}

// Carica gli extras applicabili al plan + filtra i selezionati (+ mandatory sempre inclusi).
async function resolveExtras(plan, selectedExtraIds) {
  const all = await prisma.bookingExtra.findMany({
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
  const selectedSet = new Set(
    (Array.isArray(selectedExtraIds) ? selectedExtraIds : [selectedExtraIds])
      .map((v) => parseInt(v, 10))
      .filter((n) => Number.isInteger(n))
  );
  return all.filter((x) => x.mandatory || selectedSet.has(x.id));
}

// Cerca codice referral (case-insensitive) e ne valuta validità.
// Ritorna { code, error } — error string in spagnolo per il cliente.
async function resolveReferralCode(rawCode, plan) {
  if (!rawCode) return { code: null };
  const codeUpper = String(rawCode).trim().toUpperCase().replace(/\s+/g, '');
  if (!codeUpper) return { code: null };
  const code = await prisma.referralCode.findUnique({
    where: { code: codeUpper },
    include: { referrer: true, plans: { select: { id: true, slug: true, name: true } } },
  });
  const validation = RC.codeIsValid(code);
  if (!validation.ok) {
    const map = { 'not-found': 'Código no válido', 'inactive': 'Código no activo', 'expired': 'Código caducado', 'max-uses': 'Código sin usos disponibles' };
    return { code: null, error: map[validation.reason] || 'Código no válido' };
  }
  // Referrer deve essere attivo
  if (!code.referrer || code.referrer.status !== 'approved') {
    return { code: null, error: 'Código no válido' };
  }
  // Restrizione per pacchetto: se plans non vuoto, il plan corrente deve essere incluso.
  if (plan && Array.isArray(code.plans) && code.plans.length > 0) {
    const allowedIds = code.plans.map((p) => p.id);
    if (!allowedIds.includes(plan.id)) {
      return { code: null, error: 'Este código no es válido para este pack' };
    }
  }
  return { code };
}

// Applica lo sconto referral a un breakdown già calcolato (post multi-discount).
// SCONTO al cliente: applicato al LORDO pacchetto (esclusi extras).
// COMMISSIONE referrer: applicata al NETTO pacchetto post-sconto (no IVA, no extras).
function applyReferralDiscount(breakdown, refCode) {
  if (!refCode) {
    breakdown.referralDiscount = 0;
    breakdown.referralCode = null;
    return breakdown;
  }
  const grossPack = round2(breakdown.subtotal - breakdown.discountAmount);  // lordo pacchetto post multi-discount
  const { gross: refDiscountGross } = RC.discountAmountForCode(refCode, grossPack);
  const newGrossPack = round2(grossPack - refDiscountGross);
  const newTotal = round2(newGrossPack + breakdown.extrasTotal);

  // Base per la commissione: net del pacchetto POST sconto referral (extras già fuori dal grossPack).
  const netBaseForCommission = round2(newGrossPack / (1 + RC.IVA_RATE));

  breakdown.referralDiscount = refDiscountGross;
  breakdown.referralCode = { id: refCode.id, code: refCode.code, commissionPct: refCode.commissionPct, referrerId: refCode.referrerId };
  breakdown.total = newTotal;
  breakdown.netBaseForCommission = netBaseForCommission;
  return breakdown;
}

// Validazione completa del body + creazione in transazione.
async function createMultiBooking(plan, body) {
  if (!body || typeof body !== 'object') return { error: 'Body non valido' };

  // ---- PAGANTE ----
  const payer = body.payer || {};
  const payerFirst = String(payer.firstName || '').trim();
  const payerLast = String(payer.lastName || '').trim();
  const payerEmail = String(payer.email || '').trim().toLowerCase();
  const payerPhone = String(payer.phone || '').trim();
  if (payerFirst.length < 2 || payerLast.length < 2) return { error: 'Nombre y apellidos del pagante obligatorios' };
  if (!isValidEmail(payerEmail)) return { error: 'Email del pagante no válido' };
  if (!payerPhone) return { error: 'Teléfono del pagante obligatorio' };

  const imageConsent = !!payer.imageConsent;
  const dataConsent = !!payer.dataConsent;
  const healthConsent = !!payer.healthConsent;
  const minorConsent = !!payer.minorConsent;
  if (!imageConsent) return { error: 'Debes autorizar el uso de imágenes y vídeos' };
  if (!dataConsent) return { error: 'Debes aceptar las condiciones de participación' };
  if (!healthConsent) return { error: 'Debes declarar el nivel adecuado de salud física' };

  // Datos fatturazione (opzionali). Se compilato indirizzo → almeno address+city+zip+nif obbligatori.
  const billing = (payer.billing && typeof payer.billing === 'object') ? payer.billing : null;
  let billingFields = { address: '', city: '', zip: '', country: '', nif: '' };
  if (billing) {
    billingFields.address = String(billing.address || '').trim();
    billingFields.city    = String(billing.city || '').trim();
    billingFields.zip     = String(billing.zip || '').trim();
    billingFields.country = String(billing.country || 'ES').trim();
    billingFields.nif     = String(billing.nif || '').trim();
    if (billingFields.address || billingFields.city || billingFields.zip || billingFields.nif) {
      if (!billingFields.address) return { error: 'Para la factura: dirección obligatoria' };
      if (!billingFields.city)    return { error: 'Para la factura: ciudad obligatoria' };
      if (!billingFields.zip)     return { error: 'Para la factura: código postal obligatorio' };
      if (!billingFields.nif)     return { error: 'Para la factura: NIF/CIF/DNI obligatorio' };
    }
  }

  // ---- PARTECIPANTI ----
  const parts = Array.isArray(body.participants) ? body.participants : [];
  if (parts.length < 1) return { error: 'Debes añadir al menos 1 participante' };
  if (parts.length > MAX_PARTICIPANTS) return { error: `Máximo ${MAX_PARTICIPANTS} participantes por reserva` };

  // ---- TUTORI ----
  const tutorsIn = Array.isArray(body.tutors) ? body.tutors : [];

  // Validazione partecipanti + classificazione minori/maggiori
  const validatedParticipants = [];
  let hasMinor = false;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i] || {};
    const firstName = String(p.firstName || '').trim();
    const lastName = String(p.lastName || '').trim();
    const birth = p.birthDate ? new Date(p.birthDate) : null;
    if (firstName.length < 2) return { error: `Participante ${i + 1}: nombre obligatorio` };
    if (lastName.length < 2) return { error: `Participante ${i + 1}: apellido obligatorio` };
    if (!birth || isNaN(birth.getTime())) return { error: `Participante ${i + 1}: fecha de nacimiento no válida` };
    const age = ageFromBirth(birth);
    if (age == null || age < 0 || age > 100) return { error: `Participante ${i + 1}: fecha de nacimiento no válida` };
    const isMinor = age < 18;

    const address = String(p.address || '').trim();
    const city = String(p.city || '').trim();
    const zip = String(p.zip || '').trim();
    const country = String(p.country || 'ES').trim();
    if (!address) return { error: `Participante ${i + 1}: dirección obligatoria` };
    if (!city) return { error: `Participante ${i + 1}: ciudad obligatoria` };
    if (!zip) return { error: `Participante ${i + 1}: código postal obligatorio` };

    let email = '';
    let phone = '';
    let tutorIndex = null;

    if (isMinor) {
      hasMinor = true;
      // Il pagante è automaticamente il tutor del minore: nessun tutorIndex separato.
    } else {
      email = String(p.email || '').trim().toLowerCase();
      phone = String(p.phone || '').trim();
      if (!isValidEmail(email)) return { error: `Participante ${i + 1}: email no válido` };
      if (!phone) return { error: `Participante ${i + 1}: teléfono obligatorio` };
    }

    validatedParticipants.push({
      firstName, lastName, birthDate: birth, isMinor,
      email, phone, address, city, zip, country, tutorIndex,
    });
  }

  // Se ci sono minori: il pagante deve aver dato il consenso minorenni
  if (hasMinor && !minorConsent) {
    return { error: 'Para reservas con menores debes autorizar su participación' };
  }

  // ---- CLASSI / LEZIONI (solo per Single) ----
  let classesPerParticipant = 1;
  let lessons = [];
  if (plan.bookingMode === 'single_lessons') {
    const cnt = parseInt(body.classesPerParticipant, 10);
    if (!Number.isInteger(cnt) || cnt < 1) {
      return { error: 'Debes elegir el número de clases' };
    }
    classesPerParticipant = cnt;
    lessons = Array.isArray(body.lessons) ? body.lessons : [];
    if (lessons.length !== cnt) {
      return { error: `Debes seleccionar día y horario para las ${cnt} clases` };
    }
    for (let i = 0; i < lessons.length; i++) {
      if (!lessons[i] || !lessons[i].day || !lessons[i].slot) {
        return { error: `Falta día u horario para la clase ${i + 1}` };
      }
    }
  }

  // ---- GIORNI + FASCIA (solo per Red) ----
  // body.days = { 'YYYY-MM-DD': 'AM'|'PM', ... }
  let redDays = {};
  if (plan.bookingMode === 'red') {
    const raw = (body && body.days) || {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { error: 'Debes elegir Mañana o Tarde para cada día' };
    }
    Object.keys(raw).forEach((iso) => {
      const v = String(raw[iso] || '').toUpperCase().trim();
      if (v === 'AM' || v === 'PM') redDays[iso] = v;
    });
    if (!Object.keys(redDays).length) {
      return { error: 'Debes elegir Mañana o Tarde para cada día del Pack Red' };
    }
  }

  // ---- EXTRAS ----
  const chosenExtras = await resolveExtras(plan, body.extras || []);
  const extrasSnapshot = chosenExtras.map((x) => ({
    id: x.id, name: x.name, price: x.price, mandatory: x.mandatory,
  }));

  // ---- PRICING ----
  const breakdown = computeMultiTotal({
    plan,
    classesPerParticipant,
    participantsCount: validatedParticipants.length,
    extras: chosenExtras,
  });
  if (!breakdown.ok) return { error: breakdown.error };

  // ---- CODICE REFERRAL (opzionale) ----
  const refRes = await resolveReferralCode(body.referralCode, plan);
  if (body.referralCode && refRes.error) return { error: refRes.error };
  applyReferralDiscount(breakdown, refRes.code);

  // ---- CAPACITÀ LEZIONI (anti overbook) ----
  // Controllo PRIMA della transazione: rifiuta se non c'è disponibilità per N partecipanti.
  if (plan.eventId) {
    const selection = (plan.bookingMode === 'single_lessons')
      ? { lessons }
      : (plan.bookingMode === 'red')
        ? { days: redDays }
        : {};
    const cap = await LC.assertCapacity({
      eventId: plan.eventId,
      plan,
      selection,
      requestedCount: breakdown.N,
    });
    if (!cap.ok) return { error: cap.error, fullLessons: cap.fullLessons };
  }

  // ---- TRANSAZIONE ----
  const result = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.create({
      data: {
        firstName: payerFirst,
        lastName: payerLast,
        customerName: `${payerFirst} ${payerLast}`,
        customerEmail: payerEmail,
        phone: payerPhone,
        // imageConsent/dataConsent/healthConsent registrati sul pagante a livello booking
        imageConsent, dataConsent, healthConsent,
        // billing (vuoti se non richiesto factura)
        billingAddress: billingFields.address,
        billingCity:    billingFields.city,
        billingZip:     billingFields.zip,
        billingCountry: billingFields.country,
        billingNif:     billingFields.nif,
        // legacy fields: parentalConsent = autorizzazione minori data dal pagante
        birthDate: null,
        isMinor: false,
        parentalConsent: hasMinor && minorConsent,
        planId: plan.id,
        eventId: plan.eventId || null,
        dateLabel: breakdown.label,
        itemsJson: JSON.stringify(
          plan.bookingMode === 'single_lessons' ? { lessons, count: classesPerParticipant }
          : plan.bookingMode === 'red'          ? { days: redDays }
          : {}
        ),
        extrasJson: JSON.stringify(extrasSnapshot),
        amount: breakdown.total,
        currency: plan.currency || 'EUR',
        participantsCount: breakdown.N,
        classesPerParticipant,
        subtotal: breakdown.subtotal,
        discountAmount: breakdown.discountAmount,
        extrasTotal: breakdown.extrasTotal,
        referralCodeId: breakdown.referralCode ? breakdown.referralCode.id : null,
        referralCodeSnap: breakdown.referralCode ? breakdown.referralCode.code : '',
        referralDiscount: breakdown.referralDiscount || 0,
        resumeToken: genResumeToken(),
        status: 'pending',
        paymentStatus: 'unpaid',
      },
    });

    // Partecipanti (niente TutorBlock: il pagante è automaticamente il tutor di ogni minore)
    for (let i = 0; i < validatedParticipants.length; i++) {
      const p = validatedParticipants[i];
      await tx.participant.create({
        data: {
          bookingId: booking.id,
          firstName: p.firstName, lastName: p.lastName,
          birthDate: p.birthDate, isMinor: p.isMinor,
          email: p.email, phone: p.phone,
          address: p.address, city: p.city, zip: p.zip, country: p.country,
          tutorBlockId: null,
          sort: i,
        },
      });
    }

    return booking;
  });

  return {
    booking: result,
    breakdown: { ...breakdown, chosenExtras },
  };
}

module.exports = {
  MAX_PARTICIPANTS,
  computeMultiTotal,
  resolveExtras,
  resolveReferralCode,
  applyReferralDiscount,
  createMultiBooking,
};
