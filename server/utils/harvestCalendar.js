/**
 * Suggests optimal harvest window avoiding rainy days.
 */
function suggestHarvestWindow(weatherForecast) {
  const suitableDays = weatherForecast.filter(day => day.rainChancePct < 20);
  return {
    recommendedDates: suitableDays.map(d => d.date),
    favorableDaysCount: suitableDays.length,
    dryingConditions: suitableDays.length >= 3 ? 'EXCELLENT' : 'MODERATE'
  };
}

module.exports = { suggestHarvestWindow };
