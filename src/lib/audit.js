// Helper centralizzato per scrivere righe AuditLog senza far esplodere
// la richiesta principale se il DB è momentaneamente lento o fallisce.
const prisma = require('./db');

function clientIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.ip ||
    (req.connection && req.connection.remoteAddress) ||
    ''
  );
}

async function log(req, action, opts = {}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: req.user ? req.user.id : null,
        userEmail: req.user ? req.user.email : '',
        action: String(action || '').slice(0, 80),
        entity: String(opts.entity || '').slice(0, 80),
        entityId: String(opts.entityId || '').slice(0, 80),
        details: typeof opts.details === 'object'
          ? JSON.stringify(opts.details).slice(0, 4000)
          : String(opts.details || '').slice(0, 4000),
        ip: clientIp(req).slice(0, 64),
        userAgent: String(req.headers['user-agent'] || '').slice(0, 240),
      },
    });
  } catch (e) {
    // Non bloccare mai la request principale
    console.error('[audit] log failed:', e.message);
  }
}

module.exports = { log, clientIp };
