import { describe, expect, it } from 'vitest';
import { assessRisk, supportedRiskCrops } from '../src/services/risk/engine.js';
import { RULES } from '../src/services/risk/rules.js';

const START = '2026-09-13';
const PAST = 3;

const isoPlus = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** 3 past + 7 forecast days, the same shape services/weather.js produces. */
const week = (overrides = {}) =>
  Array.from({ length: 10 }, (_, i) => ({
    date: isoPlus(START, i),
    isForecast: i >= PAST,
    tmin: 10,
    tmax: 20,
    tmean: 15,
    rhMean: 70,
    rhMax: 85,
    rhMin: 55,
    hoursRh90: 0,
    tmeanHumid: null,
    rainMm: 0,
    rainHours: 0,
    ...(typeof overrides === 'function' ? overrides(i, i >= PAST) : overrides),
  }));

const COOL_DRY = { tmin: 2, tmax: 12, tmean: 7, rhMean: 45, rhMax: 60, rhMin: 30, hoursRh90: 0, rainMm: 0 };

describe('weather risk rules', () => {
  it('cover the six supported crops with unique ids and cited sources', () => {
    expect(new Set(RULES.map((r) => r.id)).size).toBe(RULES.length);
    expect(supportedRiskCrops().sort()).toEqual(['grape', 'maize', 'potato', 'rice', 'tomato', 'wheat']);
    for (const rule of RULES) {
      // Some Indian agricultural university sites (e.g. TNAU's eagri.org) are http-only.
      expect(rule.source).toMatch(/^https?:\/\//);
      expect(rule.diseaseKey.startsWith(`${rule.crop}_`)).toBe(true);
    }
  });

  it('return low for every rule in a cool, dry week', () => {
    for (const rule of RULES) {
      expect(rule.evaluate(week(COOL_DRY)).level, rule.id).toBe('low');
    }
  });

  it('honour the result contract and survive missing or junk data', () => {
    const nullDays = week(() => ({ tmin: null, tmax: null, tmean: null, rhMean: null, rhMax: null, rhMin: null, hoursRh90: null, rainMm: null }));
    for (const rule of RULES) {
      for (const input of [week(), nullDays, [], undefined, [null, { date: 'bad' }, 42]]) {
        const r = rule.evaluate(input);
        expect(['low', 'moderate', 'high']).toContain(r.level);
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1);
        expect(typeof r.reason).toBe('string');
      }
      expect(rule.evaluate(nullDays).level, `${rule.id} must not raise a warning from missing data`).toBe('low');
    }
  });

  it('never warn high from past weather alone', () => {
    // Very wet and mild on past days only; dry forecast.
    const pastOnly = week((i, isForecast) => (isForecast ? COOL_DRY : { tmin: 18, tmax: 26, tmean: 22, tmeanHumid: 19, rhMean: 95, rhMax: 100, rhMin: 88, hoursRh90: 20, rainMm: 15 }));
    for (const rule of RULES) {
      expect(rule.evaluate(pastOnly).level, rule.id).not.toBe('high');
    }
  });

  it('flag potato late blight under the Hutton Criteria and report one entry per disease', () => {
    // Two consecutive forecast days with tmin >= 10 °C and >= 6 h at RH >= 90%.
    const hutton = week((i) => (i === 4 || i === 5 ? { tmin: 12, tmax: 22, hoursRh90: 8, tmeanHumid: 14, rhMean: 88 } : COOL_DRY));
    const report = assessRisk('potato', hutton);
    const lateBlight = report.assessments.filter((a) => a.diseaseKey === 'potato_late_blight');
    expect(lateBlight).toHaveLength(1);
    expect(lateBlight[0].level).toBe('high');
    expect(lateBlight[0].otherModels.map((m) => m.model).join()).toMatch(/JHULSACAST/);
    expect(report.overall).toBe('high');
  });

  it('do not warn of late blight in tropical heat, which the UK Hutton Criteria never had to consider', () => {
    // Real pattern from Hooghly, West Bengal in September: very humid but nights of 26-27 °C.
    const hotHumid = week(() => ({ tmin: 26.5, tmax: 33, tmean: 29, tmeanHumid: 27.2, rhMean: 88, rhMax: 98, rhMin: 65, hoursRh90: 15, rainMm: 6 }));
    for (const crop of ['potato', 'tomato']) {
      const lateBlight = assessRisk(crop, hotHumid).assessments.find((a) => a.diseaseKey === `${crop}_late_blight`);
      expect(lateBlight.level, crop).not.toBe('high');
    }
  });

  it('flag rice leaf blast only after a sustained humid, mild-night run', () => {
    const blastWeek = week(() => ({ tmin: 22, tmax: 30, tmean: 25, tmeanHumid: 23, rhMean: 92, rhMax: 99, rhMin: 80, hoursRh90: 14 }));
    expect(assessRisk('rice', blastWeek).assessments.find((a) => a.diseaseKey === 'rice_leaf_blast').level).toBe('high');
  });

  it('returns an empty assessment for a crop without rules', () => {
    expect(assessRisk('cotton', week())).toEqual({ crop: 'cotton', overall: 'unknown', assessments: [] });
  });
});
