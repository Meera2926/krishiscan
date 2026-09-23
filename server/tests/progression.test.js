import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { evaluateTreatment, safeHarvestDate, summariseProgression } from '../src/services/progression.js';
import { estimateSeverity, gradeFor } from '../src/services/severity.js';

const day = (n) => new Date(Date.UTC(2026, 8, 1) + n * 864e5);

/** A green leaf (ellipse) on a grey background, with brown lesions covering `lesionShare` of it. */
async function syntheticLeaf(lesionShare) {
  const w = 400;
  const h = 300;
  const rx = 160;
  const ry = 110;
  const leafArea = Math.PI * rx * ry;
  const spots = [];
  if (lesionShare > 0) {
    // Split the lesion area across four circles well inside the leaf.
    const r = Math.sqrt((leafArea * lesionShare) / 4 / Math.PI);
    for (const [cx, cy] of [[140, 130], [250, 120], [170, 190], [260, 185]]) {
      spots.push(`<circle cx="${cx}" cy="${cy}" r="${r.toFixed(2)}" fill="#7a4a1c"/>`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="100%" height="100%" fill="#8f9194"/>
    <ellipse cx="200" cy="150" rx="${rx}" ry="${ry}" fill="#3f8f3a"/>${spots.join('')}</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toBuffer();
}

describe('severity estimation', () => {
  it('reports near zero for a clean leaf', async () => {
    const s = await estimateSeverity(await syntheticLeaf(0));
    expect(s.reliable).toBe(true);
    expect(s.percent).toBeLessThan(2);
    expect(s.grade).toBeLessThanOrEqual(1);
  });

  it('recovers the lesion share of the leaf within a few points', async () => {
    for (const share of [0.08, 0.2, 0.4]) {
      const s = await estimateSeverity(await syntheticLeaf(share));
      expect(s.percent, `share ${share}`).toBeGreaterThan(share * 100 - 4);
      expect(s.percent, `share ${share}`).toBeLessThan(share * 100 + 4);
    }
  });

  it('does not count the grey background as disease', async () => {
    const s = await estimateSeverity(await syntheticLeaf(0));
    expect(s.leafFraction).toBeGreaterThan(0.3);
    expect(s.leafFraction).toBeLessThan(0.6);
  });

  it('gives no figure when there is no leaf in frame', async () => {
    const grey = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#777777' } }).jpeg().toBuffer();
    const s = await estimateSeverity(grey);
    expect(s.percent).toBeNull();
    expect(s.reliable).toBe(false);
  });

  it('maps percentages to grades', () => {
    expect([0, 1, 3, 8, 20, 40, 80].map(gradeFor)).toEqual([0, 0, 1, 2, 3, 4, 5]);
  });
});

describe('progression summary', () => {
  it('needs at least two readings a day apart', () => {
    expect(summariseProgression([]).trend).toBe('insufficient');
    expect(summariseProgression([{ date: day(0), percent: 5 }]).trend).toBe('insufficient');
  });

  it('detects worsening, computes AUDPC and projects days to severe', () => {
    const s = summariseProgression([
      { date: day(0), percent: 4 },
      { date: day(4), percent: 8 },
      { date: day(8), percent: 12 },
    ]);
    expect(s.trend).toBe('worsening');
    expect(s.slopePerDay).toBeCloseTo(1, 5);
    // Trapezoids: (4+8)/2*4 + (8+12)/2*4 = 24 + 40
    expect(s.audpc).toBe(64);
    expect(s.daysToSevere).toBe(13);
    expect(s.change).toBe(8);
  });

  it('detects improvement and stability, and ignores unreliable readings', () => {
    expect(summariseProgression([{ date: day(0), percent: 20 }, { date: day(10), percent: 6 }]).trend).toBe('improving');
    expect(summariseProgression([{ date: day(0), percent: 10 }, { date: day(10), percent: 11 }]).trend).toBe('stable');
    expect(summariseProgression([{ date: day(0), percent: 10 }, { date: day(3), percent: null }]).count).toBe(1);
  });

  it('reports recovery after a peak as improving, not stable', () => {
    // Rose for three weeks, then fell after treatment: the ends are close, but it is getting better.
    const s = summariseProgression([
      { date: day(0), percent: 4 },
      { date: day(5), percent: 9 },
      { date: day(10), percent: 16 },
      { date: day(15), percent: 22 },
      { date: day(20), percent: 12 },
      { date: day(23), percent: 6 },
    ]);
    expect(s.trend).toBe('improving');
    // Whole-series figures stay whole-series.
    expect(s.change).toBe(2);
    expect(s.audpc).toBeGreaterThan(200);
  });

  it('sorts readings by date before computing', () => {
    const s = summariseProgression([{ date: day(9), percent: 2 }, { date: day(0), percent: 15 }]);
    expect(s.trend).toBe('improving');
    expect(s.firstPercent).toBe(15);
  });
});

describe('treatment efficacy', () => {
  const scan = (d, percent, extra = {}) => ({ id: `s${d}`, createdAt: day(d), diseaseKey: 'tomato_late_blight', isHealthy: false, severity: { percent, reliable: true }, ...extra });
  const treatment = { appliedAt: day(10), diseaseKey: 'tomato_late_blight', phiDays: 7 };

  it('is effective when severity falls after application', () => {
    const r = evaluateTreatment(treatment, [scan(8, 18), scan(20, 9)], day(25));
    expect(r.status).toBe('effective');
    expect(r.change).toBe(-9);
    expect(r.before.percent).toBe(18);
    expect(r.safeHarvestFrom).toEqual(day(17));
  });

  it('counts a healthy follow-up scan as recovery', () => {
    const r = evaluateTreatment(treatment, [scan(9, 12), scan(18, 1, { isHealthy: true, diseaseKey: 'tomato_healthy' })], day(20));
    expect(r.status).toBe('effective');
  });

  it('is not effective when severity keeps rising', () => {
    expect(evaluateTreatment(treatment, [scan(9, 10), scan(19, 22)], day(20)).status).toBe('not_effective');
  });

  it('waits for a follow-up, and asks for a baseline when none exists', () => {
    const waiting = evaluateTreatment(treatment, [scan(9, 10), scan(12, 11)], day(13));
    expect(waiting.status).toBe('awaiting_followup');
    expect(waiting.followUpFrom).toEqual(day(15));
    expect(evaluateTreatment(treatment, [scan(20, 5)], day(21)).status).toBe('no_baseline');
    expect(evaluateTreatment(treatment, [scan(9, 10)], day(60)).status).toBe('no_followup');
  });

  it('ignores scans of a different disease', () => {
    const other = scan(19, 30, { diseaseKey: 'tomato_early_blight' });
    expect(evaluateTreatment(treatment, [scan(9, 10), other], day(20)).status).toBe('awaiting_followup');
  });

  it('takes the latest pre-harvest interval across treatments', () => {
    expect(safeHarvestDate([{ appliedAt: day(0), phiDays: 10 }, { appliedAt: day(5), phiDays: 3 }, { appliedAt: day(6), phiDays: null }])).toEqual(day(10));
    expect(safeHarvestDate([{ appliedAt: day(0), phiDays: null }])).toBeNull();
  });
});
