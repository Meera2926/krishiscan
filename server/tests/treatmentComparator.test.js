const { compareTreatmentOptions } = require('../utils/treatmentComparator');

describe('treatmentComparator', () => {
  it('provides zero day pre-harvest interval for organic remedies', () => {
    const comparison = compareTreatmentOptions('LeafBlight');
    expect(comparison.organic.waitingPeriodDays).toBe(0);
    expect(comparison.organic.safetyRating).toBe('ECO_SAFE');
  });
});
