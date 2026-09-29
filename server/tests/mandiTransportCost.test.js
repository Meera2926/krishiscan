const { estimateTransportCost } = require('../utils/mandiTransportCost');

describe('mandiTransportCost', () => {
  it('calculates total haulage cost based on distance and load weight', () => {
    const cost = estimateTransportCost(20, 10, 3.5);
    // 250 base + 20 * 10 * 3.5 = 250 + 700 = 950
    expect(cost).toBe(950);
  });
});
