import sharp from 'sharp';
import { badRequest } from '../utils/httpError.js';

const MAX_STORED_EDGE = 1600;
const MIN_EDGE = 128;

// Measured on a fixed 512px greyscale copy so the thresholds do not depend on camera resolution.
export const QUALITY_THRESHOLDS = Object.freeze({
  tooDark: 45,
  tooBright: 230,
  blurry: 4.5,
  lowGreenFraction: 0.08,
});

/**
 * Decodes an upload, rejecting anything that is not really an image, and produces:
 *  - `stored`: an EXIF-rotated, metadata-stripped JPEG for persistence. Stripping matters:
 *    phone photos embed exact GPS coordinates, and location sharing here is opt-in.
 *  - `quality`: brightness / sharpness / plant-coverage heuristics with farmer-facing warnings.
 */
export async function prepareImage(buffer) {
  let meta;
  try {
    meta = await sharp(buffer, { failOn: 'error' }).metadata();
  } catch {
    throw badRequest('That file could not be read as an image.');
  }
  if (!meta.width || !meta.height) throw badRequest('That file could not be read as an image.');

  // Apply EXIF orientation first so width/height reflect what the farmer actually sees.
  const oriented = sharp(buffer, { failOn: 'error' }).rotate();

  const storedBuffer = await oriented
    .clone()
    .resize({ width: MAX_STORED_EDGE, height: MAX_STORED_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  const { width, height } = storedBuffer.info;
  if (Math.min(width, height) < MIN_EDGE) {
    throw badRequest(`Photo is too small. Please use an image at least ${MIN_EDGE}px on each side.`);
  }

  const quality = await assessQuality(storedBuffer.data);

  return {
    stored: {
      buffer: storedBuffer.data,
      width,
      height,
      bytes: storedBuffer.data.length,
      format: 'jpeg',
    },
    quality,
  };
}

export async function assessQuality(buffer) {
  const grey = sharp(buffer).resize(512, 512, { fit: 'inside' }).greyscale();
  const stats = await grey.stats();
  const brightness = stats.channels[0].mean;
  const sharpness = stats.sharpness;

  // Fraction of pixels where green clearly dominates: a cheap "is there foliage here" signal.
  const { data, info } = await sharp(buffer)
    .resize(64, 64, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let green = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (g > r * 1.05 && g > b * 1.05 && g > 40) green += 1;
  }
  const greenFraction = green / (info.width * info.height);

  const warnings = [];
  if (brightness < QUALITY_THRESHOLDS.tooDark) warnings.push('too_dark');
  if (brightness > QUALITY_THRESHOLDS.tooBright) warnings.push('overexposed');
  if (sharpness < QUALITY_THRESHOLDS.blurry) warnings.push('blurry');
  // Soft signal only: a leaf badly damaged by blight can be mostly brown.
  if (greenFraction < QUALITY_THRESHOLDS.lowGreenFraction) warnings.push('little_foliage');

  return {
    ok: warnings.length === 0,
    brightness: round(brightness),
    sharpness: round(sharpness),
    greenFraction: round(greenFraction, 3),
    warnings,
  };
}

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
