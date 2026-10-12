import multer from 'multer';
import { config } from '../config/env.js';
import { badRequest } from '../utils/httpError.js';

// No HEIC: the image library's prebuilt binaries decode AVIF but not HEIC, so a HEIC upload could
// only ever fail later as 'not an image'. Phone browsers convert HEIC to JPEG when uploading.
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Memory storage: the buffer goes straight to validation and inference, and is only
// persisted once sharp has confirmed it really is an image. The declared mimetype is
// just a first filter; the real check happens in services/imageQuality.js.
const imageUpload = (field) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
    fileFilter(_req, file, cb) {
      if (ACCEPTED.has(file.mimetype)) return cb(null, true);
      cb(badRequest('Please upload a JPEG, PNG or WebP photo.'));
    },
  }).single(field);

export const uploadImage = imageUpload('image');

/** An expert's degree certificate: a photo or scan of it, through the same filter. */
export const uploadCertificate = imageUpload('document');
