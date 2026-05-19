// Le vecchie pagine statiche pack-*.html (checkout _77) non devono piu esistere:
// le sostituisco con un redirect immediato al checkout dinamico /reserva/<slug>.
const fs = require('fs');
const path = require('path');

const SLUGS = ['pack-single', 'pack-gold', 'pack-red', 'pack-junior'];
for (const slug of SLUGS) {
  const f = path.join(__dirname, slug + '.html');
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0; url=/reserva/${slug}">
<link rel="canonical" href="/reserva/${slug}">
<title>Reserva — Irene Monticelli</title>
<meta name="robots" content="noindex">
<script>location.replace('/reserva/${slug}');</script>
</head>
<body style="font-family:system-ui;background:#f6f6f4;color:#1c1f26;display:flex;min-height:100vh;align-items:center;justify-content:center">
<p>Redirigiendo a la reserva… <a href="/reserva/${slug}">Continuar</a></p>
</body>
</html>`;
  fs.writeFileSync(f, html);
  console.log(slug + '.html -> stub redirect /reserva/' + slug);
}
console.log('Fatto.');
