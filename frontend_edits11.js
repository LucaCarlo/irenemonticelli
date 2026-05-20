// Footer (no Associazione + moderna->modern) e "alterna"->"se trabajarán" in pro-dance.
const fs = require('fs');
const path = require('path');
function rep(file, from, to, label) {
  const fp = path.join(__dirname, file);
  let h = fs.readFileSync(fp, 'utf8');
  const c = h.split(from).length - 1;
  if (c) { h = h.split(from).join(to); fs.writeFileSync(fp, h); console.log(`[${file}] ${label}: ${c}x`); }
  else console.log(`[${file}] ${label}: NON trovato`);
}
for (const f of ['index.html', 'pro-dance.html']) {
  rep(f,
    'Bailarina, coreógrafa y profesora de danza contemporánea y moderna en la Associazione Arte e Passione.',
    'Bailarina, coreógrafa y profesora de danza contemporánea y modern.',
    'footer text');
}
rep('pro-dance.html',
  'En los 3 días se alterna la base técnica',
  'En los 3 días se trabajarán la base técnica',
  '"alterna"->"trabajarán"');
console.log('Fatto.');
