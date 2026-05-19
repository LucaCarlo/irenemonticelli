// Footer Explora: "Contacto" -> "Profesores" (nuova pagina) + aggiunge "Escríbenos" -> /contatti
const fs = require('fs');
const path = require('path');
const M = [
  ['index.html',
   '<li><a href="/contatti" data-nav="contatti">Contacto</a></li>',
   '<li><a href="/profesores">Profesores</a></li>\r\n        <li><a href="/contatti" data-nav="contatti">Escríbenos</a></li>'],
  ['pro-dance.html',
   '<li><a href="/contatti" data-nav="contatti">Contacto</a></li>',
   '<li><a href="/profesores">Profesores</a></li>\r\n        <li><a href="/contatti" data-nav="contatti">Escríbenos</a></li>'],
];
for (const [f, a, b] of M) {
  const fp = path.join(__dirname, f);
  let h = fs.readFileSync(fp, 'utf8');
  const c = h.split(a).length - 1;
  if (c) { h = h.split(a).join(b); fs.writeFileSync(fp, h); console.log(`[${f}] footer aggiornato (${c}x)`); }
  else console.log(`[${f}] footer: NON trovato`);
}
console.log('Fatto.');
