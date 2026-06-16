// Email di conferma prenotazione (riepilogo completo) al cliente + a Irene.
// Supporta sia il vecchio modello (1 partecipante = i campi sul Booking)
// sia il nuovo modello multi-partecipante (relazione Participant + TutorBlock).
const prisma = require('./db');
const settings = require('./settings');
const { sendMail } = require('./mailer');

function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }); }
  catch { return String(d); }
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; });
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

function detailLines(booking) {
  const out = [];
  let it = {};
  try { it = JSON.parse(booking.itemsJson || '{}') || {}; } catch {}
  const mode = booking.plan ? booking.plan.bookingMode : '';
  if (mode === 'single_lessons' && Array.isArray(it.lessons)) {
    it.lessons.forEach((l, i) => out.push(`Clase ${i + 1}: ${l.day} · ${l.slot}`));
  } else if (mode === 'red' && it.days) {
    Object.keys(it.days).forEach((d) => out.push(`${d}: ${it.days[d] === 'AM' ? 'Mañana' : 'Tarde'}`));
  }
  return out;
}

// Rende la sezione partecipanti. Per i minori: il pagante è il tutor responsabile (inline).
function renderParticipantsSection(participants, payerName) {
  if (!participants || !participants.length) return { html: '', text: '' };
  const html =
    `<h3 style="font-family:Arial,Helvetica,sans-serif;color:#1c1f26;margin:26px 0 10px;font-size:15px;letter-spacing:.06em;text-transform:uppercase;color:#7a5800">Participantes (${participants.length})</h3>` +
    participants.map((p, i) => {
      const age = ageYears(p.birthDate);
      const ageBadge = age == null ? '' : (age < 18
        ? `<span style="background:#fff3d6;color:#7a5800;font-size:10px;padding:2px 8px;border-radius:99px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-left:6px">menor · ${age}</span>`
        : `<span style="background:#e3f0ff;color:#0d5290;font-size:10px;padding:2px 8px;border-radius:99px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-left:6px">adulto · ${age}</span>`);
      const isMinor = (age != null && age < 18);
      const adultContact = (!isMinor && (p.email || p.phone))
        ? `<div style="font-size:12.5px;color:#5a5e6a;margin-top:4px">${escapeHtml(p.email || '')}${p.email && p.phone ? ' · ' : ''}${escapeHtml(p.phone || '')}</div>`
        : '';
      const tutorLine = isMinor
        ? `<div style="font-size:12.5px;color:#7a5800;margin-top:4px;font-style:italic">Tutor responsable: ${escapeHtml(payerName)} (pagante)</div>`
        : '';
      const address = [p.address, p.zip + ' ' + p.city, p.country].filter(function(x){return x && x.trim();}).join(', ');
      return `<div style="border:1px solid #eef0f4;border-radius:8px;padding:12px 14px;margin-bottom:10px;background:#fafbfc">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:4px">
          <strong style="font-size:14.5px;color:#1c1f26">#${i + 1} — ${escapeHtml((p.firstName + ' ' + p.lastName).trim())}</strong>
          ${ageBadge}
        </div>
        <div style="font-size:12.5px;color:#5a5e6a">${fmtDate(p.birthDate)} · ${escapeHtml(address)}</div>
        ${adultContact}
        ${tutorLine}
      </div>`;
    }).join('');
  const text =
    `\n\nPARTICIPANTES (${participants.length})\n` +
    participants.map(function(p, i){
      const age = ageYears(p.birthDate);
      const isMinor = (age != null && age < 18);
      const tutorLine = isMinor ? `\n   Tutor responsable: ${payerName} (pagante)` : '';
      const contact = (!isMinor && (p.email || p.phone)) ? `\n   ${[p.email, p.phone].filter(Boolean).join(' · ')}` : '';
      const address = [p.address, p.zip + ' ' + p.city, p.country].filter(function(x){return x && x.trim();}).join(', ');
      return `${i+1}. ${p.firstName} ${p.lastName} (${age != null ? (age<18?'menor '+age:'adulto '+age) : '?'})\n   ${fmtDate(p.birthDate)} · ${address}${contact}${tutorLine}`;
    }).join('\n');
  return { html, text };
}

