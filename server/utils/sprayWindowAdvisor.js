/**
 * Recommends optimal pesticide/fungicide spray window.
 */
function getSprayWindowSuitability(windSpeedKmh, rainChancePct, tempCelsius) {
  if (windSpeedKmh > 15) {
    return { suitable: false, reason: 'High wind causes pesticide drift hazard' };
  }
  if (rainChancePct > 40) {
    return { suitable: false, reason: 'Imminent rainfall will wash off spray chemicals' };
  }
  if (tempCelsius > 35) {
    return { suitable: false, reason: 'Excessive heat causes rapid chemical evaporation' };
  }
  return { suitable: true, reason: 'Optimal weather window for foliar treatment application' };
}

module.exports = { getSprayWindowSuitability };
