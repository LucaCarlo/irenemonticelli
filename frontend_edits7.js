// Ripristino: l'UNICA modifica deve essere la VOCE DI MENU (header):
// "Sobre mí" -> "En movimiento" che punta a /biografia.
// Reverto: eyebrow sezione home + link nel footer (tornano "Sobre mí").
const fs = require('fs');
const path = require('path');
const SECONDARY = ['pro-dance.html', 'contatti.html', 'pack-single.html', 'pack-gold.html', 'pack-red.html', 'pack-junior.html'];

function rd(f){ return fs.readFileSync(path.join(__dirname, f), 'utf8'); }
function wr(f, h){ fs.writeFileSync(path.join(__dirname, f), h); }
function rep(f, h, a, b, label){
  const c = h.split(a).length - 1;
  if (c) { console.log(`[${f}] ${label}: ${c}x`); return h.split(a).join(b); }
  console.log(`[${f}] ${label}: 0 (gia ok)`);
  return h;
}

// index.html
let ix = rd('index.html');
// footer (link senza data-h) -> originale home
ix = rep('index.html', ix, '<a href="/biografia">En movimiento</a>', '<a href="#about">Sobre mí</a>', 'footer revert');
// eyebrow sezione about (era un <div>, non un link)
ix = rep('index.html', ix, ' aria-hidden="true"></span>En movimiento</div>', ' aria-hidden="true"></span>Sobre mí</div>', 'eyebrow revert');
// header (con data-h) resta "En movimiento" -> /biografia : NON tocco
wr('index.html', ix);

// pagine secondarie: footer torna all'originale; header resta cambiato
for (const f of SECONDARY) {
  let h = rd(f);
  h = rep(f, h, '<a href="/biografia">En movimiento</a>',
    '<a href="index.html#about" data-nav="home" data-target="about">Sobre mí</a>', 'footer revert');
  wr(f, h);
}
console.log('Fatto. Voce menu header = "En movimiento" -> /biografia (invariata).');
