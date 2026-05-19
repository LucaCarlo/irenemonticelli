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
const htlCards = TL.map(([y, t], i) => `
        <article class="qs-tl2-item ${i % 2 === 0 ? 'qs-up' : 'qs-down'}">
          <div class="qs-tl2-card">
            <div class="qs-tl2-year">${y}</div>
            <p class="qs-tl2-text">${t}</p>
          </div>
          <span class="qs-tl2-conn" aria-hidden="true"></span>
          <span class="qs-tl2-dot" aria-hidden="true"></span>
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
  /* Timeline ALTERNATA sopra/sotto, riquadri spaziosi, niente clipping */
  .qs-tl2{position:relative;margin:56px 0 0;left:50%;width:100vw;transform:translateX(-50%)}
  .qs-tl2-viewport{overflow:hidden;position:relative;cursor:none}
  .qs-tl2-viewport::before{content:"";position:absolute;left:0;right:0;top:50%;height:2px;transform:translateY(-50%);background:linear-gradient(90deg,rgba(0,0,0,.05),var(--yellow,#e0aa00) 12%,var(--yellow,#e0aa00) 88%,rgba(0,0,0,.05));z-index:0}
  .qs-tl2-track{display:flex;padding:0 5vw;transition:transform .8s cubic-bezier(.7,0,.2,1);will-change:transform}
  .qs-tl2-item{flex:0 0 460px;width:460px;height:560px;position:relative}
  .qs-tl2-card{position:absolute;left:32px;right:32px;background:#fff;border:1px solid rgba(0,0,0,.06);border-radius:18px;padding:28px 30px;box-shadow:0 26px 56px -30px rgba(0,0,0,.3)}
  .qs-up .qs-tl2-card{bottom:calc(50% + 50px)}
  .qs-down .qs-tl2-card{top:calc(50% + 50px)}
  .qs-tl2-conn{position:absolute;left:50%;width:2px;background:rgba(224,170,0,.5);transform:translateX(-50%);z-index:1}
  .qs-up .qs-tl2-conn{bottom:50%;height:50px}
  .qs-down .qs-tl2-conn{top:50%;height:50px}
  .qs-tl2-dot{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:18px;height:18px;border-radius:50%;background:var(--yellow,#e0aa00);box-shadow:0 0 0 6px rgba(224,170,0,.16);z-index:2}
  .qs-tl2-year{font-family:Fraunces,Georgia,serif;font-size:40px;font-weight:600;color:var(--yellow,#c8970a);margin-bottom:10px;line-height:1}
  .qs-tl2-text{font-size:16.5px;line-height:1.7;color:#3a3d44;margin:0}
  .qs-cursor{position:fixed;left:0;top:0;width:62px;height:62px;border-radius:50%;background:var(--yellow,#e0aa00);color:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;pointer-events:none;z-index:99999;opacity:0;transform:translate(-50%,-50%) scale(.4);transition:opacity .15s,transform .15s;box-shadow:0 10px 28px -10px rgba(224,170,0,.6)}
  .qs-cursor.on{opacity:1;transform:translate(-50%,-50%) scale(1)}
  .qs-tl2-hint{text-align:center;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#9a8f7a;margin:24px 0 0}
  @media(max-width:760px){.qs-tl2-track{padding:0 14px}.qs-tl2-item{flex-basis:86vw;width:86vw;height:520px}.qs-tl2-card{left:14px;right:14px;padding:22px 22px}.qs-tl2-year{font-size:32px}.qs-cursor{display:none}.qs-tl2-viewport{cursor:default}}
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
    <div class="qs-tl2">
      <div class="qs-tl2-viewport" id="qsVp">
        <div class="qs-tl2-track" id="qsTrack">${htlCards}
        </div>
      </div>
    </div>
    <p class="qs-tl2-hint">Mueve el cursor a la izquierda o derecha y haz clic para recorrer</p>
  </div>
</section>
<script>
(function(){
  var track=document.getElementById('qsTrack'),vp=document.getElementById('qsVp');
  if(!track||!vp) return;
  var items=track.children, n=items.length, idx=0, timer=null, dir=1;
  // Cursore-freccia: creato nel BODY (fuori da elementi con transform) cosi
  // position:fixed segue ESATTAMENTE il mouse, senza scostamenti.
  var cur=document.createElement('div'); cur.className='qs-cursor'; cur.setAttribute('aria-hidden','true');
  document.body.appendChild(cur);
  function iw(){ return items.length ? items[0].getBoundingClientRect().width : 460; }
  function vis(){ return Math.max(1, Math.floor(vp.getBoundingClientRect().width/iw())); }
  function maxI(){ return Math.max(0, n - vis()); }
  function go(i){ var m=maxI(); idx = i>m ? 0 : (i<0 ? m : i); track.style.transform='translateX('+(-idx*iw())+'px)'; }
  function next(){ go(idx+1); }
  function start(){ stop(); timer=setInterval(next, 5000); }
  function stop(){ if(timer){ clearInterval(timer); timer=null; } }
  vp.addEventListener('mousemove', function(e){
    cur.style.left=e.clientX+'px'; cur.style.top=e.clientY+'px';
    var r=vp.getBoundingClientRect();
    dir = (e.clientX < r.left + r.width/2) ? -1 : 1;
    cur.innerHTML = dir<0 ? '&#8249;' : '&#8250;';
  });
  vp.addEventListener('mouseenter', function(){ cur.classList.add('on'); stop(); });
  vp.addEventListener('mouseleave', function(){ cur.classList.remove('on'); start(); });
  vp.addEventListener('click', function(){ go(idx + dir); });
  window.addEventListener('resize', function(){ go(Math.min(idx, maxI())); });
  go(0); start();
})();
</script>

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
