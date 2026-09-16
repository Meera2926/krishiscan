import crypto from 'node:crypto';

/**
 * Minimal Cloudinary client using the signed Upload API directly, so no SDK is needed.
 * https://cloudinary.com/documentation/image_upload_api_reference
 */
export function createCloudinaryStorage({ cloudName, apiKey, apiSecret, folder = 'krishiscan/scans' }) {
  const base = `https://api.cloudinary.com/v1_1/${cloudName}/image`;

  function sign(params) {
    const payload = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&');
    return crypto.createHash('sha1').update(payload + apiSecret).digest('hex');
  }

  async function call(endpoint, form) {
    const res = await fetch(`${base}/${endpoint}`, { method: 'POST', body: form });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Cloudinary ${endpoint} failed (${res.status}): ${body?.error?.message ?? 'unknown error'}`);
    }
    return body;
  }

  return {
    name: 'cloudinary',

    async put(buffer) {
      const params = { folder, timestamp: Math.floor(Date.now() / 1000) };
      const form = new FormData();
      form.append('file', new Blob([buffer], { type: 'image/jpeg' }));
      for (const [k, v] of Object.entries(params)) form.append(k, String(v));
      form.append('api_key', apiKey);
      form.append('signature', sign(params));
      const result = await call('upload', form);
      return { storageKey: result.public_id, url: result.secure_url };
    },

    async remove(storageKey) {
      const params = { public_id: storageKey, timestamp: Math.floor(Date.now() / 1000) };
      const form = new FormData();
      for (const [k, v] of Object.entries(params)) form.append(k, String(v));
      form.append('api_key', apiKey);
      form.append('signature', sign(params));
      await call('destroy', form);
    },
  };
}
