const { calculateFungalRisk } = require('../utils/fungalRiskIndex');

describe('fungalRiskIndex', () => {
  it('returns high risk during prolonged humid warm conditions', () => {
    const score = calculateFungalRisk(25, 90, 3);
    expect(score).toBe(100);
  });

  it('returns low risk in dry cool weather', () => {
    const score = calculateFungalRisk(12, 40, 0);
    expect(score).toBe(0);
  });
});
