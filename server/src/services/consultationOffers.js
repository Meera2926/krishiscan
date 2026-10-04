import { Consultation } from '../models/index.js';
import { buildCaseSummary, expiryFrom, shouldOfferForScan, shouldOfferForTreatment } from './consultation.js';

/**
 * Creates the offer of an expert review, once per case.
 *
 * Separate from services/consultation.js so the rules there stay pure and testable; this is the
 * part that touches the database. Offers are idempotent: scanning the same leaf twice raises two
 * cases (two scans), but re-opening one scan never raises a second.
 */
export async function offerConsultation({
  trigger,
  scan = null,
  plot = null,
  treatment = null,
  disease = null,
  progression = null,
  efficacy = null,
  force = false,
  now = new Date(),
}) {
  if (!force) {
    if (trigger === 'uncertain_diagnosis' && !shouldOfferForScan(scan)) return null;
    if (trigger === 'treatment_not_working' && !shouldOfferForTreatment(efficacy)) return null;
  }

  const farmer = scan?.owner ?? treatment?.owner;
  if (!farmer) return null;

  const key = scan
    ? { scan: scan._id ?? scan.id, trigger }
    : { treatment: treatment._id ?? treatment.id, trigger };

  const existing = await Consultation.findOne(key);
  if (existing) return existing;

  return Consultation.create({
    ...key,
    farmer,
    plot: plot?._id ?? plot ?? scan?.plot ?? treatment?.plot ?? null,
    decision: 'pending',
    status: 'open',
    // The farmer has a week to answer before the case and its photo are removed.
    expiresAt: expiryFrom(now),
    caseSummary: buildCaseSummary({ scan, disease, progression, treatment, efficacy }),
  });
}
