import { Router } from 'express';
import { z } from 'zod';
import { blockUnverifiedExperts, requireAuth, requireRole } from '../middleware/auth.js';
import { cropKey, idParams, validate } from '../middleware/validate.js';
import { Disease, Scan } from '../models/index.js';
import { fromPoint } from '../utils/geo.js';
import { conflict, notFound, unprocessable } from '../utils/httpError.js';

const router = Router();
// Farmers' photos and the model's answers about them: verified experts and admins only.
router.use(requireAuth, requireRole('expert', 'admin'), blockUnverifiedExperts);

const queueQuery = z.object({
  status: z.enum(['pending', 'confirmed', 'corrected']).default('pending'),
  crop: cropKey.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

router.get('/queue', validate({ query: queueQuery }), async (req, res) => {
  const { status, crop, page, limit } = req.valid.query;
  const filter = { 'review.status': status };
  if (crop) filter.crop = crop;

  const [items, total] = await Promise.all([
    Scan.find(filter)
      // Pending: oldest first, so nobody waits forever. Reviewed: most recent first.
      .sort({ createdAt: status === 'pending' ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('owner', 'name district state')
      .populate('plot', 'name crop variety sowingDate')
      .populate('review.reviewer', 'name'),
    Scan.countDocuments(filter),
  ]);

  res.json({
    items: items.map((s) => ({ ...s.toJSON(), location: fromPoint(s.location) })),
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
});

const decisionBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('confirm'), note: z.string().max(1000).optional() }),
  z.object({
    action: z.literal('correct'),
    diseaseKey: z.string().trim().toLowerCase().min(1).max(80),
    note: z.string().max(1000).optional(),
  }),
]);

// Settling a label is an expert's judgement, and it becomes the field-accuracy record, so an
// admin can watch the queue but only a verified expert can rule on it.
router.post('/:id', requireRole('expert'), validate({ params: idParams, body: decisionBody }), async (req, res) => {
  const scan = await Scan.findById(req.valid.params.id);
  if (!scan) throw notFound('Scan not found');
  if (scan.review.status === 'confirmed' || scan.review.status === 'corrected') {
    throw conflict('This scan has already been reviewed.');
  }

  const body = req.valid.body;
  if (body.action === 'confirm' && !scan.diseaseKey) {
    throw unprocessable('Nothing to confirm: the model gave no diagnosis. Use "correct" instead.');
  }
  if (body.action === 'correct') {
    const disease = await Disease.findOne({ key: body.diseaseKey }).select('key crop');
    if (!disease) throw unprocessable('Unknown disease', { diseaseKey: ['No disease with that key'] });
  }

  // The model's original output is never overwritten, so field accuracy can be measured later.
  scan.review = {
    status: body.action === 'confirm' ? 'confirmed' : 'corrected',
    reviewer: req.auth.userId,
    correctedDiseaseKey: body.action === 'correct' ? body.diseaseKey : null,
    note: body.note,
    reviewedAt: new Date(),
  };
  await scan.save();
  res.json({ scan: scan.toJSON() });
});

/** How well the model agrees with experts on real field photos: the honest accuracy number. */
router.get('/metrics', async (_req, res) => {
  const [result] = await Scan.aggregate([
    { $match: { 'review.status': { $in: ['confirmed', 'corrected'] } } },
    {
      $facet: {
        overall: [{ $group: { _id: '$review.status', count: { $sum: 1 } } }],
        byCrop: [
          {
            $group: {
              _id: '$crop',
              reviewed: { $sum: 1 },
              confirmed: { $sum: { $cond: [{ $eq: ['$review.status', 'confirmed'] }, 1, 0] } },
            },
          },
          { $sort: { reviewed: -1 } },
        ],
        confusions: [
          { $match: { 'review.status': 'corrected' } },
          { $group: { _id: { predicted: '$diseaseKey', actual: '$review.correctedDiseaseKey' }, count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 15 },
        ],
      },
    },
  ]);

  const overall = Object.fromEntries(result.overall.map((o) => [o._id, o.count]));
  const reviewed = (overall.confirmed ?? 0) + (overall.corrected ?? 0);
  res.json({
    reviewed,
    confirmed: overall.confirmed ?? 0,
    corrected: overall.corrected ?? 0,
    agreementRate: reviewed ? (overall.confirmed ?? 0) / reviewed : null,
    pending: await Scan.countDocuments({ 'review.status': 'pending' }),
    byCrop: result.byCrop.map((c) => ({
      crop: c._id,
      reviewed: c.reviewed,
      confirmed: c.confirmed,
      agreementRate: c.reviewed ? c.confirmed / c.reviewed : null,
    })),
    confusions: result.confusions.map((c) => ({ predicted: c._id.predicted, actual: c._id.actual, count: c.count })),
  });
});

export default router;
