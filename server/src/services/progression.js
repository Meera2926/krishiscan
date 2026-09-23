/**
 * Disease progression and treatment-efficacy analysis over a plot's scan history.
 * Pure functions: callers pass plain data, which keeps them easy to test.
 */

const DAY = 864e5;

// Percentage points of leaf area per day that count as a real trend rather than noise.
export const TREND_SLOPE = 0.5;
// Total change, in percentage points, that counts as a trend even when the slope is gentle.
export const TREND_DELTA = 5;
// Grade 4 starts above 25% leaf area affected.
export const SEVERE_PERCENT = 25;
// Only readings from this recent window decide the trend direction.
export const TREND_WINDOW_DAYS = 14;

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * @param points [{ date: Date|string, percent: number }] reliable severity readings, any order.
 * @returns trend summary, including AUDPC (area under the disease progress curve, in %-days,
 *          trapezoidal method of Shaner & Finney, Phytopathology 67:1051, 1977).
 */
export function summariseProgression(points) {
  const series = points
    .filter((p) => p.percent != null)
    .map((p) => ({ t: new Date(p.date).getTime(), percent: p.percent }))
    .sort((a, b) => a.t - b.t);

  if (series.length === 0) return { count: 0, trend: 'insufficient' };

  const first = series[0];
  const latest = series.at(-1);
  const spanDays = (latest.t - first.t) / DAY;
  const base = {
    count: series.length,
    firstPercent: first.percent,
    latestPercent: latest.percent,
    change: round1(latest.percent - first.percent),
    spanDays: round1(spanDays),
  };

  if (series.length < 2 || spanDays < 1) {
    return { ...base, trend: 'insufficient', slopePerDay: null, audpc: 0, daysToSevere: null };
  }

  // The trend answers "what is happening now", so fit only recent readings: a plot that peaked and
  // then recovered after treatment is improving, even though its first and last readings are close.
  const recent = series.filter((p) => latest.t - p.t <= TREND_WINDOW_DAYS * DAY);
  const window = recent.length >= 2 ? recent : series.slice(-2);

  // Least-squares slope in percentage points per day.
  const xs = window.map((p) => (p.t - window[0].t) / DAY);
  const ys = window.map((p) => p.percent);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i += 1) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den ? num / den : 0;

  let audpc = 0;
  for (let i = 1; i < series.length; i += 1) {
    audpc += ((series[i - 1].percent + series[i].percent) / 2) * ((series[i].t - series[i - 1].t) / DAY);
  }

  const windowChange = round1(window.at(-1).percent - window[0].percent);
  let trend = 'stable';
  if (slope >= TREND_SLOPE || (windowChange >= TREND_DELTA && slope > 0)) trend = 'worsening';
  else if (slope <= -TREND_SLOPE || (windowChange <= -TREND_DELTA && slope < 0)) trend = 'improving';

  // A straight-line projection: a rough early warning, labelled as such in the UI.
  const daysToSevere =
    trend === 'worsening' && latest.percent < SEVERE_PERCENT && slope > 0
      ? Math.min(60, Math.ceil((SEVERE_PERCENT - latest.percent) / slope))
      : null;

  return { ...base, trend, slopePerDay: round1(slope), audpc: Math.round(audpc), daysToSevere };
}

// Windows for comparing severity before and after a treatment.
export const BEFORE_WINDOW_DAYS = 14;
export const AFTER_MIN_DAYS = 5;
export const AFTER_MAX_DAYS = 30;
export const EFFECT_THRESHOLD = 3;

/**
 * Did a treatment work? Compares the latest reliable scan in the 14 days before application with
 * the latest one 5-30 days after. Healthy scans count after treatment, since recovery is success.
 *
 * @param treatment { appliedAt, diseaseKey, phiDays }
 * @param scans [{ id, createdAt, diseaseKey, isHealthy, severity: { percent, reliable } }]
 */
export function evaluateTreatment(treatment, scans, now = new Date()) {
  const applied = new Date(treatment.appliedAt).getTime();
  const relevant = scans
    .filter((s) => s.severity?.reliable && s.severity.percent != null)
    .filter((s) => !treatment.diseaseKey || s.isHealthy || s.diseaseKey === treatment.diseaseKey)
    .map((s) => ({ ...s, t: new Date(s.createdAt).getTime() }))
    .sort((a, b) => a.t - b.t);

  const before = relevant.filter((s) => s.t <= applied && s.t >= applied - BEFORE_WINDOW_DAYS * DAY).at(-1);
  const after = relevant.filter((s) => s.t >= applied + AFTER_MIN_DAYS * DAY && s.t <= applied + AFTER_MAX_DAYS * DAY).at(-1);

  const safeHarvestFrom = treatment.phiDays != null ? new Date(applied + treatment.phiDays * DAY) : null;
  const followUpFrom = new Date(applied + AFTER_MIN_DAYS * DAY);
  const pick = (s) => (s ? { scanId: String(s.id ?? s._id), date: new Date(s.t), percent: s.severity.percent } : null);

  let status;
  if (!before) status = 'no_baseline';
  else if (!after) status = now.getTime() <= applied + AFTER_MAX_DAYS * DAY ? 'awaiting_followup' : 'no_followup';
  else {
    const delta = after.severity.percent - before.severity.percent;
    if (delta <= -EFFECT_THRESHOLD || (before.severity.percent >= 5 && after.severity.percent <= 2)) status = 'effective';
    else if (delta >= EFFECT_THRESHOLD) status = 'not_effective';
    else status = 'no_change';
  }

  return {
    status,
    before: pick(before),
    after: pick(after),
    change: before && after ? round1(after.severity.percent - before.severity.percent) : null,
    followUpFrom,
    safeHarvestFrom,
  };
}

/** The date from which every logged treatment's pre-harvest interval has passed. */
export function safeHarvestDate(treatments) {
  const dates = treatments
    .filter((t) => t.phiDays != null)
    .map((t) => new Date(t.appliedAt).getTime() + t.phiDays * DAY);
  return dates.length ? new Date(Math.max(...dates)) : null;
}
