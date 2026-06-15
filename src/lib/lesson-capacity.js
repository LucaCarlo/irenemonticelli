// Capacità delle Lesson: contatori, validazione overbook, identificazione lezioni piene.
//
// REGOLE:
// - Il conteggio si misura per PARTECIPANTI (Booking.participantsCount), non per booking.
// - Concorrono solo le booking confermate E pagate: status='confirmed' AND paymentStatus='paid'.
// - Lesson.capacity = 0 → illimitata (no controllo).
// - I gold/red coprono lezioni implicite (per evento + dayIndex/isAfternoon).
// - I single_lessons coprono coppie esplicite (day ISO, slot).

const prisma = require('./db');

// Mappa "ISO date → dayIndex" per un evento. Day 1 = startDate.
function buildDayIndexMap(event) {
  const map = new Map();
  if (!event || !event.startDate) return map;
  const start = new Date(event.startDate);
  const end = event.endDate ? new Date(event.endDate) : start;
  let idx = 1;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1), idx++) {
    map.set(new Date(d).toISOString().slice(0, 10), idx);
  }
  return map;
}

// Inverso: dayIndex → ISO date
function buildIsoForDayIndexMap(event) {
  const map = new Map();
  if (!event || !event.startDate) return map;
  const start = new Date(event.startDate);
  const end = event.endDate ? new Date(event.endDate) : start;
  let idx = 1;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1), idx++) {
    map.set(idx, new Date(d).toISOString().slice(0, 10));
  }
  return map;
}

// Restituisce il Set di lessonIds richiesti da una booking di un certo plan/evento/selezione.
// selection è il payload normalizzato dal caller:
//   - single_lessons: { lessons: [{day, slot}, ...] }
//   - red:            { days: {iso: 'AM'|'PM'} }
//   - gold/junior:    {} (tutte le lezioni attive non-pausa)
function resolveRequestedLessonIds({ plan, event, allLessons, selection }) {
  const out = new Set();
  if (!plan || !event || !allLessons || !allLessons.length) return out;
  const lessonsActive = allLessons.filter((L) => L.active && !L.isPause);
  const isoForDay = buildIsoForDayIndexMap(event);

  if (plan.bookingMode === 'single_lessons') {
    const sel = (selection && Array.isArray(selection.lessons)) ? selection.lessons : [];
    sel.forEach((s) => {
      const wantedDay = String(s.day || '').trim();
      const wantedSlot = String(s.slot || '').trim();
      lessonsActive.forEach((L) => {
        if (L.time === wantedSlot && isoForDay.get(L.dayIndex) === wantedDay) out.add(L.id);
      });
    });
    return out;
  }

  if (plan.bookingMode === 'red') {
    const days = (selection && selection.days) || {};
    Object.keys(days).forEach((iso) => {
      const segment = days[iso]; // 'AM'|'PM'
      const dayIdx = null;
      // Trova il dayIndex corrispondente all'iso
      const dim = buildDayIndexMap(event);
      const di = dim.get(iso);
      if (!di) return;
      lessonsActive.forEach((L) => {
        if (L.dayIndex !== di) return;
        const isMorning = !L.isAfternoon;
        if ((segment === 'AM' && isMorning) || (segment === 'PM' && L.isAfternoon)) out.add(L.id);
      });
    });
    return out;
  }

  // gold / junior / altri pack "all-inclusive"
  lessonsActive.forEach((L) => out.add(L.id));
  return out;
}

// Carica le lessons di un evento + tutte le booking confermate+pagate dello stesso evento
// (con planId e itemsJson) e calcola la occupancy attuale per ogni lesson.id.
// Ritorna { lessons:[...], occupancy:Map<lessonId, count>, byId:Map<lessonId, lesson> }.
async function computeEventOccupancy(eventId) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { lessons: true, plans: true },
  });
  if (!event) return { event: null, lessons: [], occupancy: new Map(), byId: new Map() };

  const lessons = event.lessons || [];
  const byId = new Map(lessons.map((L) => [L.id, L]));
  const occupancy = new Map(lessons.map((L) => [L.id, 0]));

  // Booking che potenzialmente impegnano slot su questo evento.
  const bookings = await prisma.booking.findMany({
    where: {
      eventId,
      status: 'confirmed',
      paymentStatus: 'paid',
    },
    include: { plan: true },
  });

  bookings.forEach((b) => {
    if (!b.plan) return;
    const N = Math.max(1, b.participantsCount || 1);
    let items = {};
    try { items = b.itemsJson ? JSON.parse(b.itemsJson) : {}; } catch (_) {}
    const selection = (b.plan.bookingMode === 'single_lessons')
      ? { lessons: items.lessons || [] }
      : (b.plan.bookingMode === 'red')
        ? { days: items.days || {} }
        : {};
    const req = resolveRequestedLessonIds({ plan: b.plan, event, allLessons: lessons, selection });
    req.forEach((lid) => occupancy.set(lid, (occupancy.get(lid) || 0) + N));
  });

  return { event, lessons, occupancy, byId };
}

