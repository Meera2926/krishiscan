/**
 * Diagnoses plant leaf symptoms for NPK macro-nutrient deficiencies.
 * @param {object} symptoms - Observed visual symptoms
 * @returns {string} primary deficiency diagnosis
 */
function diagnoseNpkDeficiency(symptoms) {
  if (symptoms.yellowOlderLeaves && symptoms.stuntedGrowth) {
    return 'NITROGEN_DEFICIENCY';
  }
  if (symptoms.purplingUnderside && symptoms.delayedMaturity) {
    return 'PHOSPHORUS_DEFICIENCY';
  }
  if (symptoms.marginalLeafScorching && symptoms.weakStems) {
    return 'POTASSIUM_DEFICIENCY';
  }
  return 'BALANCED_NUTRITION';
}

module.exports = { diagnoseNpkDeficiency };
