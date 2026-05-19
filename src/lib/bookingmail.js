// Email di conferma prenotazione (riepilogo completo) al cliente + a Irene.
const prisma = require('./db');
const settings = require('./settings');
const { sendMail } = require('./mailer');

function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }); }
  catch { return String(d); }
}

// Trasforma itemsJson + bookingMode in righe leggibili
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

async function sendBookingConfirmation(bookingId) {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { plan: true, event: true },
  });
  if (!b) return;
  const s = await settings.all();
  const adminEmail = s.contact_email || s.smtp_from_email || '';
  const det = detailLines(b);
  const ev = b.event;

  const rows = [
    ['Reserva nº', String(b.id)],
    ['Nombre', `${b.firstName} ${b.lastName}`.trim() || b.customerName],
    ['Email', b.customerEmail],
    ['Teléfono', b.phone || '—'],
    ['Pack', b.plan ? b.plan.name : '—'],
    ['Evento', ev ? ev.title : '—'],
    ['Sede', ev && ev.location ? ev.location : '—'],
    ['Fechas', ev ? `${fmtDate(ev.startDate)} — ${fmtDate(ev.endDate)}` : '—'],
    ['Detalle', det.length ? det.join(' · ') : (b.dateLabel || '—')],
    ['Importe', `${b.amount} ${b.currency || 'EUR'}`],
    ['Estado', b.paymentStatus === 'paid' ? 'Pagado / Confirmado' : 'Pendiente'],
  ];

  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;color:#1c1f26;max-width:560px;margin:0 auto">
      <h2 style="color:#c8970a">¡Reserva confirmada!</h2>
      <p>Gracias <strong>${b.firstName || b.customerName}</strong>, hemos recibido tu reserva. Aquí tienes el resumen:</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        ${rows.map(([k, v]) => `<tr><td style="padding:8px 6px;color:#7a8190;border-bottom:1px solid #eee;width:38%">${k}</td><td style="padding:8px 6px;border-bottom:1px solid #eee"><strong>${v}</strong></td></tr>`).join('')}
      </table>
      <p style="margin-top:18px;font-size:13px;color:#7a8190">Si necesitas modificar algo, responde a este email. ¡Nos vemos en la pista!</p>
      <p style="font-size:13px">Irene Monticelli · Pro Dance Experience</p>
    </div>`;
  const text =
    `¡Reserva confirmada!\n\n` +
    rows.map(([k, v]) => `${k}: ${v}`).join('\n') +
    `\n\nGracias. Irene Monticelli — Pro Dance Experience`;

  const subject = `Reserva confirmada — ${b.plan ? b.plan.name : 'Pro Dance Experience'} (nº ${b.id})`;

  // Al cliente
  await sendMail({ to: b.customerEmail, subject, text, html });
  // Copia a Irene/admin
  if (adminEmail && adminEmail !== b.customerEmail) {
    await sendMail({ to: adminEmail, subject: `[Nueva reserva] ${subject}`, text, html }).catch(() => {});
  }
}

module.exports = { sendBookingConfirmation };
