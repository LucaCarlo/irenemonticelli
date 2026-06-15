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
  // Evita doppi banner se il file viene incluso 2 volte
  if (document.getElementById('rv-resume-pill')) return;

  // Stile (inline per non toccare CSS dei 4 HTML)
  function injectStyle(){
    if (document.getElementById('rv-resume-style')) return;
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
      + '.rv-resume-pill[data-resume-status="draft"]{border-color:#9ad1ae;color:#9ad1ae !important}'
      + '.rv-resume-pill[data-resume-status="draft"]:hover{background:#9ad1ae;color:#1c1f26 !important}'
      + '.rv-resume-dot{width:9px;height:9px;border-radius:50%;background:#e0aa00;'
      + 'animation:rvPulse 1.6s ease-in-out infinite;flex-shrink:0;}'
      + '.rv-resume-pill[data-resume-status="failed"] .rv-resume-dot{background:#ff8a72}'
      + '.rv-resume-pill[data-resume-status="draft"] .rv-resume-dot{background:#9ad1ae}'
      + '@keyframes rvPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.3)}}'
      + '@media(max-width:720px){.rv-resume-pill{padding:6px 12px !important;font-size:11px;margin-left:6px}'
      + '.rv-resume-txt{display:none}}';
    document.head.appendChild(st);
  }

  // Mostra pillola con dati custom (server resume o local draft)
  function showPill(href, status, label, tooltip){
    if (document.getElementById('rv-resume-pill')) return;
    var nav = document.querySelector('header.site .nav-links');
    if (!nav) return;
    injectStyle();
    var a = document.createElement('a');
    a.id = 'rv-resume-pill';
    a.href = href;
    a.className = 'rv-resume-pill';
    a.setAttribute('data-resume-status', status);
    a.innerHTML = '<span class="rv-resume-dot"></span><span class="rv-resume-txt">' + label + '</span>';
    if (tooltip) a.title = tooltip;
    nav.appendChild(a);
  }

  // Helper: cerca bozze localStorage (autosave precoce, prima del confirmar)
  function findLocalDraft(){
    try {
      var TTL = 24 * 60 * 60 * 1000;
      var newest = null;
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf('rv_draft_') !== 0) continue;
        var raw = localStorage.getItem(k);
        if (!raw) continue;
        var d; try { d = JSON.parse(raw); } catch (_) { continue; }
        if (!d || !d.savedAt) continue;
        if (Date.now() - d.savedAt > TTL) {
          localStorage.removeItem(k);
          continue;
        }
        if (!newest || d.savedAt > newest.savedAt) {
          newest = { slug: k.replace('rv_draft_', ''), data: d };
        }
      }
      return newest;
    } catch (_) { return null; }
  }

  // 1) Priorità al cookie server (booking creata)
  var token = getCookie('rv_resume');
  if (token) {
    fetch('/api/booking/resume-info?t=' + encodeURIComponent(token), {
      credentials: 'same-origin',
    }).then(function(r){ return r.json(); }).then(function(j){
      if (!j || !j.ok) {
        delCookie('rv_resume');
        // Fallback: prova con la bozza locale
        var draft = findLocalDraft();
        if (draft) showPill('/reserva/' + draft.slug, 'draft', '✎ Continuar reserva', 'Continuar la reserva pendiente: ' + (draft.data.planName || ''));
        return;
      }
      var msg = j.paymentStatus === 'failed' ? '⚠ Reanudar pago' : '🛒 Reanudar reserva';
      var tt = 'Tienes una reserva en curso: ' + (j.planName || '') + ' (' + (j.amount || '') + ' €). Haz clic para reanudar.';
      showPill(j.resumeUrl, j.paymentStatus || 'unpaid', msg, tt);
    }).catch(function(){
      // Errore di rete? Almeno la bozza locale
      var draft = findLocalDraft();
      if (draft) showPill('/reserva/' + draft.slug, 'draft', '✎ Continuar reserva', 'Continuar la reserva pendiente: ' + (draft.data.planName || ''));
    });
    return;
  }

  // 2) Niente cookie? Cerca bozza locale (autosave pre-confirmar)
  var draft = findLocalDraft();
  if (draft) {
    showPill('/reserva/' + draft.slug, 'draft', '✎ Continuar reserva', 'Continuar la reserva pendiente: ' + (draft.data.planName || ''));
    return;
  }

  // Nessuna ripresa disponibile: termina silenziosamente
})();
