import { validateLeafImageAspect } from '../utils/imageAspectValidator';

describe('imageAspectValidator', () => {
  it('accepts standard 4:3 and 1:1 camera framing', () => {
    expect(validateLeafImageAspect(800, 600).valid).toBe(true);
    expect(validateLeafImageAspect(600, 600).valid).toBe(true);
  });

  it('rejects ultra-narrow or wide panoramas', () => {
    expect(validateLeafImageAspect(1200, 200).valid).toBe(false);
  });
});
