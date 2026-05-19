// Terzo giro: rimuove Galería dal menu, corregge telefono nel footer e
// nella pagina contatti (toglie Estudio, Ciudad -> Santa Pola - Alicante),
// e toglie il flash del titolo home quando si arriva con un hash.
const fs = require('fs');
const path = require('path');

const ALL = ['index.html', 'pro-dance.html', 'contatti.html', 'pack-single.html', 'pack-gold.html', 'pack-red.html', 'pack-junior.html'];
const SECONDARY = ALL.filter((f) => f !== 'index.html');

function read(f) { return fs.readFileSync(path.join(__dirname, f), 'utf8'); }
function write(f, h) { fs.writeFileSync(path.join(__dirname, f), h); }
function rep(f, h, from, to, opt) {
  const n = h.split(from).length - 1;
  if (n === 0) { console.log(`  [${f}] NON trovato: ${JSON.stringify(from.slice(0, 55))}`); return h; }
  console.log(`  [${f}] OK (${n}x): ${JSON.stringify(from.slice(0, 45))}`);
  return opt === 'all' ? h.split(from).join(to) : h.replace(from, to);
}

// A) Rimuovi "Galería" dal menu header (l'utente non la vuole li)
for (const f of ALL) {
  let h = read(f);
  if (f === 'index.html') {
    h = rep(f, h, '<a href="#galleria" data-h>Galería</a> <a href="/contatti" data-h data-nav="contatti">Contacto</a>',
      '<a href="/contatti" data-h data-nav="contatti">Contacto</a>');
  } else {
    h = rep(f, h, '<a href="index.html#galleria" data-h data-nav="home" data-target="galleria">Galería</a> <a href="/contatti" data-h data-nav="contatti">Contacto</a>',
      '<a href="/contatti" data-h data-nav="contatti">Contacto</a>');
  }
  // B) Telefono nel footer (placeholder -> reale)
  h = rep(f, h, 'tel:+34600000000">+34 600 000 000</a>', 'tel:+34672047938">+34 672047938</a>', 'all');
  write(f, h);
}

// C) Pagina contatti: telefono, rimuovi Estudio, Ciudad corretto
let c = read('contatti.html');
c = rep('contatti.html', c,
  '<a href="tel:+34600000000"><span class="ci-label">Teléfono</span>+34 600 000 000</a>',
  '<a href="tel:+34672047938"><span class="ci-label">Teléfono</span>+34 672047938</a>');
c = rep('contatti.html', c,
  '<span><span class="ci-label">Estudio</span>Associazione Arte e Passione</span> ', '');
c = rep('contatti.html', c,
  '<span class="ci-label">Ciudad</span>Milán</span>',
  '<span class="ci-label">Ciudad</span>Santa Pola - Alicante</span>');
write('contatti.html', c);

// D) index.html: niente flash del titolo home quando si arriva con hash
let h = read('index.html');
const FROM =
  "if (window.__SKIP_INTRO || !pre || !preSig || !headerLogo || !placeholder || !header) {\r\n" +
  "      document.documentElement.classList.remove('loading');\r\n" +
  "      if (pre) pre.style.display = 'none';\r\n" +
  "      if (header) header.classList.add('entered');\r\n" +
  "      document.body.classList.add('scroll-cue-ready');\r\n" +
  "      document.body.classList.add('hero-title-show');\r\n" +
  "      return;\r\n" +
  "    }";
const TO =
  "if (window.__SKIP_INTRO || !pre || !preSig || !headerLogo || !placeholder || !header) {\r\n" +
  "      document.documentElement.classList.remove('loading');\r\n" +
  "      if (pre) pre.style.display = 'none';\r\n" +
  "      if (header) header.classList.add('entered');\r\n" +
  "      if (window.__SKIP_INTRO) {\r\n" +
  "        var __tgt = location.hash && location.hash.length > 1 && document.querySelector(location.hash);\r\n" +
  "        if (__tgt) { try { __tgt.scrollIntoView({behavior:'auto',block:'start'}); } catch(e){} }\r\n" +
  "      } else {\r\n" +
  "        document.body.classList.add('scroll-cue-ready');\r\n" +
  "        document.body.classList.add('hero-title-show');\r\n" +
  "      }\r\n" +
  "      return;\r\n" +
  "    }";
h = rep('index.html', h, FROM, TO);
write('index.html', h);

console.log('Fatto.');
