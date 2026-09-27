/**
 * Compares organic bio-control vs chemical treatment trade-offs.
 */
function compareTreatmentOptions(diseaseType) {
  return {
    organic: {
      name: 'Neem Oil (Azadirachtin 1500 ppm) + Trichoderma viride',
      safetyRating: 'ECO_SAFE',
      waitingPeriodDays: 0,
      costLevel: 'LOW'
    },
    chemical: {
      name: 'Mancozeb 75% WP or Propiconazole 25% EC',
      safetyRating: 'MODERATE_HAZARD',
      waitingPeriodDays: 14,
      costLevel: 'MEDIUM'
    }
  };
}

module.exports = { compareTreatmentOptions };
