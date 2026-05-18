// Splits the single-file SPA into separate, real, multi-page HTML files.
// Keeps <head>/CSS/fonts/base64 images byte-identical; only navigation is
// rewritten to real .html permalinks and the SPA router is left inert.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'sito_irene_monticelli (1).html');
const html = fs.readFileSync(SRC, 'utf8');

// --- Markers: opening tag of each page-view div ---
const M = {
  home:    '<div id="page-home" class="page-view" data-page="home">',
  pro:     '<div id="page-prodance" class="page-view" data-page="pro-dance" hidden>',
  contat:  '<div id="page-contatti" class="page-view" data-page="contatti" hidden>',
  single:  '<div id="page-pack-single" class="page-view page-pack" data-pack-color="single" data-page="pack-single" hidden>',
  gold:    '<div id="page-pack-gold" class="page-view page-pack" data-pack-color="gold" data-page="pack-gold" hidden>',
  red:     '<div id="page-pack-red" class="page-view page-pack" data-pack-color="red" data-page="pack-red" hidden>',
  junior:  '<div id="page-pack-junior" class="page-view page-pack" data-pack-color="junior" data-page="pack-junior" hidden>',
};

const idx = {};
for (const k in M) {
  idx[k] = html.indexOf(M[k]);
  if (idx[k] < 0) throw new Error('Marker not found: ' + k);
}

// First <script> after the last page-view div = start of trailing scripts/suffix.
const suffixStart = html.indexOf('<script>', idx.junior);
if (suffixStart < 0) throw new Error('Suffix <script> not found');

const PREFIX = html.slice(0, idx.home);            // <head> + body open + preloader + cursor
let   SUFFIX = html.slice(suffixStart);            // all <script> blocks + </body></html>

// Per-page div slices (each includes its own closing </div>)
const slices = {
  'index':       html.slice(idx.home,   idx.pro),
  'pro-dance':   html.slice(idx.pro,    idx.contat),
  'contatti':    html.slice(idx.contat, idx.single),
  'pack-single': html.slice(idx.single, idx.gold),
  'pack-gold':   html.slice(idx.gold,   idx.red),
  'pack-red':    html.slice(idx.red,    idx.junior),
  'pack-junior': html.slice(idx.junior, suffixStart),
};

// --- Bootstrap script: replicates the router's "show*" side effects for the
// single page present, so secondary pages are visible without the SPA. ---
const BOOTSTRAP = `
<script>
/* Multi-page bootstrap (sostituisce il router SPA) */
(function(){
  var pv = document.querySelector('.page-view');
  if(!pv) return;
  var page = pv.getAttribute('data-page');
  var BODY = { 'home':'on-home','pro-dance':'on-prodance','contatti':'on-contatti',
    'pack-single':'on-pack','pack-gold':'on-pack','pack-red':'on-pack','pack-junior':'on-pack' };
  var ENTER = { 'pro-dance':'pd-entered','contatti':'contatti-entered',
    'pack-single':'pack-entered','pack-gold':'pack-entered','pack-red':'pack-entered','pack-junior':'pack-entered' };
  if (BODY[page]) document.body.classList.add(BODY[page]);
  if (page !== 'home') {
    var pre = document.getElementById('preloader');
    if (pre) pre.style.display = 'none';
    document.documentElement.classList.remove('loading');
    document.body.classList.add('scroll-cue-ready','hero-title-show');
    var hdr = pv.querySelector('header.site');
    if (hdr) { hdr.classList.add('entered'); hdr.classList.remove('over-video'); }
    if (ENTER[page]) {
      void pv.offsetHeight;
      requestAnimationFrame(function(){ pv.classList.add(ENTER[page]); });
    }
  }
  // Garantisce che tutti i contenuti .reveal siano visibili (come il router originale)
  function showReveal(){ pv.querySelectorAll('.reveal, .mask-reveal').forEach(function(el){ el.classList.add('in'); }); }
  showReveal();
  setTimeout(showReveal, 60);
})();
</script>
`;

// Inject bootstrap right before </body>
SUFFIX = SUFFIX.replace('</body>', BOOTSTRAP + '\n</body>');

// --- Global navigation rewrites (SPA hashes -> real permalinks) ---
// Order matters: longer/specific tokens first. #logo-paths (SVG <use>) and
// in-page anchors (#about/#galleria/#corsi/#hero/#descubre) are left untouched.
const NAV = [
  ['href="#home-about"',    'href="index.html#about"'],
  ['href="#home-galleria"', 'href="index.html#galleria"'],
  ['href="#home"',          'href="index.html"'],
  ['href="#top"',           'href="index.html"'],
  ['href="#pro-dance"',     'href="pro-dance.html"'],
  ['href="#contatti"',      'href="contatti.html"'],
  ['href="#pack-single"',   'href="pack-single.html"'],
  ['href="#pack-gold"',     'href="pack-gold.html"'],
  ['href="#pack-red"',      'href="pack-red.html"'],
  ['href="#pack-junior"',   'href="pack-junior.html"'],
];

function applyNav(s){
  for (const [a,b] of NAV) s = s.split(a).join(b);
  return s;
}

// Translate the only Italian string flagged (site language is Spanish)
function translate(s){
  return s.split('Scorri per scoprire').join('Desliza para descubrir');
}

for (const name in slices) {
  let pageDiv = slices[name].replace(' hidden>', '>'); // un-hide chosen page
  let out = PREFIX + pageDiv + SUFFIX;
  out = applyNav(out);
  out = translate(out);
  const file = path.join(__dirname, name + '.html');
  fs.writeFileSync(file, out);
  console.log(name + '.html  ' + (out.length/1048576).toFixed(2) + ' MB');
}
console.log('done');
