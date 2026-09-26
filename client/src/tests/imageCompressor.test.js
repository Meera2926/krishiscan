import { computeTargetDimensions } from '../utils/imageCompressor';

describe('imageCompressor', () => {
  it('scales down large landscape images proportionally to max 640px', () => {
    const dim = computeTargetDimensions(1280, 720, 640);
    expect(dim.width).toBe(640);
    expect(dim.height).toBe(360);
  });
});
