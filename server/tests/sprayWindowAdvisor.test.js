const { getSprayWindowSuitability } = require('../utils/sprayWindowAdvisor');

describe('sprayWindowAdvisor', () => {
  it('rejects spraying when rain is forecasted', () => {
    const res = getSprayWindowSuitability(5, 60, 25);
    expect(res.suitable).toBe(false);
    expect(res.reason).toContain('rainfall');
  });

  it('approves spraying under calm mild conditions', () => {
    const res = getSprayWindowSuitability(8, 10, 26);
    expect(res.suitable).toBe(true);
  });
});
