import { Router } from 'express';
import { z } from 'zod';
import { blockUnverifiedExperts, requireAdmin, requireAuth, requireRole } from '../middleware/auth.js';
import { uploadCertificate } from '../middleware/upload.js';
import { idParams, validate } from '../middleware/validate.js';
import { EXPERT_STATUSES } from '../models/expertOptions.js';
import { ExpertDocument, User } from '../models/index.js';
import {
  DECISIONS,
  buildExpertProfile,
  credentialsBody,
  expertOptions,
  prepareCertificate,
  publicExpertProfile,
  ratingDetail,
  releaseOpenCases,
} from '../services/experts.js';
import { badRequest, conflict, notFound, unprocessable } from '../utils/httpError.js';

const router = Router();

// The application form needs the degree list before the applicant has an account.
router.get('/options', (_req, res) => {
  res.json(expertOptions());
});

router.use(requireAuth);

/** One entry on the admin's desk. The certificate itself is fetched separately, on demand. */
function applicationItem(user, hasDocument) {
  const v = user.expertVerification ?? {};
  const decidedBy = v.decidedBy?._id ? { id: String(v.decidedBy._id), name: v.decidedBy.name } : null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    state: user.state ?? null,
    district: user.district ?? null,
    createdAt: user.createdAt,
    expertProfile: user.toJSON().expertProfile ?? {},
    expertVerification: {
      status: v.status ?? null,
      submittedAt: v.submittedAt ?? null,
      decidedAt: v.decidedAt ?? null,
      note: v.note ?? null,
      decidedBy,
    },
    hasDocument,
  };
}

// ---------------------------------------------------------------------------------------------
// The applicant's own application
// ---------------------------------------------------------------------------------------------

router.get('/me/application', requireRole('expert'), async (req, res) => {
  const user = await User.findById(req.auth.userId);
  if (!user) throw notFound('User not found');
  const doc = await ExpertDocument.findOne({ owner: user._id }).select('updatedAt').lean();
  const json = user.toJSON();
  res.json({
    application: {
      expertProfile: json.expertProfile ?? {},
      expertVerification: json.expertVerification ?? {},
      hasDocument: Boolean(doc),
      documentUploadedAt: doc?.updatedAt ?? null,
    },
  });
});

/**
 * Correcting an application, while it waits or after it was turned down. It goes back to the
 * queue as new. A verified expert cannot rewrite the credentials that were checked, and a
 * suspended one cannot talk their way back in through a form.
 */
router.put('/me/application', requireRole('expert'), uploadCertificate, validate({ body: credentialsBody }), async (req, res) => {
  const user = await User.findById(req.auth.userId);
  if (!user) throw notFound('User not found');
  const status = user.expertVerification?.status;
  if (status === 'verified') throw conflict('Your account is already verified.');
  if (status !== 'pending' && status !== 'rejected') {
    throw conflict('This account is suspended, so the application cannot be changed. Please contact the KrishiScan team.');
  }

  const expertProfile = await buildExpertProfile(req.valid.body);
  const certificate = req.file ? await prepareCertificate(req.file.buffer) : null;
  if (!certificate && !(await ExpertDocument.exists({ owner: user._id }))) {
    throw badRequest('Attach a photo or scan of your degree certificate in the "document" field.');
  }
  if (certificate) {
    await ExpertDocument.updateOne({ owner: user._id }, { $set: certificate }, { upsert: true });
  }

  user.expertProfile = expertProfile;
  // A fresh submission: the earlier decision and its reason no longer describe this application.
  user.expertVerification = { status: 'pending', submittedAt: new Date() };
  await user.save();
  res.json({ user });
});

// ---------------------------------------------------------------------------------------------
// The admin's desk
// ---------------------------------------------------------------------------------------------

