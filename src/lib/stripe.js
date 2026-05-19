// Client Stripe costruito dalle chiavi salvate nelle Impostazioni.
const Stripe = require('stripe');
const settings = require('./settings');

async function getStripe() {
  const s = await settings.all();
  const key = s.stripe_secret_key;
  if (!key) throw new Error('Stripe non configurato (Impostazioni > Stripe)');
  return new Stripe(key, { apiVersion: '2024-06-20' });
}

async function publishableKey() {
  const s = await settings.all();
  return s.stripe_publishable_key || '';
}
async function webhookSecret() {
  const s = await settings.all();
  return s.stripe_webhook_secret || '';
}

module.exports = { getStripe, publishableKey, webhookSecret };
