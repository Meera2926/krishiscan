import { RULES } from './rules.js';

const LEVEL_ORDER = { high: 3, moderate: 2, low: 1, unknown: 0 };

export function rulesForCrop(crop) {
  return RULES.filter((r) => r.crop === crop);
}

export function supportedRiskCrops() {
  return [...new Set(RULES.map((r) => r.crop))];
}

/**
 * Evaluates every weather-risk rule for a crop against a daily weather series
 * (see services/weather.js for the shape). Rules only look at forecast days plus the
 * recent past they need, so the result is a forward-looking warning, not a diagnosis.
 */
export function assessRisk(crop, days) {
  const results = rulesForCrop(crop).map((rule) => {
    let outcome;
    try {
      outcome = rule.evaluate(days);
    } catch (err) {
      console.warn(`[risk] rule ${rule.id} failed:`, err.message);
      outcome = { level: 'unknown', score: 0, reason: 'Could not evaluate with the available weather data.' };
    }
    return {
      ruleId: rule.id,
      diseaseKey: rule.diseaseKey,
      model: rule.model,
      source: rule.source,
      level: outcome.level,
      score: outcome.score,
      reason: outcome.reason,
      window: outcome.window ?? null,
      dailyScores: outcome.dailyScores ?? null,
    };
  });

  results.sort((a, b) => LEVEL_ORDER[b.level] - LEVEL_ORDER[a.level] || b.score - a.score);
  const overall = results[0]?.level ?? 'unknown';
  return { crop, overall, assessments: results };
}
