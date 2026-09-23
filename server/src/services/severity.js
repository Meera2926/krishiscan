import sharp from 'sharp';

/**
 * Estimates disease severity as the percentage of leaf area that is lesion tissue, using colour
 * segmentation in the spirit of Leaf Doctor (Pethybridge & Nelson, Plant Disease 99:1310, 2015).
 *
 * 1. Healthy tissue = green pixels (HSV hue 65-170 deg, enough saturation and brightness).
 * 2. Leaf region = green pixels, dilated slightly, with enclosed holes filled. Lesions sit inside
 *    the leaf, so they become holes in the green mask, while soil and sky touch the image border
 *    and are never filled.
 * 3. Lesion tissue = leaf-region pixels that are not green (yellowing, browning, necrosis).
 *
 * This is an estimate for tracking change over time on the same plot, not a lab measurement:
 * lesions on the leaf edge and pale glare are under-counted, and dark shadows can be over-counted.
 */

const SIZE = 192;

export const SEVERITY_METHOD = 'hsv-enclosed-lesion-v1';

// Percent leaf area thresholds for a 0-5 grade (upper bounds, inclusive).
export const GRADE_BOUNDS = [1, 5, 10, 25, 50];

export function gradeFor(percent) {
  const i = GRADE_BOUNDS.findIndex((b) => percent <= b);
  return i === -1 ? 5 : i;
}

function hsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max / 255];
}

function dilate(mask, w, h, radius) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!mask[y * w + x]) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const xx = x + dx;
          if (xx >= 0 && xx < w) out[yy * w + xx] = 1;
        }
      }
    }
  }
  return out;
}

/** Marks every non-mask pixel reachable from the border; the rest are enclosed holes. */
function fillHoles(mask, w, h) {
  const outside = new Uint8Array(mask.length);
  const stack = [];
  const push = (x, y) => {
    const i = y * w + x;
    if (!mask[i] && !outside[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x += 1) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y += 1) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  const filled = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) filled[i] = outside[i] ? 0 : 1;
  return filled;
}

export async function estimateSeverity(imageBuffer) {
  const { data, info } = await sharp(imageBuffer)
    .rotate()
    .resize(SIZE, SIZE, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  const n = w * h;

  const green = new Uint8Array(n);
  const tissue = new Uint8Array(n); // green, or lesion-coloured: brown/orange necrosis, yellow chlorosis
  for (let i = 0; i < n; i += 1) {
    const [hue, sat, val] = hsv(data[i * channels], data[i * channels + 1], data[i * channels + 2]);
    if (hue >= 65 && hue <= 170 && sat >= 0.18 && val >= 0.12) green[i] = 1;
    // Lesions are warm-hued. Neutral or bluish dark pixels are shadows or background showing
    // between leaflets, and dark yellow-green is shadowed healthy tissue; neither counts.
    const necrotic = (hue < 50 || hue > 330) && sat >= 0.2 && val >= 0.08;
    const chlorotic = hue >= 50 && hue < 65 && sat >= 0.2 && val >= 0.35;
    if (green[i] || necrotic || chlorotic) tissue[i] = 1;
  }

  const greenCount = green.reduce((a, b) => a + b, 0);
  if (greenCount < n * 0.03) {
    return { percent: null, grade: null, leafFraction: greenCount / n, method: SEVERITY_METHOD, reliable: false };
  }

  const radius = Math.max(1, Math.round(Math.min(w, h) * 0.015));
  const region = fillHoles(dilate(green, w, h, radius), w, h);

  let leaf = 0;
  let lesion = 0;
  for (let i = 0; i < n; i += 1) {
    if (!region[i]) continue;
    if (green[i]) {
      leaf += 1;
    } else if (tissue[i]) {
      leaf += 1;
      lesion += 1;
    }
  }

  const percent = leaf ? Math.round((lesion / leaf) * 1000) / 10 : 0;
  return {
    percent,
    grade: gradeFor(percent),
    leafFraction: Math.round((leaf / n) * 1000) / 1000,
    method: SEVERITY_METHOD,
    // Too little leaf in frame makes the percentage meaningless.
    reliable: leaf >= n * 0.08,
  };
}
