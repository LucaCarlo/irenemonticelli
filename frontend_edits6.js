// Menu: "Sobre mí" -> "En movimiento" che porta alla nuova pagina /biografia.
const fs = require('fs');
const path = require('path');
const FILES = ['index.html', 'pro-dance.html', 'contatti.html',
  'pack-single.html', 'pack-gold.html', 'pack-red.html', 'pack-junior.html'];

const PAIRS = [
  // header index
  ['<a href="#about" data-h>Sobre mí</a>', '<a href="/biografia" data-h>En movimiento</a>'],
  // header pagine secondarie
  ['<a href="index.html#about" data-h data-nav="home" data-target="about">Sobre mí</a>', '<a href="/biografia" data-h>En movimiento</a>'],
  // footer index
  ['<a href="#about">Sobre mí</a>', '<a href="/biografia">En movimiento</a>'],
  // footer pagine secondarie
  ['<a href="index.html#about" data-nav="home" data-target="about">Sobre mí</a>', '<a href="/biografia">En movimiento</a>'],
];

for (const f of FILES) {
  const fp = path.join(__dirname, f);
  if (!fs.existsSync(fp)) continue;
  let h = fs.readFileSync(fp, 'utf8');
  let n = 0;
  for (const [a, b] of PAIRS) {
    const c = h.split(a).length - 1;
    if (c) { h = h.split(a).join(b); n += c; }
  }
  // fallback: qualunque "Sobre mí" residuo come testo del link
  if (h.includes('>Sobre mí</a>')) { h = h.split('>Sobre mí</a>').join('>En movimiento</a>'); n += 1; }
  fs.writeFileSync(fp, h);
  console.log('[' + f + '] sostituzioni: ' + n + (h.includes('Sobre mí') ? ' (resta "Sobre mí" altrove)' : ''));
}
console.log('Fatto.');