// overrideTo: se passato, invia SOLO a quel destinatario (utile per test/sample),
//             niente copia all'admin. Se non passato, comportamento normale.
async function sendBookingConfirmation(bookingId, overrideTo) {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      plan: true,
      event: true,
      participants: { orderBy: { sort: 'asc' } },
      tutorBlocks: false,  // legacy: non più popolato — pagante è il tutore
    },
  });
  if (!b) return;
  const s = await settings.all();
  const adminEmail = s.contact_email || s.smtp_from_email || '';
  const det = detailLines(b);
  const ev = b.event;

  const refundDays = parseInt(s.refund_days || '15', 10) || 15;
  const bookedAt = new Date(b.createdAt).toLocaleString('es-ES', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });

  let extras = [];
  try { extras = JSON.parse(b.extrasJson || '[]') || []; } catch {}
  const extrasLine = extras.length
    ? extras.map((x) => `${x.name}${x.mandatory ? ' (obligatorio)' : ''}: ${x.price}€`).join(' · ')
    : '';

  const N = b.participantsCount || 1;
  const rows = [
    ['Reserva nº', String(b.id)],
    ['Fecha de reserva', bookedAt],
    ['Pagante', `${b.firstName} ${b.lastName}`.trim() || b.customerName],
    ['Email pagante', b.customerEmail],
    ['Teléfono pagante', b.phone || '—'],
    ['Pack', b.plan ? b.plan.name : '—'],
    ['Evento', ev ? ev.title : '—'],
    ['Sede', ev && ev.location ? ev.location : '—'],
    ['Fechas', ev ? `${fmtDate(ev.startDate)} — ${fmtDate(ev.endDate)}` : '—'],
    ['Participantes', String(N) + (N === 1 ? ' persona' : ' personas')],
    ['Detalle', det.length ? det.join(' · ') : (b.dateLabel || '—')],
  ];
  // Breakdown se multi-partecipante o se subtotal/extrasTotal compilati
  if (b.subtotal > 0 || N > 1) {
    if (b.subtotal > 0) rows.push(['Subtotal', `${b.subtotal} ${b.currency || 'EUR'}`]);
    if (b.discountAmount > 0) rows.push(['Descuento (cantidad)', `−${b.discountAmount} ${b.currency || 'EUR'}`]);
    if (b.extrasTotal > 0) rows.push(['Extras (×' + N + ')', `${b.extrasTotal} ${b.currency || 'EUR'}`]);
  } else if (extrasLine) {
    rows.push(['Extras', extrasLine]);
  }
  rows.push(
    ['Importe total', `${b.amount} ${b.currency || 'EUR'}`],
    ['Estado', b.paymentStatus === 'paid' ? 'Pagado / Confirmado' : 'Pendiente']
  );

  // Sezione factura (se presente)
  let billingSection = { html: '', text: '' };
  if (b.billingAddress || b.billingNif) {
    const billHtml = `<h3 style="font-family:Arial,Helvetica,sans-serif;color:#1c1f26;margin:22px 0 10px;font-size:15px;letter-spacing:.06em;text-transform:uppercase;color:#7a5800">Datos para factura</h3>
      <div style="border:1px solid #ead9a8;border-radius:8px;padding:12px 14px;background:#fdf8e8;font-size:13.5px;line-height:1.6">
        <div><strong>${escapeHtml((b.firstName + ' ' + b.lastName).trim() || b.customerName)}</strong></div>
        ${b.billingAddress ? `<div>${escapeHtml(b.billingAddress)}</div>` : ''}
        ${(b.billingZip || b.billingCity) ? `<div>${escapeHtml(b.billingZip + ' ' + b.billingCity)}</div>` : ''}
        ${b.billingCountry ? `<div>${escapeHtml(b.billingCountry)}</div>` : ''}
        ${b.billingNif ? `<div style="margin-top:4px"><strong>NIF/CIF/DNI:</strong> ${escapeHtml(b.billingNif)}</div>` : ''}
      </div>`;
    const billText = `\n\nDATOS PARA FACTURA\n` +
      `${(b.firstName + ' ' + b.lastName).trim() || b.customerName}\n` +
      (b.billingAddress ? b.billingAddress + '\n' : '') +
      ((b.billingZip || b.billingCity) ? (b.billingZip + ' ' + b.billingCity).trim() + '\n' : '') +
      (b.billingCountry ? b.billingCountry + '\n' : '') +
      (b.billingNif ? 'NIF/CIF/DNI: ' + b.billingNif + '\n' : '');
    billingSection = { html: billHtml, text: billText };
  }

  const payerName = `${b.firstName} ${b.lastName}`.trim() || b.customerName || '';
  const partSection = renderParticipantsSection(b.participants || [], payerName);
  const tutorSection = { html: '', text: '' };  // niente sezione tutori — il pagante è il tutore

  const refundBox = `
    <div style="margin:22px 0 0;padding:14px 16px;background:#fdf8e8;border:1px solid #ead9a8;border-radius:8px;color:#7a5800;font-size:13px;line-height:1.55">
      <strong style="display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7a5800;margin-bottom:4px">Política de reembolso</strong>
      <p style="margin:0;color:#5e4400">Dispones de <strong>${refundDays} días</strong> desde la fecha de tu reserva (${bookedAt}) para solicitar el reembolso íntegro respondiendo a este email. Pasado este plazo no se aceptan devoluciones.</p>
    </div>`;

  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#1c1f26;max-width:620px;margin:0 auto;background:#fff;padding:20px">
      <h2 style="color:#c8970a;margin:0 0 8px">¡Reserva confirmada!</h2>
      <p style="margin:0 0 16px">Gracias <strong>${escapeHtml(b.firstName || b.customerName)}</strong>, hemos recibido tu reserva. Aquí tienes el resumen completo:</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        ${rows.map(([k, v]) => `<tr><td style="padding:8px 6px;color:#7a8190;border-bottom:1px solid #eee;width:38%">${escapeHtml(k)}</td><td style="padding:8px 6px;border-bottom:1px solid #eee"><strong>${escapeHtml(v)}</strong></td></tr>`).join('')}
      </table>
      ${partSection.html}
      ${tutorSection.html}
      ${billingSection.html}
      ${refundBox}
      <p style="margin-top:18px;font-size:13px;color:#7a8190">Si necesitas modificar algo, responde a este email. ¡Nos vemos en la pista!</p>
      <p style="font-size:13px;margin:6px 0 0">Irene Monticelli · Pro Dance Experience</p>
    </div>`;

  const text =
    `¡Reserva confirmada!\n\n` +
    rows.map(([k, v]) => `${k}: ${v}`).join('\n') +
    partSection.text + tutorSection.text + billingSection.text +
    `\n\n— Política de reembolso —\nDispones de ${refundDays} días desde la fecha de tu reserva (${bookedAt}) para solicitar el reembolso íntegro. Pasado este plazo no se aceptan devoluciones.\n\nGracias. Irene Monticelli — Pro Dance Experience`;

  const subject = `Reserva confirmada — ${b.plan ? b.plan.name : 'Pro Dance Experience'} (nº ${b.id})`;

  if (overrideTo) {
    // Modalità sample/test: invia SOLO al destinatario override.
    await sendMail({ to: overrideTo, subject: '[SAMPLE] ' + subject, text, html, kind: 'booking.confirmation.sample', entity: 'Booking', entityId: b.id });
    return;
  }
  // Al cliente
  await sendMail({ to: b.customerEmail, subject, text, html, kind: 'booking.confirmation', entity: 'Booking', entityId: b.id });
  // Copia a Irene/admin
  if (adminEmail && adminEmail !== b.customerEmail) {
    await sendMail({ to: adminEmail, subject: `[Nueva reserva] ${subject}`, text, html, kind: 'booking.confirmation.admin', entity: 'Booking', entityId: b.id }).catch(() => {});
  }
}

module.exports = { sendBookingConfirmation };
