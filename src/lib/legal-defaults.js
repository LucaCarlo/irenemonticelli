// HTML di default delle pagine Privacy e Cookies. Le variabili {{...}} vengono
// sostituite a runtime con i valori dei settings (azienda, email, indirizzo, ecc.).
// L'admin può sovrascrivere salvando privacy_html / cookies_html in Impostazioni.

const PRIVACY_DEFAULT_HTML = `<p>En cumplimiento del Reglamento (UE) 2016/679 (RGPD) y de la Ley Orgánica 3/2018 de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD), te informamos sobre el tratamiento de tus datos personales en este sitio web.</p>

<h2>1. Responsable del tratamiento</h2>
<p>
  <strong>{{company}}</strong><br>
  {{address}}<br>
  Correo electrónico: <a href="mailto:{{email}}">{{email}}</a>
</p>

<h2>2. Datos personales que recopilamos</h2>
<p>Para los servicios que ofrecemos a través de este sitio, podemos tratar las siguientes categorías de datos:</p>
<ul>
  <li><strong>Datos de identificación:</strong> nombre y apellidos.</li>
  <li><strong>Datos de contacto:</strong> dirección de correo electrónico, teléfono.</li>
  <li><strong>Datos personales:</strong> fecha de nacimiento (para verificar la mayoría de edad).</li>
  <li><strong>Datos del menor</strong> (si procede) y consentimiento del padre/madre/tutor legal.</li>
  <li><strong>Datos de pago:</strong> los datos de la tarjeta no se almacenan en nuestros sistemas; el pago se procesa de forma segura mediante <a href="https://stripe.com/es/privacy" target="_blank" rel="noopener">Stripe Payments Europe Ltd</a>.</li>
  <li><strong>Contenidos audiovisuales:</strong> imágenes y vídeos del evento (si has dado tu consentimiento explícito).</li>
  <li><strong>Datos de navegación:</strong> dirección IP (almacenada en formato anonimizado/hash), navegador, dispositivo, país aproximado, páginas visitadas. Ver <a href="/cookies">Política de Cookies</a>.</li>
</ul>

<h2>3. Finalidades del tratamiento</h2>
<ul>
  <li>Gestionar las reservas de clases, talleres y la Pro Dance Experience.</li>
  <li>Enviar el comprobante de pago y la información práctica del evento.</li>
  <li>Responder a las solicitudes recibidas a través del formulario de contacto.</li>
  <li>Cumplir con las obligaciones fiscales y contables.</li>
  <li>Publicar contenido del evento en Instagram y página web (solo con consentimiento explícito).</li>
  <li>Analizar de forma agregada el uso del sitio para mejorar la experiencia (analítica propia, sin perfilado individual).</li>
</ul>

<h2>4. Base legal del tratamiento</h2>
<ul>
  <li><strong>Ejecución del contrato:</strong> para gestionar la reserva y prestar el servicio.</li>
  <li><strong>Consentimiento explícito:</strong> para el uso de imágenes/vídeos en redes sociales y web.</li>
  <li><strong>Obligación legal:</strong> conservación fiscal de las facturas (Art. 30 LGT, hasta 4 años; conservación general hasta 10 años para libros contables, según Código de Comercio Art. 30).</li>
  <li><strong>Interés legítimo:</strong> seguridad del sitio y prevención del fraude.</li>
</ul>

<h2>5. Destinatarios de los datos</h2>
<p>Tus datos se comunican únicamente a los siguientes destinatarios, en la medida estrictamente necesaria:</p>
<ul>
  <li><strong>Stripe Payments Europe Ltd</strong> (Irlanda / EE. UU.) — procesamiento de pagos. Sus servidores en EE. UU. operan bajo cláusulas contractuales tipo (SCC) aprobadas por la Comisión Europea.</li>
  <li><strong>MailChannels Cloud Corp.</strong> — proveedor de envío de correo transaccional (confirmaciones, formulario contacto).</li>
  <li><strong>Proveedor de alojamiento web</strong> (UE) — encargado del tratamiento bajo contrato.</li>
</ul>
<div class="box">
  <p>No vendemos ni cedemos tus datos a terceros con fines comerciales. No realizamos perfilado automatizado ni decisiones automatizadas que produzcan efectos jurídicos sobre ti.</p>
</div>

<h2>6. Conservación de los datos</h2>
<ul>
  <li>Datos de reserva y facturación: <strong>10 años</strong> desde la última operación, por obligación legal.</li>
  <li>Datos de contacto (formulario): <strong>2 años</strong> desde la última interacción.</li>
  <li>Imágenes/vídeos publicados en redes: hasta retirada del consentimiento.</li>
  <li>Datos analíticos (anonimizados): <strong>14 meses</strong>.</li>
</ul>

<h2>7. Transferencias internacionales</h2>
<p>Algunos proveedores (Stripe) pueden tratar tus datos en EE. UU. La transferencia se basa en cláusulas contractuales tipo aprobadas por la Comisión Europea (SCC), conforme al Art. 46 RGPD. Puedes solicitar copia escribiendo a <a href="mailto:{{email}}">{{email}}</a>.</p>

<h2>8. Tus derechos</h2>
<p>Como titular de los datos, tienes derecho a:</p>
<ul>
  <li><strong>Acceso:</strong> saber qué datos tenemos sobre ti.</li>
  <li><strong>Rectificación:</strong> corregir datos inexactos.</li>
  <li><strong>Supresión:</strong> que eliminemos tus datos cuando ya no sean necesarios.</li>
  <li><strong>Limitación del tratamiento:</strong> restringir temporalmente el uso.</li>
  <li><strong>Portabilidad:</strong> recibir tus datos en formato estructurado.</li>
  <li><strong>Oposición:</strong> oponerte al tratamiento por motivos legítimos.</li>
  <li><strong>Revocación del consentimiento</strong> en cualquier momento, sin efectos retroactivos.</li>
</ul>
<p>Para ejercerlos, escribe a <a href="mailto:{{email}}">{{email}}</a> adjuntando copia de tu documento de identidad.</p>

<h2>9. Autoridad de control</h2>
<p>Si consideras que el tratamiento no cumple con la normativa, puedes presentar una reclamación ante la <strong>{{authority}}</strong> — <a href="https://www.aepd.es" target="_blank" rel="noopener">www.aepd.es</a>.</p>

<h2>10. Seguridad</h2>
<p>Aplicamos medidas técnicas y organizativas apropiadas para proteger tus datos personales contra acceso no autorizado, alteración, divulgación o destrucción. El sitio utiliza conexión cifrada (HTTPS) en todas las páginas.</p>

<h2>11. Cambios en esta política</h2>
<p>Nos reservamos el derecho de actualizar esta Política de Privacidad para reflejar cambios en nuestros servicios o en la normativa aplicable. La versión vigente se publica en esta página con la fecha de última actualización.</p>

<div class="box">
  <p>¿Tienes dudas sobre cómo tratamos tus datos? Escríbenos a <a href="mailto:{{email}}">{{email}}</a> y te responderemos en un plazo máximo de 30 días.</p>
</div>`;

