import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { assessQuality } from '../src/services/imageQuality.js';

/**
 * A leaf-like JPEG with fine detail whose pattern scales with the image, so the same scene
 * photographed at two resolutions carries the same amount of visible detail — which is how real
 * photos behave, and what the quality heuristics have to be invariant to.
 */
function texturedLeafJpeg(size) {
  const veins = Array.from(
    { length: 24 },
    (_, i) =>
      `<line x1="${size / 2}" y1="${size * 0.08}" x2="${(i / 23) * size}" y2="${size * 0.95}" stroke="#2f6b2f" stroke-width="${size / 300}"/>`,
  ).join('');
  const lesions = Array.from(
    { length: 18 },
    (_, i) =>
      `<circle cx="${(((i * 37) % 100) / 100) * size}" cy="${(((i * 61) % 100) / 100) * size}" r="${size / 40}" fill="#6b4a1f"/>`,
  ).join('');
  return sharp(
    Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="#3f8f3f"/>${veins}${lesions}</svg>`),
  )
    .jpeg({ quality: 90 })
    .toBuffer();
}

describe('image quality', () => {
  it('does not call a detailed photo blurry, whatever the camera resolution', async () => {
    const phone = await assessQuality(await texturedLeafJpeg(1600));
    const small = await assessQuality(await texturedLeafJpeg(512));

    expect(phone.warnings).not.toContain('blurry');
    expect(small.warnings).not.toContain('blurry');
    // The regression: sharpness used to be measured on the original, so the same scene scored
    // roughly half as sharp at full phone resolution and every photo was called blurry.
    expect(phone.sharpness).toBeCloseTo(small.sharpness, 0);
  });

  it('still warns about a genuinely blurred photo', async () => {
    const blurred = await sharp(await texturedLeafJpeg(1600)).blur(12).jpeg().toBuffer();
    expect((await assessQuality(blurred)).warnings).toContain('blurry');
  });

  it('measures brightness as luminance, not the red channel', async () => {
    // Foliage is dark in red and bright in luma, so measuring the red channel made well-lit
    // leaf photos look under-exposed.
    const litLeaf = await sharp({ create: { width: 600, height: 600, channels: 3, background: { r: 20, g: 200, b: 40 } } })
      .jpeg()
      .toBuffer();
    const quality = await assessQuality(litLeaf);
    expect(quality.brightness).toBeGreaterThan(100);
    expect(quality.warnings).not.toContain('too_dark');
  });

  it('warns about a genuinely dark photo', async () => {
    const dusk = await sharp(await texturedLeafJpeg(800)).modulate({ brightness: 0.15 }).jpeg().toBuffer();
    expect((await assessQuality(dusk)).warnings).toContain('too_dark');
  });
});
