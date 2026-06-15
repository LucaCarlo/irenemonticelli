// Webhook Stripe: conferma la prenotazione quando il pagamento va a buon fine.
// Montato con express.raw PRIMA di express.json (serve il body grezzo).
const express = require('express');
const prisma = require('../lib/db');
const { getStripe, webhookSecret } = require('../lib/stripe');
const { sendBookingConfirmation } = require('../lib/bookingmail');
const { ensureSubscriber } = require('../lib/newsletter');
const RC = require('../lib/referral-calc');
const settings = require('../lib/settings');
const { sendMail } = require('../lib/mailer');
const audit = require('../lib/audit');

// Risolve un bookingId a partire dall'evento Stripe, anche se metadata.bookingId manca.
// Per checkout.session.completed: fallback su stripeSessionId.
// Per payment_intent.*: fallback su stripePaymentIntent.
async function resolveBookingId(obj, kind) {
  let id = parseInt(obj && obj.metadata && obj.metadata.bookingId, 10);
  if (id) return id;
  try {
    if (kind === 'session' && obj && obj.id) {
      const b = await prisma.booking.findFirst({ where: { stripeSessionId: obj.id }, select: { id: true } });
      if (b) return b.id;
    }
    if (kind === 'pi' && obj && obj.id) {
      const b = await prisma.booking.findFirst({ where: { stripePaymentIntent: obj.id }, select: { id: true } });
      if (b) return b.id;
    }
  } catch (e) {
    console.error('[stripe-webhook] resolveBookingId lookup error', e.message);
  }
  return null;
}

