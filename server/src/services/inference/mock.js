import crypto from 'node:crypto';

/**
 * Deterministic stand-in classifier for tests and for UI work without downloading models.
 * The same image always produces the same result, and confidence varies across images so
 * every triage path (confident / uncertain / rejected) shows up in the UI.
 *
 * `labels` are disease keys like "tomato_late_blight"; the crop is the part before the first "_".
 */
export function createMockClassifier({ labels }) {
  if (!labels.length) throw new Error('Mock classifier needs at least one label; run the seed script first.');

  return {
    modelVersion: 'mock-1',
    labels,
    async classify(buffer, { crop } = {}) {
      const digest = crypto.createHash('sha256').update(buffer).digest();
      // Mostly pick a class from the declared crop, like a real model would for a real leaf.
      const pool = crop ? labels.filter((l) => l.startsWith(`${crop}_`)) : labels;
      const candidates = pool.length ? pool : labels;
      const winner = labels.indexOf(candidates[digest.readUInt32BE(0) % candidates.length]);
      const runnerUp = labels.indexOf(candidates[(digest[4] + 1) % candidates.length]);
      // Top-1 confidence spread over roughly 0.25-0.95.
      const topConfidence = 0.25 + (digest[5] / 255) * 0.7;
      const second = (1 - topConfidence) * 0.6;
      const rest = labels.length > 2 ? (1 - topConfidence - second) / (labels.length - 2) : 0;

      const raw = labels.map((label, i) => ({
        label,
        confidence: i === winner ? topConfidence : i === runnerUp ? second : rest,
      }));
      const total = raw.reduce((sum, p) => sum + p.confidence, 0);
      return {
        predictions: raw.map((p) => ({ label: p.label, confidence: p.confidence / total })),
        // Roughly one image in sixteen looks like "not a leaf".
        invalidProbability: digest[6] < 16 ? 0.95 : 0.01,
        modelVersion: 'mock-1',
      };
    },
  };
}
