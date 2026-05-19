const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const methodOverride = require('method-override');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { PrismaSessionStore } = require('@quixo3/prisma-session-store');

const config = require('./config');
const prisma = require('./lib/db');
const settings = require('./lib/settings');
const { loadUser, requireAuth, enforcePasswordChange } = require('./middleware/auth');
const { runSeed } = require('./seed');

const app = express();
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', config.DIRS.views);

// Header di sicurezza. CSP disattivata: il sito pubblico ha molti inline/base64.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
  })
);

// Webhook Stripe PRIMA dei body-parser (serve il body grezzo per la firma)
app.use(require('./routes/stripe-webhook'));

app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(methodOverride('_method'));

app.use(
  session({
    name: 'im_admin_sid',
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 8, // 8h
    },
    store: new PrismaSessionStore(prisma, {
      checkPeriod: 1000 * 60 * 10,
      dbRecordIdIsSessionId: true,
      dbRecordIdFunction: undefined,
    }),
  })
);

// Flash messages (session-based)
app.use((req, res, next) => {
  res.locals.flash = req.session.flash || [];
  req.session.flash = [];
  req.flash = (type, msg) => {
    req.session.flash = req.session.flash || [];
    req.session.flash.push({ type, msg });
  };
  next();
});

// CSRF token semplice legato alla sessione
app.use((req, res, next) => {
  if (req.session && !req.session.csrf) {
    req.session.csrf = crypto.randomBytes(24).toString('hex');
  }
  res.locals.csrfToken = req.session ? req.session.csrf : '';
  next();
});

function csrfProtect(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // I form multipart (upload) sono parsati da multer DOPO questo middleware:
  // il CSRF viene verificato nella route, post-multer (vedi routes/media.js).
  if ((req.headers['content-type'] || '').includes('multipart/form-data')) return next();
  const token = (req.body && req.body._csrf) || req.headers['x-csrf-token'];
  if (token && req.session && token === req.session.csrf) return next();
  res.status(403);
  return res.render('error', { title: 'CSRF', code: 403, message: 'Token di sicurezza non valido. Riprova.' });
}

// Verifica CSRF dopo il parsing multipart (multer)
function verifyCsrfAfterMulter(req, res, next) {
  const token = (req.body && req.body._csrf) || req.headers['x-csrf-token'];
  if (token && req.session && token === req.session.csrf) return next();
  res.status(403);
  if ((req.headers.accept || '').includes('application/json')) return res.json({ ok: false, error: 'CSRF non valido' });
  return res.render('error', { title: 'CSRF', code: 403, message: 'Token di sicurezza non valido. Riprova.' });
}
app.locals.verifyCsrfAfterMulter = verifyCsrfAfterMulter;

app.use(loadUser);

const { hasPermission } = require('./lib/permissions');

// Variabili comuni alle view admin
app.use(async (req, res, next) => {
  try {
    res.locals.settings = await settings.all();
    res.locals.SCHEMA = settings.SCHEMA;
    res.locals.path = req.path;
    res.locals.appName = res.locals.settings.site_name || 'Irene Monticelli';
  } catch (e) {
    res.locals.settings = {};
  }
  res.locals.can = (key) => hasPermission(req.user, key);
  res.locals.fmtBytes = (b) => {
    b = Number(b) || 0;
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(2) + ' MB';
  };
  // Logo per la sidebar (se impostato)
  res.locals.logoUrl = '';
  try {
    const lid = parseInt(res.locals.settings.logo_media_id, 10);
    if (lid) {
      const lm = await prisma.media.findUnique({ where: { id: lid } });
      if (lm) res.locals.logoUrl = lm.path;
    }
  } catch (e) {
    /* ignore */
  }
  next();
});

// Versione asset (cambia ad ogni riavvio/deploy) per il cache-busting
const ASSET_V = String(Date.now());
app.use((req, res, next) => { res.locals.assetV = ASSET_V; next(); });

// Asset admin: niente cache lunga (con ?v= il browser prende sempre l'ultima)
app.use(
  '/public-admin',
  express.static(config.DIRS.publicAdmin, {
    maxAge: 0,
    etag: true,
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
  })
);
app.use('/uploads', express.static(config.DIRS.uploads, { maxAge: '30d' }));

