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
      <div class="qs-htl-card reveal">
        <div class="qs-htl-year">${y}</div>
        <div class="qs-htl-line" aria-hidden="true"><span></span></div>
        <p class="qs-htl-text">${t}</p>
      </div>`).join('');

const CONTENT = `
<style>
  .qs-intro{display:grid;grid-template-columns:1.05fr 1fr;gap:0;align-items:stretch}
  .qs-intro-img{position:relative;min-height:70vh;overflow:hidden}
  .qs-intro-img img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .qs-intro-txt{display:flex;flex-direction:column;justify-content:center;padding:9vh 7vw}
  .qs-intro-txt .body-lg{margin:14px 0 0}
  .qs-split{display:grid;grid-template-columns:1.15fr .85fr;gap:56px;align-items:start}
  .qs-cv{text-align:left}
  .qs-cv p{text-align:left;margin:0 0 18px}
  .qs-side{display:flex;flex-direction:column;gap:18px;position:sticky;top:96px}
  .qs-side-fig{margin:0;border-radius:8px;overflow:hidden;position:relative}
  .qs-side-fig img{display:block;width:100%;height:100%;object-fit:cover;aspect-ratio:4/3;transition:transform .9s ease}
  .qs-side-fig:hover img{transform:scale(1.05)}
  .qs-side-fig figcaption{position:absolute;left:12px;bottom:10px;color:#fff;font-size:12px;letter-spacing:.04em;text-shadow:0 1px 6px rgba(0,0,0,.5)}
  /* Timeline orizzontale dinamica */
  .qs-htl-wrap{margin-top:42px;overflow-x:auto;padding:8px 0 22px;-webkit-overflow-scrolling:touch}
  .qs-htl{display:flex;gap:0;min-width:max-content;position:relative}
  .qs-htl::before{content:"";position:absolute;left:0;right:0;top:74px;height:2px;background:linear-gradient(90deg,rgba(0,0,0,.08),var(--yellow,#e0aa00),rgba(0,0,0,.08))}
  .qs-htl-card{position:relative;width:300px;padding:0 26px;flex:0 0 auto}
  .qs-htl-year{font-family:Fraunces,Georgia,serif;font-size:34px;font-weight:600;color:var(--yellow,#c8970a);height:54px}
  .qs-htl-line{height:40px;display:flex;align-items:center}
  .qs-htl-line span{width:18px;height:18px;border-radius:50%;background:var(--yellow,#e0aa00);box-shadow:0 0 0 6px rgba(224,170,0,.15);position:relative;z-index:1}
  .qs-htl-text{margin:14px 0 0;font-size:15px;line-height:1.65;color:#3a3d44;border-left:2px solid rgba(224,170,0,.35);padding-left:16px}
  .qs-htl-card:hover .qs-htl-line span{transform:scale(1.18);transition:transform .3s}
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
    <div class="qs-htl-wrap">
      <div class="qs-htl">${htlCards}
      </div>
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
