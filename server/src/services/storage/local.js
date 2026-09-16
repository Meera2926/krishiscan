import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Stores images on the server's disk and serves them from /uploads.
 * Good for development. On most free hosts the disk is wiped on every deploy or restart,
 * so use the Cloudinary driver in production.
 */
export function createLocalStorage({ directory }) {
  let ready = null;
  const ensureDir = () => (ready ??= fs.mkdir(directory, { recursive: true }));

  return {
    name: 'local',

    async put(buffer, { extension = 'jpg' } = {}) {
      await ensureDir();
      const now = new Date();
      const folder = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      const filename = `${crypto.randomUUID()}.${extension}`;
      const storageKey = `${folder}/${filename}`;
      await fs.mkdir(path.join(directory, folder), { recursive: true });
      await fs.writeFile(path.join(directory, storageKey), buffer);
      return { storageKey, url: `/uploads/${storageKey}` };
    },

    async remove(storageKey) {
      // storageKey is always one we generated, but never let it escape the upload directory.
      const target = path.resolve(directory, storageKey);
      if (!target.startsWith(path.resolve(directory) + path.sep)) return;
      await fs.rm(target, { force: true });
    },
  };
}
