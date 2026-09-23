import mongoose from 'mongoose';
import { pointSchema, toJSONOptions } from './shared.js';

export const SCAN_STATUS = ['confident', 'uncertain', 'rejected'];
export const STATUS_REASONS = [
  'ok',
  'low_confidence',
  'not_recognised',
  'crop_mismatch',
  'crop_not_supported',
];
export const REVIEW_STATUS = ['none', 'pending', 'confirmed', 'corrected'];

const predictionSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    diseaseKey: { type: String, default: null },
  },
  { _id: false },
);

const scanSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    plot: { type: mongoose.Schema.Types.ObjectId, ref: 'Plot', default: null },
    // Crop the farmer said they photographed; used to condition the predictions.
    declaredCrop: { type: String, lowercase: true, default: null },

    image: {
      url: { type: String, required: true },
      storageKey: { type: String, required: true },
      width: Number,
      height: Number,
      bytes: Number,
      format: String,
    },
    quality: {
      ok: Boolean,
      brightness: Number,
      sharpness: Number,
      warnings: [String],
    },

    // Lesion share of leaf area, for progression tracking (see services/severity.js).
    severity: {
      percent: { type: Number, min: 0, max: 100, default: null },
      grade: { type: Number, min: 0, max: 5, default: null },
      leafFraction: Number,
      reliable: { type: Boolean, default: false },
      method: String,
    },

    predictions: { type: [predictionSchema], default: [] },
    top: { type: predictionSchema, default: undefined },
    crop: { type: String, lowercase: true, default: null },
    diseaseKey: { type: String, default: null },
    isHealthy: { type: Boolean, default: false },
    status: { type: String, enum: SCAN_STATUS, required: true },
    statusReason: { type: String, enum: STATUS_REASONS, default: 'ok' },
    // Share of the model's raw probability that fell on the declared crop's classes.
    cropProbability: { type: Number, min: 0, max: 1, default: null },
    // Gate model's probability that the photo is not a crop leaf at all.
    invalidProbability: { type: Number, min: 0, max: 1, default: null },
    modelVersion: { type: String, required: true },
    inferenceMs: Number,

    location: { type: pointSchema, default: undefined },
    // Consent to include this scan, with coarsened coordinates, in the public outbreak map.
    shareLocation: { type: Boolean, default: false },

    review: {
      status: { type: String, enum: REVIEW_STATUS, default: 'none' },
      reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      correctedDiseaseKey: { type: String, default: null },
      note: { type: String, maxlength: 1000 },
      reviewedAt: Date,
    },
  },
  { timestamps: true, toJSON: toJSONOptions },
);

scanSchema.virtual('effectiveDiseaseKey').get(function effectiveDiseaseKey() {
  return this.review?.status === 'corrected' ? this.review.correctedDiseaseKey : this.diseaseKey;
});

scanSchema.index({ owner: 1, createdAt: -1 });
scanSchema.index({ plot: 1, createdAt: -1 });
scanSchema.index({ location: '2dsphere' });
scanSchema.index({ shareLocation: 1, diseaseKey: 1, createdAt: -1 });
scanSchema.index({ 'review.status': 1, createdAt: 1 });

export const Scan = mongoose.models.Scan ?? mongoose.model('Scan', scanSchema);
