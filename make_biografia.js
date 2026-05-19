// Genera quien-soy.html clonando lo SHELL REALE del sito (pro-dance.html):
// stesso <head> (CSS/font), stesso header e footer di tutte le pagine.
// Sostituisce solo il contenuto centrale con: intro (immagine), currículum,
// timeline animata e galleria identica alla homepage.
const fs = require('fs');
const path = require('path');

const pd = fs.readFileSync(path.join(__dirname, 'pro-dance.html'), 'utf8');
const idx = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

function imgSrc(alt) {
  const i = idx.indexOf('alt="' + alt + '"');
  if (i < 0) return '';
  const s = idx.lastIndexOf('<img', i);
  const e = idx.indexOf('>', i) + 1;
  const m = idx.slice(s, e).match(/src="([^"]*)"/);
  return m ? m[1] : '';
}
const HERO = imgSrc('Bailarina, retrato escénico');
const GAL = [
  ['Performance contemporánea — dúo', 'Performance · 2025'],
  ['Danza al aire libre', 'Estudio · Mediterráneo'],
  ['Solo de danza contemporánea', 'Lab · 2024'],
  ['Clase con jóvenes bailarines', 'Clase · Pro Dance'],
  ['Movimiento bajo el cielo', 'Improvisación'],
].map(([a, c], i) => ({ a, c, src: imgSrc(a), n: i + 1 })).filter((x) => x.src);

// --- shell: prendo head+header da pro-dance, footer+scripts da pro-dance ---
const hdrE = pd.indexOf('</header>', pd.indexOf('<header class="site"')) + '</header>'.length;
const ftS = pd.indexOf('<footer');
if (hdrE < 10 || ftS < 0) throw new Error('Shell pro-dance non trovato');
let prefix = pd.slice(0, hdrE);
const suffix = pd.slice(ftS);
// titolo pagina
prefix = prefix.replace(/<title>[\s\S]*?<\/title>/, '<title>Quién soy — Irene Monticelli</title>');
// Rinomina lo wrapper: NON deve essere "pro-dance" (altrimenti il menu evidenzia
// Pro Dance e si applicano stili pd-*). Pagina propria "quien-soy".
prefix = prefix.split('id="page-prodance"').join('id="page-quiensoy"');
prefix = prefix.split('data-page="pro-dance"').join('data-page="quien-soy"');
prefix = prefix.split('id="header-prodance"').join('id="header-quiensoy"');
prefix = prefix.split('id="navToggle-prodance"').join('id="navToggle-quiensoy"');
prefix = prefix.split('id="navLinks-prodance"').join('id="navLinks-quiensoy"');

// --- testo curriculum ---
const CV = [
 'Irene Monticelli empezó danza con 6 años siguiendo el curso de ballet y danza moderna con R. Sabbatini; con solo 10 años recibe una beca de una semana para la "Pineapple Performing Arts" de Londres, donde estudia ballet, street dance, lyrical jazz y moderno.',
 'Después profundizó los estudios del modern contemporáneo con el curso de formación trienal impartido por M. Astolfi, F. Monteverde, Mia Molinari, D. Ziglioli y V. Pitzalis en el Centro Studi Danza Arte Musica e Spettacolo de Fermo (FM, Italia).',
 'En 2006 entra por audición en el curso para la enseñanza de la moderna-jazz del International Dance Association, graduándose en 2008 con la nota 26/30. En 2007 gana la beca para el Balletto di Toscana (FI), dirigido por C. Bozzolini, perfeccionando la técnica contemporánea con A. Benedetti, E. Buratti, R. Sartori, D. Losi y ballet con S. Gennasi.',
 'En 2009 se inscribe en el M Hip Hop & Urban Movement con Marisa Ragazzo y Omid Inghani, ampliando su lenguaje contemporáneo. En 2010 sigue el curso de la Fundación Nacional de Danza "Aterballetto" con V. Longo, R. Zappalà, E. Davoli, S. Bertozzi y G. Calanni, seleccionada por Zappalà para el proyecto Modem Atelier.',
 'En 2014 gana la beca para el curso de formación con Michele Oliva, que culmina con la puesta en escena en Venecia junto a la compañía de danza OCDP. Actualmente imparte clases de danza moderna contemporánea para niños, adolescentes y adultos, y sigue formándose en ballet y cursos de actualización.',
];
const TL = [
 ['2003', 'Solista en la compañía dirigida por R. Sabbatini "Zeropositivo" para diversas producciones (hasta 2005).'],
 ['2004', 'Coreografía de D. Ziglioli "Due uomini per un paio di tacchi" en el Hangart Dance Festival de Pesaro; pieza de improvisación con la compañía Lische.'],
 ['2006', 'Contrato de temporada con la compañía "Ortomagico" para el musical "Jesus Christ Superstar".'],
 ['2010', 'Solista en "El Cascanueces" con música en vivo en el Teatro dell’Aquila de Fermo.'],
 ['2012', 'Primer premio en "Riccione Summer Dance" con la coreografía "Come sorelle", de M. Cursi.'],
];

