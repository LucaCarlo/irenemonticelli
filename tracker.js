// Mini tracker analytics pubblico — Irene Monticelli
// Genera/persiste un sessionId (sessionStorage) + visitorId (localStorage),
// invia un pageview a /track al caricamento e la durata in unload.
(function () {
  try {
    if (window.__IM_TRACKED__) return; window.__IM_TRACKED__ = true;

    // Skip per dev/preview/Lighthouse
    if (/headless|lighthouse|webpagetest/i.test(navigator.userAgent)) return;

    function rand() {
      try { return crypto.randomUUID().replace(/-/g, '').slice(0, 16); }
      catch (e) { return Math.random().toString(36).slice(2, 18); }
    }

    var sessionId = sessionStorage.getItem('im_sid');
    if (!sessionId) { sessionId = rand(); sessionStorage.setItem('im_sid', sessionId); }
    var visitorId = localStorage.getItem('im_vid');
    if (!visitorId) { visitorId = rand(); try { localStorage.setItem('im_vid', visitorId); } catch(e){} }

    var path = location.pathname || '/';
    var startedAt = Date.now();

    // Invio pageview iniziale (con keepalive per non bloccare nav)
    var pv = {
      sessionId: sessionId,
      visitorId: visitorId,
      path: path,
      title: (document.title || '').slice(0, 200),
      referrer: document.referrer || '',
    };
    try {
      fetch('/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pv),
        credentials: 'same-origin',
        keepalive: true,
      }).catch(function(){});
    } catch (e) { /* ignore */ }

    // Invio della durata alla chiusura/cambio pagina (via Beacon o keepalive)
    function sendDuration() {
      var ms = Date.now() - startedAt;
      var payload = JSON.stringify({ sessionId: sessionId, path: path, durationMs: ms });
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/track/duration', new Blob([payload], { type: 'application/json' }));
        } else {
          fetch('/track/duration', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true });
        }
      } catch (e) { /* ignore */ }
    }
    // visibilitychange è più affidabile di unload su mobile
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') sendDuration();
    });
    window.addEventListener('pagehide', sendDuration);
    window.addEventListener('beforeunload', sendDuration);
  } catch (e) {
    // Mai bloccare la pagina
  }
})();
