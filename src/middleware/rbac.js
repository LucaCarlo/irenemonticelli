const { hasPermission } = require('../lib/permissions');

// Blocca se l'utente non ha il permesso richiesto.
function requirePermission(key) {
  return function (req, res, next) {
    if (hasPermission(req.user, key)) return next();
    res.status(403);
    return res.render('error', {
      title: 'Accesso negato',
      code: 403,
      message: `Non hai il permesso necessario (${key}).`,
    });
  };
}

module.exports = { requirePermission };
