import { Disease } from '../models/index.js';

let cached = null;

/**
 * Map of classifier label -> { diseaseKey, crop, isHealthy }. The classifiers already emit
 * disease keys (see inference/catalog.js), so a label only resolves if the disease has
 * advisory content in the database.
 */
export async function getLabelIndex() {
  if (cached) return cached;
  const diseases = await Disease.find().select('key crop isHealthy').lean();
  cached = new Map(diseases.map((d) => [d.key, { diseaseKey: d.key, crop: d.crop, isHealthy: d.isHealthy }]));
  return cached;
}

/** Call after reseeding diseases so the next scan sees the new mapping. */
export function invalidateLabelIndex() {
  cached = null;
}
