/* Banner "Riprendi tu reserva": se il cookie rv_resume contiene un token valido
 * (booking non ancora pagata), aggiunge un'icona/pillola a destra del menu
 * pubblico che linka a /reserva/resume/<token>.
 *
 * Cookie settato dal server al momento della creazione PaymentIntent
 * (TTL 7g, httpOnly:false così è leggibile qui). Cancellato a pagamento OK
 * (server clearCookie su /reserva/success). Auto-rimosso da questo script
 * se l'API risponde "non più valido". */
(function(){
  function getCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
    return m ? decodeURIComponent(m[1]) : '';
  }
  function delCookie(name) {
    document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  }
  var token = getCookie('rv_resume');
  if (!token) return;

  // Evita doppi banner se il file viene incluso 2 volte
  if (document.getElementById('rv-resume-pill')) return;

  fetch('/api/booking/resume-info?t=' + encodeURIComponent(token), {
    credentials: 'same-origin',
  }).then(function(r){ return r.json(); }).then(function(j){
    if (!j || !j.ok) { delCookie('rv_resume'); return; }
    // Trovata booking ripristinabile → aggiungo pillola nel menu
    var nav = document.querySelector('header.site .nav-links');
    if (!nav) return;
    var a = document.createElement('a');
    a.id = 'rv-resume-pill';
    a.href = j.resumeUrl;
    a.className = 'rv-resume-pill';
    a.setAttribute('data-resume-status', j.paymentStatus || 'unpaid');
    var msg = j.paymentStatus === 'failed' ? '⚠ Reanudar pago' : '🛒 Reanudar reserva';
    a.innerHTML = '<span class="rv-resume-dot"></span><span class="rv-resume-txt">' + msg + '</span>';
    a.title = 'Tienes una reserva en curso: ' + (j.planName || '') + ' (' + (j.amount || '') + ' €). Haz clic para reanudar.';
    nav.appendChild(a);

    // Stile inline (evita di toccare CSS in 4 HTML)
    if (!document.getElementById('rv-resume-style')) {
      var st = document.createElement('style');
      st.id = 'rv-resume-style';
      st.textContent = ''
        + '.rv-resume-pill{display:inline-flex !important;align-items:center;gap:8px;'
        + 'background:#1c1f26;color:#e0aa00 !important;'
        + 'padding:8px 16px !important;border-radius:99px !important;'
        + 'font-size:12.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;'
        + 'margin-left:10px;text-decoration:none;border:1.5px solid #e0aa00;'
        + 'transition:.2s;position:relative;}'
        + '.rv-resume-pill:hover{background:#e0aa00;color:#1c1f26 !important}'
        + '.rv-resume-pill[data-resume-status="failed"]{border-color:#e88080;color:#ff8a72 !important}'
        + '.rv-resume-pill[data-resume-status="failed"]:hover{background:#e88080;color:#fff !important}'
        + '.rv-resume-dot{width:9px;height:9px;border-radius:50%;background:#e0aa00;'
        + 'animation:rvPulse 1.6s ease-in-out infinite;flex-shrink:0;}'
        + '.rv-resume-pill[data-resume-status="failed"] .rv-resume-dot{background:#ff8a72}'
        + '@keyframes rvPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.3)}}'
        + '@media(max-width:720px){.rv-resume-pill{padding:6px 12px !important;font-size:11px;margin-left:6px}'
        + '.rv-resume-txt{display:none}}';
      document.head.appendChild(st);
    }
  }).catch(function(){});
})();
