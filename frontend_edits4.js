// Fix menu hamburger su pagine non-home: il bind JS originale cerca solo
// #navToggle (home). Sulle pagine secondarie l'id ha un suffisso, quindi
// il toggle non funziona. Inietto un handler delegato universale.
const fs = require('fs');
const path = require('path');

const MARK = 'rv-navfix';
const SNIPPET =
  '\n<script id="' + MARK + '">document.addEventListener("click",function(e){' +
  'var t=e.target.closest(".nav-toggle");if(!t)return;' +
  'var n=t.closest("nav")||t.parentNode;var l=n&&n.querySelector(".nav-links");' +
  'if(!l)return;e.preventDefault();t.classList.toggle("open");l.classList.toggle("open");});' +
  'document.addEventListener("click",function(e){' +
  'if(e.target.closest(".nav-links a")){var o=document.querySelector(".nav-links.open");' +
  'if(o){o.classList.remove("open");var b=document.querySelector(".nav-toggle.open");if(b)b.classList.remove("open");}}});' +
  '</script>\n';

const FILES = ['index.html', 'pro-dance.html', 'contatti.html',
  'pack-single.html', 'pack-gold.html', 'pack-red.html', 'pack-junior.html'];

for (const f of FILES) {
  const fp = path.join(__dirname, f);
  if (!fs.existsSync(fp)) { console.log('skip', f); continue; }
  let h = fs.readFileSync(fp, 'utf8');
  if (h.includes('id="' + MARK + '"')) { console.log('[' + f + '] gia presente'); continue; }
  const i = h.lastIndexOf('</body>');
  if (i < 0) { console.log('[' + f + '] no </body>'); continue; }
  h = h.slice(0, i) + SNIPPET + h.slice(i);
  fs.writeFileSync(fp, h);
  console.log('[' + f + '] navfix iniettato');
}
console.log('Fatto.');
