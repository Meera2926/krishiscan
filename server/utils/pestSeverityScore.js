/**
 * Computes standardized crop pest severity score (1 to 5).
 */
function calculatePestSeverity(damagedLeavesPct, affectedStemCount) {
  if (damagedLeavesPct > 50 || affectedStemCount >= 5) return 5;
  if (damagedLeavesPct > 30) return 4;
  if (damagedLeavesPct > 15) return 3;
  if (damagedLeavesPct > 5) return 2;
  return 1;
}

module.exports = { calculatePestSeverity };
