import { Router } from 'express';
import { z } from 'zod';
import { idParams, objectId, validate } from '../middleware/validate.js';
import { Disease, Plot, Scan, TREATMENT_TYPES, Treatment } from '../models/index.js';
import { evaluateTreatment, safeHarvestDate } from '../services/progression.js';
import { notFound, unprocessable } from '../utils/httpError.js';

// Mounted under /api/plots/:plotId/treatments, behind requireAuth.
const router = Router({ mergeParams: true });

const plotParams = z.object({ plotId: objectId });

const createBody = z.object({
  type: z.enum(TREATMENT_TYPES),
  product: z.string().trim().min(1).max(120),
  activeIngredient: z.string().trim().max(120).optional(),
  dose: z.string().trim().max(120).optional(),
  diseaseKey: z.string().trim().toLowerCase().max(80).nullable().optional(),
  appliedAt: z.coerce
    .date()
    .refine((d) => d.getTime() <= Date.now() + 864e5, { error: 'Application date cannot be in the future' }),
  phiDays: z.coerce.number().int().min(0).max(365).nullable().optional(),
  notes: z.string().max(1000).optional(),
});

async function ownedPlot(req) {
  const plot = await Plot.findOne({ _id: req.params.plotId, owner: req.auth.userId });
  if (!plot) throw notFound('Plot not found');
  return plot;
}

/** Treatments with efficacy and safe-to-harvest dates, newest first. */
export async function treatmentsWithEfficacy(plotId) {
  const [treatments, scans] = await Promise.all([
    Treatment.find({ plot: plotId }).sort({ appliedAt: -1 }).lean(),
    Scan.find({ plot: plotId, status: { $ne: 'rejected' }, 'severity.reliable': true })
      .select('createdAt diseaseKey isHealthy severity review')
      .lean(),
  ]);
  // Expert corrections override the model's disease key.
  const effective = scans.map((s) => ({
    ...s,
    id: String(s._id),
    diseaseKey: s.review?.status === 'corrected' ? s.review.correctedDiseaseKey : s.diseaseKey,
  }));
  const now = new Date();
  const items = treatments.map(({ _id, __v, ...t }) => ({ id: String(_id), ...t, efficacy: evaluateTreatment(t, effective, now) }));
  const safeFrom = safeHarvestDate(treatments);
  return {
    items,
    safeHarvestFrom: safeFrom,
    safeToHarvestNow: safeFrom ? now >= safeFrom : true,
  };
}

router.get('/', validate({ params: plotParams }), async (req, res) => {
  const plot = await ownedPlot(req);
  res.json(await treatmentsWithEfficacy(plot._id));
});

router.post('/', validate({ params: plotParams, body: createBody }), async (req, res) => {
  const plot = await ownedPlot(req);
  const body = req.valid.body;
  if (body.diseaseKey) {
    const disease = await Disease.findOne({ key: body.diseaseKey }).select('crop');
    if (!disease || disease.crop !== plot.crop) {
      throw unprocessable('Unknown disease', { diseaseKey: [`Not a ${plot.crop} disease`] });
    }
  }
  const treatment = await Treatment.create({ ...body, owner: req.auth.userId, plot: plot._id });
  res.status(201).json({ treatment });
});

router.delete('/:id', validate({ params: plotParams.extend(idParams.shape) }), async (req, res) => {
  const plot = await ownedPlot(req);
  const result = await Treatment.deleteOne({ _id: req.valid.params.id, plot: plot._id });
  if (!result.deletedCount) throw notFound('Treatment not found');
  res.status(204).end();
});

export default router;
