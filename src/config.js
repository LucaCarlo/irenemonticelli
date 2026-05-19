require('dotenv').config();
const path = require('path');

const ROOT = path.join(__dirname, '..');

module.exports = {
  ROOT,
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3017', 10),
  SESSION_SECRET: process.env.SESSION_SECRET || 'dev-insecure-secret-change-me',
  MAX_UPLOAD_MB: parseInt(process.env.MAX_UPLOAD_MB || '15', 10),
  DIRS: {
    uploads: path.join(ROOT, 'uploads'),
    backups: path.join(ROOT, 'backups'),
    data: path.join(ROOT, 'data'),
    publicAdmin: path.join(ROOT, 'public-admin'),
    views: path.join(ROOT, 'views'),
    site: ROOT, // il sito statico (index.html, *.html, Foto sito...) sta nella root
  },
  SEED: {
    email: process.env.SEED_ADMIN_EMAIL || 'luca@mywebagency.com',
    name: process.env.SEED_ADMIN_NAME || 'Super Admin',
    password: process.env.SEED_ADMIN_PASSWORD || '',
  },
};
