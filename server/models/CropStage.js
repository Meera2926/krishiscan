/**
 * Crop growth stages enum and milestone day intervals.
 */
const CROP_GROWTH_STAGES = {
  SEEDLING: { code: 'STAGE_1', label: 'Seedling / Germination', susceptibility: 'HIGH' },
  VEGETATIVE: { code: 'STAGE_2', label: 'Vegetative Growth', susceptibility: 'MEDIUM' },
  FLOWERING: { code: 'STAGE_3', label: 'Flowering & Pollination', susceptibility: 'CRITICAL' },
  MATURITY: { code: 'STAGE_4', label: 'Ripening & Harvest', susceptibility: 'LOW' }
};

module.exports = { CROP_GROWTH_STAGES };
