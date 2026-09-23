import mongoose from 'mongoose';
import { toJSONOptions } from './shared.js';

export const TREATMENT_TYPES = ['chemical', 'organic', 'cultural'];

const treatmentSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    plot: { type: mongoose.Schema.Types.ObjectId, ref: 'Plot', required: true },
    // The disease being treated; null for a general or preventive application.
    diseaseKey: { type: String, default: null },
    type: { type: String, enum: TREATMENT_TYPES, required: true },
    product: { type: String, trim: true, maxlength: 120, required: true },
    activeIngredient: { type: String, trim: true, maxlength: 120 },
    dose: { type: String, trim: true, maxlength: 120 },
    appliedAt: { type: Date, required: true },
    // Pre-harvest interval from the product label; drives the safe-to-harvest date.
    phiDays: { type: Number, min: 0, max: 365, default: null },
    notes: { type: String, maxlength: 1000 },
  },
  { timestamps: true, toJSON: toJSONOptions },
);

treatmentSchema.index({ plot: 1, appliedAt: -1 });

export const Treatment = mongoose.models.Treatment ?? mongoose.model('Treatment', treatmentSchema);
