/**
 * Calculates Pre-Harvest Interval (PHI) safe consumption date after spray.
 */
function calculateSafeHarvestDate(sprayDateStr, phiDays = 14) {
  const spray = new Date(sprayDateStr);
  const safeDate = new Date(spray);
  safeDate.setDate(safeDate.getDate() + phiDays);
  return safeDate.toISOString().split('T')[0];
}

module.exports = { calculateSafeHarvestDate };
