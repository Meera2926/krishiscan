import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { config } from '../config/env.js';
import { isVerifiedExpert, requireAuth } from '../middleware/auth.js';
import { uploadImage } from '../middleware/upload.js';
import { cropKey, idParams, objectId, validate } from '../middleware/validate.js';
import { Consultation, Disease, Plot, SCAN_STATUS, Scan } from '../models/index.js';
import { offerConsultation } from '../services/consultationOffers.js';
import { diagnose } from '../services/diagnosis.js';
import { followUpPlan } from '../services/followUp.js';
import { organicRemedies } from '../services/remedies.js';
import { prepareImage } from '../services/imageQuality.js';
import { estimateSeverity } from '../services/severity.js';
import {
  CROP_MATCH_FLOOR,
  CROP_MATCH_MARGIN,
  GATE_MODEL_CROPS,
  SINGLE_MODEL_CROPS,
  SUPPORTED_CROPS,
} from '../services/inference/catalog.js';
import { classify } from '../services/inference/index.js';
import { getLabelIndex } from '../services/labelIndex.js';
import { storage } from '../services/storage/index.js';
import { fromPoint, latitude, longitude, toPoint } from '../utils/geo.js';
import { badRequest, forbidden, notFound, unprocessable } from '../utils/httpError.js';

const router = Router();
router.use(requireAuth);

// Multipart fields arrive as strings.
const formBool = z
  .enum(['true', 'false', 'on', '1', '0'])
  .transform((v) => v === 'true' || v === 'on' || v === '1');

const createBody = z
  .object({
    plotId: objectId.optional(),
    // The scan being re-photographed, when the farmer chose "scan again" on a result.
    followUpOf: objectId.optional(),
    crop: cropKey.optional(),
    lat: latitude.optional(),
    lng: longitude.optional(),
    shareLocation: formBool.optional(),
  })
  .refine((b) => (b.lat === undefined) === (b.lng === undefined), {
    error: 'lat and lng must be provided together',
    path: ['lat'],
  });

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  plotId: objectId.optional(),
  status: z.enum(SCAN_STATUS).optional(),
  diseaseKey: z.string().trim().toLowerCase().max(80).optional(),
});

const patchBody = z.object({
  shareLocation: z.boolean().optional(),
  plotId: objectId.nullable().optional(),
});

async function loadAdvisory(scan) {
  const key = scan.effectiveDiseaseKey;
  const keys = [...new Set([key, ...scan.predictions.map((p) => p.diseaseKey)].filter(Boolean))];
  const diseases = await Disease.find({ key: { $in: keys } }).lean({ virtuals: false });
  const byKey = Object.fromEntries(
    diseases.map((d) => {
      const { _id, __v, ...rest } = d;
      return [d.key, { id: String(_id), ...rest }];
    }),
  );
  const disease = key ? (byKey[key] ?? null) : null;
  return {
    disease,
    alternatives: byKey,
    // The safe treatments the knowledge base already recommends, with somewhere to buy them.
    remedies: disease ? organicRemedies(disease) : [],
    // Progression tracking needs a second photo, so the result always names the day to take it.
    followUp: scan.status === 'rejected' ? null : followUpPlan(disease, scan.severity, scan.createdAt),
  };
}

/** Severity change against the plot's previous reliable scan: the per-scan view of progression. */
const COMPARE_FIELDS = 'createdAt severity diseaseKey isHealthy review image.url status';

/**
 * How much of the leaf is affected now against before. A re-photograph of a named scan is compared
 * with that scan; otherwise a scan on a plot is compared with the plot's previous scan. Changes of
 * under 3 points are within what the colour estimate can tell apart, so they count as no change.
 */
async function compareWithPrevious(scan) {
  if (!scan.severity?.reliable) return null;
  let previous = null;
  let basis = null;
  if (scan.followUpOf) {
    previous = await Scan.findOne({ _id: scan.followUpOf, owner: scan.owner }).select(COMPARE_FIELDS);
    if (previous && (previous.status === 'rejected' || !previous.severity?.reliable)) previous = null;
    if (previous) basis = 'leaf';
  }
  const plotId = scan.plot?._id ?? scan.plot;
  if (!previous && plotId) {
    previous = await Scan.findOne({
      plot: plotId,
      _id: { $ne: scan._id },
      createdAt: { $lt: scan.createdAt },
      status: { $ne: 'rejected' },
      'severity.reliable': true,
    })
      .sort({ createdAt: -1 })
      .select(COMPARE_FIELDS);
    if (previous) basis = 'plot';
  }
  if (!previous) return null;
  const change = Math.round((scan.severity.percent - previous.severity.percent) * 10) / 10;
  return {
    basis,
    previousScanId: previous.id,
    previousDate: previous.createdAt,
    previousImageUrl: previous.image?.url ?? null,
    previousPercent: previous.severity.percent,
    currentPercent: scan.severity.percent,
    previousDiseaseKey: previous.effectiveDiseaseKey,
    change,
    direction: change >= 3 ? 'worse' : change <= -3 ? 'better' : 'same',
  };
}

