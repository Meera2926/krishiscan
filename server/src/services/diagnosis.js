/**
 * Turns a classifier's raw probability distribution into a farmer-facing diagnosis.
 *
 * Order matters:
 *  1. "Is this a crop leaf at all?" gates, on RAW probabilities:
 *     a. nothing scores above the low threshold, or
 *     b. the gate model's explicit "invalid" class is strongly (or moderately, while the disease
 *        model is also unsure) convinced this is not a crop leaf.
 *  2. Crop conditioning. The farmer tells us the crop, so keep only that crop's classes and
 *     renormalise. This sharply improves ranking, but renormalising can inflate a junk
 *     prediction, which is why step 1 has to run first.
 *  3. Triage into confident / uncertain / rejected. Uncertain scans go to the expert queue.
 *
 * Thresholds were chosen against a small labelled set of PlantVillage, Indian rice field,
 * Wikimedia field, and non-leaf photos (see server/scripts/evaluate-models.js). Re-check
 * them against more field data before trusting them.
 */

// Below this share of raw probability on the declared crop, the model disagrees with the farmer
// about the crop. The best in-crop answer is still shown, but only as uncertain.
export const CROP_AGREEMENT = 0.5;

// A real late-blight tomato photo scored 0.59 on the invalid class while the tomato model was
// 77% sure of the disease, so moderate invalid evidence alone must not reject a photo.
export const INVALID_STRONG = 0.9;
export const INVALID_MODERATE = 0.5;

const INVALID_LABEL = '__invalid__';

export function diagnose(raw, { labelIndex, declaredCrop = null, invalidProbability = 0, high, low, topK = 3 }) {
  if (!raw?.length) throw new Error('diagnose() needs at least one prediction');

  const ranked = [...raw]
    .filter((p) => p.label !== INVALID_LABEL)
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
  if (!ranked.length) throw new Error('diagnose() needs at least one non-invalid prediction');
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
    invalidProbability: round(invalidProbability),
  });

  if (rawTop.confidence < low) {
    return outcome(rawTop, ranked, 'rejected', 'not_recognised');
  }
  if (invalidProbability >= INVALID_STRONG || (invalidProbability >= INVALID_MODERATE && rawTop.confidence < high)) {
    return outcome(rawTop, ranked, 'rejected', 'not_recognised');
  }

  if (declaredCrop) {
    const inCrop = ranked.filter((p) => p.crop === declaredCrop);
    if (inCrop.length === 0) {
      return outcome(rawTop, ranked, 'rejected', 'crop_not_supported');
    }

    const cropProbability = inCrop.reduce((sum, p) => sum + p.confidence, 0);
    const conditioned = inCrop.map((p) => ({ ...p, confidence: cropProbability > 0 ? p.confidence / cropProbability : 0 }));
    const top = conditioned[0];

    if (cropProbability < CROP_AGREEMENT) {
      // Farmers know their own crop far better than the model does (wheat rust photos were
      // routinely called maize rust), so show the best answer for the declared crop, flagged.
      return outcome(top, conditioned, 'uncertain', 'crop_mismatch', cropProbability);
    }
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
