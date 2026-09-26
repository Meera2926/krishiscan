/**
 * Validates photographed crop leaf aspect ratio before AI inference.
 */
export function validateLeafImageAspect(width, height) {
  if (!width || !height) return { valid: false, error: 'Invalid dimensions' };
  const ratio = width / height;
  // Leaf photos should not be extreme panoramic strips
  if (ratio > 2.5 || ratio < 0.4) {
    return { valid: false, error: 'Please frame the leaf centrally without excessive cropping' };
  }
  return { valid: true };
}