const COOKIES_DEFAULT_HTML = `<p>Este sitio web utiliza cookies y tecnologías similares (almacenamiento local del navegador) con la finalidad de garantizar su correcto funcionamiento, recordar tus preferencias y analizar de forma agregada el uso del sitio.</p>

<h2>1. ¿Qué son las cookies?</h2>
<p>Las cookies son pequeños archivos de texto que el navegador almacena en tu dispositivo cuando visitas una página web. Permiten al sitio recordar información sobre tu visita (por ejemplo, idioma preferido, estado de la sesión) y mejorar la experiencia de uso.</p>
<p>Junto a las cookies tradicionales, este sitio también utiliza el <strong>almacenamiento del navegador</strong> (<em>localStorage</em>, <em>sessionStorage</em>) para fines similares.</p>

<h2>2. ¿Qué cookies utilizamos?</h2>

<h3>2.1 Almacenamiento analítico propio</h3>
<p>Datos anonimizados, no compartidos con terceros, alojados exclusivamente en nuestros servidores en la UE.</p>
<table class="cookies-table">
  <thead><tr><th>Clave</th><th>Tipo</th><th>Finalidad</th><th>Duración</th></tr></thead>
  <tbody>
    <tr><td>im_sid</td><td>sessionStorage</td><td>Identificador anónimo de la visita (sesión actual).</td><td>Hasta cerrar la pestaña</td></tr>
    <tr><td>im_vid</td><td>localStorage</td><td>Identificador anónimo del visitante (sin datos personales) para contar visitantes únicos.</td><td>Persistente</td></tr>
  </tbody>
</table>

<h3>2.2 Cookies de terceros (proveedor de pagos)</h3>
<p>Durante el proceso de pago, el formulario embebido de <strong>Stripe</strong> instala sus propias cookies para garantizar la seguridad de la transacción y prevenir el fraude. No tenemos control directo sobre estas cookies; consulta la política de Stripe en <a href="https://stripe.com/es/privacy" target="_blank" rel="noopener">stripe.com/es/privacy</a>.</p>

<div class="box">
  <p><strong>No utilizamos</strong> cookies publicitarias, de marketing comportamental, ni servicios de seguimiento de terceros (Google Analytics, Meta Pixel, etc.) salvo que tú nos hayas dado consentimiento explícito.</p>
</div>

<h2>3. Cómo gestionar y desactivar las cookies</h2>
<p>Puedes aceptar, rechazar o eliminar las cookies desde la configuración de tu navegador en cualquier momento:</p>
<ul>
  <li><a href="https://support.google.com/chrome/answer/95647?hl=es" target="_blank" rel="noopener">Google Chrome</a></li>
  <li><a href="https://support.mozilla.org/es/kb/Borrar%20cookies" target="_blank" rel="noopener">Mozilla Firefox</a></li>
  <li><a href="https://support.apple.com/es-es/guide/safari/sfri11471/mac" target="_blank" rel="noopener">Safari (macOS / iOS)</a></li>
  <li><a href="https://support.microsoft.com/es-es/windows/eliminar-y-administrar-cookies-168dab11-0753-043d-7c16-ede5947fc64d" target="_blank" rel="noopener">Microsoft Edge</a></li>
</ul>
<p>Para borrar el almacenamiento analítico de este sitio en concreto, puedes abrir las DevTools del navegador (<kbd>F12</kbd>) → pestaña <em>Application</em> / <em>Storage</em> → <em>Local Storage</em> y <em>Session Storage</em> → borrar las claves <code>im_sid</code> y <code>im_vid</code>.</p>

<h2>4. Consecuencias de la desactivación</h2>
<p>Las cookies analíticas propias y las de Stripe pueden bloquearse sin afectar a la navegación general del sitio. Sin embargo, el formulario de pago podría no funcionar correctamente si bloqueas las cookies de Stripe (necesarias para procesar el pago de forma segura).</p>

<h2>5. Más información</h2>
<p>Para más detalles sobre el tratamiento de tus datos personales, consulta nuestra <a href="/privacidad">Política de Privacidad</a>.</p>

<div class="box">
  <p>¿Dudas? Escríbenos a <a href="mailto:{{email}}">{{email}}</a>.</p>
</div>`;

function fillVars(html, vars) {
  return String(html || '').replace(/\{\{(\w+)\}\}/g, (m, k) => vars[k] != null ? vars[k] : m);
}

module.exports = { PRIVACY_DEFAULT_HTML, COOKIES_DEFAULT_HTML, fillVars };
