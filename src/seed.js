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
  const DEFAULT_SLOTS = JSON.stringify(['9:30', '11:15', '12:30', '15:30', '16:45', '18:00']);
  if (!event) {
    event = await prisma.event.create({
      data: {
        title: 'Pro Dance Experience',
        subtitle: 'Tres dias de danza',
        startDate: new Date('2026-07-29'),
        endDate: new Date('2026-07-31'),
        location: 'Pabellon Municipal Lara Gonzalez, Santa Pola - Alicante',
        description: 'Tres dias de danza frente al Mediterraneo.',
        slotsJson: DEFAULT_SLOTS,
        active: true,
        sort: 1,
      },
    });
  } else if (!event.slotsJson) {
    event = await prisma.event.update({ where: { id: event.id }, data: { slotsJson: DEFAULT_SLOTS } });
  }

  // 2) Pacchetti dell'evento con prezzi reali (dal file _77). Modificabili da dashboard.
  const T = (base, p1, p2) => JSON.stringify({
    type: 'tiers', base,
    tiers: [{ until: '2026-06-15', price: p1 }, { until: '2026-07-10', price: p2 }],
  });
  const plans = [
    { slug: 'pack-single', name: 'Single class', bookingMode: 'single_lessons', badge: '', color: '#175a6e', sort: 1,
      price: 35,
      pricingJson: JSON.stringify({ type: 'lessons', options: [
        { count: 1, price: 35 }, { count: 3, price: 82.5 }, { count: 6, price: 120 }] }),
      description: 'La opción más libre. Eliges una sola clase entre todas las propuestas del programa, o combinas varias en el mismo día con tarifa reducida. Ideal si vienes a probar, a descubrir un profesor o un lenguaje específico.' },
    { slug: 'pack-gold', name: 'Pack GOLD', bookingMode: 'gold', badge: 'Más completo', color: '#7a4a0e', sort: 2,
      price: 360, pricingJson: T(360, 288, 324),
      description: 'La inmersión total. Acceso libre a todas las clases de los tres días: ballet, contemporáneo, fusión, LAB coreográfico, modern y stretching. Para quien quiere vivir la experiencia entera.' },
    { slug: 'pack-red', name: 'Pack RED', bookingMode: 'red', badge: '', color: '#8a2a1c', sort: 3,
      price: 247, pricingJson: T(247, 198, 222),
      description: 'Una ruta concentrada de tres clases al día durante los tres días del curso. Equilibrio entre intensidad y respiración. Para cada día eliges mañana o tarde.' },
    { slug: 'pack-junior', name: 'Pack JUNIOR', bookingMode: 'junior', badge: '', color: '#2f5f1a', sort: 4,
      price: 150, pricingJson: T(150, 120, 135),
      description: 'El pack dedicado a los jóvenes bailarines de entre 9 y 12 años. Todos los días por la mañana, de 9:30 a 12:30. Técnica, juego, escucha y composición.' },
  ];
  const OLD_MODES = ['date_time', 'none', 'three_days_ampm', 'alldays_time'];
  for (const p of plans) {
    const exists = await prisma.plan.findUnique({ where: { slug: p.slug } });
    if (!exists) {
      await prisma.plan.create({
        data: { ...p, currency: 'EUR', ctaLabel: 'Reserva', active: true, eventId: event.id },
      });
    } else {
      // Aggiorna solo i valori di default iniziali (rispetta personalizzazioni utente)
      const data = {};
      if (!exists.eventId) data.eventId = event.id;
      if (!exists.color || exists.color === '#e0aa00') data.color = p.color;
      if (OLD_MODES.includes(exists.bookingMode)) data.bookingMode = p.bookingMode;
      if (!exists.pricingJson) { data.pricingJson = p.pricingJson; data.price = p.price; }
      if (!exists.description || exists.description.startsWith('Todos los') || exists.description.startsWith('Una clase')) data.description = p.description;
      if (Object.keys(data).length) await prisma.plan.update({ where: { id: exists.id }, data });
    }
  }
}

module.exports = { runSeed };

if (require.main === module) {
  runSeed().then(() => process.exit(0));
}
