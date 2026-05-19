// Modifiche di contenuto al sito statico richieste dal cliente.
// Ogni replace e' verificato: se la stringa attesa non c'e', avvisa (no crash).
const fs = require('fs');
const path = require('path');

function edit(file, pairs) {
  const fp = path.join(__dirname, file);
  if (!fs.existsSync(fp)) { console.log('SKIP (manca):', file); return; }
  let h = fs.readFileSync(fp, 'utf8');
  let changed = 0;
  for (const [from, to, opt] of pairs) {
    const occurrences = h.split(from).length - 1;
    if (occurrences === 0) {
      console.log(`  [${file}] NON trovato: ${JSON.stringify(from.slice(0, 50))}`);
      continue;
    }
    if (opt === 'all') {
      h = h.split(from).join(to);
    } else {
      h = h.replace(from, to); // solo la prima
    }
    changed += 1;
    console.log(`  [${file}] OK (${occurrences}x): ${JSON.stringify(from.slice(0, 40))}`);
  }
  if (changed) fs.writeFileSync(fp, h);
}

// ---- index.html (sezione Pro Dance Experience) ----
edit('index.html', [
  // Titolo: cuatro -> tres
  ['Experience</i> — cuatro días de danza.', 'Experience</i> — tres días de danza.'],
  // Card 01 sottotitolo: Cuatro -> Tres
  ['<h3>Cuatro días de <i class="it">danza</i>', '<h3>Tres días de <i class="it">danza</i>'],
  // Card 01 fechas: 28 -> 29
  ['Fechas <span class="val">28 — 31 Julio</span>', 'Fechas <span class="val">29 — 31 Julio</span>'],
  // Card 02: togli "Horton y Graham"
  ['lenguaje contemporáneo, Horton y Graham, composición.', 'lenguaje contemporáneo, composición.'],
  // Card 02: idiomas
  ['Idiomas <span class="val">IT · ES</span>', 'Idiomas <span class="val">ES · ENG · IT</span>'],
  // Card 03: togli l'ultima frase sullo stretching in spiaggia
  ['personalizado</i>. Cierre del día con stretching en la playa.</p>', 'personalizado</i>.</p>'],
]);

// ---- Bottone pack "Prenota" -> "Reserva" (griglia prezzi in pro-dance) ----
edit('pro-dance.html', [
  ['data-nav="pack-single">Prenota</a>', 'data-nav="pack-single">Reserva</a>'],
  ['data-nav="pack-gold">Prenota</a>', 'data-nav="pack-gold">Reserva</a>'],
  ['data-nav="pack-red">Prenota</a>', 'data-nav="pack-red">Reserva</a>'],
  ['data-nav="pack-junior">Prenota</a>', 'data-nav="pack-junior">Reserva</a>'],
]);
for (const f of ['pack-single.html', 'pack-gold.html', 'pack-red.html', 'pack-junior.html']) {
  edit(f, [
    ['>Reservar ahora<', '>Reserva<', 'all'],
    ['>Reservar<', '>Reserva<', 'all'],
    ['>Prenota</a>', '>Reserva</a>', 'all'],
  ]);
}

console.log('Fatto.');
