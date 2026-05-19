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

  try {
    await seedProfessors();
  } catch (e) {
    console.error('[seedProfessors]', e.message);
  }
}

// Importa i professori dalle foto in seed-assets/professors (idempotente).
async function seedProfessors() {
  const fsx = require('fs');
  const pathx = require('path');
  const { processUpload } = require('./lib/images');
  const dir = pathx.join(__dirname, '..', 'seed-assets', 'professors');
  const dirOk = fsx.existsSync(dir);
  const DATA = [
    { file: 'irene-monticelli.png', firstName: 'Irene', lastName: 'Monticelli', danceType: 'Contemporáneo · Modern', sort: 1,
      descriptionHtml: '<p>Bailarina, coreógrafa y profesora. Directora artística de la <strong>Pro Dance Experience</strong>.</p>' },
    { firstName: 'Carmela', lastName: 'García', danceType: 'Contemporáneo', sort: 2,
      descriptionHtml:
        '<p>Doctora en Danza y Licenciada en Coreografía e Interpretación. Su trayectoria se desarrolla entre la creación, la escena y la docencia, combinando una sólida carrera como bailarina e intérprete con la labor pedagógica y de investigación. Ha formado parte de producciones reconocidas como <i>La mort i la Donzella</i>, producida por el IVC y con coreografía de Asun Noales. Ha sido distinguida en diversas ocasiones como Mejor Bailarina, además de recibir premios internacionales. Su experiencia abarca compañías como OtraDanza y proyectos de ámbito internacional, así como la dirección artística junto a A. Espinoza en Cave Canem. Forma parte también de la dirección artística y de procesos de creación en la Jove Companyia de Dansa Gerard Collins, dirigida por Mamen García. Actualmente compagina su actividad escénica en Wako Danza, bajo la dirección de Eduardo Zúñiga, y en Titoyaya Dansa, dirigida por Gustavo Ramírez, con la docencia en conservatorios y universidad.</p>' +
        '<p>Su trabajo entiende la danza como un lenguaje que transforma, conecta y potencia el bienestar. Su enfoque parte de dotar de sentido al movimiento desde la interpretación, explorando la relación entre lo técnico y lo expresivo para generar un espacio de libertad, comodidad y organicidad en el cuerpo.</p>' +
        '<p><i>Estará presente todos los tres días del intensivo con su clase de contemporáneo donde la convergencia de técnica, intención y presencia harán que sus clases sean únicas.</i></p>' },
    { firstName: 'Giosy', lastName: 'Sampaolo', danceType: 'Contemporáneo', sort: 3,
      descriptionHtml:
        '<p>Licenciada en Letras Modernas con especialización en Estética del Espectáculo, cuenta con un Máster en Dirección Teatral, además tiene una formación en Light Designer. Bailarina de sólida formación clásica y contemporánea, se ha perfeccionado en importantes centros europeos junto a reconocidos maestros internacionales como Loris Petrillo y Tero Saarinen, Guy Nader, Carolyn Carsol, Anton Lucty y Sharon Fridman.</p>' +
        '<p>Es directora artística de Hunt Compañía de Danza Contemporánea, activa en el panorama nacional italiano, y destaca también como formadora de numerosos bailarines que hoy forman parte de prestigiosas compañías y teatros internacionales. Imparte clases de técnica contemporánea, floor work, contact improvisation y creación coreográfica, combinando experiencia artística, técnica y pedagógica.</p>' +
        '<p><i>En nuestro intensivo impartirá técnica de contact improvisation.</i></p>' },
    { firstName: 'Federica', lastName: 'Fasano', danceType: 'Contemporáneo', sort: 4,
      descriptionHtml:
        '<p>Desarrolla su trayectoria como intérprete en Rusia, Holanda, Malta y España (Tatiana Petrova Youth Ballet Theatre, The Saint-Petersburg Classical Ballet Theatre of Marina Medvetskaya, DDG, La Fura dels Baus, MOPA).</p>' +
        '<p>Es Licenciada cum laude en Lengua y Literatura Rusa, Inglesa y Portuguesa (UNIBA, Italia) y Graduada en Pedagogía de la Danza, especialidad danza contemporánea, con Matrícula de Honor por el Conservatorio Superior de Danza de Alicante.</p>' +
        '<p>Es Miembro Jurado en certámenes internacionales de danza como Young Russia Grand Prix e International Ballet Competition Anna Pavlova. Ganadora del Premio RusPrix Award 2019 del Consulado Ruso en La Haya, y del Accèsit del VI Premio Nacional de Investigación en Artes Escénicas José Monleón 2020 (AAEE, España). Premio Alacant a Escena 2019 con la obra <i>Cuando los pájaros vuelan</i> (Compañía Over&amp;Out). Cuenta con un Máster en Estudios Avanzados de Teatro (UNIR) y un Máster en Investigación Educativa (UA). Su último proyecto performativo, FUGANT, ha sido seleccionado para la residencia de creación artística en l’Assut del Art (Tales), un proyecto de Pepa Cases producido por el Institut Valencià de Cultura.</p>' +
        '<p><i>Estará presente todos los tres días del intensivo dedicándose a desarrollar el taller coreográfico.</i></p>' },
    { file: 'alicia-reig.png', firstName: 'Alicia', lastName: 'Reig', danceType: 'Danza', sort: 5,
      descriptionHtml: '<p>Profesora invitada de la Pro Dance Experience.</p>' },
    { file: 'cintia-solbes.png', firstName: 'Cintia', lastName: 'Solbes', danceType: 'Danza', sort: 6,
      descriptionHtml: '<p>Profesora invitada de la Pro Dance Experience.</p>' },
    { file: 'maria-palazon.png', firstName: 'María', lastName: 'Palazón', danceType: 'Danza', sort: 7,
      descriptionHtml: '<p>Profesora invitada de la Pro Dance Experience.</p>' },
  ];
  for (const d of DATA) {
    const exists = await prisma.professor.findFirst({ where: { firstName: d.firstName, lastName: d.lastName } });
    if (exists) continue;
    let photoMediaId = null;
    const fp = d.file && dirOk ? pathx.join(dir, d.file) : null;
    if (fp && fsx.existsSync(fp)) {
      const info = await processUpload(fsx.readFileSync(fp), d.file, 'image/png');
      const media = await prisma.media.create({
        data: {
          filename: info.filename, originalName: info.originalName, title: `${d.firstName} ${d.lastName}`,
          alt: `${d.firstName} ${d.lastName}`, mime: info.mime, ext: info.ext,
          width: info.width, height: info.height, sizeBytes: info.sizeBytes, smallBytes: info.smallBytes,
          path: info.path, smallPath: info.smallPath, isImage: info.isImage,
        },
      });
      photoMediaId = media.id;
    }
    await prisma.professor.create({
      data: {
        firstName: d.firstName, lastName: d.lastName, danceType: d.danceType,
        descriptionHtml: d.descriptionHtml, photoMediaId, active: true, sort: d.sort,
      },
    });
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

  // Pack Junior (9-12) sospeso per quest'anno: disattivato (non eliminato)
  const junior = await prisma.plan.findUnique({ where: { slug: 'pack-junior' } });
  if (junior && junior.active) {
    await prisma.plan.update({ where: { id: junior.id }, data: { active: false } });
  }
}

module.exports = { runSeed };

if (require.main === module) {
  runSeed().then(() => process.exit(0));
}
