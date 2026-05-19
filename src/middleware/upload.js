const multer = require('multer');
const { MAX_UPLOAD_MB } = require('../config');

// Upload in memoria: il buffer passa subito alla pipeline sharp.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
});

module.exports = upload;
