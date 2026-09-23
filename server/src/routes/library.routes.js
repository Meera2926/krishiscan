import { Router } from 'express';
import { z } from 'zod';
import { cropKey, validate } from '../middleware/validate.js';
import { Crop, Disease } from '../models/index.js';
import { notFound } from '../utils/httpError.js';

const router = Router();

const LIBRARY_CACHE = 'public, max-age=300';

router.get('/crops', async (_req, res) => {
  const crops = await Crop.find().sort({ name: 1 });
  const counts = await Disease.aggregate([
    { $match: { isHealthy: false } },
    { $group: { _id: '$crop', diseaseCount: { $sum: 1 } } },
  ]);
  const byCrop = new Map(counts.map((c) => [c._id, c.diseaseCount]));
  res.set('Cache-Control', LIBRARY_CACHE);
  res.json({
    crops: crops.map((c) => ({ ...c.toJSON(), diseaseCount: byCrop.get(c.key) ?? 0 })),
  });
});

const listQuery = z.object({
  crop: cropKey.optional(),
  q: z.string().trim().max(80).optional(),
  includeHealthy: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/diseases', validate({ query: listQuery }), async (req, res) => {
  const { crop, q, includeHealthy } = req.valid.query;
  const filter = {};
  if (crop) filter.crop = crop;
  if (!includeHealthy) filter.isHealthy = false;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ commonName: rx }, { pathogen: rx }, { symptoms: rx }, { key: rx }];
  }
  const diseases = await Disease.find(filter)
    .select('key crop commonName names causalAgentType pathogen severity isHealthy')
    .sort({ crop: 1, commonName: 1 });
  res.set('Cache-Control', LIBRARY_CACHE);
  res.json({ diseases });
});

const keyParams = z.object({ key: z.string().trim().toLowerCase().regex(/^[a-z0-9_]+$/) });

router.get('/diseases/:key', validate({ params: keyParams }), async (req, res) => {
  const disease = await Disease.findOne({ key: req.valid.params.key });
  if (!disease) throw notFound('Disease not found');
  res.set('Cache-Control', LIBRARY_CACHE);
  res.json({ disease });
});

export default router;
