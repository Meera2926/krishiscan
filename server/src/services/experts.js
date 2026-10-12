/**
 * Who may advise farmers, and what farmers say about them afterwards.
 *
 * An expert account is created "pending" and stays useless until an admin has looked at the
 * degree certificate it was opened with. Ratings come only from farmers whose case that expert
 * actually completed.
 */
import mongoose from 'mongoose';
import sharp from 'sharp';
import { z } from 'zod';
import { cropKey } from '../middleware/validate.js';
import { AGRI_DEGREES, GRADUATION_YEAR_MIN, ORGANISATION_TYPES, composeQualification } from '../models/expertOptions.js';
import { CONSULTATION_MODES, Consultation, Crop, ExpertRating, User } from '../models/index.js';
import { LANGUAGES } from '../models/shared.js';
import { badRequest, unprocessable } from '../utils/httpError.js';

// ---------------------------------------------------------------------------------------------
// The application form
// ---------------------------------------------------------------------------------------------

/**
 * A multipart form sends a list as one comma-separated string, or as a repeated field that
 * arrives as an array. Either becomes a de-duplicated array.
 */
const list = (item) =>
  z.preprocess((value) => {
    if (value == null || value === '') return [];
    const parts = Array.isArray(value) ? value : String(value).split(',');
    return [...new Set(parts.map((s) => String(s).trim()).filter(Boolean))];
  }, z.array(item));

/** Everything about the qualification and the practice; the same for a first application and a resubmission. */
export const credentialsBody = z.object({
  degree: z.enum(Object.keys(AGRI_DEGREES), { error: 'Choose your agriculture degree from the list.' }),
  specialisation: z.string().trim().max(80).optional(),
  university: z.string().trim().min(3).max(120),
  graduationYear: z.coerce
    .number()
    .int()
    .min(GRADUATION_YEAR_MIN)
    .refine((y) => y <= new Date().getFullYear(), { error: 'The year of passing cannot be in the future.' }),
  organisationType: z.enum(Object.keys(ORGANISATION_TYPES), { error: 'Choose where you work from the list.' }),
  organisation: z.string().trim().min(2).max(120),
  designation: z.string().trim().min(2).max(120),
  experienceYears: z.coerce.number().int().min(0).max(60),
  // Empty means every crop the app supports, as it always has for the expert picker.
  crops: list(cropKey).pipe(z.array(z.string()).max(20)),
  languages: list(z.enum(LANGUAGES)).pipe(z.array(z.string()).min(1, 'Choose at least one language.')),
  modes: list(z.enum(CONSULTATION_MODES)).pipe(z.array(z.string()).min(1, 'Choose at least one way to advise.')),
  bio: z.string().trim().max(600).optional(),
  declaration: z.literal('true', { error: 'Please confirm that these details are true.' }),
});

/** Turns a validated form into the profile stored on the account. Unknown crops are refused, not dropped. */
export async function buildExpertProfile(body) {
  if (body.crops.length) {
    const known = await Crop.find({ key: { $in: body.crops } }).distinct('key');
    const unknown = body.crops.filter((c) => !known.includes(c));
    if (unknown.length) throw unprocessable('Unknown crop', { crops: [`Not a crop in the app: ${unknown.join(', ')}`] });
  }
  const specialisation = body.specialisation || undefined;
  return {
    qualification: composeQualification(body.degree, specialisation),
    degree: body.degree,
    specialisation,
    university: body.university,
    graduationYear: body.graduationYear,
    organisationType: body.organisationType,
    organisation: body.organisation,
    designation: body.designation,
    experienceYears: body.experienceYears,
    crops: body.crops,
    languages: body.languages,
    modes: body.modes,
    bio: body.bio || undefined,
  };
}

/** What any signed-in user may see about a verified expert's background. */
export function publicExpertProfile(profile = {}) {
  return {
    qualification: profile.qualification ?? null,
    degree: profile.degree ?? null,
    degreeLabel: AGRI_DEGREES[profile.degree] ?? null,
    specialisation: profile.specialisation ?? null,
    university: profile.university ?? null,
    graduationYear: profile.graduationYear ?? null,
    organisationType: profile.organisationType ?? null,
    organisation: profile.organisation ?? null,
    designation: profile.designation ?? null,
    experienceYears: profile.experienceYears ?? null,
    crops: profile.crops ?? [],
    languages: profile.languages ?? [],
    modes: profile.modes ?? [],
    bio: profile.bio ?? null,
  };
}

/** Options the application form offers, so the client never hard-codes the degree list. */
export function expertOptions(now = new Date()) {
  return {
    degrees: Object.entries(AGRI_DEGREES).map(([key, label]) => ({ key, label })),
    organisationTypes: Object.entries(ORGANISATION_TYPES).map(([key, label]) => ({ key, label })),
    graduationYear: { min: GRADUATION_YEAR_MIN, max: now.getFullYear() },
  };
}

// ---------------------------------------------------------------------------------------------
// The certificate
// ---------------------------------------------------------------------------------------------

