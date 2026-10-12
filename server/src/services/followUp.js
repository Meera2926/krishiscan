/**
 * When to photograph the same leaf again.
 *
 * Progression tracking only works with a second scan to compare against, and the app has no way
 * of telling the farmer "soon" that they can act on. So every diagnosis names a date.
 *
 * The interval is a rule of thumb from how fast the pathogen group moves, not a figure lifted
 * from any one extension recommendation: oomycetes like late blight can take a field in under a
 * week, while a virus will not visibly change in that time. A severe disease is re-checked
 * sooner, and a healthy leaf later. Treat it as a reminder, not as agronomic advice.
 */

const DAY = 86_400_000;

const DAYS_BY_AGENT = {
  oomycete: 5,
  bacterial: 7,
  fungal: 7,
  pest: 7,
  viral: 14,
  deficiency: 14,
  abiotic: 14,
  none: 14,
};

export const HEALTHY_DAYS = 14;
const MIN_DAYS = 3;
const MAX_DAYS = 21;

/**
 * @param {{causalAgentType?: string, severity?: string, isHealthy?: boolean}|null} disease
 * @param {{percent?: number}|null} severity measured lesion area for this scan
 */
export function followUpDays(disease, severity = null) {
  if (!disease || disease.isHealthy) return HEALTHY_DAYS;

  let days = DAYS_BY_AGENT[disease.causalAgentType] ?? DAYS_BY_AGENT.none;
  if (disease.severity === 'severe') days -= 2;
  else if (disease.severity === 'low') days += 3;
  // Already well established: watching it closely matters more than the pathogen's usual pace.
  if (severity?.percent != null && severity.percent >= 25) days -= 2;

  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, days));
}

/**
 * @returns {{days: number, date: Date, healthy: boolean}} when to scan this plot again.
 */
export function followUpPlan(disease, severity = null, from = new Date()) {
  const days = followUpDays(disease, severity);
  return {
    days,
    date: new Date(new Date(from).getTime() + days * DAY),
    healthy: Boolean(disease?.isHealthy),
  };
}
