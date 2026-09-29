import { formatMandiRatePerQuintal } from '../utils/mandiPriceFormatter';

describe('mandiPriceFormatter', () => {
  it('formats mandi rate in Indian localized currency format', () => {
    expect(formatMandiRatePerQuintal(2450)).toBe('₹2,450/quintal');
  });
});