const router = express.Router();

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Crea ReferralCommission per una booking che ha un codice referral applicato.
// Idempotente: se esiste già, non duplica.
async function createCommissionIfNeeded(bookingId) {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { referralCode: { include: { referrer: true } }, commission: true },
  });
  if (!b) return null;
  if (b.commission) return b.commission;            // già creata
  if (!b.referralCodeId || !b.referralCode) return null;
  // Calcolo base commissione: net pacchetto post sconto referral (no IVA, no extras).
  const grossPack = (b.subtotal || 0) - (b.discountAmount || 0) - (b.referralDiscount || 0);
  const netBase = +(grossPack / (1 + RC.IVA_RATE)).toFixed(2);
  const commissionAmt = RC.commissionForCode(b.referralCode, netBase);

  const created = await prisma.referralCommission.create({
    data: {
      referrerId: b.referralCode.referrerId,
      codeId: b.referralCodeId,
      bookingId: b.id,
      bookingGross: b.amount || 0,
      netBase,
      commissionPct: b.referralCode.commissionPct,
      commissionAmt,
      status: 'pending',
    },
  });
  // Incremento usedCount
  await prisma.referralCode.update({
    where: { id: b.referralCodeId },
    data: { usedCount: { increment: 1 } },
  });

  // Email al referrer (best-effort)
  if (commissionAmt > 0 && b.referralCode.referrer && b.referralCode.referrer.email) {
    try {
      const s = await settings.all();
      const siteName = s.site_name || 'Irene Monticelli';
      const loginUrl = 'https://irenemonticelli.com/area-referral/login';
      const ref = b.referralCode.referrer;
      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;color:#1c1f26;max-width:560px">
          <h2 style="color:#1b6b3e;font-family:Georgia,serif;font-weight:500;font-size:26px;margin:0 0 14px">🎉 ¡Nueva comisión!</h2>
          <p>Hola <strong>${escapeHtml(ref.firstName)}</strong>,</p>
          <p>¡Buenas noticias! Alguien acaba de reservar usando tu código <code style="background:#fffbe8;color:#7a5800;padding:3px 9px;border-radius:5px;font-weight:700">${escapeHtml(b.referralCodeSnap)}</code>.</p>
          <div style="background:#e7f3ec;border:1px solid #aedabe;border-radius:10px;padding:18px;margin:18px 0;text-align:center">
            <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#1b6b3e;font-weight:700;margin-bottom:8px">Tu comisión</div>
            <div style="font-family:Georgia,serif;font-size:38px;font-weight:500;color:#1c1f26">${commissionAmt.toFixed(2)} €</div>
          </div>
          <p style="font-size:14px;line-height:1.65;color:#5a5e6a">
            Puedes ver el detalle y el histórico completo en tu panel personal:
          </p>
          <p style="margin:18px 0;text-align:center">
            <a href="${loginUrl}" style="display:inline-block;background:#1c1f26;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Ir a mi panel →</a>
          </p>
          <p style="font-size:12px;color:#888;margin-top:24px">— ${escapeHtml(siteName)}</p>
        </div>`;
      const text = `¡Nueva comisión!\n\nHola ${ref.firstName},\n\nAlguien acaba de reservar usando tu código ${b.referralCodeSnap}.\n\nTu comisión: ${commissionAmt.toFixed(2)} €\n\nVer detalle en: ${loginUrl}\n\n— ${siteName}`;
      await sendMail({
        to: ref.email,
        subject: `🎉 Nueva comisión de ${commissionAmt.toFixed(2)}€ · ${siteName}`,
        text, html,
      });
    } catch (e) {
      console.error('[commission-mail] invio referrer fallito:', e.message);
    }
  }

  return created;
}

router.post('/stripe/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  let event;
  try {
    const stripe = await getStripe();
    const secret = await webhookSecret();
    const sig = req.headers['stripe-signature'];
    if (secret && sig) {
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } else {
      // Senza webhook secret: best-effort (parse del JSON grezzo)
      event = JSON.parse(req.body.toString('utf8'));
    }
  } catch (e) {
    console.error('[stripe-webhook] signature error', e.message);
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }

  // Audit log: registra ogni evento ricevuto (best-effort)
  const fakeReq = { headers: req.headers, ip: req.ip, user: null };
  let resolvedBookingId = null;

  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object;
      const bookingId = await resolveBookingId(s, 'session');
      resolvedBookingId = bookingId;
      if (bookingId) {
        await prisma.booking.update({
          where: { id: bookingId },
          data: {
            status: 'confirmed',
            paymentStatus: 'paid',
            method: (s.payment_method_types && s.payment_method_types[0]) || 'card',
            stripePaymentIntent: s.payment_intent || '',
          },
        });
        // Crea commissione referral (se applicabile)
        await createCommissionIfNeeded(bookingId).catch((e) => console.error('[commission] create fallita:', e.message));
        // Auto-iscrizione newsletter se il cliente ha dato consenso dati
        try {
          const bk = await prisma.booking.findUnique({ where: { id: bookingId }, select: { customerEmail: true, firstName: true, lastName: true, customerName: true, dataConsent: true } });
          if (bk && bk.dataConsent) await ensureSubscriber({ email: bk.customerEmail, name: bk.customerName || (bk.firstName + ' ' + bk.lastName).trim(), source: 'booking' });
        } catch (e) { console.error('[newsletter] auto-subscribe fallita:', e.message); }
        // Email di conferma con riepilogo (non bloccare il webhook se SMTP off)
        try { await sendBookingConfirmation(bookingId); }
        catch (e) { console.error('[booking-mail] invio fallito:', e.message); }
      } else {
        console.warn('[stripe-webhook] checkout.session.completed: bookingId non risolto', s.id);
      }
    } else if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      const bookingId = await resolveBookingId(pi, 'pi');
      resolvedBookingId = bookingId;
      if (bookingId) {
        await prisma.booking.update({
          where: { id: bookingId },
          data: {
            status: 'confirmed',
            paymentStatus: 'paid',
            method: 'stripe',
            stripePaymentIntent: pi.id || '',
          },
        });
        await createCommissionIfNeeded(bookingId).catch((e) => console.error('[commission] create fallita:', e.message));
        try {
          const bk = await prisma.booking.findUnique({ where: { id: bookingId }, select: { customerEmail: true, firstName: true, lastName: true, customerName: true, dataConsent: true } });
          if (bk && bk.dataConsent) await ensureSubscriber({ email: bk.customerEmail, name: bk.customerName || (bk.firstName + ' ' + bk.lastName).trim(), source: 'booking' });
        } catch (e) { console.error('[newsletter] auto-subscribe fallita:', e.message); }
        try { await sendBookingConfirmation(bookingId); }
        catch (e) { console.error('[booking-mail] invio fallito:', e.message); }
      } else {
        console.warn('[stripe-webhook] payment_intent.succeeded: bookingId non risolto', pi.id);
      }
    } else if (event.type === 'checkout.session.expired') {
      const s = event.data.object;
      const bookingId = await resolveBookingId(s, 'session');
      resolvedBookingId = bookingId;
      if (bookingId) {
        await prisma.booking.update({
          where: { id: bookingId },
          data: {
            paymentStatus: 'failed',
            stripeErrorCode: 'session_expired',
            stripeError: 'La sesión de pago expiró sin completarse',
          },
        }).catch(() => {});
      }
    } else if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object;
      const bookingId = await resolveBookingId(pi, 'pi');
      resolvedBookingId = bookingId;
      if (bookingId) {
        // Estrae i dettagli dell'errore: decline_code (più specifico) > code > generic message
        const lpe = pi.last_payment_error || {};
        const code = lpe.decline_code || lpe.code || 'payment_failed';
        // Frase user-friendly: prefer human-readable message poi fallback
        const msg = lpe.message
          || (lpe.payment_method_details && lpe.payment_method_details.error)
          || 'El pago no se ha podido completar';
        await prisma.booking.update({
          where: { id: bookingId },
          data: {
            paymentStatus: 'failed',
            stripeErrorCode: String(code).slice(0, 80),
            stripeError: String(msg).slice(0, 500),
          },
        }).catch(() => {});
      }
    } else if (event.type === 'charge.refunded' || event.type === 'charge.refund.updated') {
      const ch = event.data.object;
      // Lookup booking per PaymentIntent ID
      const pi = ch.payment_intent;
      if (pi) {
        const b = await prisma.booking.findFirst({ where: { stripePaymentIntent: pi }, select: { id: true } });
        if (b) {
          resolvedBookingId = b.id;
          // Refund totale o parziale: per ora marchiamo refunded
          await prisma.booking.update({
            where: { id: b.id },
            data: { paymentStatus: 'refunded' },
          }).catch(() => {});
        }
      }
    }
  } catch (e) {
    console.error('[stripe-webhook] handler error', e.message);
    audit.log(fakeReq, 'stripe.webhook.error', {
      entity: 'stripeEvent', entityId: (event && event.id) || '',
      details: { type: event && event.type, error: e.message, bookingId: resolvedBookingId },
    }).catch(() => {});
    return res.json({ received: true });
  }

  // Audit success
  audit.log(fakeReq, 'stripe.webhook.received', {
    entity: 'stripeEvent', entityId: (event && event.id) || '',
    details: { type: event && event.type, bookingId: resolvedBookingId },
  }).catch(() => {});

  res.json({ received: true });
});

module.exports = router;
