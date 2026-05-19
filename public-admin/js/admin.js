(function () {
  'use strict';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  // Sidebar mobile
  var burger = $('#sbBurger'), sidebar = $('#sidebar'), backdrop = $('#sbBackdrop');
  function setSidebar(open) {
    if (!sidebar) return;
    sidebar.classList.toggle('open', open);
    if (backdrop) backdrop.classList.toggle('show', open);
  }
  if (burger && sidebar) {
    burger.addEventListener('click', function (e) {
      e.stopPropagation();
      setSidebar(!sidebar.classList.contains('open'));
    });
    if (backdrop) backdrop.addEventListener('click', function () { setSidebar(false); });
    sidebar.addEventListener('click', function (e) {
      if (e.target.closest('a.sb-link')) setSidebar(false);
    });
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape') setSidebar(false); });
  }

  // Flash auto-dismiss
  $$('.flash-success').forEach(function (el) {
    setTimeout(function () { el.style.transition = '.4s'; el.style.opacity = '0'; setTimeout(function () { el.remove(); }, 400); }, 5000);
  });

  // ---- Permessi: toggle gruppo ----
  $$('.perm-group').forEach(function (fs) {
    var master = $('.perm-group-toggle', fs);
    var items = $$('input[name="permissions"]', fs);
    function sync() { master.checked = items.length && items.every(function (i) { return i.checked; }); }
    if (master) {
      master.addEventListener('change', function () { items.forEach(function (i) { i.checked = master.checked; }); });
      items.forEach(function (i) { i.addEventListener('change', sync); });
      sync();
    }
  });

  // ---- Media: selezione multipla + bulk ----
  var grid = $('#mediaGrid');
  if (grid) {
    var bulkbar = $('#bulkbar'), selCount = $('#selCount'), bulkIds = $('#bulkIds');
    function refresh() {
      var checked = $$('.media-check:checked', grid);
      checked.forEach(function (c) {});
      $$('.media-tile', grid).forEach(function (t) {
        var c = $('.media-check', t);
        t.classList.toggle('selected', c && c.checked);
      });
      if (bulkbar) bulkbar.hidden = checked.length === 0;
      if (selCount) selCount.textContent = checked.length;
      if (bulkIds) bulkIds.innerHTML = checked.map(function (c) {
        return '<input type="hidden" name="ids" value="' + c.value + '">';
      }).join('');
    }
    grid.addEventListener('change', function (e) {
      if (e.target.classList.contains('media-check')) refresh();
    });
    $$('.media-thumb[data-detail]').forEach(function (th) {
      th.addEventListener('click', function () { openDetail(th.getAttribute('data-detail')); });
    });
    var selClear = $('#selClear');
    if (selClear) selClear.addEventListener('click', function () {
      $$('.media-check', grid).forEach(function (c) { c.checked = false; });
      refresh();
    });
  }

  // Detail drawer
  function openDetail(id) {
    var drawer = $('#detailDrawer'), body = $('#detailBody');
    if (!drawer) return;
    drawer.hidden = false;
    body.innerHTML = '<p class="muted">Caricamento...</p>';
    fetch('/admin/media/' + id + '.json').then(function (r) { return r.json(); }).then(function (m) {
      var img = m.isImage ? '<img class="detail-img" src="' + m.path + '" alt="">' : '';
      body.innerHTML = img +
        row('Nome originale', escapeHtml(m.originalName)) +
        row('Tipo', m.mime) +
        row('Dimensioni', m.width + ' × ' + m.height + ' px') +
        row('Peso (normale)', fmt(m.sizeBytes)) +
        row('Peso (small)', fmt(m.smallBytes)) +
        row('URL normale', '<code>' + m.path + '</code>') +
        row('URL small', '<code>' + m.smallPath + '</code>') +
        row('Caricato da', m.uploadedBy ? escapeHtml(m.uploadedBy.name) : '—') +
        row('Data', new Date(m.createdAt).toLocaleString('it-IT')) +
        '<form method="post" action="/admin/media/' + m.id + '" class="form" style="margin-top:16px">' +
        '<input type="hidden" name="_csrf" value="' + (window.MEDIA_CSRF || '') + '">' +
        '<div class="field"><label class="field-lbl">Titolo</label><input type="text" name="title" value="' + escapeAttr(m.title || '') + '"></div>' +
        '<div class="field"><label class="field-lbl">Testo alternativo (alt)</label><input type="text" name="alt" value="' + escapeAttr(m.alt || '') + '"></div>' +
        '<div class="form-actions"><button class="btn btn-primary btn-sm">Salva</button>' +
        '<button type="button" class="btn btn-danger btn-sm" id="dlDelete">Elimina</button></div></form>';
      var del = $('#dlDelete');
      if (del) del.addEventListener('click', function () {
        if (!confirm('Eliminare definitivamente questo media?')) return;
        var f = document.createElement('form');
        f.method = 'post'; f.action = '/admin/media/' + m.id + '/delete';
        f.innerHTML = '<input type="hidden" name="_csrf" value="' + (window.MEDIA_CSRF || '') + '">';
        document.body.appendChild(f); f.submit();
      });
    });
    function row(k, v) { return '<div class="detail-row"><span>' + k + '</span><span>' + v + '</span></div>'; }
  }
  var dc = $('#detailClose');
  if (dc) dc.addEventListener('click', function () { $('#detailDrawer').hidden = true; });
  var dd = $('#detailDrawer');
  if (dd) dd.addEventListener('click', function (e) { if (e.target === dd) dd.hidden = true; });

  // ---- Upload (drag & drop + progress) ----
  var dz = $('#dropzone'), fileInput = $('#fileInput');
  if (dz && fileInput) {
    $$('.dz-msg .link, label[for=fileInput]').forEach(function (el) {
      el.addEventListener('click', function (e) { e.preventDefault(); fileInput.click(); });
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('drag'); });
    });
    dz.addEventListener('drop', function (e) { if (e.dataTransfer.files.length) doUpload(e.dataTransfer.files); });
    fileInput.addEventListener('change', function () { if (fileInput.files.length) doUpload(fileInput.files); });
  }
  function doUpload(files) {
    var fd = new FormData();
    fd.append('_csrf', window.MEDIA_CSRF || '');
    for (var i = 0; i < files.length; i++) fd.append('files', files[i]);
    var prog = $('#dzProgress'), bar = $('#dzBar');
    if (prog) prog.hidden = false;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/admin/media/upload');
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.onprogress = function (e) {
      if (e.lengthComputable && bar) bar.style.width = Math.round((e.loaded / e.total) * 100) + '%';
    };
    xhr.onload = function () { location.reload(); };
    xhr.onerror = function () { alert('Upload fallito'); };
    xhr.send(fd);
  }

  // ---- Media picker (impostazioni: logo / favicon) ----
  var pickerModal = $('#pickerModal');
  if (pickerModal) {
    var activePicker = null;
    $$('.media-picker').forEach(function (mp) {
      $('.btn-pick', mp).addEventListener('click', function () { activePicker = mp; openPicker(); });
      $('.btn-clear', mp).addEventListener('click', function () {
        mp.querySelector('input[type=hidden]').value = '';
        mp.querySelector('.media-picker-preview').innerHTML = '<span class="muted">Nessuna immagine</span>';
      });
    });
    $('#pickerClose').addEventListener('click', function () { pickerModal.hidden = true; });
    pickerModal.addEventListener('click', function (e) { if (e.target === pickerModal) pickerModal.hidden = true; });
    function openPicker() {
      pickerModal.hidden = false;
      var g = $('#pickerGrid');
      g.innerHTML = '<p class="muted">Caricamento...</p>';
      fetch('/admin/media/picker.json').then(function (r) { return r.json(); }).then(function (list) {
        if (!list.length) { g.innerHTML = '<p class="muted">Nessuna immagine. Carica prima qualcosa in Media.</p>'; return; }
        g.innerHTML = '';
        list.forEach(function (m) {
          var t = document.createElement('div');
          t.className = 'media-tile';
          t.innerHTML = '<div class="media-thumb"><img src="' + m.smallPath + '" alt=""></div><div class="media-name">' + escapeHtml(m.originalName) + '</div>';
          t.addEventListener('click', function () {
            if (!activePicker) return;
            activePicker.querySelector('input[type=hidden]').value = m.id;
            activePicker.querySelector('.media-picker-preview').innerHTML = '<img src="' + m.smallPath + '" alt="">';
            pickerModal.hidden = true;
          });
          g.appendChild(t);
        });
      });
    }
  }

  function fmt(b) {
    b = Number(b) || 0;
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(2) + ' MB';
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
})();
