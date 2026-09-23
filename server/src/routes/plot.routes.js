import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { cropKey, idParams, validate } from '../middleware/validate.js';
import { Crop, Disease, Plot, Scan, Treatment } from '../models/index.js';
import { summariseProgression } from '../services/progression.js';
import treatmentRoutes, { treatmentsWithEfficacy } from './treatment.routes.js';
import { fromPoint, latitude, longitude, toPoint } from '../utils/geo.js';
import { notFound, unprocessable } from '../utils/httpError.js';

const router = Router();
router.use(requireAuth);

const plotFields = {
  name: z.string().trim().min(1).max(80),
  crop: cropKey.refine(Boolean, 'Choose a crop'),
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
  await Treatment.deleteMany({ plot: plot._id });
  await plot.deleteOne();
  res.status(204).end();
});

/**
 * Disease progression for one plot: a severity timeline and trend for the plot as a whole and
 * for each disease seen on it, plus the treatment log with efficacy checks.
 */
router.get('/:id/progression', validate({ params: idParams }), async (req, res) => {
  const plot = await findOwnedPlot(req);
  const scans = await Scan.find({ plot: plot._id, status: { $ne: 'rejected' } })
    .sort({ createdAt: 1 })
    .select('createdAt diseaseKey isHealthy status severity review image.url');

  const points = scans.map((s) => ({
    scanId: s.id,
    date: s.createdAt,
    percent: s.severity?.reliable ? s.severity.percent : null,
    grade: s.severity?.reliable ? s.severity.grade : null,
    diseaseKey: s.effectiveDiseaseKey,
    isHealthy: s.review?.status === 'corrected' ? s.review.correctedDiseaseKey?.endsWith('_healthy') : s.isHealthy,
    status: s.status,
    imageUrl: s.image.url,
  }));

  const diseaseKeys = [...new Set(points.filter((p) => p.diseaseKey && !p.isHealthy).map((p) => p.diseaseKey))];
  const diseases = await Disease.find({ key: { $in: diseaseKeys } }).select('key commonName names severity').lean();
  const byKey = Object.fromEntries(diseases.map((d) => [d.key, d]));

  res.json({
    plot: { id: plot.id, name: plot.name, crop: plot.crop },
    overall: { points, summary: summariseProgression(points) },
    byDisease: diseaseKeys.map((key) => {
      const own = points.filter((p) => p.diseaseKey === key);
      return {
        diseaseKey: key,
        commonName: byKey[key]?.commonName ?? key,
        names: byKey[key]?.names ?? {},
        severity: byKey[key]?.severity ?? null,
        points: own,
        summary: summariseProgression(own),
      };
    }),
    treatments: await treatmentsWithEfficacy(plot._id),
  });
});

router.use('/:plotId/treatments', treatmentRoutes);

export default router;
