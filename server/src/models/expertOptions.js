/**
 * What counts as a qualification to advise farmers here, and the states an expert account moves
 * through. Kept free of model imports so both the User schema and the routes can use it.
 */

/**
 * Agriculture degrees, bachelor's and above. A farmer acts on what an expert tells them - which
 * fungicide, how much, whether to pull the crop - so the bar is a degree in agriculture itself,
 * not a related science. The labels are how the degrees are written on Indian certificates and
 * become the start of the qualification line farmers see ("M.Sc. (Agri.) Plant Pathology").
 */
export const AGRI_DEGREES = {
  bsc_agriculture: 'B.Sc. (Agri.)',
  bsc_horticulture: 'B.Sc. (Horti.)',
  btech_agri_engineering: 'B.Tech. (Agri. Engg.)',
  msc_agriculture: 'M.Sc. (Agri.)',
  msc_horticulture: 'M.Sc. (Horti.)',
  mtech_agri_engineering: 'M.Tech. (Agri. Engg.)',
  phd_agriculture: 'Ph.D. (Agri.)',
  phd_horticulture: 'Ph.D. (Horti.)',
};

export const ORGANISATION_TYPES = {
  kvk: 'Krishi Vigyan Kendra (KVK)',
  sau: 'State Agricultural University',
  icar: 'ICAR institute',
  state_dept: 'State Department of Agriculture / Horticulture',
  private: 'Private company or NGO',
  independent: 'Independent consultant',
};

/**
 * pending   - applied, certificate not yet checked by an admin
 * verified  - checked; may see farmers' cases and give advice
 * rejected  - not accepted; the applicant can correct the application and send it again
 * suspended - was verified, has been stopped by an admin
 */
export const EXPERT_STATUSES = ['pending', 'verified', 'rejected', 'suspended'];

export const GRADUATION_YEAR_MIN = 1960;

/** "M.Sc. (Agri.)" + "Plant Pathology" -> "M.Sc. (Agri.) Plant Pathology". */
export function composeQualification(degree, specialisation) {
  const label = AGRI_DEGREES[degree];
  if (!label) return null;
  return specialisation ? `${label} ${specialisation}` : label;
}
