const prisma = require('../lib/db');

// Carica l'utente loggato (con ruolo) su req.user e res.locals.currentUser.
async function loadUser(req, res, next) {
  res.locals.currentUser = null;
  if (req.session && req.session.userId) {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      include: { role: true },
    });
    if (user && user.isActive) {
      req.user = user;
      res.locals.currentUser = user;
    } else {
      req.session.destroy(() => {});
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    if (req.method === 'GET') req.session.returnTo = req.originalUrl;
    return res.redirect('/admin/login');
  }
  next();
}

// Funzione mantenuta per retro-compatibilità (è ancora montata in server.js).
// Disabilitata su richiesta: niente più forzatura di cambio password al primo login.
// Se in futuro la vuoi riattivare basta togliere il return next() iniziale.
function enforcePasswordChange(req, res, next) { return next(); }

module.exports = { loadUser, requireAuth, enforcePasswordChange };
