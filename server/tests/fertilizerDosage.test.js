const { getFertilizerRecommendation } = require('../utils/fertilizerDosage');

describe('fertilizerDosage', () => {
  it('returns Urea dosage for nitrogen deficiency', () => {
    const rec = getFertilizerRecommendation('Paddy', 'NITROGEN_DEFICIENCY');
    expect(rec.fertilizer).toContain('Urea');
    expect(rec.dosageKgPerAcre).toBe(35);
  });
});
