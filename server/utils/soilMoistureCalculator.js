/**
 * Calculates soil moisture deficit and irrigation recommendations.
 * @param {number} currentMoisturePct - Current volumetric water content (%)
 * @param {number} fieldCapacityPct - Soil field capacity (%)
 * @param {number} wiltingPointPct - Permanent wilting point (%)
 * @returns {object} status and deficit mm
 */
function calculateSoilMoistureDeficit(currentMoisturePct, fieldCapacityPct = 35, wiltingPointPct = 15) {
  if (currentMoisturePct < wiltingPointPct) {
    return { status: 'CRITICAL_DEFICIT', requiresIrrigation: true, urgency: 'HIGH' };
  }
  if (currentMoisturePct < (wiltingPointPct + (fieldCapacityPct - wiltingPointPct) * 0.5)) {
    return { status: 'MODERATE_DEFICIT', requiresIrrigation: true, urgency: 'MEDIUM' };
  }
  return { status: 'OPTIMAL', requiresIrrigation: false, urgency: 'NONE' };
}

module.exports = { calculateSoilMoistureDeficit };
