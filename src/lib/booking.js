// Logica prezzi/prenotazione condivisa (pacchetti dinamici dal DB).

function parseJSON(s, fallback) {
  try { const v = JSON.parse(s || ''); return v == null ? fallback : v; } catch { return fallback; }
}

// Orari dell'evento (modificabili da dashboard). AM = prima delle 14:00.
function eventSlots(event) {
  const s = parseJSON(event && event.slotsJson, null);
  const list = Array.isArray(s) && s.length ? s : ['9:30', '11:15', '12:30', '15:30', '16:45', '18:00'];
  return list.map((t) => String(t).trim()).filter(Boolean);
}
function slotIsMorning(t) {
  const h = parseInt(String(t).split(':')[0], 10);
  return h < 14;
}
function eventDays(event) {
  const out = [];
  if (!event || !event.startDate) return out;
  const start = new Date(event.startDate);
  const end = event.endDate ? new Date(event.endDate) : start;
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dd = new Date(d);
    out.push({ iso: dd.toISOString().slice(0, 10), label: `${dd.getDate()} ${months[dd.getMonth()]} ${dd.getFullYear()}` });
  }
  return out;
}

function pricing(plan) {
  return parseJSON(plan && plan.pricingJson, null) || { type: 'flat', price: plan ? plan.price : 0 };
}

// Prezzo a fasce early-bird in base alla data odierna
function tierPrice(pr, now = new Date()) {
  if (!pr || pr.type !== 'tiers') return pr ? pr.price || 0 : 0;
  const tiers = (pr.tiers || []).slice().sort((a, b) => new Date(a.until) - new Date(b.until));
  for (const t of tiers) {
    const until = new Date(t.until + 'T23:59:59');
    if (now <= until) return Number(t.price);
  }
  return Number(pr.base || 0);
}

// Calcola importo (EUR) e descrizione leggibile da una selezione.
function compute(plan, selection, now = new Date()) {
  const pr = pricing(plan);
  selection = selection || {};
  if (plan.bookingMode === 'single_lessons' || pr.type === 'lessons') {
    const opt = (pr.options || []).find((o) => String(o.count) === String(selection.count));
    if (!opt) return { ok: false, error: 'Selezione lezioni non valida' };
    const lessons = Array.isArray(selection.lessons) ? selection.lessons : [];
    if (lessons.length !== Number(opt.count)) return { ok: false, error: `Seleziona giorno e orario per ${opt.count} lezione/i` };
    for (const l of lessons) if (!l.day || !l.slot) return { ok: false, error: 'Completa giorno e orario di ogni lezione' };
    return { ok: true, amount: Number(opt.price), label: `${opt.count} lezione/i`, items: { count: opt.count, lessons } };
  }
  if (plan.bookingMode === 'red') {
    const days = selection.days || {}; // {iso: 'AM'|'PM'}
    const keys = Object.keys(days);
    if (!keys.length) return { ok: false, error: 'Scegli mattina o pomeriggio per ogni giorno' };
    for (const k of keys) if (!['AM', 'PM'].includes(days[k])) return { ok: false, error: 'Valore turno non valido' };
    return { ok: true, amount: tierPrice(pr, now), label: 'Pack Red — 3 días', items: { days } };
  }
  // gold / junior: nessuna scelta
  return { ok: true, amount: tierPrice(pr, now), label: plan.name, items: {} };
}

function ageYears(birth) {
  if (!birth) return null;
  const b = new Date(birth);
  if (isNaN(b)) return null;
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  const m = n.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < b.getDate())) a--;
  return a;
}

module.exports = { parseJSON, eventSlots, slotIsMorning, eventDays, pricing, tierPrice, compute, ageYears };
