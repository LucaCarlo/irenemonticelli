// "Escríbenos": via da Explora, messo sotto "Contacto" (2ª colonna footer).
const fs = require('fs');
const path = require('path');
for (const f of ['index.html', 'pro-dance.html']) {
  const fp = path.join(__dirname, f);
  let h = fs.readFileSync(fp, 'utf8');
  // 1) togli Escríbenos da Explora
  h = h.split('<li><a href="/profesores">Profesores</a></li>\r\n        <li><a href="/contatti" data-nav="contatti">Escríbenos</a></li>')
       .join('<li><a href="/profesores">Profesores</a></li>');
  // 2) aggiungilo come prima voce sotto "Contacto"
  h = h.split('<h4>Contacto</h4>\r\n      <ul>\r\n        <li><a href="/contatti" data-nav="contatti">Reservar clase</a></li>')
       .join('<h4>Contacto</h4>\r\n      <ul>\r\n        <li><a href="/contatti" data-nav="contatti">Escríbenos</a></li>\r\n        <li><a href="/contatti" data-nav="contatti">Reservar clase</a></li>');
  fs.writeFileSync(fp, h);
  console.log('[' + f + '] footer: Escríbenos spostato sotto Contacto');
}
console.log('Fatto.');
