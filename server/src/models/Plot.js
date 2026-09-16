import mongoose from 'mongoose';
import { pointSchema, toJSONOptions } from './shared.js';

const plotSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    crop: { type: String, required: true, lowercase: true, trim: true },
    variety: { type: String, trim: true, maxlength: 80 },
    sowingDate: Date,
    areaAcres: { type: Number, min: 0, max: 100_000 },
    location: { type: pointSchema, required: true },
    state: { type: String, trim: true, maxlength: 60 },
    district: { type: String, trim: true, maxlength: 60 },
    notes: { type: String, maxlength: 2000 },
  },
  { timestamps: true, toJSON: toJSONOptions },
);

plotSchema.index({ location: '2dsphere' });

export const Plot = mongoose.models.Plot ?? mongoose.model('Plot', plotSchema);