const applicationsQuery = z.object({
  status: z.enum(EXPERT_STATUSES).default('pending'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

router.get('/applications', requireAdmin, validate({ query: applicationsQuery }), async (req, res) => {
  const { status, page, limit } = req.valid.query;
  const filter = { role: 'expert', 'expertVerification.status': status };

  const [experts, total, byStatus] = await Promise.all([
    User.find(filter)
      // Waiting longest first; decided ones newest first.
      .sort(status === 'pending' ? { 'expertVerification.submittedAt': 1 } : { 'expertVerification.decidedAt': -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('expertVerification.decidedBy', 'name'),
    User.countDocuments(filter),
    User.aggregate([{ $match: { role: 'expert' } }, { $group: { _id: '$expertVerification.status', count: { $sum: 1 } } }]),
  ]);

  const withDocument = new Set(
    (await ExpertDocument.find({ owner: { $in: experts.map((e) => e._id) } }).select('owner').lean()).map((d) => String(d.owner)),
  );
  const counts = Object.fromEntries(EXPERT_STATUSES.map((s) => [s, 0]));
  for (const row of byStatus) if (row._id in counts) counts[row._id] = row.count;

  res.json({
    items: experts.map((e) => applicationItem(e, withDocument.has(String(e._id)))),
    counts,
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
});

const decisionBody = z.object({
  decision: z.enum(Object.keys(DECISIONS)),
  note: z.string().trim().max(500).optional(),
  // When the application the admin was looking at was sent. If the applicant has sent a new one
  // since, the decision is about something the admin has not seen, and is refused.
  submittedAt: z.coerce.date().optional(),
});

router.post('/:id/verification', requireAdmin, validate({ params: idParams, body: decisionBody }), async (req, res) => {
  const { decision, note } = req.valid.body;
  const rule = DECISIONS[decision];
  // Someone turned down or stopped is owed a reason they can act on.
  if (rule.needsNote && (!note || note.length < 5)) {
    throw unprocessable('A reason is needed', { note: ['Give the reason in a sentence the expert can act on.'] });
  }

  const expert = await User.findOne({ _id: req.valid.params.id, role: 'expert' });
  if (!expert) throw notFound('Expert not found');
  const from = expert.expertVerification?.status;
  if (!rule.from.includes(from)) {
    throw conflict(`An application that is ${from ?? 'not submitted'} cannot be given "${decision}".`);
  }
  const seen = req.valid.body.submittedAt?.getTime();
  if (seen !== undefined && seen !== expert.expertVerification?.submittedAt?.getTime()) {
    throw conflict('The applicant has changed the application since you opened it. Reload and check it again.');
  }

  expert.expertVerification = {
    status: rule.to,
    submittedAt: expert.expertVerification?.submittedAt,
    decidedAt: new Date(),
    decidedBy: req.auth.userId,
    note: note || undefined,
  };
  await expert.save();
  const released = decision === 'suspend' ? await releaseOpenCases(expert._id) : 0;

  await expert.populate('expertVerification.decidedBy', 'name');
  const hasDocument = Boolean(await ExpertDocument.exists({ owner: expert._id }));
  res.json({ expert: applicationItem(expert, hasDocument), released });
});

/**
 * The certificate, to the admin deciding on it and to the expert who sent it, and to nobody else:
 * not other experts, and not farmers. Never cached, since it is somebody's identity document.
 */
router.get('/:id/document', validate({ params: idParams }), async (req, res) => {
  const own = req.valid.params.id === req.auth.userId;
  const admin = !own && req.auth.role === 'admin' && (await User.exists({ _id: req.auth.userId, role: 'admin' }));
  // Same 404 as a missing certificate, so the endpoint does not reveal who has applied.
  if (!own && !admin) throw notFound('Certificate not found');

  const doc = await ExpertDocument.findOne({ owner: req.valid.params.id }).select('+data contentType');
  if (!doc) throw notFound('Certificate not found');
  res.set({
    'Content-Type': doc.contentType,
    'Cache-Control': 'private, no-store',
    'Content-Disposition': 'inline; filename="certificate.jpg"',
  });
  res.send(doc.data);
});

// ---------------------------------------------------------------------------------------------
// What farmers see
// ---------------------------------------------------------------------------------------------

/** A verified expert's background and what farmers they advised have said about them. */
router.get('/:id', blockUnverifiedExperts, validate({ params: idParams }), async (req, res) => {
  const expert = await User.findOne({ _id: req.valid.params.id, role: 'expert', 'expertVerification.status': 'verified' })
    .select('name state district expertProfile expertVerification.decidedAt')
    .lean();
  if (!expert) throw notFound('Expert not found');

  const { rating, reviews } = await ratingDetail(expert._id);
  res.json({
    expert: {
      id: String(expert._id),
      name: expert.name,
      state: expert.state ?? null,
      district: expert.district ?? null,
      ...publicExpertProfile(expert.expertProfile),
      verified: true,
      verifiedSince: expert.expertVerification?.decidedAt ?? null,
      rating,
      reviews,
    },
  });
});

export default router;
