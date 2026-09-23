import mongoose from 'mongoose';
import { toJSONOptions } from './shared.js';

const cropSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    // Other names farmers use for the same crop, shown in pickers and accepted by the API.
    aliases: { type: [String], default: [] },
    names: { type: Map, of: String, default: {} },
    scientificName: String,
    seasons: [String],
    commonVarieties: [String],
    typicalStates: [String],
    // False when the loaded classifier has no classes for this crop.
    supportedByModel: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: toJSONOptions },
);

export const Crop = mongoose.models.Crop ?? mongoose.model('Crop', cropSchema);
