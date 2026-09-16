import { RULES } from './rules.js';

const LEVEL_ORDER = { high: 3, moderate: 2, low: 1, unknown: 0 };

export function rulesForCrop(crop) {
  return RULES.filter((r) => r.crop === crop);
}

export function supportedRiskCrops() {
  return [...new Set(RULES.map((r) => r.crop))];
}

const rank = (a, b) => LEVEL_ORDER[b.level] - LEVEL_ORDER[a.level] || b.score - a.score;

/**
 * Evaluates every weather-risk rule for a crop against a daily weather series
 * (see services/weather.js for the shape). Rules look at forecast days plus the recent past they
 * need, so the result is a forward-looking warning, not a diagnosis.
 *
 * Some diseases have more than one model (potato late blight: Hutton Criteria and ICAR-CPRI's
 * JHULSACAST). Farmers see one entry per disease, carrying the most severe model's verdict,
 * with the other models listed alongside.
 */
export function assessRisk(crop, days) {
  const evaluated = rulesForCrop(crop).map((rule) => {
    const outcome = rule.evaluate(days);
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

  const byDisease = new Map();
  for (const result of evaluated) {
    const group = byDisease.get(result.diseaseKey) ?? [];
    group.push(result);
    byDisease.set(result.diseaseKey, group);
  }

  const assessments = [...byDisease.values()].map((group) => {
    const [worst, ...others] = group.sort(rank);
    return {
      ...worst,
      otherModels: others.map(({ model, level, reason, source }) => ({ model, level, reason, source })),
    };
  });
  assessments.sort(rank);

  return { crop, overall: assessments[0]?.level ?? 'unknown', assessments };
}
