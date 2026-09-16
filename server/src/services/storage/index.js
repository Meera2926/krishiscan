import { config } from '../../config/env.js';
import { createCloudinaryStorage } from './cloudinary.js';
import { createLocalStorage } from './local.js';

export const storage =
  config.STORAGE_DRIVER === 'cloudinary'
    ? createCloudinaryStorage({
        cloudName: config.CLOUDINARY_CLOUD_NAME,
        apiKey: config.CLOUDINARY_API_KEY,
        apiSecret: config.CLOUDINARY_API_SECRET,
      })
    : createLocalStorage({ directory: config.UPLOAD_DIR });
