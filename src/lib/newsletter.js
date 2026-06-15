// Newsletter: invio campagne, gestione iscritti, template email professionale.
const crypto = require('crypto');
const prisma = require('./db');
const settings = require('./settings');
const { sendMail } = require('./mailer');

function genToken() { return crypto.randomBytes(16).toString('hex'); }

// Aggiunge un iscritto se non esiste già (idempotente). Best-effort: ignora errori.
// Usato dopo: 1) booking pagata con dataConsent, 2) form contatto inviato,
// 3) referrer approvato. Non blocca il flusso principale se fallisce.
async function ensureSubscriber({ email, name, source }) {
  try {
    if (!email) return;
    const em = String(email).trim().toLowerCase();
    if (em.length < 5 || em.indexOf('@') < 1) return;
    const exists = await prisma.newsletterSubscriber.findUnique({ where: { email: em } });
    if (exists) return;
    await prisma.newsletterSubscriber.create({
      data: {
        email: em,
        name: String(name || '').trim(),
        source: String(source || 'manual'),
        status: 'active',
        unsubscribeToken: genToken(),
      },
    });
  } catch (e) {
    console.error('[newsletter] ensureSubscriber failed:', e.message);
  }
}

// Template HTML email professionale (responsive, inline styles per compatibilità email client)
function wrapEmail(opts) {
  const { subject, preheader, body, unsubscribeUrl, baseUrl } = opts;
  return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f6f6f4;font-family:Arial,Helvetica,sans-serif;color:#1c1f26">
<!-- preheader (testo nascosto che appare nell'anteprima della casella) -->
<div style="display:none;font-size:1px;color:#f6f6f4;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${escapeHtml(preheader || '')}</div>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f6f4;padding:30px 12px">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;max-width:600px;width:100%;border-radius:6px;overflow:hidden">
      <!-- HEADER -->
      <tr><td style="padding:32px 36px 24px;border-bottom:3px solid #e0aa00">
        <a href="${baseUrl}" style="text-decoration:none">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;color:#1c1f26;font-weight:500;letter-spacing:.5px">Irene Monticelli</div>
          <div style="font-size:11px;color:#7a8190;letter-spacing:.18em;text-transform:uppercase;margin-top:4px">Bailarina · Coreógrafa · Profesora</div>
        </a>
      </td></tr>
      <!-- BODY -->
      <tr><td style="padding:36px 36px 30px;font-size:15.5px;line-height:1.7;color:#1c1f26">
        ${body}
      </td></tr>
      <!-- FOOTER -->
      <tr><td style="padding:24px 36px;background:#fafaf8;border-top:1px solid #eef0f4;font-size:12px;color:#7a8190;text-align:center">
        <p style="margin:0 0 10px">© ${new Date().getFullYear()} Irene Monticelli · Italia ✱ España</p>
        <p style="margin:0 0 4px">
          <a href="${baseUrl}" style="color:#7a8190;text-decoration:none">irenemonticelli.com</a>
          &nbsp;·&nbsp;
          <a href="${baseUrl}/contacto" style="color:#7a8190;text-decoration:none">Contacto</a>
          &nbsp;·&nbsp;
          <a href="${unsubscribeUrl}" style="color:#7a8190;text-decoration:underline">Cancelar suscripción</a>
        </p>
        <p style="margin:8px 0 0;font-size:11px;color:#9aa1b2">
          Recibes este correo porque te has inscrito a un evento o has dado tu consentimiento durante el contacto.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function escapeHtml(s) { return String(s||'').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]); }

// Importa iscritti dalle prenotazioni confermate (con consenso dati) — idempotente
async function importFromBookings() {
  const bookings = await prisma.booking.findMany({
    where: { dataConsent: true },
    select: { customerEmail: true, firstName: true, lastName: true },
  });
  let added = 0;
  for (const b of bookings) {
    if (!b.customerEmail) continue;
    const exists = await prisma.newsletterSubscriber.findUnique({ where: { email: b.customerEmail } });
    if (exists) continue;
    await prisma.newsletterSubscriber.create({
      data: {
        email: b.customerEmail,
        name: `${b.firstName || ''} ${b.lastName || ''}`.trim(),
        source: 'booking',
        unsubscribeToken: genToken(),
      },
    });
    added++;
  }
  return added;
}

// Invia la campagna a tutti gli iscritti attivi (con piccolo delay per non saturare il SMTP)
async function sendCampaign(campaignId, baseUrl) {
  const c = await prisma.newsletterCampaign.findUnique({ where: { id: campaignId } });
  if (!c) throw new Error('Campagna non trovata');
  if (c.status === 'sent' || c.status === 'sending') throw new Error('Campagna già in invio / inviata');

  // Audience
  let where = { status: 'active' };
  if (c.audience === 'bookings') where.source = 'booking';
  else if (c.audience === 'contacts') where.source = 'contact';
  const recipients = await prisma.newsletterSubscriber.findMany({ where });

  await prisma.newsletterCampaign.update({
    where: { id: campaignId },
    data: { status: 'sending', totalRecipients: recipients.length, successCount: 0, failureCount: 0 },
  });

  let success = 0, failure = 0;
  for (const r of recipients) {
    const unsubscribeUrl = `${baseUrl}/newsletter/unsubscribe/${r.unsubscribeToken}`;
    const html = wrapEmail({ subject: c.subject, preheader: c.preheader, body: c.htmlBody, unsubscribeUrl, baseUrl });
    try {
      await sendMail({ to: r.email, subject: c.subject, html, text: htmlToText(c.htmlBody) });
      await prisma.newsletterSubscriber.update({ where: { id: r.id }, data: { lastSentAt: new Date() } });
      success++;
    } catch (e) {
      console.error('[newsletter] invio fallito a', r.email, e.message);
      failure++;
    }
    // throttle 150ms
    await new Promise((ok) => setTimeout(ok, 150));
  }

  await prisma.newsletterCampaign.update({
    where: { id: campaignId },
    data: {
      status: failure === 0 ? 'sent' : (success === 0 ? 'failed' : 'sent'),
      sentAt: new Date(),
      successCount: success, failureCount: failure,
    },
  });
  return { total: recipients.length, success, failure };
}

function htmlToText(html) {
  return String(html||'')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h\d|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')
    .replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = { wrapEmail, sendCampaign, importFromBookings, genToken, htmlToText, ensureSubscriber };
