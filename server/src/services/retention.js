import { Consultation, Scan } from '../models/index.js';
import { reminderDue } from './consultation.js';
import { storage } from './storage/index.js';

/**
 * Keeps declined and ignored expert reviews from piling up.
 *
 * A farmer who is offered a review and does not book one gets reminders for a week. If the week
 * runs out with nothing booked, the consultation is deleted along with the scan it was raised
 * for and that scan's photo — the farmer is told the exact date on the result page and in every
 * reminder, so nothing disappears unannounced.
 *
 * Only cases the farmer never answered are ever deleted. A scheduled, confirmed or completed
 * consultation has no expiry, scans that were never flagged for review are untouched, and a scan
 * an expert has already ruled on is kept even when its consultation goes.
 */

/** Sends any reminders that have come due. Returns the consultations that got one. */
export async function sendDueReminders(now = new Date()) {
  const candidates = await Consultation.find({
    decision: { $ne: 'scheduled' },
    expiresAt: { $gt: now },
  }).select('createdAt expiresAt remindersSent decision farmer scan');

  const reminded = [];
  for (const consultation of candidates) {
    const due = reminderDue(consultation, now);
    if (!due) continue;
    consultation.remindersSent.push(now);
    await consultation.save();
    reminded.push(consultation);
  }
  return reminded;
}

/** Deletes consultations whose week has run out, with their scan and its stored photo. */
export async function purgeExpired(now = new Date()) {
  const expired = await Consultation.find({
    decision: { $ne: 'scheduled' },
    expiresAt: { $lte: now },
  }).select('scan farmer messages');

  let scansDeleted = 0;
  let scansKept = 0;
  for (const consultation of expired) {
    // Photos sent inside the conversation are the farmer's too, and go with it.
    for (const message of consultation.messages ?? []) {
      if (message.image?.storageKey) {
        await storage
          .remove(message.image.storageKey)
          .catch((err) => console.warn('[retention] chat image cleanup failed:', err.message));
      }
    }
    if (consultation.scan) {
      const scan = await Scan.findById(consultation.scan).select('image review');
      // A scan an agronomist has already ruled on is not just this farmer's copy: it is the
      // record of what the model said against what an expert said, which is the only honest
      // accuracy figure this project has. Sweeping the unanswered consultation away is right;
      // taking the settled review with it is not.
      const reviewed = ['confirmed', 'corrected'].includes(scan?.review?.status);
      if (scan && !reviewed) {
        await scan.deleteOne();
        scansDeleted += 1;
        if (scan.image?.storageKey) {
          await storage
            .remove(scan.image.storageKey)
            .catch((err) => console.warn('[retention] image cleanup failed:', err.message));
        }
      } else if (reviewed) {
        scansKept += 1;
      }
    }
    await consultation.deleteOne();
  }
  return { consultationsDeleted: expired.length, scansDeleted, scansKept };
}

export async function runRetentionSweep(now = new Date()) {
  const reminded = await sendDueReminders(now);
  const purged = await purgeExpired(now);
  return { remindersSent: reminded.length, ...purged };
}

/**
 * Runs the sweep hourly. One process does this; on a multi-instance deployment it would need a
 * lock, but a free-tier single instance is what this app targets.
 */
export function startRetentionScheduler({ intervalMs = 3_600_000 } = {}) {
  const tick = async () => {
    try {
      const result = await runRetentionSweep();
      if (result.remindersSent || result.consultationsDeleted) {
        console.log(
          `[retention] ${result.remindersSent} reminder(s), removed ${result.consultationsDeleted} expired review(s) and ${result.scansDeleted} scan(s)`,
        );
      }
    } catch (err) {
      console.warn('[retention] sweep failed:', err.message);
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  tick();
  return () => clearInterval(timer);
}
