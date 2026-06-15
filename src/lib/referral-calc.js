// Logica condivisa per calcolo sconto codice referral + base commissione.
// IVA Spagna 21% inclusa nei prezzi listino dei pacchetti.
//
// REGOLE DI CALCOLO:
// - Sconto cliente: applicato al LORDO del pacchetto (IVA inclusa), esclusi extras (assicurazione).
// - Commissione referrer: applicata al NETTO del pacchetto post-sconto (IVA esclusa, extras esclusi).

const IVA_RATE = 0.21;

function rnd() { return Math.random().toString(36).slice(2, 6).toUpperCase(); }

// Genera un codice "MARIA-X4K2" partendo dal nome (max 6 char) + suffisso casuale.
function suggestCode(firstName, lastName) {
  const base = String(firstName || lastName || 'CODE').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
  return `${base}-${rnd()}`;
}

// Trasforma un valore lordo (IVA inclusa) in netto (senza IVA).
function netOfGross(gross) {
  return +(gross / (1 + IVA_RATE)).toFixed(2);
}

// Calcola lo sconto da applicare al lordo del pacchetto (no extras).
// Ritorna { gross, net } dello sconto stesso.
//   - percent: % del lordo pacchetto
//   - fixed:   valore in € fissi sul lordo pacchetto
function discountAmountForCode(code, grossPack) {
  if (!code || !code.active) return { gross: 0, net: 0 };
  let gross;
  if (code.discountType === 'fixed') {
    gross = +code.discountValue;
  } else {
    gross = +(grossPack * (+code.discountValue / 100)).toFixed(2);
  }
  if (gross < 0) gross = 0;
  if (gross > grossPack) gross = grossPack;
  const net = +(gross / (1 + IVA_RATE)).toFixed(2);
  return { gross, net };
}

// Mantenuto per retro-compatibilità (versione legacy che ritorna solo net).
function discountForCode(code, netPack) {
  if (!code || !code.active) return 0;
  let amount = 0;
  if (code.discountType === 'fixed') {
    amount = +code.discountValue;
  } else {
    amount = +(netPack * (+code.discountValue / 100)).toFixed(2);
  }
  if (amount < 0) amount = 0;
  if (amount > netPack) amount = netPack;
  return amount;
}

// Commissione referrer: % sul net pacchetto post-sconto (no IVA, no extras).
// NB: non blocchiamo su `code.active` — la validazione "codice attivo" è del
// checkout (vedi codeIsValid). Una booking già pagata genera la sua commissione
// anche se il codice viene disattivato dopo la prenotazione.
function commissionForCode(code, netBase) {
  if (!code || !code.commissionPct) return 0;
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
  discountAmountForCode,
  discountForCode, // legacy
  commissionForCode,
  codeIsValid,
};
