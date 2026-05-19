// Mailer costruito dinamicamente dalle impostazioni SMTP salvate.
const nodemailer = require('nodemailer');
const settings = require('./settings');

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

async function sendMail({ to, subject, text, html }) {
  const s = await settings.all();
  const transport = await buildTransport();
  const from = `${s.smtp_from_name || 'Admin'} <${s.smtp_from_email || s.smtp_user}>`;
  return transport.sendMail({ from, to, subject, text, html });
}

module.exports = { sendMail, buildTransport };
