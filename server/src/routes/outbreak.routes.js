import { Router } from 'express';
import { z } from 'zod';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { Plot, Scan } from '../models/index.js';
import { latitude, longitude, toPoint } from '../utils/geo.js';

const router = Router();

// Public cells are snapped to a ~5.5 km grid so no individual farm can be located.
export const GRID_DEGREES = 0.05;
// Plot alerts use a tighter radius: disease pressure within a few km is what matters.
const ALERT_RADIUS_KM = 10;
const ALERT_DAYS = 14;

/** Scans that count as evidence: shared, and either confidently classified or expert-verified. */
const evidenceFilter = (since, extra = {}) => ({
  shareLocation: true,
  createdAt: { $gte: since },
  $or: [{ status: 'confident' }, { 'review.status': { $in: ['confirmed', 'corrected'] } }],
  ...extra,
});

const effectiveKey = {
  $cond: [{ $eq: ['$review.status', 'corrected'] }, '$review.correctedDiseaseKey', '$diseaseKey'],
};

const snap = (axis) => ({
  $add: [
    { $multiply: [{ $floor: { $divide: [{ $arrayElemAt: ['$location.coordinates', axis] }, GRID_DEGREES] } }, GRID_DEGREES] },
    GRID_DEGREES / 2,
  ],
});

/** Joins disease metadata and drops anything an expert corrected to "healthy". */
const joinDisease = [
  { $lookup: { from: 'diseases', localField: '_id.diseaseKey', foreignField: 'key', as: 'disease' } },
  { $unwind: '$disease' },
  { $match: { 'disease.isHealthy': false } },
];

const mapQuery = z.object({
  lat: latitude,
  lng: longitude,
  radiusKm: z.coerce.number().min(1).max(300).default(100),
  days: z.coerce.number().int().min(1).max(90).default(30),
  crop: z.string().trim().toLowerCase().max(40).optional(),
});

router.get('/map', optionalAuth, validate({ query: mapQuery }), async (req, res) => {
  const { lat, lng, radiusKm, days, crop } = req.valid.query;
  const since = new Date(Date.now() - days * 864e5);

  const cells = await Scan.aggregate([
    {
      // $geoNear must be the first stage and uses the 2dsphere index.
      $geoNear: {
        near: toPoint(lat, lng),
        distanceField: 'distanceM',
        maxDistance: radiusKm * 1000,
        spherical: true,
        query: evidenceFilter(since, crop ? { crop } : {}),
      },
    },
    { $project: { diseaseKey: effectiveKey, createdAt: 1, cellLng: snap(0), cellLat: snap(1) } },
    { $match: { diseaseKey: { $ne: null } } },
    {
      $group: {
        _id: { lat: '$cellLat', lng: '$cellLng', diseaseKey: '$diseaseKey' },
        count: { $sum: 1 },
        lastSeen: { $max: '$createdAt' },
        firstSeen: { $min: '$createdAt' },
      },
    },
    ...joinDisease,
    { $sort: { count: -1 } },
    { $limit: 500 },
  ]);

  const totals = new Map();
  for (const c of cells) {
    const t = totals.get(c._id.diseaseKey) ?? { diseaseKey: c._id.diseaseKey, commonName: c.disease.commonName, crop: c.disease.crop, severity: c.disease.severity, reports: 0, cells: 0 };
    t.reports += c.count;
    t.cells += 1;
    totals.set(c._id.diseaseKey, t);
  }

  res.set('Cache-Control', 'public, max-age=120');
  res.json({
    center: { lat, lng },
    radiusKm,
    days,
    gridDegrees: GRID_DEGREES,
    cells: cells.map((c) => ({
      lat: round(c._id.lat),
      lng: round(c._id.lng),
      diseaseKey: c._id.diseaseKey,
      commonName: c.disease.commonName,
      crop: c.disease.crop,
      severity: c.disease.severity,
      count: c.count,
      firstSeen: c.firstSeen,
      lastSeen: c.lastSeen,
    })),
    diseases: [...totals.values()].sort((a, b) => b.reports - a.reports),
  });
});

router.get('/alerts', requireAuth, async (req, res) => {
  const plots = await Plot.find({ owner: req.auth.userId }).lean();
  const since = new Date(Date.now() - ALERT_DAYS * 864e5);

  const alerts = await Promise.all(
    plots.map(async (plot) => {
      const nearby = await Scan.aggregate([
        {
          $geoNear: {
            near: plot.location,
            distanceField: 'distanceM',
            maxDistance: ALERT_RADIUS_KM * 1000,
            spherical: true,
            // Other farmers' reports only, for the same crop.
            query: evidenceFilter(since, { crop: plot.crop, owner: { $ne: plot.owner } }),
          },
        },
        { $project: { diseaseKey: effectiveKey, createdAt: 1, distanceM: 1 } },
        { $match: { diseaseKey: { $ne: null } } },
        {
          $group: {
            _id: { diseaseKey: '$diseaseKey' },
            count: { $sum: 1 },
            nearestKm: { $min: { $divide: ['$distanceM', 1000] } },
            lastSeen: { $max: '$createdAt' },
          },
        },
        ...joinDisease,
        { $sort: { count: -1 } },
      ]);

      return {
        plotId: String(plot._id),
        plotName: plot.name,
        crop: plot.crop,
        radiusKm: ALERT_RADIUS_KM,
        days: ALERT_DAYS,
        outbreaks: nearby.map((n) => ({
          diseaseKey: n._id.diseaseKey,
          commonName: n.disease.commonName,
          severity: n.disease.severity,
          reports: n.count,
          // Rounded up to whole km so an alert never reveals a neighbour's exact distance.
          nearestKm: Math.max(1, Math.ceil(n.nearestKm)),
          lastSeen: n.lastSeen,
        })),
      };
    }),
  );

  res.json({ alerts: alerts.filter((a) => a.outbreaks.length > 0) });
});

const round = (n) => Math.round(n * 1000) / 1000;

export default router;
