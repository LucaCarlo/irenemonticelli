// Mailer costruito dinamicamente dalle impostazioni SMTP salvate.
// Ogni invio (riuscito O fallito) genera un AuditLog automatico, così c'è
// sempre traccia di cosa è stato inviato, a chi, quando e con che esito.
const nodemailer = require('nodemailer');
const settings = require('./settings');
const prisma = require('./db');

async function buildTransport() {
  const s = await settings.all();
  if (!s.smtp_host) throw new Error('SMTP non configurato (Impostazioni > SMTP)');
  return nodemailer.createTransport({
    host: s.smtp_host,
    port: parseInt(s.smtp_port || '587', 10),
    secure: s.smtp_secure === '1' || s.smtp_secure === 'true',
    auth: s.smtp_user ? { user: s.smtp_user, pass: s.smtp_pass } : undefined,
  });
}

// Audit best-effort: non blocca mai l'invio se fallisce
function logAudit({ action, kind, entity, entityId, to, subject, error, messageId }) {
  prisma.auditLog.create({
    data: {
      userId: null,
      userEmail: 'system@mailer',
      action: String(action || '').slice(0, 80),
      entity: String(entity || kind || 'mail').slice(0, 80),
      entityId: String(entityId || '').slice(0, 80),
      details: JSON.stringify({ to, subject, kind: kind || '', messageId: messageId || '', error: error || '' }).slice(0, 4000),
      ip: '',
      userAgent: 'mailer',
    },
  }).catch(() => {});
}

// `kind` (es. 'booking.confirmation', 'newsletter.campaign', 'referrer.welcome', ...)
// e `entity` / `entityId` sono opzionali: arricchiscono l'AuditLog.
async function sendMail({ to, subject, text, html, kind, entity, entityId }) {
  const s = await settings.all();
  const transport = await buildTransport();
  const from = `${s.smtp_from_name || 'Admin'} <${s.smtp_from_email || s.smtp_user}>`;
  try {
    const r = await transport.sendMail({ from, to, subject, text, html });
    logAudit({ action: 'mail.sent', kind, entity, entityId, to, subject, messageId: r && r.messageId });
    return r;
  } catch (e) {
    logAudit({ action: 'mail.failed', kind, entity, entityId, to, subject, error: e.message });
    throw e;
  }
}

module.exports = { sendMail, buildTransport };
