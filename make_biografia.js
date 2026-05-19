// Genera biografia.html nello stile del sito (riusa reserva77.css = CSS reale
// del sito) e le immagini reali (data URI) gia presenti in index.html.
const fs = require('fs');
const path = require('path');

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
const G = [
  ['Solo de danza contemporánea', imgSrc('Solo de danza contemporánea')],
  ['Performance contemporánea — dúo', imgSrc('Performance contemporánea — dúo')],
  ['Danza al aire libre', imgSrc('Danza al aire libre')],
].filter((x) => x[1]);

// Curriculum (testo fornito dal cliente)
const CV = `Irene Monticelli empezó danza con 6 años siguiendo el curso de ballet y danza moderna con R. Sabbatini; con solo 10 años recibe una beca de una semana para la "Pineapple Performing Arts" de Londres, donde estudia ballet, street dance, lyrical jazz y moderno.

Después de esta experiencia, profundizó los estudios del modern contemporáneo con el curso de formación trienal impartido por M. Astolfi, F. Monteverde, Mia Molinari, D. Ziglioli y V. Pitzalis en el Centro Studi Danza Arte Musica e Spettacolo de Fermo (FM, Italia).

En 2006 entra por audición en el curso para la enseñanza de la moderna-jazz organizado por el International Dance Association, graduándose en 2008 con la nota 26/30. En 2007 gana la beca para el Balletto di Toscana (FI), dirigido por C. Bozzolini, donde perfecciona la técnica contemporánea con A. Benedetti, E. Buratti, R. Sartori, D. Losi y ballet con S. Gennasi.

En 2009 se inscribe en el M Hip Hop & Urban Movement bajo la dirección de Marisa Ragazzo y Omid Inghani, para ampliar su lenguaje contemporáneo, obteniendo el certificado de primer nivel en junio. En 2010 sigue el curso de formación organizado por la Fundación Nacional de Danza "Aterballetto", estudiando con V. Longo, R. Zappalà, E. Davoli, S. Bertozzi y G. Calanni, y fue seleccionada por Zappalà para una presentación al público del proyecto Modem Atelier.

En 2014 gana la beca para el curso de formación con Michele Oliva, que termina con la puesta en escena en Venecia del espectáculo junto a la compañía de danza OCDP.

Actualmente imparte clases de danza moderna contemporánea para niños, adolescentes y adultos, y sigue estudiando ballet y cursos de actualización para profesores y bailarines.`;

const EXP = [
  ['2003', 'Se incorpora como solista a la compañía de danza dirigida por R. Sabbatini "Zeropositivo" para diversas producciones, hasta 2005.'],
  ['2004', 'Con la coreografía de D. Ziglioli "Due uomini per un paio di tacchi" baila en el "Hangart Dance Festival" de Pesaro; en el mismo festival participa en la coreografía con la compañía Lische, fruto de una obra de improvisación.'],
  ['2006', 'Firma un contrato por una temporada con la compañía "Ortomagico" para el musical "Jesus Christ Superstar".'],
  ['2010', 'Es convocada como solista para el espectáculo "El Cascanueces" con música en vivo en el Teatro dell’Aquila de Fermo.'],
  ['2012', 'Gana el primer premio en "Riccione Summer Dance" con la coreografía "Come sorelle", firmada por M. Cursi.'],
];

const cvHtml = CV.split(/\n\n+/).map((p) => `<p>${p.trim()}</p>`).join('\n');
const expHtml = EXP.map(
  ([y, t]) => `<div class="bio-exp"><span class="bio-year">${y}</span><p>${t}</p></div>`
).join('\n');
const galHtml = G.map(([alt, src]) => `<figure class="bio-fig"><img loading="lazy" src="${src}" alt="${alt}"></figure>`).join('\n');

const HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Biografía — Irene Monticelli</title>
<meta name="description" content="Biografía y trayectoria de Irene Monticelli, bailarina, coreógrafa y profesora.">
<link rel="icon" href="/favicon.ico">
<link rel="stylesheet" href="/reserva77.css">
<style>
  body{margin:0;background:#f3f1ec;color:#1c1f26;font-family:'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif}
  a{color:inherit}
  .bio-nav{position:sticky;top:0;z-index:30;display:flex;align-items:center;justify-content:space-between;padding:20px 6vw;background:rgba(243,241,236,.9);backdrop-filter:blur(8px);border-bottom:1px solid rgba(0,0,0,.06)}
  .bio-nav .brand{font-weight:800;letter-spacing:.04em;text-decoration:none;font-size:15px}
  .bio-nav .links a{margin-left:26px;text-decoration:none;font-size:14px;color:#3a3d44}
  .bio-nav .links a:hover{color:#000}
  .bio-hero{display:grid;grid-template-columns:1.05fr 1fr;gap:0;min-height:78vh}
  .bio-hero-img{position:relative;overflow:hidden}
  .bio-hero-img img{width:100%;height:100%;object-fit:cover;display:block}
  .bio-hero-txt{display:flex;flex-direction:column;justify-content:center;padding:8vh 7vw}
  .bio-kicker{text-transform:uppercase;letter-spacing:.32em;font-size:12px;color:#9a8f7a;margin-bottom:22px}
  .bio-hero-txt h1{font-family:'Fraunces',Georgia,serif;font-weight:600;font-size:clamp(40px,6vw,76px);line-height:1.04;margin:0 0 18px}
  .bio-hero-txt h1 em{font-style:italic;color:#b88a1a}
  .bio-hero-txt .sub{font-size:17px;color:#52555c;max-width:36ch;line-height:1.6}
  .bio-wrap{max-width:920px;margin:0 auto;padding:90px 7vw 40px}
  .bio-sec-title{font-family:'Fraunces',Georgia,serif;font-size:clamp(26px,3.4vw,40px);font-weight:600;margin:0 0 26px}
  .bio-sec-title em{font-style:italic;color:#b88a1a}
  .bio-cv p{font-size:17px;line-height:1.85;color:#3a3d44;margin:0 0 20px}
  .bio-cv p:first-child::first-letter{font-family:'Fraunces',Georgia,serif;font-size:3.4em;line-height:.8;float:left;margin:6px 14px 0 0;color:#b88a1a}
  .bio-divider{height:1px;background:linear-gradient(90deg,transparent,rgba(0,0,0,.14),transparent);margin:64px 0}
  .bio-exp{display:grid;grid-template-columns:96px 1fr;gap:22px;padding:18px 0;border-bottom:1px solid rgba(0,0,0,.07)}
  .bio-exp:last-child{border-bottom:0}
  .bio-year{font-family:'Fraunces',Georgia,serif;font-size:24px;color:#b88a1a;font-weight:600}
  .bio-exp p{margin:0;font-size:16px;line-height:1.7;color:#3a3d44}
  .bio-gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;max-width:1180px;margin:10px auto 0;padding:0 6vw 90px}
  .bio-fig{margin:0;overflow:hidden;border-radius:6px;aspect-ratio:3/4}
  .bio-fig img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .9s ease}
  .bio-fig:hover img{transform:scale(1.05)}
  .bio-cta{text-align:center;padding:30px 6vw 90px}
  .bio-cta a{display:inline-block;background:#1c1f26;color:#fff;text-decoration:none;font-weight:700;padding:15px 30px;border-radius:40px;letter-spacing:.02em}
  .bio-foot{padding:40px 6vw;border-top:1px solid rgba(0,0,0,.08);text-align:center;color:#7a8190;font-size:13px}
  .bio-foot a{text-decoration:none;margin:0 10px}
  @media(max-width:860px){
    .bio-hero{grid-template-columns:1fr}.bio-hero-img{min-height:56vh;order:-1}
    .bio-gallery{grid-template-columns:1fr 1fr}
    .bio-nav .links a:first-child{margin-left:0}
    .bio-exp{grid-template-columns:64px 1fr;gap:14px}
  }
</style>
</head>
<body>
<nav class="bio-nav">
  <a href="/" class="brand">IRENE MONTICELLI</a>
  <div class="links">
    <a href="/biografia">Biografía</a>
    <a href="/pro-dance">Pro Dance</a>
    <a href="/contatti">Contacto</a>
  </div>
</nav>

<header class="bio-hero">
  <div class="bio-hero-img">
    ${HERO ? `<img src="${HERO}" alt="Bailarina, retrato escénico">` : ''}
  </div>
  <div class="bio-hero-txt">
    <div class="bio-kicker">Bailarina · Coreógrafa · Profesora</div>
    <h1>Irene <em>Monticelli</em></h1>
    <p class="sub">Una vida en movimiento: del ballet a la danza contemporánea, entre el escenario y la enseñanza.</p>
  </div>
</header>

<main class="bio-wrap">
  <h2 class="bio-sec-title">Currículum</h2>
  <div class="bio-cv">
${cvHtml}
  </div>

  <div class="bio-divider"></div>

  <h2 class="bio-sec-title">Experiencia <em>como bailarina</em></h2>
  ${expHtml}
</main>

<section class="bio-gallery">
${galHtml}
</section>

<div class="bio-cta">
  <a href="/pro-dance">Descubre la Pro Dance Experience</a>
</div>

<footer class="bio-foot">
  <div><a href="/biografia">Biografía</a> · <a href="/pro-dance">Pro Dance</a> · <a href="/contatti">Contacto</a></div>
  <div style="margin-top:10px">© <span id="y"></span> Irene Monticelli</div>
  <script>document.getElementById('y').textContent=new Date().getFullYear();</script>
</footer>
</body>
</html>`;

fs.writeFileSync(path.join(__dirname, 'biografia.html'), HTML);
console.log('biografia.html generato — bytes', HTML.length, '| hero', HERO ? 'OK' : 'MANCANTE', '| gallery', G.length);
