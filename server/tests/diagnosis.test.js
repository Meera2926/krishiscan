import { describe, expect, it } from 'vitest';
import { CROP_AGREEMENT, diagnose } from '../src/services/diagnosis.js';

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

  it('rejects photos nothing recognises, and gives no diagnosis', () => {
    const r = diagnose(dist({ Tomato___Late_blight: 0.22, Tomato___Early_blight: 0.2, Tomato___healthy: 0.2, Potato___Late_blight: 0.19, Potato___healthy: 0.19 }), opts);
    expect(r.status).toBe('rejected');
    expect(r.statusReason).toBe('not_recognised');
    expect(r.diseaseKey).toBeNull();
    expect(r.crop).toBeNull();
  });

  it('runs the out-of-distribution gate BEFORE crop conditioning', () => {
    // Renormalising within tomato would turn 0.25 / (0.25 + 0.05) into 0.83 and look confident.
    const junk = dist({ Tomato___Late_blight: 0.25, Tomato___Early_blight: 0.05, Potato___Late_blight: 0.24, Potato___healthy: 0.23, Tomato___healthy: 0.23 });
    const r = diagnose(junk, { ...opts, declaredCrop: 'tomato' });
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
    const unsure = dist({ Tomato___Late_blight: 0.56, Tomato___Early_blight: 0.4, Potato___healthy: 0.04 });

    it('rejects on strong invalid evidence even if the disease model is confident', () => {
      const r = diagnose(leafy, { ...opts, declaredCrop: 'tomato', invalidProbability: 0.95 });
      expect(r.status).toBe('rejected');
      expect(r.statusReason).toBe('not_recognised');
      expect(r.invalidProbability).toBeCloseTo(0.95, 4);
    });

    it('rejects on moderate invalid evidence when the disease model is also unsure', () => {
      const r = diagnose(unsure, { ...opts, declaredCrop: 'tomato', invalidProbability: 0.6 });
      expect(r.status).toBe('rejected');
    });

    it('keeps a real diseased leaf that the gate is only moderately unsure about', () => {
      // Mirrors a real Wikimedia late-blight photo: 59% invalid, 77% late blight.
      const r = diagnose(leafy, { ...opts, declaredCrop: 'tomato', invalidProbability: 0.586 });
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
