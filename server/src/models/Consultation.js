import mongoose from 'mongoose';
import { toJSONOptions } from './shared.js';

/**
 * An offer of a human expert review, and everything that follows from the farmer's answer.
 *
 * Raised automatically when the app should not be trusted on its own: the classifier was not
 * sure, or progression tracking shows a spray did not work. The farmer answers yes or no.
 *
 *   yes  -> they pick a phone call, a live chat or a farm visit, and a slot. The case stays
 *           until it is completed or cancelled.
 *   no   -> or no answer at all: reminders go out for a week, and if the farmer never comes
 *           back the consultation and the scan it was raised for are deleted, so declined
 *           cases do not pile up in the database forever.
 *
 * `caseSummary` is captured when the offer is made, so an expert opening a chat already has the
 * diagnosis, the severity history and the treatments in front of them, and the farmer does not
 * have to tell the story from the beginning.
 */

export const CONSULTATION_TRIGGERS = ['uncertain_diagnosis', 'treatment_not_working'];
export const CONSULTATION_DECISIONS = ['pending', 'scheduled', 'declined'];
export const CONSULTATION_MODES = ['call', 'chat', 'visit'];
export const CONSULTATION_STATUSES = ['open', 'confirmed', 'completed', 'cancelled', 'expired'];

const messageSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderRole: { type: String, enum: ['farmer', 'expert', 'admin'], required: true },
    // Either is enough on its own: a photo with no caption is a perfectly good reply to
    // "send me a picture of the underside".
    body: { type: String, trim: true, maxlength: 2000, default: '' },
    image: {
      url: String,
      storageKey: String,
      width: Number,
      height: Number,
      bytes: Number,
      format: String,
    },
    sentAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const consultationSchema = new mongoose.Schema(
  {
    farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    expert: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    scan: { type: mongoose.Schema.Types.ObjectId, ref: 'Scan', default: null },
    plot: { type: mongoose.Schema.Types.ObjectId, ref: 'Plot', default: null },
    treatment: { type: mongoose.Schema.Types.ObjectId, ref: 'Treatment', default: null },

    trigger: { type: String, enum: CONSULTATION_TRIGGERS, required: true },
    decision: { type: String, enum: CONSULTATION_DECISIONS, default: 'pending' },
    decidedAt: { type: Date, default: null },

    mode: { type: String, enum: CONSULTATION_MODES, default: null },
    scheduledFor: { type: Date, default: null },
    // Where the expert should call or visit. Only collected for those two modes.
    contactPhone: { type: String, trim: true, maxlength: 20, default: null },
    visitAddress: { type: String, trim: true, maxlength: 300, default: null },

    status: { type: String, enum: CONSULTATION_STATUSES, default: 'open' },
    question: { type: String, trim: true, maxlength: 1000, default: null },
    messages: { type: [messageSchema], default: [] },

    /**
     * The case as it stood when the offer was made, so the conversation starts with the facts
     * rather than with the farmer re-typing them.
     */
    caseSummary: {
      crop: String,
      diseaseKey: String,
      diseaseName: String,
      confidence: Number,
      statusReason: String,
      severityPercent: Number,
      severityTrend: String,
      imageUrl: String,
      treatmentProduct: String,
      treatmentAppliedAt: Date,
      severityBefore: Number,
      severityAfter: Number,
    },

    // While the farmer has not booked anything, the case is kept only until this date; after it
    // the sweep in services/retention.js deletes the consultation and its scan.
    expiresAt: { type: Date, default: null },
    remindersSent: { type: [Date], default: [] },

    outcome: {
      diseaseKey: { type: String, default: null },
      advice: { type: String, maxlength: 2000, default: null },
      completedAt: { type: Date, default: null },
    },
  },
  { timestamps: true, toJSON: toJSONOptions },
);

/** True while the farmer still has to answer, or has said no and the week has not run out. */
consultationSchema.virtual('awaitingFarmer').get(function awaitingFarmer() {
  return this.decision !== 'scheduled' && ['open', 'expired'].includes(this.status);
});

consultationSchema.index({ farmer: 1, createdAt: -1 });
consultationSchema.index({ expert: 1, scheduledFor: 1 });
consultationSchema.index({ status: 1, scheduledFor: 1 });
// Drives the retention sweep: everything still awaiting the farmer, oldest deadline first.
consultationSchema.index({ decision: 1, expiresAt: 1 });
// One live offer per case, so a farmer is never asked the same question twice. These have to be
// partial rather than sparse: both fields default to null, so the field is always present and a
// sparse index would treat every treatment-triggered case as a duplicate of the last one.
consultationSchema.index(
  { scan: 1, trigger: 1 },
  { unique: true, partialFilterExpression: { scan: { $type: 'objectId' } } },
);
consultationSchema.index(
  { treatment: 1, trigger: 1 },
  { unique: true, partialFilterExpression: { treatment: { $type: 'objectId' } } },
);

export const Consultation =
  mongoose.models.Consultation ?? mongoose.model('Consultation', consultationSchema);
