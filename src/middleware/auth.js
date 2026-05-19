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

// Se l'utente deve cambiare password, forzalo li (eccetto logout e la pagina stessa).
function enforcePasswordChange(req, res, next) {
  if (
    req.user &&
    req.user.mustChangePassword &&
    !req.path.startsWith('/admin/change-password') &&
    req.path !== '/admin/logout'
  ) {
    return res.redirect('/admin/change-password');
  }
  next();
}

module.exports = { loadUser, requireAuth, enforcePasswordChange };
