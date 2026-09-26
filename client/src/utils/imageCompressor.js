/**
 * Calculates optimal target dimensions preserving aspect ratio under max dimension.
 */
export function computeTargetDimensions(origWidth, origHeight, maxDimension = 640) {
  if (origWidth <= maxDimension && origHeight <= maxDimension) {
    return { width: origWidth, height: origHeight };
  }
  if (origWidth > origHeight) {
    return { width: maxDimension, height: Math.round((origHeight * maxDimension) / origWidth) };
  }
  return { width: Math.round((origWidth * maxDimension) / origHeight), height: maxDimension };
}
