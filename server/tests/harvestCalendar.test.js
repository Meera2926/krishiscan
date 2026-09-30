const { suggestHarvestWindow } = require('../utils/harvestCalendar');

describe('harvestCalendar', () => {
  it('filters dry weather days for safe grain harvesting', () => {
    const forecast = [
      { date: '2026-10-01', rainChancePct: 10 },
      { date: '2026-10-02', rainChancePct: 70 },
      { date: '2026-10-03', rainChancePct: 5 },
    ];
    const res = suggestHarvestWindow(forecast);
    expect(res.favorableDaysCount).toBe(2);
    expect(res.recommendedDates).toContain('2026-10-01');
  });
});
