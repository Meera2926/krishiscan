/**
 * Evaluates physiological thermal stress on crops.
 */
function evaluateCropThermalStress(tempCelsius, crop) {
  if (tempCelsius > 40) {
    return { alert: 'SEVERE_HEAT_STRESS', action: 'Apply light mulching and evening irrigation' };
  }
  if (tempCelsius < 4) {
    return { alert: 'FROST_WARNING', action: 'Create night smudge fires or provide sprinkler protection' };
  }
  return { alert: 'NORMAL', action: 'No thermal stress observed' };
}

module.exports = { evaluateCropThermalStress };