function serialise(scan) {
  const json = scan.toJSON();
  json.location = fromPoint(scan.location);
  return json;
}

async function findVisibleScan(req) {
  const scan = await Scan.findById(req.valid.params.id).populate('plot', 'name crop');
  if (!scan) throw notFound('Scan not found');
  const isOwner = scan.owner.equals(req.auth.userId);
  // Another farmer's photo is visible to admins and to experts whose certificate was checked;
  // to an expert still waiting on verification it does not exist.
  const mayOversee = req.auth.role === 'admin' || (await isVerifiedExpert(req));
  if (!isOwner && !mayOversee) throw notFound('Scan not found');
  return { scan, isOwner };
}

router.post('/', uploadImage, validate({ body: createBody }), async (req, res) => {
  if (!req.file) throw badRequest('Attach a photo in the "image" field.');
  const body = req.valid.body;

  // A re-photograph belongs with the scan it follows: same farmer, same crop, same plot.
  let earlier = null;
  if (body.followUpOf) {
    earlier = await Scan.findOne({ _id: body.followUpOf, owner: req.auth.userId }).select('declaredCrop plot');
    if (!earlier) throw notFound('The scan to compare with was not found');
  }
  let plot = null;
  const plotId = body.plotId ?? earlier?.plot ?? null;
  if (plotId) {
    plot = await Plot.findOne({ _id: plotId, owner: req.auth.userId });
    if (!plot && body.plotId) throw notFound('Plot not found');
  }
  // The classifiers are routed by crop, and farmers know their crop, so it is required.
  const declaredCrop = body.crop || plot?.crop || earlier?.declaredCrop || null;
  if (earlier?.declaredCrop && declaredCrop !== earlier.declaredCrop) {
    throw unprocessable('Same crop needed', { crop: ['A re-photograph must be of the same crop as the scan it follows.'] });
  }
  if (!declaredCrop) {
    throw unprocessable('Choose the crop', { crop: ['Select which crop this leaf is from.'] });
  }
  if (!SUPPORTED_CROPS.includes(declaredCrop)) {
    throw unprocessable('Crop not supported', {
      crop: [`Photo diagnosis currently supports: ${SUPPORTED_CROPS.join(', ')}.`],
    });
  }
  const location = body.lat !== undefined ? toPoint(body.lat, body.lng) : plot?.location;

  // Validate and classify before persisting anything, so a failure leaves no orphaned image.
  const { stored, quality } = await prepareImage(req.file.buffer);
  const [{ predictions: raw, invalidProbability, modelVersion, inferenceMs }, severity] = await Promise.all([
    classify(stored.buffer, { crop: declaredCrop }),
    estimateSeverity(stored.buffer),
  ]);
  const result = diagnose(raw, {
    labelIndex: await getLabelIndex(),
    declaredCrop,
    invalidProbability,
    gateKnowsCrop: GATE_MODEL_CROPS.includes(declaredCrop),
    // Only the crops whose classifier knows every crop it serves get the hard crop gate.
    cropFloor: SINGLE_MODEL_CROPS.includes(declaredCrop) ? CROP_MATCH_FLOOR : null,
    cropMargin: CROP_MATCH_MARGIN,
    high: config.CONFIDENCE_HIGH,
  });

  const saved = await storage.put(stored.buffer, { extension: 'jpg' });
  let scan;
  try {
    scan = await Scan.create({
      owner: req.auth.userId,
      plot: plot?._id ?? null,
      followUpOf: earlier?._id ?? null,
      declaredCrop,
      image: {
        url: saved.url,
        storageKey: saved.storageKey,
        width: stored.width,
        height: stored.height,
        bytes: stored.bytes,
        format: stored.format,
      },
      quality,
      // A severity figure for a photo that is not a recognised leaf would only mislead.
      severity: result.status === 'rejected' ? undefined : severity,
      ...result,
      modelVersion,
      inferenceMs,
      location: location ?? undefined,
      shareLocation: Boolean(location && body.shareLocation),
      review: { status: result.status === 'uncertain' ? 'pending' : 'none' },
    });
  } catch (err) {
    await storage.remove(saved.storageKey).catch(() => {});
    throw err;
  }

  if (plot) await scan.populate('plot', 'name crop');
  const advisory = await loadAdvisory(scan);
  // When the app is not sure, offer the farmer a human expert rather than leaving them with a
  // hedge. The offer carries the case, so a booked chat does not start from a blank page.
  const consultation = await offerConsultation({
    trigger: 'uncertain_diagnosis',
    scan,
    plot,
    disease: advisory.disease,
  });
  res.status(201).json({
    scan: serialise(scan),
    ...advisory,
    comparison: await compareWithPrevious(scan),
    consultation: consultation ? consultation.toJSON() : null,
  });
});

