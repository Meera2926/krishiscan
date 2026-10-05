/**
 * Turns a classifier's raw probability distribution into a farmer-facing diagnosis.
 *
 * Order matters:
 *  1. "Is this a crop leaf at all?" — the gate model's explicit "invalid" class, on RAW
 *     probabilities, plus a floor that only fires when nothing at all scored above chance.
 *  2. Crop conditioning. The farmer tells us the crop, so keep only that crop's classes and
 *     renormalise. This sharply improves ranking, but renormalising can inflate a junk
 *     prediction, which is why step 1 has to run first.
 *  3. Triage into confident / uncertain / rejected. Uncertain scans go to the expert queue.
 *
 * Rejecting a real leaf is the expensive mistake: the farmer gets nothing back and nothing to
 * appeal against. Everything short of "this is not a crop leaf" is therefore answered and
 * flagged rather than refused. Thresholds come from server/eval, a small set of real field
 * photos (see scripts/evaluate-models.js); re-check them whenever that set grows.
 */

// Below this share of raw probability on the declared crop, the model disagrees with the farmer
// about the crop. The best in-crop answer is still shown, but only as uncertain, because the
// older models each know only a few crops and a farmer knows their own field better.
export const CROP_AGREEMENT = 0.5;

/**
 * Non-leaf evidence from the gate model's "invalid" class. On the eval set every non-leaf photo
 * scored at least 0.997, while real leaves of crops the gate model was never trained on (tomato,
 * grape) reached 0.82 — one high threshold separates them with room to spare, whatever the crop.
 *
 * The lower DOUBT band only means something for crops the gate model actually knows (see
 * GATE_MODEL_CROPS). There it downgrades an answer to "uncertain" so an expert looks at it; for
 * the other crops a moderate score is just the model meeting a plant it was never taught, and
 * flagging every tomato photo would make the warning worthless.
 */
export const INVALID_REJECT = 0.9;
export const INVALID_DOUBT = 0.5;

/**
 * Floor on the raw top-1, i.e. the maximum over every class of every routed model (38 of them
 * for the PlantVillage model). Chance is about 0.026 there, and on a real field photo the mass
 * spreads out, so even a correct answer routinely peaks near 0.2. The old floor of 0.35
 * rejected 10 of 57 real leaves and caught no non-leaf photo that the invalid gate had not
 * already caught, so this one only fires when the models recognised nothing whatsoever.
 */
export const RAW_FLOOR = 0.05;

const INVALID_LABEL = '__invalid__';

export function diagnose(
  raw,
  { labelIndex, declaredCrop = null, invalidProbability = 0, gateKnowsCrop = true, cropFloor = null, high, topK = 3 },
) {
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

  if (rawTop.confidence < RAW_FLOOR) {
    return outcome(rawTop, ranked, 'rejected', 'not_recognised');
  }
  if (invalidProbability >= INVALID_REJECT) {
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

    // A classifier that was trained on every crop it serves is worth believing about which crop
    // it is looking at: the one here separates its five crops perfectly on held-out photos. When
    // such a model says the photo is not the declared crop, answering anyway would mean naming a
    // disease of the wrong plant, so it is refused outright. Models that only know one or two of
    // the crops they are routed for get the softer CROP_AGREEMENT treatment below instead.
    if (cropFloor != null && cropProbability < cropFloor) {
      return outcome(top, conditioned, 'rejected', 'wrong_crop', cropProbability);
    }
    if (cropProbability < CROP_AGREEMENT) {
      // Farmers know their own crop far better than the model does (wheat rust photos were
      // routinely called maize rust), so show the best answer for the declared crop, flagged.
      return outcome(top, conditioned, 'uncertain', 'crop_mismatch', cropProbability);
    }
    if (gateKnowsCrop && invalidProbability >= INVALID_DOUBT) {
      return outcome(top, conditioned, 'uncertain', 'maybe_not_leaf', cropProbability);
    }
    return top.confidence >= high
      ? outcome(top, conditioned, 'confident', 'ok', cropProbability)
      : outcome(top, conditioned, 'uncertain', 'low_confidence', cropProbability);
  }

  // No declared crop: the model has to be sure on its own, and we need advisory content for it.
  if (!rawTop.diseaseKey) {
    return outcome(rawTop, ranked, 'rejected', 'crop_not_supported');
  }
  if (gateKnowsCrop && invalidProbability >= INVALID_DOUBT) {
    return outcome(rawTop, ranked, 'uncertain', 'maybe_not_leaf');
  }
  return rawTop.confidence >= high
    ? outcome(rawTop, ranked, 'confident', 'ok')
    : outcome(rawTop, ranked, 'uncertain', 'low_confidence');
}

const round = (n) => Math.round(n * 10_000) / 10_000;

const pick = (p) => ({ label: p.label, confidence: round(p.confidence), diseaseKey: p.diseaseKey });
