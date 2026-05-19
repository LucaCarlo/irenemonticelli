// Estrae il logo (SVG inline) dall'header del sito pubblico e lo trasforma
// in un file SVG autonomo, bianco + accento giallo, adatto alla sidebar scura.
const fs = require('fs');
const path = require('path');
const { DIRS } = require('../config');

function buildLogoSvg() {
  const indexFile = path.join(DIRS.site, 'index.html');
  if (!fs.existsSync(indexFile)) return null;
  const html = fs.readFileSync(indexFile, 'utf8');
  const i = html.indexOf('<symbol id="logo-paths"');
  if (i < 0) return null;
  const end = html.indexOf('</symbol>', i);
  if (end < 0) return null;
  const symbol = html.slice(i, end);

  // viewBox del symbol
  const vb = (symbol.match(/viewBox="([^"]+)"/) || [])[1] || '0 0 1000 140';
  // tieni solo i <path ...>
  const paths = (symbol.match(/<path[^>]*\/?>/g) || []).join('');
  if (!paths) return null;

  // path normali bianchi, .cls-1 resta giallo (specificita classe > tag)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="Irene Monticelli">` +
    `<style>path{fill:#ffffff}.cls-1{fill:#ffba30}</style>` +
    paths +
    `</svg>`
  );
}

module.exports = { buildLogoSvg };
