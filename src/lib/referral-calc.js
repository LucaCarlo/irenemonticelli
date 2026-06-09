// Logica condivisa per calcolo sconto codice referral + base commissione.
// IVA Spagna 21% inclusa nei prezzi listino dei pacchetti.

const IVA_RATE = 0.21;

function isUuid() { return Math.random().toString(36).slice(2, 6).toUpperCase(); }

// Genera un codice "MARIA-X4K2" partendo dal nome (max 6 char) + suffisso casuale.
function suggestCode(firstName, lastName) {
  const base = String(firstName || lastName || 'CODE').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
  return `${base}-${isUuid()}`;
}

// Net (senza IVA) di un valore lordo (IVA inclusa).
function netOfGross(gross) {
  return +(gross / (1 + IVA_RATE)).toFixed(2);
}

// Calcola lo sconto da applicare al net pacchetto a partire dal codice.
// netPack: importo netto del pacchetto pre-sconto (senza IVA, senza extras).
function discountForCode(code, netPack) {
  if (!code || !code.active) return 0;
  let amount = 0;
  if (code.discountType === 'fixed') {
    amount = +code.discountValue;            // € fissi
  } else {
    amount = +(netPack * (+code.discountValue / 100)).toFixed(2);
  }
  if (amount < 0) amount = 0;
  if (amount > netPack) amount = netPack;
  return amount;
}

// Calcola la commissione referrer dato un codice e il net post-sconto.
function commissionForCode(code, netBase) {
  if (!code || !code.active || !code.commissionPct) return 0;
  let amount = +(netBase * (+code.commissionPct / 100)).toFixed(2);
  if (amount < 0) amount = 0;
  return amount;
}

// Validità codice (attivo + non scaduto + non sopra il max).
function codeIsValid(code) {
  if (!code) return { ok: false, reason: 'not-found' };
  if (!code.active) return { ok: false, reason: 'inactive' };
  if (code.validUntil && new Date(code.validUntil) < new Date()) return { ok: false, reason: 'expired' };
  if (code.maxUses && code.usedCount >= code.maxUses) return { ok: false, reason: 'max-uses' };
  return { ok: true };
}

module.exports = {
  IVA_RATE,
  suggestCode,
  netOfGross,
  discountForCode,
  commissionForCode,
  codeIsValid,
};
