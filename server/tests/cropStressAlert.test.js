const { evaluateCropThermalStress } = require('../utils/cropStressAlert');

describe('cropStressAlert', () => {
  it('flags severe heat stress above 40C', () => {
    const alert = evaluateCropThermalStress(42, 'Cotton');
    expect(alert.alert).toBe('SEVERE_HEAT_STRESS');
  });

  it('triggers frost warning when temperatures drop near zero', () => {
    const alert = evaluateCropThermalStress(2, 'Mustard');
    expect(alert.alert).toBe('FROST_WARNING');
  });
});
