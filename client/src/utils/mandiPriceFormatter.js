/**
 * Formats mandi agricultural crop commodity prices per quintal.
 */
export function formatMandiRatePerQuintal(amountInRupees) {
  return `₹${Number(amountInRupees).toLocaleString('en-IN')}/quintal`;
}
