import mongoose from 'mongoose';
import { toJSONOptions } from './shared.js';

const chemicalSchema = new mongoose.Schema(
  {
    activeIngredient: { type: String, required: true },
    dose: { type: String, required: true },
    // Pre-harvest interval in days; null when the source did not give one.
    phiDays: { type: Number, default: null },
  },
  { _id: false },
);

const diseaseSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, lowercase: true, trim: true },
    crop: { type: String, required: true, lowercase: true, index: true },
    isHealthy: { type: Boolean, default: false },
    commonName: { type: String, required: true },
    names: { type: Map, of: String, default: {} },
    causalAgentType: {
      type: String,
      // abiotic: a disorder with no pathogen, such as tipburn from calcium or moisture stress.
      enum: ['fungal', 'bacterial', 'viral', 'oomycete', 'pest', 'deficiency', 'abiotic', 'none'],
      default: 'none',
    },
    pathogen: String,
    symptoms: String,
    favorableConditions: {
      tempMinC: Number,
      tempMaxC: Number,
      humidityPct: Number,
      leafWetnessHours: Number,
      rainfall: String,
    },
    organicControl: [String],
    chemicalControl: [chemicalSchema],
    preventive: [String],
    severity: { type: String, enum: ['none', 'low', 'moderate', 'severe'], default: 'moderate' },
    sourceUrl: String,
  },
  { timestamps: true, toJSON: toJSONOptions },
);

export const Disease = mongoose.models.Disease ?? mongoose.model('Disease', diseaseSchema);
