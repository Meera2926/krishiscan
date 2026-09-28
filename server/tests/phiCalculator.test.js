const { calculateSafeHarvestDate } = require('../utils/phiCalculator');

describe('phiCalculator', () => {
  it('computes safe harvest date adding PHI waiting window', () => {
    const safeDate = calculateSafeHarvestDate('2026-09-20', 10);
    expect(safeDate).toBe('2026-09-30');
  });
});
