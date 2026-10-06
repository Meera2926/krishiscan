import { describe, expect, it } from 'vitest';
import { CROP_AGREEMENT, diagnose } from '../src/services/diagnosis.js';
import {
  CROP_MATCH_FLOOR,
  CROP_MATCH_MARGIN,
  SINGLE_MODEL_CROPS,
  cropProbability,
} from '../src/services/inference/catalog.js';

const labelIndex = new Map([
  ['Tomato___Late_blight', { diseaseKey: 'tomato_late_blight', crop: 'tomato', isHealthy: false }],
  ['Tomato___Early_blight', { diseaseKey: 'tomato_early_blight', crop: 'tomato', isHealthy: false }],
  ['Tomato___healthy', { diseaseKey: 'tomato_healthy', crop: 'tomato', isHealthy: true }],
  ['Potato___Late_blight', { diseaseKey: 'potato_late_blight', crop: 'potato', isHealthy: false }],
  ['Potato___healthy', { diseaseKey: 'potato_healthy', crop: 'potato', isHealthy: true }],
]);

const opts = { labelIndex, high: 0.7, low: 0.35 };

const dist = (pairs) => Object.entries(pairs).map(([label, confidence]) => ({ label, confidence }));

describe('diagnose', () => {
  it('is confident when the top class clears the high threshold', () => {
    const r = diagnose(dist({ Tomato___Late_blight: 0.9, Tomato___Early_blight: 0.06, Potato___Late_blight: 0.04 }), opts);
    expect(r.status).toBe('confident');
    expect(r.statusReason).toBe('ok');
    expect(r.diseaseKey).toBe('tomato_late_blight');
    expect(r.crop).toBe('tomato');
    expect(r.predictions).toHaveLength(3);
    expect(r.predictions[0].confidence).toBeGreaterThan(r.predictions[1].confidence);
  });

  it('sorts unsorted input before deciding', () => {
    const r = diagnose(dist({ Potato___Late_blight: 0.1, Tomato___Late_blight: 0.85, Tomato___healthy: 0.05 }), opts);
    expect(r.top.label).toBe('Tomato___Late_blight');
  });

  it('is uncertain between the thresholds', () => {
    const r = diagnose(dist({ Tomato___Late_blight: 0.5, Tomato___Early_blight: 0.45, Potato___healthy: 0.05 }), opts);
    expect(r.status).toBe('uncertain');
    expect(r.statusReason).toBe('low_confidence');
    expect(r.diseaseKey).toBe('tomato_late_blight');
  });

  it('rejects only when nothing at all was recognised', () => {
    // A spread-out distribution is weak evidence, not an absence of it: on real field photos a
    // correct answer often peaks near 0.2, so this has to be answered and flagged, not refused.
    const spread = diagnose(dist({ Tomato___Late_blight: 0.22, Tomato___Early_blight: 0.2, Tomato___healthy: 0.2, Potato___Late_blight: 0.19, Potato___healthy: 0.19 }), opts);
    expect(spread.status).toBe('uncertain');

    const nothing = diagnose(dist({ Tomato___Late_blight: 0.04, Tomato___Early_blight: 0.032, Tomato___healthy: 0.032, Potato___Late_blight: 0.03, Potato___healthy: 0.03 }), opts);
    expect(nothing.status).toBe('rejected');
    expect(nothing.statusReason).toBe('not_recognised');
    expect(nothing.diseaseKey).toBeNull();
    expect(nothing.crop).toBeNull();
  });

  it('runs the out-of-distribution gate BEFORE crop conditioning', () => {
    // Renormalising within tomato would turn 0.25 / (0.25 + 0.05) into 0.83 and look confident,
    // so the gate has to decide on the raw distribution first.
    const junk = dist({ Tomato___Late_blight: 0.25, Tomato___Early_blight: 0.05, Potato___Late_blight: 0.24, Potato___healthy: 0.23, Tomato___healthy: 0.23 });
    const r = diagnose(junk, { ...opts, declaredCrop: 'tomato', invalidProbability: 0.97 });
    expect(r.status).toBe('rejected');
    expect(r.statusReason).toBe('not_recognised');
  });

  it('conditions on the declared crop and renormalises within it', () => {
    const r = diagnose(
      dist({ Potato___Late_blight: 0.4, Tomato___Late_blight: 0.45, Tomato___Early_blight: 0.1, Tomato___healthy: 0.05 }),
      { ...opts, declaredCrop: 'tomato' },
    );
    expect(r.cropProbability).toBeCloseTo(0.6, 5);
    expect(r.top.label).toBe('Tomato___Late_blight');
    expect(r.top.confidence).toBeCloseTo(0.75, 4);
    expect(r.status).toBe('confident');
    expect(r.predictions.every((p) => p.diseaseKey.startsWith('tomato_'))).toBe(true);
    const total = r.predictions.reduce((s, p) => s + p.confidence, 0);
    expect(total).toBeCloseTo(1, 3);
  });

  it('on a crop mismatch, keeps the best answer for the declared crop but only as uncertain', () => {
    const r = diagnose(dist({ Potato___Late_blight: 0.8, Tomato___Late_blight: 0.15, Tomato___healthy: 0.05 }), { ...opts, declaredCrop: 'tomato' });
    expect(r.cropProbability).toBeLessThan(CROP_AGREEMENT);
    expect(r.status).toBe('uncertain');
    expect(r.statusReason).toBe('crop_mismatch');
    expect(r.top.label).toBe('Tomato___Late_blight');
    expect(r.top.confidence).toBeCloseTo(0.75, 4);
    expect(r.crop).toBe('tomato');
  });

  describe('invalid-class gate', () => {
    const leafy = dist({ Tomato___Late_blight: 0.77, Tomato___Early_blight: 0.2, Potato___healthy: 0.03 });

    it('rejects on strong invalid evidence even if the disease model is confident', () => {
      const r = diagnose(leafy, { ...opts, declaredCrop: 'tomato', invalidProbability: 0.95 });
      expect(r.status).toBe('rejected');
      expect(r.statusReason).toBe('not_recognised');
      expect(r.invalidProbability).toBeCloseTo(0.95, 4);
    });

    it('flags, rather than rejects, moderate invalid evidence on a crop the gate knows', () => {
      const r = diagnose(dist({ Potato___Late_blight: 0.56, Potato___healthy: 0.4, Tomato___Late_blight: 0.04 }), {
        ...opts,
        declaredCrop: 'potato',
        gateKnowsCrop: true,
        invalidProbability: 0.6,
      });
      expect(r.status).toBe('uncertain');
      expect(r.statusReason).toBe('maybe_not_leaf');
      expect(r.diseaseKey).toBe('potato_late_blight');
    });

    it('ignores moderate invalid evidence on a crop the gate was never trained on', () => {
      // The gate model knows only maize, potato, rice and wheat. On the eval set it scored 0.71
      // on a healthy tomato leaf, so on tomato a moderate score is not evidence of anything.
      const r = diagnose(leafy, { ...opts, declaredCrop: 'tomato', gateKnowsCrop: false, invalidProbability: 0.586 });
      expect(r.status).toBe('confident');
      expect(r.diseaseKey).toBe('tomato_late_blight');
    });

    it('ignores the __invalid__ label when ranking diseases', () => {
      const r = diagnose(
        [...dist({ Tomato___Late_blight: 0.5, Tomato___healthy: 0.1 }), { label: '__invalid__', confidence: 0.4 }],
        { ...opts, declaredCrop: 'tomato', invalidProbability: 0.4 },
      );
      expect(r.top.label).toBe('Tomato___Late_blight');
    });
  });

  it('rejects a declared crop the model has no classes for', () => {
    const r = diagnose(dist({ Tomato___Late_blight: 0.9, Potato___healthy: 0.1 }), { ...opts, declaredCrop: 'cotton' });
    expect(r.status).toBe('rejected');
    expect(r.statusReason).toBe('crop_not_supported');
  });

  it('rejects a confident prediction for a class with no advisory content', () => {
    const r = diagnose(dist({ Apple___Apple_scab: 0.95, Tomato___healthy: 0.05 }), opts);
    expect(r.status).toBe('rejected');
    expect(r.statusReason).toBe('crop_not_supported');
  });

  it('reports healthy leaves as healthy', () => {
    const r = diagnose(dist({ Tomato___healthy: 0.93, Tomato___Late_blight: 0.07 }), opts);
    expect(r.status).toBe('confident');
    expect(r.isHealthy).toBe(true);
  });

  it('throws on an empty distribution', () => {
    expect(() => diagnose([], opts)).toThrow();
  });
});

