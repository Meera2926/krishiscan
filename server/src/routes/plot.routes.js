import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { idParams, validate } from '../middleware/validate.js';
import { Crop, Plot, Scan } from '../models/index.js';
import { fromPoint, latitude, longitude, toPoint } from '../utils/geo.js';
import { notFound, unprocessable } from '../utils/httpError.js';

const router = Router();
router.use(requireAuth);

const plotFields = {
  name: z.string().trim().min(1).max(80),
  crop: z.string().trim().toLowerCase().min(1).max(40),
  variety: z.string().trim().max(80).optional(),
  sowingDate: z.coerce
    .date()
    .refine((d) => d.getTime() <= Date.now() + 365 * 864e5, { error: 'Sowing date is too far in the future' })
    .optional(),
  areaAcres: z.coerce.number().min(0).max(100_000).optional(),
  lat: latitude,
  lng: longitude,
  state: z.string().trim().max(60).optional(),
  district: z.string().trim().max(60).optional(),
  notes: z.string().max(2000).optional(),
};

const createBody = z.object(plotFields);
const updateBody = z
  .object(plotFields)
  .partial()
  .refine((b) => (b.lat === undefined) === (b.lng === undefined), {
    error: 'lat and lng must be provided together',
    path: ['lat'],
  });

async function assertKnownCrop(crop) {
  if (crop && !(await Crop.exists({ key: crop }))) {
    throw unprocessable('Unknown crop', { crop: [`"${crop}" is not a supported crop`] });
  }
}

function serialise(plot) {
  const json = plot.toJSON();
  return { ...json, ...fromPoint(plot.location) };
}

async function findOwnedPlot(req) {
  const plot = await Plot.findOne({ _id: req.valid.params.id, owner: req.auth.userId });
  if (!plot) throw notFound('Plot not found');
  return plot;
}

router.get('/', async (req, res) => {
  const plots = await Plot.find({ owner: req.auth.userId }).sort({ createdAt: -1 });

  // One aggregation for scan counts and last-scan dates across all plots.
  const stats = await Scan.aggregate([
    { $match: { plot: { $in: plots.map((p) => p._id) } } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: '$plot',
        scanCount: { $sum: 1 },
        lastScanAt: { $first: '$createdAt' },
        lastDiseaseKey: { $first: '$diseaseKey' },
        lastIsHealthy: { $first: '$isHealthy' },
      },
    },
  ]);
  const byPlot = new Map(stats.map((s) => [s._id.toString(), s]));

  res.json({
    plots: plots.map((p) => {
      const s = byPlot.get(p.id);
      return {
        ...serialise(p),
        scanCount: s?.scanCount ?? 0,
        lastScanAt: s?.lastScanAt ?? null,
        lastDiseaseKey: s?.lastDiseaseKey ?? null,
        lastIsHealthy: s?.lastIsHealthy ?? null,
      };
    }),
  });
});

router.post('/', validate({ body: createBody }), async (req, res) => {
  const { lat, lng, ...fields } = req.valid.body;
  await assertKnownCrop(fields.crop);
  const plot = await Plot.create({ ...fields, owner: req.auth.userId, location: toPoint(lat, lng) });
  res.status(201).json({ plot: serialise(plot) });
});

router.get('/:id', validate({ params: idParams }), async (req, res) => {
  const plot = await findOwnedPlot(req);
  res.json({ plot: serialise(plot) });
});

router.patch('/:id', validate({ params: idParams, body: updateBody }), async (req, res) => {
  const plot = await findOwnedPlot(req);
  const { lat, lng, ...fields } = req.valid.body;
  await assertKnownCrop(fields.crop);
  plot.set(fields);
  if (lat !== undefined) plot.location = toPoint(lat, lng);
  await plot.save();
  res.json({ plot: serialise(plot) });
});

router.delete('/:id', validate({ params: idParams }), async (req, res) => {
  const plot = await findOwnedPlot(req);
  // Keep the scans (they are the farmer's history) but detach them from the deleted plot.
  await Scan.updateMany({ plot: plot._id }, { $set: { plot: null } });
  await plot.deleteOne();
  res.status(204).end();
});

export default router;
