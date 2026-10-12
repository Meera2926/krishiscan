import mongoose from 'mongoose';
import { toJSONOptions } from './shared.js';

/**
 * A farmer's rating of the expert who answered their case.
 *
 * Tied to a completed consultation, one per consultation, so a rating can only come from someone
 * the expert actually advised and nobody can rate the same case twice to move an average.
 */
const expertRatingSchema = new mongoose.Schema(
  {
    expert: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    consultation: { type: mongoose.Schema.Types.ObjectId, ref: 'Consultation', required: true, unique: true },
    stars: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: { validator: Number.isInteger, message: 'stars must be a whole number' },
    },
    comment: { type: String, trim: true, maxlength: 500, default: null },
  },
  { timestamps: true, toJSON: { ...toJSONOptions } },
);

expertRatingSchema.index({ expert: 1, createdAt: -1 });

export const ExpertRating = mongoose.models.ExpertRating ?? mongoose.model('ExpertRating', expertRatingSchema);
