import multer from 'multer';
import { config } from '../config/env.js';
import { badRequest } from '../utils/httpError.js';

const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

// Memory storage: the buffer goes straight to validation and inference, and is only
// persisted once sharp has confirmed it really is an image. The declared mimetype is
// just a first filter; the real check happens in services/imageQuality.js.
export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter(_req, file, cb) {
    if (ACCEPTED.has(file.mimetype)) return cb(null, true);
    cb(badRequest('Please upload a JPEG, PNG, WebP or HEIC photo.'));
  },
}).single('image');
