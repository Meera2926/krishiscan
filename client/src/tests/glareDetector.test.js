import { checkBrightnessAnomaly } from '../utils/glareDetector';

describe('glareDetector', () => {
  it('flags overexposed photos with glare warning', () => {
    const res = checkBrightnessAnomaly(248);
    expect(res.hasGlare).toBe(true);
  });

  it('flags underexposed dark photos', () => {
    const res = checkBrightnessAnomaly(20);
    expect(res.isTooDark).toBe(true);
  });
});