// Favicon condivisa (admin + sito pubblico). Browser la richiede da solo.
app.get(['/favicon.ico', '/favicon'], async (req, res) => {
  try {
    const s = await settings.all();
    if (s.favicon_media_id) {
      const m = await prisma.media.findUnique({ where: { id: parseInt(s.favicon_media_id, 10) } });
      if (m) {
        const fp = path.join(config.DIRS.uploads, path.basename(m.path));
        if (fs.existsSync(fp)) {
          res.type(m.mime || 'image/webp');
          return res.sendFile(fp);
        }
      }
    }
  } catch (e) {
    /* fallthrough */
  }
  res.status(204).end();
});

// ---- Rotte admin ----
app.use('/admin', require('./routes/auth'));
app.use('/admin', requireAuth, enforcePasswordChange, csrfProtect, require('./routes/dashboard'));
app.use('/admin/settings', requireAuth, enforcePasswordChange, csrfProtect, require('./routes/settings'));
app.use('/admin/users', requireAuth, enforcePasswordChange, csrfProtect, require('./routes/users'));
app.use('/admin/roles', requireAuth, enforcePasswordChange, csrfProtect, require('./routes/roles'));
app.use('/admin/media', requireAuth, enforcePasswordChange, csrfProtect, require('./routes/media'));
app.use('/admin/plans', requireAuth, enforcePasswordChange, csrfProtect, require('./routes/plans'));
app.use('/admin/events', requireAuth, enforcePasswordChange, csrfProtect, require('./routes/events'));
app.use('/admin/professors', requireAuth, enforcePasswordChange, csrfProtect, require('./routes/professors'));
app.use('/admin/bookings', requireAuth, enforcePasswordChange, csrfProtect, require('./routes/bookings'));

// ---- Prenotazione pubblica dinamica (DB + Stripe) ----
// Le vecchie pagine statiche pack-*.html ora rimandano al checkout dinamico.
app.get(/^\/(pack-(?:single|gold|red|junior))(?:\.html)?$/, (req, res) => {
  res.redirect(302, '/reserva/' + req.params[0]);
});
app.use(require('./routes/reserva'));

// ---- Sito pubblico statico (pretty URLs, replica nginx) ----
const SITE = config.DIRS.site;

app.get('/', (req, res, next) => {
  const f = path.join(SITE, 'index.html');
  if (fs.existsSync(f)) return res.sendFile(f);
  next();
});

// /<page>.html -> 301 /<page>
app.get(/^\/([A-Za-z0-9_-]+)\.html$/, (req, res) => {
  res.redirect(301, '/' + req.params[0]);
});
app.get(['/index', '/index.html'], (req, res) => res.redirect(301, '/'));

// Asset del sito (immagini originali, css fix, ecc.)
app.use(
  express.static(SITE, {
    extensions: ['html'],
    index: false,
    setHeaders: (res, fp) => {
      if (fp.endsWith('.html')) res.setHeader('Cache-Control', 'public, must-revalidate, max-age=300');
    },
  })
);

// Pretty URL: /contatti -> contatti.html
app.get(/^\/([A-Za-z0-9_-]+)$/, (req, res, next) => {
  const f = path.join(SITE, req.params[0] + '.html');
  if (fs.existsSync(f)) return res.sendFile(f);
  next();
});

// 404
app.use((req, res) => {
  if (req.path.startsWith('/admin')) {
    res.status(404);
    return res.render('error', { title: 'Non trovato', code: 404, message: 'Pagina non trovata.' });
  }
  res.status(404).send('Not found');
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    req.flash && req.flash('error', `File troppo grande (max ${config.MAX_UPLOAD_MB}MB).`);
    return res.redirect('back');
  }
  res.status(500);
  if (req.path && req.path.startsWith('/admin')) {
    return res.render('error', { title: 'Errore', code: 500, message: 'Si e verificato un errore interno.' });
  }
  res.send('Internal error');
});

// Rete di sicurezza: un errore async non gestito non deve abbattere il server
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));

async function start() {
  await runSeed();
  app.listen(config.PORT, () => {
    console.log(`\n  Sito + Admin attivi su http://localhost:${config.PORT}`);
    console.log(`  Admin:  http://localhost:${config.PORT}/admin\n`);
  });
}

start();
