/**
 * Turns a classifier's raw probability distribution into a farmer-facing diagnosis.
 *
 * Order matters:
 *  1. Out-of-distribution gate on the RAW distribution. If nothing scores above the low
 *     threshold, the photo is not a leaf the model recognises.
 *  2. Crop conditioning. When the farmer tells us the crop, keep only that crop's classes and
 *     renormalise. This sharply improves ranking, but renormalising can inflate a junk
 *     prediction, which is why step 1 has to run first.
 *  3. Triage into confident / uncertain / rejected. Uncertain scans go to the expert queue.
 */

// If less than this share of raw probability lands on the declared crop, the model thinks
// the photo shows a different crop, so the result is flagged rather than forced into that crop.
export const CROP_AGREEMENT = 0.5;

export function diagnose(raw, { labelIndex, declaredCrop = null, high, low, topK = 3 }) {
  if (!raw?.length) throw new Error('diagnose() needs at least one prediction');

  const ranked = [...raw]
    .sort((a, b) => b.confidence - a.confidence)
    .map((p) => {
      const info = labelIndex.get(p.label);
      return {
        label: p.label,
        confidence: p.confidence,
        diseaseKey: info?.diseaseKey ?? null,
        crop: info?.crop ?? null,
        isHealthy: info?.isHealthy ?? false,
      };
    });
  const rawTop = ranked[0];

  const outcome = (top, predictions, status, statusReason, cropProbability = null) => ({
    top: pick(top),
    predictions: predictions.slice(0, topK).map(pick),
    crop: status === 'rejected' ? null : top.crop,
    diseaseKey: status === 'rejected' ? null : top.diseaseKey,
    isHealthy: status === 'rejected' ? false : top.isHealthy,
    status,
    statusReason,
    cropProbability: cropProbability == null ? null : round(cropProbability),
  });

  if (rawTop.confidence < low) {
    return outcome(rawTop, ranked, 'rejected', 'not_recognised');
  }

  if (declaredCrop) {
    const inCrop = ranked.filter((p) => p.crop === declaredCrop);
    if (inCrop.length === 0) {
      return outcome(rawTop, ranked, 'rejected', 'crop_not_supported');
    }

    const cropProbability = inCrop.reduce((sum, p) => sum + p.confidence, 0);
    if (cropProbability < CROP_AGREEMENT) {
      return outcome(rawTop, ranked, 'uncertain', 'crop_mismatch', cropProbability);
    }

    const conditioned = inCrop.map((p) => ({ ...p, confidence: p.confidence / cropProbability }));
    const top = conditioned[0];
    return top.confidence >= high
      ? outcome(top, conditioned, 'confident', 'ok', cropProbability)
      : outcome(top, conditioned, 'uncertain', 'low_confidence', cropProbability);
  }

  // No declared crop: the model has to be sure on its own, and we need advisory content for it.
  if (!rawTop.diseaseKey) {
    return outcome(rawTop, ranked, 'rejected', 'crop_not_supported');
  }
  return rawTop.confidence >= high
    ? outcome(rawTop, ranked, 'confident', 'ok')
    : outcome(rawTop, ranked, 'uncertain', 'low_confidence');
}

const round = (n) => Math.round(n * 10_000) / 10_000;

const pick = (p) => ({ label: p.label, confidence: round(p.confidence), diseaseKey: p.diseaseKey });
