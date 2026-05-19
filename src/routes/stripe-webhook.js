// Webhook Stripe: conferma la prenotazione quando il pagamento va a buon fine.
// Montato con express.raw PRIMA di express.json (serve il body grezzo).
const express = require('express');
const prisma = require('../lib/db');
const { getStripe, webhookSecret } = require('../lib/stripe');

const router = express.Router();

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

  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object;
      const bookingId = parseInt(s.metadata && s.metadata.bookingId, 10);
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
      }
    } else if (event.type === 'checkout.session.expired') {
      const s = event.data.object;
      const bookingId = parseInt(s.metadata && s.metadata.bookingId, 10);
      if (bookingId) {
        await prisma.booking.update({ where: { id: bookingId }, data: { paymentStatus: 'failed' } }).catch(() => {});
      }
    }
  } catch (e) {
    console.error('[stripe-webhook] handler error', e.message);
  }
  res.json({ received: true });
});

module.exports = router;
