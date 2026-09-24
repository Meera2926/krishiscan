/**
 * Computes recommended fertilizer dosage in kg/acre.
 * @param {string} crop - Crop type
 * @param {string} deficiency - Diagnosed nutrient deficiency
 * @returns {object} recommended fertilizer application
 */
function getFertilizerRecommendation(crop, deficiency) {
  switch (deficiency) {
    case 'NITROGEN_DEFICIENCY':
      return { fertilizer: 'Urea (46-0-0)', dosageKgPerAcre: 35, method: 'Split top dressing' };
    case 'PHOSPHORUS_DEFICIENCY':
      return { fertilizer: 'Single Super Phosphate (SSP)', dosageKgPerAcre: 50, method: 'Basal placement' };
    case 'POTASSIUM_DEFICIENCY':
      return { fertilizer: 'Muriate of Potash (MOP)', dosageKgPerAcre: 25, method: 'Foliar spray' };
    default:
      return { fertilizer: 'Balanced NPK (19:19:19)', dosageKgPerAcre: 5, method: 'Maintenance spray' };
  }
}

module.exports = { getFertilizerRecommendation };
