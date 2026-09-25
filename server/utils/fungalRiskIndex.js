/**
 * Calculates fungal disease proliferation risk score (0 - 100).
 * High humidity (>80%) combined with moderate warmth (20-30°C) accelerates sporulation.
 */
function calculateFungalRisk(tempCelsius, relativeHumidityPct, consecutiveRainDays) {
  let riskScore = 0;
  if (relativeHumidityPct >= 85) riskScore += 50;
  else if (relativeHumidityPct >= 70) riskScore += 30;

  if (tempCelsius >= 20 && tempCelsius <= 30) riskScore += 30;
  else if (tempCelsius >= 15 && tempCelsius <= 35) riskScore += 15;

  if (consecutiveRainDays >= 2) riskScore += 20;

  return Math.min(100, riskScore);
}

module.exports = { calculateFungalRisk };
