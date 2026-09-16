import crypto from 'node:crypto';

/**
 * Deterministic stand-in classifier for tests and for UI work without downloading a model.
 * The same image always produces the same result, and confidence varies across images so
 * every triage path (confident / uncertain / rejected) shows up in the UI.
 */
export function createMockClassifier({ labels }) {
  if (!labels.length) throw new Error('Mock classifier needs at least one label; run the seed script first.');

  return {
    modelVersion: 'mock-1',
    labels,
    async classify(buffer) {
      const digest = crypto.createHash('sha256').update(buffer).digest();
      const winner = digest.readUInt32BE(0) % labels.length;
      const runnerUp = (winner + 1 + (digest[4] % Math.max(labels.length - 1, 1))) % labels.length;
      // Top-1 confidence spread over roughly 0.25-0.95.
      const topConfidence = 0.25 + (digest[5] / 255) * 0.7;
      const second = (1 - topConfidence) * 0.6;
      const rest = labels.length > 2 ? (1 - topConfidence - second) / (labels.length - 2) : 0;

      const raw = labels.map((label, i) => ({
        label,
        confidence: i === winner ? topConfidence : i === runnerUp ? second : rest,
      }));
      const total = raw.reduce((sum, p) => sum + p.confidence, 0);
      return raw.map((p) => ({ label: p.label, confidence: p.confidence / total }));
    },
  };
}
