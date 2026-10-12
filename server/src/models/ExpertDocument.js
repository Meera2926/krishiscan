import mongoose from 'mongoose';

/**
 * The certificate an expert applied with.
 *
 * Kept in the database rather than in storage, because storage is public: a local upload is served
 * from /uploads and a Cloudinary one from a public URL, and a degree certificate carries a name,
 * a registration number and sometimes a photograph. Here it can only be read through an endpoint
 * that checks who is asking. One per expert; sending a new one replaces it.
 */
const expertDocumentSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    contentType: { type: String, required: true },
    width: Number,
    height: Number,
    bytes: Number,
    data: { type: Buffer, required: true, select: false },
  },
  { timestamps: true },
);

export const ExpertDocument =
  mongoose.models.ExpertDocument ?? mongoose.model('ExpertDocument', expertDocumentSchema);