// Small enough to keep in a database document, large enough to read a registration number.
const CERTIFICATE_MAX_EDGE = 2000;
// Below this a certificate cannot be read, which makes it no evidence of anything.
export const CERTIFICATE_MIN_EDGE = 300;

/**
 * Re-encodes the uploaded certificate. Decoding it is the real check that it is an image, whatever
 * the browser declared, and re-encoding drops the metadata (a phone photo of a certificate
 * carries the GPS position of wherever it was taken).
 */
export async function prepareCertificate(buffer) {
  let meta;
  try {
    meta = await sharp(buffer, { failOn: 'error' }).metadata();
  } catch {
    throw badRequest('The certificate could not be read as an image. Please upload a photo or scan of it.');
  }
  if (!meta.width || !meta.height) throw badRequest('The certificate could not be read as an image.');

  const { data, info } = await sharp(buffer, { failOn: 'error' })
    .rotate()
    .resize({ width: CERTIFICATE_MAX_EDGE, height: CERTIFICATE_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  if (Math.min(info.width, info.height) < CERTIFICATE_MIN_EDGE) {
    throw badRequest(`The certificate photo is too small to read. Use one at least ${CERTIFICATE_MIN_EDGE}px on each side.`);
  }
  return { contentType: 'image/jpeg', data, width: info.width, height: info.height, bytes: data.length };
}

// ---------------------------------------------------------------------------------------------
// Verification decisions
// ---------------------------------------------------------------------------------------------

/** Which status each decision may be taken from, and what it leads to. */
export const DECISIONS = {
  verify: { from: ['pending', 'rejected', 'suspended'], to: 'verified', needsNote: false },
  reject: { from: ['pending'], to: 'rejected', needsNote: true },
  suspend: { from: ['verified'], to: 'suspended', needsNote: true },
};

/**
 * Hands an expert's unfinished cases back to the open queue, so a farmer whose adviser was just
 * suspended is not left waiting on someone who can no longer answer. Answered cases stay theirs:
 * the advice was given and the record of who gave it should not change.
 */
export async function releaseOpenCases(expertId) {
  const { modifiedCount } = await Consultation.updateMany(
    { expert: expertId, status: { $in: ['open', 'confirmed'] } },
    { $set: { expert: null, status: 'open' } },
  );
  return modifiedCount;
}

/**
 * Expert accounts that predate verification have no status at all. Until now the only way to make
 * one was the seed script or a deliberate edit of the database by whoever runs it - registration
 * has never been able to create an expert - so each of them was put there by an administrator.
 * They are marked verified once, on start-up, rather than locked out of the cases they are
 * already handling. Every account created from here on starts as pending.
 */
export async function verifyLegacyExperts(now = new Date()) {
  const { modifiedCount } = await User.updateMany(
    { role: 'expert', 'expertVerification.status': { $exists: false } },
    {
      $set: {
        'expertVerification.status': 'verified',
        'expertVerification.decidedAt': now,
        'expertVerification.note': 'Set up by an administrator before expert sign-up existed.',
      },
    },
  );
  return modifiedCount;
}

// ---------------------------------------------------------------------------------------------
// Ratings
// ---------------------------------------------------------------------------------------------

const oneDecimal = (n) => Math.round(n * 10) / 10;
export const NO_RATINGS = Object.freeze({ average: null, count: 0 });

// Aggregation pipelines do not cast, so a string id would silently match nothing.
const asObjectId = (id) => new mongoose.Types.ObjectId(String(id));

/** Average and count for several experts at once, for the picker. */
export async function ratingSummaries(expertIds) {
  if (!expertIds.length) return new Map();
  const rows = await ExpertRating.aggregate([
    { $match: { expert: { $in: expertIds.map(asObjectId) } } },
    { $group: { _id: '$expert', total: { $sum: '$stars' }, count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), { average: oneDecimal(r.total / r.count), count: r.count }]));
}

export async function ratingSummary(expertId) {
  return (await ratingSummaries([expertId])).get(String(expertId)) ?? { ...NO_RATINGS };
}

/**
 * The full picture for an expert's profile: average, how the stars are spread, and the latest
 * comments. Comments carry no farmer's name or place. A farmer who knows the expert will see
 * who wrote what is less likely to write what happened.
 */
export async function ratingDetail(expertId, { limit = 10 } = {}) {
  const expert = asObjectId(expertId);
  const [byStars, latest] = await Promise.all([
    ExpertRating.aggregate([{ $match: { expert } }, { $group: { _id: '$stars', count: { $sum: 1 } } }]),
    ExpertRating.find({ expert }).sort({ updatedAt: -1 }).limit(limit).select('stars comment createdAt').lean(),
  ]);
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  let count = 0;
  for (const row of byStars) {
    distribution[row._id] = row.count;
    total += row._id * row.count;
    count += row.count;
  }
  return {
    rating: { average: count ? oneDecimal(total / count) : null, count, distribution },
    reviews: latest.map((r) => ({ stars: r.stars, comment: r.comment ?? null, createdAt: r.createdAt })),
  };
}
