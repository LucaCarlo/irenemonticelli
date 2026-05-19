// Backup: zip di data/app.db + cartella uploads/. Restore = ripristino DB.
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { DIRS } = require('../config');

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function list() {
  ensureDir(DIRS.backups);
  return fs
    .readdirSync(DIRS.backups)
    .filter((f) => f.endsWith('.zip'))
    .map((f) => {
      const st = fs.statSync(path.join(DIRS.backups, f));
      return { name: f, sizeBytes: st.size, createdAt: st.mtime };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

function create() {
  ensureDir(DIRS.backups);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const name = `backup-${stamp}.zip`;
  const outPath = path.join(DIRS.backups, name);
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve({ name, sizeBytes: archive.pointer() }));
    archive.on('error', reject);
    archive.pipe(output);
    const dbFile = path.join(DIRS.data, 'app.db');
    if (fs.existsSync(dbFile)) archive.file(dbFile, { name: 'data/app.db' });
    if (fs.existsSync(DIRS.uploads)) archive.directory(DIRS.uploads, 'uploads');
    archive.finalize();
  });
}

function remove(name) {
  const safe = path.basename(name);
  const fp = path.join(DIRS.backups, safe);
  if (fs.existsSync(fp) && safe.endsWith('.zip')) fs.unlinkSync(fp);
}

function filePath(name) {
  const safe = path.basename(name);
  const fp = path.join(DIRS.backups, safe);
  if (!fs.existsSync(fp) || !safe.endsWith('.zip')) return null;
  return fp;
}

module.exports = { list, create, remove, filePath };
