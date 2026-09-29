const { computePriceTrend } = require('../utils/mandiTrendEstimator');

describe('mandiTrendEstimator', () => {
  it('detects rising price momentum', () => {
    const res = computePriceTrend([2000, 2100, 2200]);
    expect(res.trend).toBe('RISING');
    expect(res.changePct).toBe(10);
  });
});
