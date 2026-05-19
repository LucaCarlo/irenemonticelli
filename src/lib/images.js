// Pipeline immagini riutilizzabile: ogni immagine caricata diventa WebP con
// due varianti (small <=480px, normal <=1600px), ridimensionata e compressa.
// Usata sia dalla libreria media che dagli upload nelle impostazioni (logo...).
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DIRS } = require('../config');

const NORMAL_MAX = 1600;
const NORMAL_Q = 82;
const SMALL_MAX = 480;
const SMALL_Q = 78;

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function slugify(s) {
  return (
    String(s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // rimuove i segni diacritici combinanti
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'file'
  );
}

const IMAGE_MIME = /^image\/(jpe?g|png|webp|gif|tiff|avif|bmp|heic|heif)$/i;

// Ritorna i metadati per creare la riga Media.
async function processUpload(buffer, originalName, declaredMime) {
  ensureDir(DIRS.uploads);
  const rand = crypto.randomBytes(3).toString('hex');
  const baseName = `${Date.now()}-${rand}-${slugify(path.parse(originalName).name)}`;
  const isImage = IMAGE_MIME.test(declaredMime || '');

  if (!isImage) {
    // File non-immagine: salvato cosi com'e (no conversione)
    const ext = (path.extname(originalName).replace('.', '') || 'bin').toLowerCase();
    const fname = `${baseName}.${ext}`;
    fs.writeFileSync(path.join(DIRS.uploads, fname), buffer);
    return {
      filename: baseName,
      originalName,
      mime: declaredMime || 'application/octet-stream',
      ext,
      width: 0,
      height: 0,
      sizeBytes: buffer.length,
      smallBytes: 0,
      path: `/uploads/${fname}`,
      smallPath: `/uploads/${fname}`,
      isImage: false,
    };
  }

  const src = sharp(buffer, { failOn: 'none' }).rotate(); // auto-orient EXIF
  const meta = await src.metadata();

  const normalName = `${baseName}.webp`;
  const smallName = `${baseName}-small.webp`;
  const normalPath = path.join(DIRS.uploads, normalName);
  const smallPath = path.join(DIRS.uploads, smallName);

  const normalBuf = await sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize({ width: NORMAL_MAX, height: NORMAL_MAX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: NORMAL_Q })
    .toBuffer();
  fs.writeFileSync(normalPath, normalBuf);

  const smallBuf = await sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize({ width: SMALL_MAX, height: SMALL_MAX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: SMALL_Q })
    .toBuffer();
  fs.writeFileSync(smallPath, smallBuf);

  const normalMeta = await sharp(normalBuf).metadata();

  return {
    filename: baseName,
    originalName,
    mime: 'image/webp',
    ext: 'webp',
    width: normalMeta.width || meta.width || 0,
    height: normalMeta.height || meta.height || 0,
    sizeBytes: normalBuf.length,
    smallBytes: smallBuf.length,
    path: `/uploads/${normalName}`,
    smallPath: `/uploads/${smallName}`,
    isImage: true,
  };
}

// Cancella i file fisici di un media (entrambe le varianti)
function deleteFiles(media) {
  for (const p of [media.path, media.smallPath]) {
    if (!p) continue;
    const fp = path.join(DIRS.uploads, path.basename(p));
    try {
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch {
      /* ignore */
    }
  }
}

module.exports = { processUpload, deleteFiles, slugify };
