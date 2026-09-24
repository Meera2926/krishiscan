const { diagnoseNpkDeficiency } = require('../utils/npkAnalyzer');

describe('npkAnalyzer', () => {
  it('detects Nitrogen deficiency from chlorosis on older leaves', () => {
    const res = diagnoseNpkDeficiency({ yellowOlderLeaves: true, stuntedGrowth: true });
    expect(res).toBe('NITROGEN_DEFICIENCY');
  });

  it('detects Potassium deficiency from marginal necrosis', () => {
    const res = diagnoseNpkDeficiency({ marginalLeafScorching: true, weakStems: true });
    expect(res).toBe('POTASSIUM_DEFICIENCY');
  });
});
