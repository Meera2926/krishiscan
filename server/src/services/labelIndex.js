import { Disease } from '../models/index.js';

let cached = null;

/** Map of raw classifier label -> { diseaseKey, crop, isHealthy }, built from Disease.modelLabels. */
export async function getLabelIndex() {
  if (cached) return cached;
  const diseases = await Disease.find({ 'modelLabels.0': { $exists: true } })
    .select('key crop isHealthy modelLabels')
    .lean();

  const index = new Map();
  for (const d of diseases) {
    for (const label of d.modelLabels) {
      index.set(label, { diseaseKey: d.key, crop: d.crop, isHealthy: d.isHealthy });
    }
  }
  cached = index;
  return index;
}

/** Call after reseeding diseases so the next scan sees the new mapping. */
export function invalidateLabelIndex() {
  cached = null;
}
