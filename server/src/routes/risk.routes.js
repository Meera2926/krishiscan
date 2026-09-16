import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { idParams, validate } from '../middleware/validate.js';
import { Disease, Plot } from '../models/index.js';
import { assessRisk, supportedRiskCrops } from '../services/risk/engine.js';
import { getDailyWeather } from '../services/weather.js';
import { fromPoint, latitude, longitude } from '../utils/geo.js';
import { notFound } from '../utils/httpError.js';

const router = Router();

async function buildReport({ lat, lng, crop }) {
  const weather = await getDailyWeather(lat, lng);
  const risk = assessRisk(crop, weather.days);
  const diseases = await Disease.find({ key: { $in: risk.assessments.map((a) => a.diseaseKey) } })
    .select('key commonName names severity preventive organicControl')
    .lean();
  const byKey = Object.fromEntries(diseases.map((d) => [d.key, d]));

  return {
    location: { lat, lng },
    weather,
    ...risk,
    assessments: risk.assessments.map((a) => {
      const d = byKey[a.diseaseKey];
      return {
        ...a,
        commonName: d?.commonName ?? a.diseaseKey,
        names: d?.names ?? {},
        severity: d?.severity ?? null,
        // Preventive advice is what matters before symptoms appear.
        preventive: a.level === 'low' ? [] : (d?.preventive ?? []).slice(0, 4),
      };
    }),
    supported: supportedRiskCrops().includes(crop),
    disclaimer:
      'Weather-based risk is an early warning, not a diagnosis. Scout your field and confirm symptoms before spraying.',
  };
}

router.get('/crops', (_req, res) => {
  res.json({ crops: supportedRiskCrops() });
});

const pointQuery = z.object({
  lat: latitude,
  lng: longitude,
  crop: z.string().trim().toLowerCase().min(1).max(40),
});

router.get('/', validate({ query: pointQuery }), async (req, res) => {
  res.json(await buildReport(req.valid.query));
});

router.get('/plots/:id', requireAuth, validate({ params: idParams }), async (req, res) => {
  const plot = await Plot.findOne({ _id: req.valid.params.id, owner: req.auth.userId });
  if (!plot) throw notFound('Plot not found');
  const { lat, lng } = fromPoint(plot.location);
  res.json({ plot: { id: plot.id, name: plot.name, crop: plot.crop }, ...(await buildReport({ lat, lng, crop: plot.crop })) });
});

export default router;
