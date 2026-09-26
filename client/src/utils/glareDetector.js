/**
 * Checks for severe sun glare or flash reflection on leaf surface.
 */
export function checkBrightnessAnomaly(avgLuminance) {
  if (avgLuminance > 240) {
    return { hasGlare: true, warning: 'Direct sunlight glare detected. Please shade the leaf.' };
  }
  if (avgLuminance < 30) {
    return { isTooDark: true, warning: 'Image is too dark. Please use natural daylight.' };
  }
  return { isOptimal: true };
}
