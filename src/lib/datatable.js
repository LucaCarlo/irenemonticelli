// Datatable: gestione paginazione/ordinamento/ricerca server-side condivisa per le tabelle admin.

const ALLOWED_PER_PAGE = [10, 25, 50, 100];

function parseParams(req, opts = {}) {
  const defaultPerPage = opts.defaultPerPage || 25;
  const allowedSorts = opts.allowedSorts || [];
  const defaultSort = opts.defaultSort || 'createdAt';

  const q = String(req.query.q || '').trim();
  let sort = String(req.query.sort || defaultSort);
  if (allowedSorts.length && !allowedSorts.includes(sort)) sort = defaultSort;
  const dir = (req.query.dir === 'asc') ? 'asc' : 'desc';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  let perPage = parseInt(req.query.perPage, 10);
  if (!ALLOWED_PER_PAGE.includes(perPage)) perPage = defaultPerPage;

  return {
    q, sort, dir, page, perPage,
    skip: (page - 1) * perPage,
    take: perPage,
    perPageOptions: ALLOWED_PER_PAGE,
  };
}

// Genera link paginazione con ellissi smart
function pageLinks(currentPage, totalPages) {
  if (totalPages <= 1) return [];
  const out = [];
  out.push({ label: '‹', page: Math.max(1, currentPage - 1), disabled: currentPage === 1 });

  const pages = new Set([1, totalPages]);
  for (let i = Math.max(2, currentPage - 2); i <= Math.min(totalPages - 1, currentPage + 2); i++) pages.add(i);
  const sorted = Array.from(pages).sort((a, b) => a - b);
  let prev = 0;
  sorted.forEach((p) => {
    if (p - prev > 1) out.push({ ellipsis: true });
    out.push({ label: String(p), page: p, current: p === currentPage });
    prev = p;
  });

  out.push({ label: '›', page: Math.min(totalPages, currentPage + 1), disabled: currentPage === totalPages });
  return out;
}

// Costruisce URL con override di alcuni parametri
function buildUrl(basePath, params, overrides = {}) {
  const merged = { q: params.q, sort: params.sort, dir: params.dir, perPage: params.perPage, page: params.page, ...overrides };
  // Applica extra filters esistenti se presenti in params._extra
  if (params._extra) {
    Object.keys(params._extra).forEach((k) => { if (!(k in merged)) merged[k] = params._extra[k]; });
  }
  const parts = [];
  Object.keys(merged).forEach((k) => {
    const v = merged[k];
    if (v !== '' && v != null && !(k === 'q' && v === '') && !(k === 'page' && v === 1)) {
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    }
  });
  return basePath + (parts.length ? '?' + parts.join('&') : '');
}

module.exports = { parseParams, pageLinks, buildUrl, ALLOWED_PER_PAGE };
