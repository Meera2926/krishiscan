const { calculateSoilMoistureDeficit } = require('../utils/soilMoistureCalculator');

describe('soilMoistureCalculator', () => {
  it('identifies critical deficit when below wilting point', () => {
    const result = calculateSoilMoistureDeficit(10, 35, 15);
    expect(result.status).toBe('CRITICAL_DEFICIT');
    expect(result.requiresIrrigation).toBe(true);
  });

  it('reports optimal moisture when above 50% available water capacity', () => {
    const result = calculateSoilMoistureDeficit(30, 35, 15);
    expect(result.status).toBe('OPTIMAL');
    expect(result.requiresIrrigation).toBe(false);
  });
});
