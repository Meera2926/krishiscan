/**
 * When to offer a farmer a human expert, and what the expert needs to see.
 *
 * The app offers a review exactly when it should not be trusted alone:
 *  - the classifier was not confident, or thought the photo might not be a leaf, or disagreed
 *    with the farmer about the crop;
 *  - progression tracking shows a spray did not bring the severity down.
 *
 * Everything here is pure so the rules can be tested without a database.
 */

const DAY = 86_400_000;

/** How long a case is kept while the farmer has not booked anything. */
export const RETENTION_DAYS = 7;
/** Days after the offer on which a reminder goes out, while there is still time to act. */
export const REMINDER_DAYS = [2, 5];

/** Scan outcomes where a second opinion is worth offering. */
const UNCERTAIN_REASONS = new Set(['low_confidence', 'crop_mismatch', 'maybe_not_leaf']);

export function shouldOfferForScan(scan) {
  return scan?.status === 'uncertain' && UNCERTAIN_REASONS.has(scan.statusReason);
}

/**
 * A spray is worth escalating once there is evidence it did not work: severity went up, or it
 * stayed flat through the whole follow-up window. "Awaiting follow-up" is not yet evidence.
 */
export function shouldOfferForTreatment(efficacy) {
  return efficacy?.status === 'not_effective' || efficacy?.status === 'no_change';
}

export const expiryFrom = (offeredAt, days = RETENTION_DAYS) =>
  new Date(new Date(offeredAt).getTime() + days * DAY);

/**
 * Which reminder, if any, is due now: the number of whole days since the offer has passed a
 * REMINDER_DAYS mark that has not been sent yet.
 */
export function reminderDue(consultation, now = new Date()) {
  if (consultation.decision === 'scheduled') return null;
  if (!consultation.expiresAt || new Date(consultation.expiresAt) <= now) return null;
  const offeredAt = new Date(consultation.createdAt).getTime();
  const elapsedDays = (now.getTime() - offeredAt) / DAY;
  const sent = consultation.remindersSent?.length ?? 0;
  const due = REMINDER_DAYS.filter((d) => elapsedDays >= d).length;
  return due > sent ? { index: sent + 1, of: REMINDER_DAYS.length } : null;
}

/** Everything an expert needs to open the case already knowing the story. */
export function buildCaseSummary({ scan, disease, progression, treatment, efficacy }) {
  return {
    crop: scan?.declaredCrop ?? null,
    diseaseKey: scan?.effectiveDiseaseKey ?? scan?.diseaseKey ?? null,
    diseaseName: disease?.commonName ?? null,
    confidence: scan?.top?.confidence ?? null,
    statusReason: scan?.statusReason ?? null,
    severityPercent: scan?.severity?.percent ?? null,
    severityTrend: progression?.trend ?? null,
    imageUrl: scan?.image?.url ?? null,
    treatmentProduct: treatment?.product ?? null,
    treatmentAppliedAt: treatment?.appliedAt ?? null,
    severityBefore: efficacy?.before?.percent ?? null,
    severityAfter: efficacy?.after?.percent ?? null,
  };
}

/**
 * Opening message of a chat consultation, written from the case rather than left to the farmer.
 * The point of the whole feature is that nobody starts the conversation from scratch.
 */
export function openingMessage(summary, trigger) {
  const lines = [];
  if (trigger === 'treatment_not_working') {
    lines.push('The app flagged this because a treatment does not seem to be working.');
    if (summary.treatmentProduct) {
      const applied = summary.treatmentAppliedAt ? new Date(summary.treatmentAppliedAt).toISOString().slice(0, 10) : 'recently';
      lines.push(`Sprayed ${summary.treatmentProduct} on ${applied}.`);
    }
    if (summary.severityBefore != null && summary.severityAfter != null) {
      lines.push(`Leaf area affected went from ${summary.severityBefore}% before the spray to ${summary.severityAfter}% after.`);
    }
  } else {
    lines.push('The app flagged this because it was not sure of the diagnosis.');
  }
  if (summary.diseaseName) {
    const pct = summary.confidence != null ? ` (${Math.round(summary.confidence * 100)}% confidence)` : '';
    lines.push(`Best guess: ${summary.diseaseName}${pct}.`);
  }
  if (summary.crop) lines.push(`Crop: ${summary.crop}.`);
  if (summary.severityPercent != null) lines.push(`Latest scan: ${summary.severityPercent}% of leaf area affected.`);
  if (summary.severityTrend) lines.push(`Trend across recent scans: ${summary.severityTrend}.`);
  return lines.join(' ');
}

/**
 * Bookable slots: whole hours during working hours, starting tomorrow, so a farmer is never
 * offered a time that has already passed. A real deployment would intersect this with each
 * expert's calendar; here it is the same grid for everyone.
 */
export const SLOT_HOURS = [9, 10, 11, 12, 14, 15, 16, 17];
const SLOT_DAYS = 7;

export function availableSlots(now = new Date(), days = SLOT_DAYS) {
  const slots = [];
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  for (let d = 1; d <= days; d += 1) {
    for (const hour of SLOT_HOURS) {
      const at = new Date(start.getTime() + d * DAY);
      at.setHours(hour, 0, 0, 0);
      if (at > now) slots.push(at);
    }
  }
  return slots;
}

export function isBookableSlot(when, now = new Date(), days = SLOT_DAYS) {
  const at = new Date(when);
  if (Number.isNaN(at.getTime()) || at <= now) return false;
  if (!SLOT_HOURS.includes(at.getHours()) || at.getMinutes() !== 0) return false;
  return at.getTime() <= now.getTime() + (days + 1) * DAY;
}
