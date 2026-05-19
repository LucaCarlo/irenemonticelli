// Rimuove il Pack Junior dal frontend e sistema il livello -> "Medio avanzado
// (a partir de 14 años)". Rimuove i riferimenti 9-12 anni.
const fs = require('fs');
const path = require('path');
function rd(f){ return fs.readFileSync(path.join(__dirname,f),'utf8'); }
function wr(f,h){ fs.writeFileSync(path.join(__dirname,f),h); }

// 1) pro-dance.html: rimuovi l'intera card Junior
let pd = rd('pro-dance.html');
var cta = pd.indexOf('data-nav="pack-junior"');
if (cta > 0) {
  var aS = pd.lastIndexOf('<article', cta);
  var aE = pd.indexOf('</article>', cta) + '</article>'.length;
  if (aS >= 0 && aE > aS) {
    // togli anche eventuale whitespace prima della card
    var before = pd.slice(0, aS).replace(/\s+$/, '\n        ');
    pd = before + pd.slice(aE);
    console.log('[pro-dance] card Junior rimossa');
  }
} else console.log('[pro-dance] card Junior non trovata (gia rimossa?)');

// 1b) pro-dance: livello con "+14 años"
if (pd.includes('<span class="pd-meta-value">Medio &mdash; <em>Avanzado</em></span>')) {
  pd = pd.replace('<span class="pd-meta-value">Medio &mdash; <em>Avanzado</em></span>',
    '<span class="pd-meta-value">Medio avanzado <em>· +14 años</em></span>');
  console.log('[pro-dance] nivel meta aggiornato (&mdash;)');
} else if (pd.includes('<span class="pd-meta-value">Medio — <em>Avanzado</em></span>')) {
  pd = pd.replace('<span class="pd-meta-value">Medio — <em>Avanzado</em></span>',
    '<span class="pd-meta-value">Medio avanzado <em>· +14 años</em></span>');
  console.log('[pro-dance] nivel meta aggiornato');
} else console.log('[pro-dance] nivel meta non trovato (verifica manuale)');
wr('pro-dance.html', pd);

// 2) index.html: card02 -> niente "Edad 9-12", livello = Medio avanzado +14
let ix = rd('index.html');
var re = /<span>\s*Edad\s*<span class="val">[^<]*<\/span>\s*<\/span>\s*<span>\s*Nivel\s*<span class="val">[^<]*<\/span>\s*<\/span>/;
if (re.test(ix)) {
  ix = ix.replace(re, '<span>Nivel <span class="val">Medio avanzado · a partir de 14 años</span></span>');
  console.log('[index] edad/nivel sostituiti');
} else {
  // fallback: solo il valore livello
  if (ix.includes('<span class="val">Intermedio · Avanzado</span>')) {
    ix = ix.replace('<span class="val">Intermedio · Avanzado</span>', '<span class="val">Medio avanzado · a partir de 14 años</span>');
    console.log('[index] nivel valore sostituito (fallback)');
  } else console.log('[index] pattern edad/nivel non trovato');
  ix = ix.replace('<span class="val">9 — 12 años</span>', '<span class="val">a partir de 14 años</span>');
}
wr('index.html', ix);
console.log('Fatto.');