/**
 * The new-crop classifier was trained on all five of its crops at once and separates them
 * perfectly on held-out photos, so when it says the photo is a different one of them that is
 * evidence, not noise. These cover the hard gate that turns that evidence into a refusal.
 */
describe('the hard crop gate (crops whose classifier knows every crop it serves)', () => {
  const alliumIndex = new Map([
    ['onion_healthy', { diseaseKey: 'onion_healthy', crop: 'onion', isHealthy: true }],
    ['onion_iris_yellow_spot_virus', { diseaseKey: 'onion_iris_yellow_spot_virus', crop: 'onion', isHealthy: false }],
    ['onion_stemphylium_leaf_blight', { diseaseKey: 'onion_stemphylium_leaf_blight', crop: 'onion', isHealthy: false }],
    ['garlic_healthy', { diseaseKey: 'garlic_healthy', crop: 'garlic', isHealthy: true }],
    ['garlic_tipburn', { diseaseKey: 'garlic_tipburn', crop: 'garlic', isHealthy: false }],
    ['cabbage_healthy', { diseaseKey: 'cabbage_healthy', crop: 'cabbage', isHealthy: true }],
    ['cabbage_grey_mould', { diseaseKey: 'cabbage_grey_mould', crop: 'cabbage', isHealthy: false }],
  ]);
  const gated = {
    labelIndex: alliumIndex,
    high: 0.7,
    declaredCrop: 'onion',
    cropFloor: CROP_MATCH_FLOOR,
    cropMargin: CROP_MATCH_MARGIN,
  };

  it('refuses rather than naming a disease of the wrong plant', () => {
    // A garlic leaf submitted as onion: plenty of confidence, almost none of it on onion.
    const r = diagnose(
      dist({ garlic_tipburn: 0.88, garlic_healthy: 0.07, onion_healthy: 0.03, onion_stemphylium_leaf_blight: 0.02 }),
      gated,
    );
    expect(r.status).toBe('rejected');
    expect(r.statusReason).toBe('wrong_crop');
    // Nothing is asserted about the plant: no disease key, no crop, not called healthy.
    expect(r.diseaseKey).toBeNull();
    expect(r.crop).toBeNull();
    expect(r.isHealthy).toBe(false);
    expect(r.cropProbability).toBeLessThan(CROP_MATCH_FLOOR);
  });

  it('answers normally when the photo really is the declared crop', () => {
    const r = diagnose(
      dist({ onion_iris_yellow_spot_virus: 0.82, onion_healthy: 0.14, garlic_tipburn: 0.03, cabbage_healthy: 0.01 }),
      gated,
    );
    expect(r.status).toBe('confident');
    expect(r.diseaseKey).toBe('onion_iris_yellow_spot_virus');
  });

  it('still answers an uncertain photo of the right crop, rather than refusing it', () => {
    // Spread across onion's own classes: the crop is not in doubt, the disease is. Refusing here
    // would cost the farmer an answer they can appeal to an expert.
    const r = diagnose(
      dist({ onion_stemphylium_leaf_blight: 0.4, onion_iris_yellow_spot_virus: 0.35, onion_healthy: 0.21, garlic_tipburn: 0.04 }),
      gated,
    );
    expect(r.status).toBe('uncertain');
    expect(r.statusReason).toBe('low_confidence');
    expect(r.diseaseKey).toBe('onion_stemphylium_leaf_blight');
  });

  it('leaves the older crops on the softer rule, which flags instead of refusing', () => {
    // Same shape of disagreement, no cropFloor: the farmer is believed and still gets an answer.
    const r = diagnose(
      dist({ garlic_tipburn: 0.88, garlic_healthy: 0.07, onion_healthy: 0.03, onion_stemphylium_leaf_blight: 0.02 }),
      { labelIndex: alliumIndex, high: 0.7, declaredCrop: 'onion' },
    );
    expect(r.status).toBe('uncertain');
    expect(r.statusReason).toBe('crop_mismatch');
    expect(r.diseaseKey).toBe('onion_healthy');
  });

  it('counts only the declared crop towards the gate', () => {
    const d = dist({ onion_healthy: 0.5, onion_healthy_duplicate_guard: 0, cabbage_healthy: 0.3, garlic_tipburn: 0.2 });
    expect(cropProbability(d, 'onion')).toBeCloseTo(0.5, 5);
    expect(cropProbability(d, 'cabbage')).toBeCloseTo(0.3, 5);
    // "onion" must not swallow "onion_healthy_duplicate_guard" from another crop's namespace.
    expect(cropProbability(d, 'garlic')).toBeCloseTo(0.2, 5);
  });

  it('answers a real photograph that is the right crop but less than perfectly peaked', () => {
    // This is the case the first version got wrong. A farmer's own photo of a healthy onion plant
    // put 72% on onion and 21% on cabbage: the right crop, well clear of everything else, and
    // refused by an absolute floor of 0.85 that had been tuned on dataset photos sitting at 0.97.
    const r = diagnose(
      dist({ onion_healthy: 0.59, onion_stemphylium_leaf_blight: 0.13, cabbage_healthy: 0.21, garlic_tipburn: 0.07 }),
      gated,
    );
    expect(r.status).not.toBe('rejected');
    expect(r.crop).toBe('onion');
    expect(r.isHealthy).toBe(true);
  });

  it('refuses when no crop leads, even if the declared one is not far behind', () => {
    // Spread across several crops with cabbage ahead of onion: nothing here says "onion".
    const r = diagnose(
      dist({ broccoli_healthy: 0.3, cabbage_grey_mould: 0.28, onion_healthy: 0.26, garlic_tipburn: 0.16 }),
      gated,
    );
    expect(r.status).toBe('rejected');
    expect(r.statusReason).toBe('wrong_crop');
  });

  it('refuses a declared crop that leads but holds too little of the mass', () => {
    // Onion leads, but on barely a third of the probability: not enough to name a disease on.
    const r = diagnose(
      dist({ onion_healthy: 0.34, cabbage_healthy: 0.24, garlic_tipburn: 0.22, broccoli_healthy: 0.2 }),
      gated,
    );
    expect(r.status).toBe('rejected');
    expect(r.statusReason).toBe('wrong_crop');
  });

  it('gates exactly the crops served only by the jointly trained model', () => {
    expect(SINGLE_MODEL_CROPS).toEqual(['onion', 'garlic', 'cabbage', 'turnip', 'broccoli']);
    expect(SINGLE_MODEL_CROPS).not.toContain('tomato');
    expect(SINGLE_MODEL_CROPS).not.toContain('potato');
  });
});
