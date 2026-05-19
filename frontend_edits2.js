// Secondo giro di modifiche frontend (verificate, whitespace-safe).
const fs = require('fs');
const path = require('path');

const SECONDARY = ['pro-dance.html', 'contatti.html', 'pack-single.html', 'pack-gold.html', 'pack-red.html', 'pack-junior.html'];

function read(f) { return fs.readFileSync(path.join(__dirname, f), 'utf8'); }
function write(f, h) { fs.writeFileSync(path.join(__dirname, f), h); }

function rep(f, h, from, to, opt) {
  const n = h.split(from).length - 1;
  if (n === 0) { console.log(`  [${f}] NON trovato: ${JSON.stringify(from.slice(0, 50))}`); return h; }
  console.log(`  [${f}] OK (${n}x): ${JSON.stringify(from.slice(0, 46))}`);
  return opt === 'all' ? h.split(from).join(to) : h.replace(from, to);
}

// --- Logo defs (symbol #logo-paths) da iniettare nelle pagine secondarie ---
const idx = read('index.html');
const di = idx.indexOf('<svg width="0" height="0"');
const dj = idx.indexOf('</svg>', idx.indexOf('</symbol>')) + 6;
const LOGO_DEFS = idx.slice(di, dj);
if (!LOGO_DEFS.includes('id="logo-paths"')) throw new Error('Logo defs non estratti');

for (const f of SECONDARY) {
  let h = read(f);
  // 1) Logo visibile: inietta i defs del simbolo se mancano
  if (!h.includes('id="logo-paths"')) {
    h = h.replace('<body>', '<body>\n' + LOGO_DEFS + '\n');
    console.log(`  [${f}] logo defs iniettati`);
  } else {
    console.log(`  [${f}] logo defs gia presenti`);
  }
  // 2) Header: "Pro Dance" -> "Pro Dance Experience"
  h = rep(f, h, 'data-nav="pro-dance">Pro Dance</a>', 'data-nav="pro-dance">Pro Dance Experience</a>', 'all');
  // 3) Aggiungi "Galería" nel menu header (pagine secondarie -> home#galleria)
  h = rep(
    f, h,
    '<a href="/contatti" data-h data-nav="contatti">Contacto</a>',
    '<a href="index.html#galleria" data-h data-nav="home" data-target="galleria">Galería</a> <a href="/contatti" data-h data-nav="contatti">Contacto</a>'
  );
  write(f, h);
}

// --- index.html ---
let h = read('index.html');
h = rep('index.html', h, 'data-nav="pro-dance">Pro Dance</a>', 'data-nav="pro-dance">Pro Dance Experience</a>', 'all');
h = rep(
  'index.html', h,
  '<a href="/contatti" data-h data-nav="contatti">Contacto</a>',
  '<a href="#galleria" data-h>Galería</a> <a href="/contatti" data-h data-nav="contatti">Contacto</a>'
);
// Sede -> luogo completo (card)
h = rep('index.html', h,
  'Sede <span class="val">Santa Pola</span>',
  'Sede <span class="val">Pabellón Municipal Lara González · Santa Pola - Alicante</span>', 'all');
// Niente animazione intro quando si arriva con un hash (link da altre pagine / footer)
h = rep('index.html', h,
  'if (!pre || !preSig || !headerLogo || !placeholder || !header) {',
  'if (window.__SKIP_INTRO || !pre || !preSig || !headerLogo || !placeholder || !header) {');
h = rep('index.html', h, '<body>',
  '<body>\n<script>if(location.hash&&location.hash.length>1){window.__SKIP_INTRO=true;}</script>');
write('index.html', h);

// --- pro-dance.html: testo, telefono, sede ---
let p = read('pro-dance.html');
p = rep('pro-dance.html', p,
  'Las mañanas se dedican a la base técnica — alineación, respiración, precisión — las tardes al lenguaje, a la composición, a la libertad del cuerpo escénico.',
  'En los 3 días se alterna la base técnica — alineación, respiración, precisión — con el lenguaje, la composición y la libertad del cuerpo escénico.');
p = rep('pro-dance.html', p, '+34 672 04 79 38', '+34 672047938', 'all');
p = rep('pro-dance.html', p,
  'Sede <span class="val">Santa Pola</span>',
  'Sede <span class="val">Pabellón Municipal Lara González · Santa Pola - Alicante</span>', 'all');
p = rep('pro-dance.html', p,
  'Santa Pola, <em>Alicante</em>',
  'Pabellón Municipal Lara González, <em>Santa Pola - Alicante</em>');
write('pro-dance.html', p);

console.log('Fatto.');
