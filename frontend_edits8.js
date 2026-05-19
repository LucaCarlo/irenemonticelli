// Home: testo "Sobre mí", sezione "lenguaje" (modern + freelance), Instagram.
const fs = require('fs');
const path = require('path');
function rep(file, from, to, label) {
  const fp = path.join(__dirname, file);
  let h = fs.readFileSync(fp, 'utf8');
  const c = h.split(from).length - 1;
  if (c) { h = h.split(from).join(to); fs.writeFileSync(fp, h); console.log(`[${file}] ${label}: ${c}x`); }
  else console.log(`[${file}] ${label}: NON trovato`);
}

// 1) Sobre mí — P1
rep('index.html',
  '<p class="body-lg reveal">Soy Irene Monticelli, italiana de formación y afincada en España. He construido mi lenguaje atravesando la danza contemporánea, la moderna y la investigación escénica, formándome en escuelas italianas e internacionales y pisando escenarios y estudios entre Milán, Bolonia, Madrid y Barcelona.</p>',
  '<p class="body-lg reveal">Soy Irene Monticelli, he construido mi lenguaje atravesando la danza modern, contemporánea y la investigación escénica, formándome en escuelas italianas e internacionales. La enseñanza y la pedagogía han sido siempre mi vocación.</p>',
  'about P1');

// 2) Sobre mí — P2 (mantengo "Creo en un método..." come da richiesta)
rep('index.html',
  '<p class="body-lg reveal">Imparto clases en la <b>Associazione Arte e Passione</b>, donde acompaño tanto a quienes dan sus primeros pasos como a alumnos avanzados. Creo en un método basado en la conciencia corporal, la escucha del ritmo interior y la libertad expresiva: porque el cuerpo, antes de hablarle al público, ha de hablarle a quien lo habita.</p>',
  '<p class="body-lg reveal">En las clases acompaño tanto a quienes dan sus primeros pasos como a alumnos avanzados. Creo en un método basado en la conciencia corporal, la escucha del ritmo interior y la libertad expresiva: porque el cuerpo, antes de hablarle al público, ha de hablarle a quien lo habita.</p>',
  'about P2');

// 3) Sezione "lenguaje": modern + freelance, via Associazione Arte e Passione
rep('index.html',
  '<p class="body-lg reveal">Bailarina, coreógrafa y profesora. Imparto clases de danza contemporánea y moderna en la <b>Associazione Arte e Passione</b>, donde el movimiento se convierte en lenguaje personal y en práctica cotidiana.</p>',
  '<p class="body-lg reveal">Bailarina, coreógrafa y profesora freelance. Imparto clases de danza contemporánea y modern, donde el movimiento se convierte en lenguaje personal y en práctica cotidiana.</p>',
  'lenguaje');

// 4) Instagram link (index + pro-dance; quien-soy si rigenera da pro-dance)
for (const f of ['index.html', 'pro-dance.html']) {
  rep(f, '<a href="#">Instagram</a>',
    '<a href="https://www.instagram.com/pro_dance_experience" target="_blank" rel="noopener">Instagram</a>',
    'instagram');
}
console.log('Fatto.');