// Helper UI: mappa lessonId → { capacity, occupied, full, remaining }.
// Restituisce array stato per ogni lezione attiva non-pausa.
async function getEventCapacityStatus(eventId) {
  const { event, lessons, occupancy } = await computeEventOccupancy(eventId);
  return {
    event,
    lessons: lessons.map((L) => {
      const cap = L.capacity || 0; // 0 = illimitata
      const occ = occupancy.get(L.id) || 0;
      const remaining = cap > 0 ? Math.max(0, cap - occ) : Infinity;
      return {
        id: L.id, dayIndex: L.dayIndex, time: L.time, title: L.title,
        isAfternoon: L.isAfternoon, isPause: L.isPause, active: L.active,
        capacity: cap, occupied: occ, remaining,
        full: cap > 0 && occ >= cap,
      };
    }),
  };
}

// Verifica che una nuova booking (o modifica) non sfori la capacità di nessuna lesson richiesta.
// requestedCount = N partecipanti che vogliono entrare.
// Ritorna { ok:true } oppure { ok:false, error, fullLessons:[{id,title,time,capacity,occupied}] }.
// Se excludeBookingId è passato (modifica), scala l'occupancy attuale di quella booking.
async function assertCapacity({ eventId, plan, selection, requestedCount, excludeBookingId }) {
  if (!eventId || !plan) return { ok: true };
  const { event, lessons, occupancy } = await computeEventOccupancy(eventId);
  if (!event) return { ok: true };

  // Se c'è una booking esistente da escludere, sottraggo i suoi posti
  if (excludeBookingId) {
    const existing = await prisma.booking.findUnique({
      where: { id: excludeBookingId },
      include: { plan: true },
    });
    if (existing && existing.plan && existing.status === 'confirmed' && existing.paymentStatus === 'paid') {
      const N0 = Math.max(1, existing.participantsCount || 1);
      let items = {};
      try { items = existing.itemsJson ? JSON.parse(existing.itemsJson) : {}; } catch (_) {}
      const sel0 = (existing.plan.bookingMode === 'single_lessons')
        ? { lessons: items.lessons || [] }
        : (existing.plan.bookingMode === 'red')
          ? { days: items.days || {} }
          : {};
      const req0 = resolveRequestedLessonIds({ plan: existing.plan, event, allLessons: lessons, selection: sel0 });
      req0.forEach((lid) => occupancy.set(lid, Math.max(0, (occupancy.get(lid) || 0) - N0)));
    }
  }

  const requested = resolveRequestedLessonIds({ plan, event, allLessons: lessons, selection });
  const N = Math.max(1, parseInt(requestedCount, 10) || 1);

  const fullLessons = [];
  requested.forEach((lid) => {
    const L = lessons.find((x) => x.id === lid);
    if (!L) return;
    const cap = L.capacity || 0;
    if (cap <= 0) return; // illimitata
    const occ = occupancy.get(lid) || 0;
    if (occ + N > cap) {
      fullLessons.push({
        id: L.id, title: L.title, time: L.time, dayIndex: L.dayIndex,
        capacity: cap, occupied: occ, requested: N,
      });
    }
  });

  if (fullLessons.length > 0) {
    return {
      ok: false,
      fullLessons,
      error: `Las siguientes clases no tienen disponibilidad suficiente: ${fullLessons.map((f) => `${f.title} (${f.time})`).join(', ')}`,
    };
  }

  return { ok: true };
}

module.exports = {
  buildDayIndexMap,
  buildIsoForDayIndexMap,
  resolveRequestedLessonIds,
  computeEventOccupancy,
  getEventCapacityStatus,
  assertCapacity,
};
