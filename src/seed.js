// Seed iniziale: ruolo Super Admin (di sistema) + primo utente se il DB e vuoto.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const prisma = require('./lib/db');
const { SEED, DIRS } = require('./config');
const settings = require('./lib/settings');
const { buildLogoSvg } = require('./lib/sitelogo');

// Estrae il logo del sito e lo imposta come logo admin (idempotente).
async function seedSiteLogo() {
  const current = await prisma.setting.findUnique({ where: { key: 'logo_media_id' } });
  if (current && current.value) {
    // gia impostato: rispetto la scelta solo se il media esiste davvero
    const exists = await prisma.media.findUnique({ where: { id: parseInt(current.value, 10) || 0 } });
    if (exists) return;
  }

  let media = await prisma.media.findFirst({ where: { filename: 'site-logo' } });
  if (!media) {
    const svg = buildLogoSvg();
    if (!svg) return;
    if (!fs.existsSync(DIRS.uploads)) fs.mkdirSync(DIRS.uploads, { recursive: true });
    fs.writeFileSync(path.join(DIRS.uploads, 'site-logo.svg'), svg);
    media = await prisma.media.create({
      data: {
        filename: 'site-logo',
        originalName: 'logo-irene-monticelli.svg',
        title: 'Logo sito',
        alt: 'Irene Monticelli',
        mime: 'image/svg+xml',
        ext: 'svg',
        width: 1000,
        height: 140,
        sizeBytes: Buffer.byteLength(svg),
        smallBytes: Buffer.byteLength(svg),
        path: '/uploads/site-logo.svg',
        smallPath: '/uploads/site-logo.svg',
        isImage: true,
      },
    });
  }
  await settings.setMany({ logo_media_id: String(media.id) }, 'general');
}

async function runSeed() {
  // Ruolo Super Admin sempre presente, con tutti i permessi ("*")
  let superRole = await prisma.role.findUnique({ where: { name: 'Super Admin' } });
  if (!superRole) {
    superRole = await prisma.role.create({
      data: {
        name: 'Super Admin',
        description: 'Accesso completo a tutte le funzioni',
        permissions: JSON.stringify(['*']),
        isSystem: true,
      },
    });
  } else if (superRole.permissions !== JSON.stringify(['*'])) {
    await prisma.role.update({ where: { id: superRole.id }, data: { permissions: JSON.stringify(['*']) } });
  }

  // Ruolo Editor di esempio (non di sistema), permessi base
  const editorExists = await prisma.role.findUnique({ where: { name: 'Editor' } });
  if (!editorExists) {
    await prisma.role.create({
      data: {
        name: 'Editor',
        description: 'Gestione contenuti e media',
        permissions: JSON.stringify(['media.view', 'media.upload', 'media.edit', 'media.delete', 'stats.view']),
        isSystem: false,
      },
    });
  }

  const userCount = await prisma.user.count();
  if (userCount === 0) {
    const tempPassword = SEED.password || crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '') + 'A1!';
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    await prisma.user.create({
      data: {
        email: SEED.email,
        name: SEED.name,
        passwordHash,
        roleId: superRole.id,
        mustChangePassword: true,
        isActive: true,
      },
    });
    console.log('\n  ===== SUPER ADMIN CREATO =====');
    console.log('  Email:    ' + SEED.email);
    console.log('  Password: ' + tempPassword);
    console.log('  (verra richiesto il cambio password al primo accesso)');
    console.log('  ==============================\n');
  }

  try {
    await seedSiteLogo();
  } catch (e) {
    console.error('[seedSiteLogo]', e.message);
  }

  try {
    await seedContent();
  } catch (e) {
    console.error('[seedContent]', e.message);
  }
}

// Dati base: l'evento Pro Dance e i 4 pacchetti collegati ad esso.
async function seedContent() {
  // 1) Evento (creato se manca)
  let event = await prisma.event.findFirst({ where: { title: 'Pro Dance Experience' } });
  if (event && (!event.location || event.location === 'Santa Pola - Alicante')) {
    // aggiorna solo il valore di default iniziale (rispetta modifiche manuali)
    event = await prisma.event.update({
      where: { id: event.id },
      data: { location: 'Pabellon Municipal Lara Gonzalez, Santa Pola - Alicante' },
    });
  }
  if (!event) {
    event = await prisma.event.create({
      data: {
        title: 'Pro Dance Experience',
        subtitle: 'Tres dias de danza',
        startDate: new Date('2026-07-29'),
        endDate: new Date('2026-07-31'),
        location: 'Pabellon Municipal Lara Gonzalez, Santa Pola - Alicante',
        description: 'Tres dias de danza frente al Mediterraneo.',
        active: true,
        sort: 1,
      },
    });
  }

  // 2) Pacchetti collegati all'evento. bookingMode di default secondo le regole:
  //    Gold = none | Red = mattina/pomeriggio | Junior = tutti i gg + orario | Single = giorno+orario
  const plans = [
    { slug: 'pack-single', name: 'Single Class', bookingMode: 'date_time', badge: '', color: '#175a6e', sort: 1,
      description: 'Una clase: se elige dia y horario.' },
    { slug: 'pack-gold', name: 'Pack Gold', bookingMode: 'none', badge: 'Completo', color: '#7a4a0e', sort: 2,
      description: 'Todos los dias del evento, sin elegir dia ni horario.' },
    { slug: 'pack-red', name: 'Pack Red', bookingMode: 'three_days_ampm', badge: '', color: '#8a2a1c', sort: 3,
      description: 'Todos los dias, eligiendo siempre manana o siempre tarde.' },
    { slug: 'pack-junior', name: 'Pack Junior', bookingMode: 'alldays_time', badge: '', color: '#2f5f1a', sort: 4,
      description: 'Todos los dias, eligiendo el horario.' },
  ];
  for (const p of plans) {
    const exists = await prisma.plan.findUnique({ where: { slug: p.slug } });
    if (!exists) {
      await prisma.plan.create({
        data: { ...p, price: 0, currency: 'EUR', ctaLabel: 'Reserva', active: true, eventId: event.id },
      });
    } else {
      // collega all'evento e imposta il colore di default se mancanti
      // (non sovrascrive prezzi/personalizzazioni dell'utente)
      const data = {};
      if (!exists.eventId) data.eventId = event.id;
      if (!exists.color || exists.color === '#e0aa00') data.color = p.color;
      if (Object.keys(data).length) await prisma.plan.update({ where: { id: exists.id }, data });
    }
  }
}

module.exports = { runSeed };

if (require.main === module) {
  runSeed().then(() => process.exit(0));
}
