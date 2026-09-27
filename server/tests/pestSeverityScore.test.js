const { calculatePestSeverity } = require('../utils/pestSeverityScore');

describe('pestSeverityScore', () => {
  it('rates severe damage over 50% as score 5', () => {
    expect(calculatePestSeverity(65, 3)).toBe(5);
  });

  it('rates minor damage under 5% as score 1', () => {
    expect(calculatePestSeverity(3, 0)).toBe(1);
  });
});
