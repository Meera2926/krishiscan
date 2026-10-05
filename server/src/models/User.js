import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { LANGUAGES, pointSchema, toJSONOptions } from './shared.js';

export const ROLES = ['farmer', 'expert', 'admin'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'farmer' },
    preferredLanguage: { type: String, enum: LANGUAGES, default: 'en' },
    state: { type: String, trim: true, maxlength: 60 },
    district: { type: String, trim: true, maxlength: 60 },
    location: { type: pointSchema, default: undefined },

    /**
     * Shown to a farmer choosing who to book. Only meaningful on an expert account; a farmer
     * picking a stranger to advise on their crop deserves to see what that person is qualified
     * in, not just a name.
     */
    expertProfile: {
      qualification: { type: String, trim: true, maxlength: 120 },
      designation: { type: String, trim: true, maxlength: 120 },
      organisation: { type: String, trim: true, maxlength: 120 },
      experienceYears: { type: Number, min: 0, max: 60 },
      // Crop keys this expert works with; empty means all supported crops.
      crops: { type: [String], default: [] },
      languages: { type: [String], default: [] },
      // Which of call / chat / visit they offer.
      modes: { type: [String], default: [] },
      bio: { type: String, trim: true, maxlength: 600 },
    },
    // Bumping this invalidates every refresh token issued to the user (logout everywhere).
    tokenVersion: { type: Number, default: 0, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      ...toJSONOptions,
      transform(doc, ret) {
        toJSONOptions.transform(doc, ret);
        delete ret.passwordHash;
        delete ret.tokenVersion;
        return ret;
      },
    },
  },
);

userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, 12);
};

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

export const User = mongoose.models.User ?? mongoose.model('User', userSchema);