router.get('/', validate({ query: listQuery }), async (req, res) => {
  const { page, limit, plotId, status, diseaseKey } = req.valid.query;
  const filter = { owner: req.auth.userId };
  if (plotId) filter.plot = plotId;
  if (status) filter.status = status;
  if (diseaseKey) filter.diseaseKey = diseaseKey;

  const [items, total] = await Promise.all([
    Scan.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('plot', 'name crop'),
    Scan.countDocuments(filter),
  ]);

  const keys = [...new Set(items.map((s) => s.effectiveDiseaseKey).filter(Boolean))];
  const names = await Disease.find({ key: { $in: keys } }).select('key commonName names severity').lean();
  const byKey = Object.fromEntries(names.map((d) => [d.key, { commonName: d.commonName, names: d.names, severity: d.severity }]));

  res.json({
    items: items.map((s) => ({ ...serialise(s), disease: byKey[s.effectiveDiseaseKey] ?? null })),
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
});

router.get('/summary', async (req, res) => {
  const owner = new mongoose.Types.ObjectId(req.auth.userId);
  const since = new Date(Date.now() - 30 * 864e5);

  const [facets] = await Scan.aggregate([
    { $match: { owner } },
    {
      $facet: {
        totals: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        healthy: [{ $match: { isHealthy: true } }, { $count: 'count' }],
        topDiseases: [
          { $match: { createdAt: { $gte: since }, isHealthy: false, diseaseKey: { $ne: null } } },
          { $group: { _id: '$diseaseKey', count: { $sum: 1 }, lastSeen: { $max: '$createdAt' } } },
          { $sort: { count: -1 } },
          { $limit: 5 },
        ],
        weekly: [
          { $match: { createdAt: { $gte: new Date(Date.now() - 12 * 7 * 864e5) } } },
          {
            $group: {
              _id: { $dateTrunc: { date: '$createdAt', unit: 'week', timezone: 'Asia/Kolkata' } },
              scans: { $sum: 1 },
              diseased: { $sum: { $cond: [{ $and: [{ $eq: ['$isHealthy', false] }, { $ne: ['$status', 'rejected'] }] }, 1, 0] } },
            },
          },
          { $sort: { _id: 1 } },
        ],
        pendingReview: [{ $match: { 'review.status': 'pending' } }, { $count: 'count' }],
      },
    },
  ]);

  const byStatus = Object.fromEntries(facets.totals.map((t) => [t._id, t.count]));
  const topKeys = facets.topDiseases.map((d) => d._id);
  const names = await Disease.find({ key: { $in: topKeys } }).select('key commonName crop severity').lean();
  const nameByKey = Object.fromEntries(names.map((d) => [d.key, d]));

  res.json({
    total: Object.values(byStatus).reduce((a, b) => a + b, 0),
    byStatus: { confident: 0, uncertain: 0, rejected: 0, ...byStatus },
    healthy: facets.healthy[0]?.count ?? 0,
    pendingReview: facets.pendingReview[0]?.count ?? 0,
    topDiseases: facets.topDiseases.map((d) => ({
      diseaseKey: d._id,
      count: d.count,
      lastSeen: d.lastSeen,
      commonName: nameByKey[d._id]?.commonName ?? d._id,
      crop: nameByKey[d._id]?.crop ?? null,
      severity: nameByKey[d._id]?.severity ?? null,
    })),
    weekly: facets.weekly.map((w) => ({ weekStart: w._id, scans: w.scans, diseased: w.diseased })),
  });
});

router.get('/:id', validate({ params: idParams }), async (req, res) => {
  const { scan } = await findVisibleScan(req);
  // The expert-review offer travels with the scan, so re-opening the result still shows it.
  const consultation = await Consultation.findOne({ scan: scan._id }).populate('expert', 'name');
  res.json({
    scan: serialise(scan),
    ...(await loadAdvisory(scan)),
    comparison: await compareWithPrevious(scan),
    consultation: consultation ? consultation.toJSON() : null,
  });
});

router.patch('/:id', validate({ params: idParams, body: patchBody }), async (req, res) => {
  const { scan, isOwner } = await findVisibleScan(req);
  if (!isOwner) throw forbidden();
  const { shareLocation, plotId } = req.valid.body;

  if (plotId !== undefined) {
    if (plotId === null) {
      scan.plot = null;
    } else {
      const plot = await Plot.findOne({ _id: plotId, owner: req.auth.userId });
      if (!plot) throw notFound('Plot not found');
      scan.plot = plot._id;
      scan.location ??= plot.location;
    }
  }
  if (shareLocation !== undefined) {
    if (shareLocation && !scan.location) throw badRequest('This scan has no location to share.');
    scan.shareLocation = shareLocation;
  }
  await scan.save();
  await scan.populate('plot', 'name crop');
  res.json({ scan: serialise(scan) });
});

router.delete('/:id', validate({ params: idParams }), async (req, res) => {
  const { scan, isOwner } = await findVisibleScan(req);
  if (!isOwner && req.auth.role !== 'admin') throw forbidden();
  await scan.deleteOne();
  await storage.remove(scan.image.storageKey).catch((err) => console.warn('[scans] image cleanup failed:', err.message));
  res.status(204).end();
});

export default router;