const cvP = CV.map((p) => `<p class="body-lg reveal">${p}</p>`).join('\n');
const tlRows = TL.map(([y, t]) => `
  <div class="qs-tl-item reveal">
    <div class="qs-tl-dot"></div>
    <div class="qs-tl-year">${y}</div>
    <div class="qs-tl-text">${t}</div>
  </div>`).join('');
const galTiles = GAL.map((g) => `<div class="ph ph-${g.n} reveal"><img loading="lazy" src="${g.src}" alt="${g.a}"><span class="ph-caption">${g.c}</span></div>`).join('\n');

const sideImgs = GAL.slice(0, 3).map((g) => `<figure class="qs-side-fig reveal"><img loading="lazy" src="${g.src}" alt="${g.a}"><figcaption>${g.c}</figcaption></figure>`).join('\n');
const htlCards = TL.map(([y, t]) => `
        <article class="qs-exp-card reveal">
          <div class="qs-exp-year">${y}</div>
          <p class="qs-exp-text">${t}</p>
        </article>`).join('');

const CONTENT = `
<style>
  .qs-intro{display:grid;grid-template-columns:1.05fr 1fr;gap:0;align-items:stretch}
  .qs-intro-img{position:relative;min-height:70vh;overflow:hidden}
  .qs-intro-img img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .qs-intro-txt{display:flex;flex-direction:column;justify-content:center;padding:8vh 7vw 8vh 7vw}
  .qs-intro-txt .h-section,.qs-intro-txt .body-lg{max-width:none;padding-right:0}
  .qs-intro-txt .body-lg{margin:14px 0 0}
  .qs-split{display:grid;grid-template-columns:1.15fr .85fr;gap:56px;align-items:start}
  .qs-cv{text-align:left}
  .qs-cv p{text-align:left;margin:0 0 18px}
  .qs-side{display:flex;flex-direction:column;gap:18px;position:sticky;top:96px}
  .qs-side-fig{margin:0;border-radius:8px;overflow:hidden;position:relative}
  .qs-side-fig img{display:block;width:100%;height:100%;object-fit:cover;aspect-ratio:4/3;transition:transform .9s ease}
  .qs-side-fig:hover img{transform:scale(1.05)}
  .qs-side-fig figcaption{position:absolute;left:12px;bottom:10px;color:#fff;font-size:12px;letter-spacing:.04em;text-shadow:0 1px 6px rgba(0,0,0,.5)}
  /* Timeline: linea centrale, riquadri alternati sopra/sotto, frecce, auto-scroll, NO scrollbar */
  /* Header SEMPRE statico su questa pagina: niente effetto d'entrata sul menu */
  header.site,#header-quiensoy,header.site .nav,header.site .nav-links,header.site .nav-links a,
  header.site .logo,header.site .cta,header.site .nav-toggle{
    opacity:1 !important;transform:none !important;transition:none !important;animation:none !important}
  /* Voce di menu attiva su questa pagina = gialla */
  header.site .nav-links a[href="/quien-soy"]{color:var(--yellow,#e0aa00) !important;font-weight:600}
  /* Esperienza: griglia di card cicciotte (3 sopra, 2 sotto) */
  .qs-exp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:44px}
  .qs-exp-card{background:#fff;border:1px solid rgba(0,0,0,.06);border-radius:20px;padding:34px 34px;
    box-shadow:0 26px 56px -34px rgba(0,0,0,.28);border-top:4px solid var(--yellow,#e0aa00);
    transition:transform .5s cubic-bezier(.7,0,.2,1),box-shadow .5s}
  .qs-exp-card:hover{transform:translateY(-6px);box-shadow:0 34px 66px -34px rgba(0,0,0,.34)}
  .qs-exp-year{font-family:Fraunces,Georgia,serif;font-size:46px;font-weight:600;color:var(--yellow,#c8970a);line-height:1;margin-bottom:14px}
  .qs-exp-text{font-size:16px;line-height:1.72;color:#3a3d44;margin:0}
  @media(max-width:920px){.qs-exp-grid{grid-template-columns:repeat(2,1fr);gap:18px}}
  @media(max-width:600px){.qs-exp-grid{grid-template-columns:1fr}.qs-exp-card{padding:26px 24px}.qs-exp-year{font-size:38px}}
  @media(max-width:920px){.qs-split{grid-template-columns:1fr;gap:30px}.qs-side{position:static;flex-direction:row;overflow-x:auto}.qs-side-fig{flex:0 0 70%}}
  @media(max-width:860px){.qs-intro{grid-template-columns:1fr}.qs-intro-img{min-height:54vh;order:-1}}
</style>

<section class="sec-white">
  <div class="qs-intro">
    <div class="qs-intro-img">${HERO ? `<img src="${HERO}" alt="Bailarina, retrato escénico">` : ''}</div>
    <div class="qs-intro-txt">
      <div class="sec-num reveal"><span class="sec-dash" aria-hidden="true"></span>Quién soy</div>
      <h2 class="h-section reveal">Una vida <i class="it yel">en movimiento</i>.</h2>
      <p class="body-lg reveal">Bailarina, coreógrafa y profesora. Más de veinte años dedicados al movimiento: del ballet clásico a la danza contemporánea, del escenario a la enseñanza.</p>
      <p class="body-lg reveal">Una formación construida entre Italia, Londres y los grandes centros de la danza europea, y una práctica que sigue interrogando al cuerpo, al ritmo y a la presencia escénica. Hoy acompaño a niños, adolescentes y adultos en su propio recorrido, con la convicción de que bailar es, ante todo, una forma de escucha.</p>
    </div>
  </div>
</section>

<section class="sec-white">
  <div class="container">
    <div class="sec-num reveal"><span class="sec-dash" aria-hidden="true"></span>Currículum</div>
    <h2 class="h-section reveal">Formación y <i class="it yel">recorrido</i>.</h2>
    <div class="qs-split" style="margin-top:34px">
      <div class="qs-cv">
${cvP}
      </div>
      <div class="qs-side">
${sideImgs}
      </div>
    </div>
  </div>
</section>

<section class="sec-white">
  <div class="container">
    <div class="sec-num reveal"><span class="sec-dash" aria-hidden="true"></span>La experiencia</div>
    <h2 class="h-section reveal">Como <i class="it yel">bailarina</i>.</h2>
    <div class="qs-exp-grid">${htlCards}
    </div>
  </div>
</section>

<section class="quote">
  <span class="quote-deco-l" aria-hidden="true"></span>
  <span class="quote-deco-r" aria-hidden="true"></span>
  <div class="quote-inner">
    <div class="quote-eyebrow reveal">Empezamos</div>
    <div class="quote-body reveal">
      <blockquote>¿List@ para <i class="it">moverte</i>? Descubre la Pro Dance Experience y <i class="it">elige tu pack</i>.</blockquote>
    </div>
    <a href="/pro-dance" data-nav="pro-dance" class="quote-cta reveal">Descubre los packs</a>
  </div>
</section>
`;

const HTML = prefix + '\n' + CONTENT + '\n' + suffix;
fs.writeFileSync(path.join(__dirname, 'quien-soy.html'), HTML);
console.log('quien-soy.html generato (shell sito) — bytes', HTML.length, '| hero', HERO ? 'OK' : 'NO', '| gallery', GAL.length);
