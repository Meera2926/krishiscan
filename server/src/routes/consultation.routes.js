import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { cropKey, idParams, objectId, validate } from '../middleware/validate.js';
import { CONSULTATION_MODES, Consultation, Disease, Scan, Treatment, User } from '../models/index.js';
import {
  availableSlots,
  buildCaseSummary,
  isBookableSlot,
  openingMessage,
  reminderDue,
} from '../services/consultation.js';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../utils/httpError.js';

const router = Router();
router.use(requireAuth);

const isExpert = (req) => ['expert', 'admin'].includes(req.auth.role);

async function findVisible(req) {
  const consultation = await Consultation.findById(req.valid.params.id)
    .populate('farmer', 'name district state preferredLanguage')
    .populate('expert', 'name state district expertProfile')
    .populate('scan', 'image declaredCrop diseaseKey severity status statusReason top createdAt')
    .populate('plot', 'name crop variety sowingDate');
  if (!consultation) throw notFound('Consultation not found');
  const mine = consultation.farmer._id.equals(req.auth.userId);
  if (!mine && !isExpert(req)) throw notFound('Consultation not found');
  return { consultation, mine };
}

const serialise = (c, now = new Date()) => ({
  ...c.toJSON(),
  reminder: reminderDue(c, now),
});

/** Slots a farmer can pick from. Same grid for every expert; see services/consultation.js. */
router.get('/slots', (_req, res) => {
  res.json({ slots: availableSlots().map((d) => d.toISOString()) });
});

/**
 * The panel a farmer chooses from. Credentials are the point: picking a stranger to advise on
 * your crop is a decision, and it needs more than a name to go on.
 */
router.get('/experts', validate({ query: z.object({ crop: cropKey.optional(), mode: z.enum(CONSULTATION_MODES).optional() }) }), async (req, res) => {
  const { crop, mode } = req.valid.query;
  const experts = await User.find({ role: { $in: ['expert', 'admin'] } })
    .select('name state district expertProfile')
    .sort({ 'expertProfile.experienceYears': -1, name: 1 })
    .lean();

  const matches = experts.filter((e) => {
    const p = e.expertProfile ?? {};
    // An empty list means "all crops" / "all modes", so an unfilled profile is never hidden.
    const cropOk = !crop || !p.crops?.length || p.crops.includes(crop);
    const modeOk = !mode || !p.modes?.length || p.modes.includes(mode);
    return cropOk && modeOk;
  });

  res.json({
    experts: matches.map((e) => ({
      id: String(e._id),
      name: e.name,
      state: e.state ?? null,
      district: e.district ?? null,
      ...(e.expertProfile ?? {}),
    })),
  });
});

/**
 * What each side needs on their own dashboard. One endpoint, two shapes, because an expert and
 * a farmer are looking at the same consultations from opposite ends.
 */
router.get('/summary', async (req, res) => {
  const me = new mongoose.Types.ObjectId(req.auth.userId);
  const now = new Date();

  const upcomingFields = 'mode scheduledFor status decision caseSummary contactPhone visitAddress';

  if (isExpert(req)) {
    // "Today" is the working day the expert is actually sitting in, not the next 24 hours.
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const open = { $in: ['open', 'confirmed'] };

    const [waiting, mine, completed, today, upcoming, recent] = await Promise.all([
      // Booked by a farmer and not yet claimed by anyone.
      Consultation.countDocuments({ decision: 'scheduled', status: 'open', expert: null }),
      Consultation.countDocuments({ expert: me, status: open }),
      Consultation.countDocuments({ expert: me, status: 'completed' }),
      Consultation.find({ expert: me, status: open, scheduledFor: { $gte: dayStart, $lt: dayEnd } })
        .sort({ scheduledFor: 1 })
        .select(upcomingFields)
        .populate('farmer', 'name district state'),
      Consultation.find({ expert: me, status: open, scheduledFor: { $gte: dayEnd } })
        .sort({ scheduledFor: 1 })
        .limit(5)
        .select(upcomingFields)
        .populate('farmer', 'name district state'),
      Consultation.find({ expert: me, status: 'completed' })
        .sort({ 'outcome.completedAt': -1 })
        .limit(4)
        .select(`${upcomingFields} outcome`)
        .populate('farmer', 'name district state'),
    ]);

    return res.json({
      role: 'expert',
      waiting,
      mine,
      completed,
      today: today.map((c) => serialise(c, now)),
      upcoming: upcoming.map((c) => serialise(c, now)),
      recent: recent.map((c) => serialise(c, now)),
    });
  }

  const [awaitingAnswer, booked, answered, upcoming] = await Promise.all([
    Consultation.countDocuments({ farmer: me, decision: { $ne: 'scheduled' }, expiresAt: { $gt: now } }),
    Consultation.countDocuments({ farmer: me, decision: 'scheduled', status: { $in: ['open', 'confirmed'] } }),
    Consultation.countDocuments({ farmer: me, status: 'completed' }),
    Consultation.find({ farmer: me, decision: 'scheduled', status: { $in: ['open', 'confirmed'] } })
      .sort({ scheduledFor: 1 })
      .limit(5)
      .select(upcomingFields)
      .populate('expert', 'name expertProfile'),
  ]);
  res.json({ role: 'farmer', awaitingAnswer, booked, answered, upcoming: upcoming.map((c) => serialise(c, now)) });
});

const listQuery = z.object({
  scope: z.enum(['mine', 'queue']).default('mine'),
  status: z.enum(['open', 'confirmed', 'completed', 'cancelled', 'expired']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

router.get('/', validate({ query: listQuery }), async (req, res) => {
  const { scope, status, page, limit } = req.valid.query;
  if (scope === 'queue' && !isExpert(req)) throw forbidden();

  const filter =
    scope === 'queue'
      ? {
          decision: 'scheduled',
          status: { $in: status ? [status] : ['open', 'confirmed'] },
          // Unclaimed cases, plus the ones this farmer asked for by name.
          $or: [{ expert: null }, { expert: req.auth.userId }],
        }
      : { farmer: req.auth.userId, ...(status && { status }) };

  const [items, total] = await Promise.all([
    Consultation.find(filter)
      // The queue is worked earliest-appointment-first; a farmer sees their newest case first.
      .sort(scope === 'queue' ? { scheduledFor: 1 } : { createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('farmer', 'name district state')
      .populate('expert', 'name expertProfile')
      .populate('scan', 'image declaredCrop diseaseKey severity')
      .populate('plot', 'name crop'),
    Consultation.countDocuments(filter),
  ]);

  const now = new Date();
  res.json({
    items: items.map((c) => serialise(c, now)),
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
});

router.get('/:id', validate({ params: idParams }), async (req, res) => {
  const { consultation } = await findVisible(req);
  res.json({ consultation: serialise(consultation) });
});

/**
 * The farmer's answer to "shall we book an expert?". Declining is a real answer, not a no-op:
 * it stops the offer nagging while leaving the week-long window intact.
 */
const decideBody = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('declined') }),
  z.object({
    decision: z.literal('scheduled'),
    mode: z.enum(CONSULTATION_MODES),
    scheduledFor: z.coerce.date(),
    contactPhone: z.string().trim().min(6).max(20).optional(),
    visitAddress: z.string().trim().min(5).max(300).optional(),
    question: z.string().trim().max(1000).optional(),
    // Optional: leaving it empty puts the case in the open queue for any expert to take.
    expertId: objectId.optional(),
  }),
]);

router.post('/:id/decision', validate({ params: idParams, body: decideBody }), async (req, res) => {
  const { consultation, mine } = await findVisible(req);
  if (!mine) throw forbidden('Only the farmer can answer this.');
  if (consultation.decision === 'scheduled' && consultation.status !== 'cancelled') {
    throw conflict('This review is already booked.');
  }
  const body = req.valid.body;

  if (body.decision === 'declined') {
    consultation.decision = 'declined';
    consultation.decidedAt = new Date();
    await consultation.save();
    return res.json({ consultation: serialise(consultation) });
  }

  if (!isBookableSlot(body.scheduledFor)) {
    throw unprocessable('Pick an available time', { scheduledFor: ['That time is not available.'] });
  }
  if (body.mode === 'call' && !body.contactPhone) {
    throw unprocessable('Phone number needed', { contactPhone: ['A phone call needs a number to ring.'] });
  }
  if (body.mode === 'visit' && !body.visitAddress) {
    throw unprocessable('Address needed', { visitAddress: ['A farm visit needs an address.'] });
  }

  consultation.decision = 'scheduled';
  consultation.decidedAt = new Date();
  consultation.mode = body.mode;
  consultation.scheduledFor = body.scheduledFor;
  consultation.contactPhone = body.contactPhone ?? null;
  consultation.visitAddress = body.visitAddress ?? null;
  consultation.question = body.question ?? null;
  consultation.status = 'open';

  if (body.expertId) {
    const expert = await User.findOne({ _id: body.expertId, role: { $in: ['expert', 'admin'] } }).select('_id');
    if (!expert) throw unprocessable('Unknown expert', { expertId: ['That expert is not available.'] });
    // Requested, not confirmed: the expert still has to accept before it is a commitment.
    consultation.expert = expert._id;
  }
  // Booked cases are kept; only unanswered ones are swept away.
  consultation.expiresAt = null;

  // Start the thread from the case, so neither side begins from the beginning.
  if (!consultation.messages.length) {
    consultation.messages.push({
      sender: req.auth.userId,
      senderRole: 'farmer',
      body: [openingMessage(consultation.caseSummary ?? {}, consultation.trigger), body.question]
        .filter(Boolean)
        .join('\n\n'),
    });
  }
  await consultation.save();
  res.json({ consultation: serialise(consultation) });
});

const messageBody = z.object({ body: z.string().trim().min(1).max(2000) });

router.post('/:id/messages', validate({ params: idParams, body: messageBody }), async (req, res) => {
  const { consultation, mine } = await findVisible(req);
  if (consultation.decision !== 'scheduled') throw badRequest('Book the review before messaging.');
  if (['completed', 'cancelled'].includes(consultation.status)) throw conflict('This review is closed.');
  if (!mine && consultation.expert && !consultation.expert._id.equals(req.auth.userId)) {
    throw forbidden('Another expert is handling this review.');
  }

  consultation.messages.push({
    sender: req.auth.userId,
    senderRole: mine ? 'farmer' : req.auth.role,
    body: req.valid.body.body,
  });
  // The first expert to answer takes the case.
  if (!mine && !consultation.expert) {
    consultation.expert = req.auth.userId;
    consultation.status = 'confirmed';
  }
  await consultation.save();
  await consultation.populate('expert', 'name expertProfile');
  res.status(201).json({ consultation: serialise(consultation) });
});

const updateBody = z.object({
  action: z.enum(['accept', 'complete', 'cancel', 'reschedule']),
  scheduledFor: z.coerce.date().optional(),
  diseaseKey: z.string().trim().toLowerCase().max(80).optional(),
  advice: z.string().trim().max(2000).optional(),
});

router.patch('/:id', validate({ params: idParams, body: updateBody }), async (req, res) => {
  const { consultation, mine } = await findVisible(req);
  const { action, scheduledFor, diseaseKey, advice } = req.valid.body;

  if (action === 'cancel') {
    if (!mine && !isExpert(req)) throw forbidden();
    consultation.status = 'cancelled';
    // A cancelled case goes back to being unbooked, so the sweep can clear it in due course.
    consultation.decision = 'declined';
    consultation.expiresAt ??= new Date(Date.now() + 7 * 86_400_000);
  } else if (action === 'reschedule') {
    if (!mine) throw forbidden('Only the farmer can move the appointment.');
    if (!scheduledFor || !isBookableSlot(scheduledFor)) {
      throw unprocessable('Pick an available time', { scheduledFor: ['That time is not available.'] });
    }
    consultation.scheduledFor = scheduledFor;
    consultation.status = 'open';
  } else {
    if (!isExpert(req)) throw forbidden('Only an expert can do that.');
    if (consultation.decision !== 'scheduled') throw badRequest('This review was never booked.');
    if (action === 'accept') {
      if (consultation.expert && !consultation.expert._id.equals(req.auth.userId)) {
        throw conflict('Another expert has taken this review.');
      }
      consultation.expert = req.auth.userId;
      consultation.status = 'confirmed';
    } else {
      if (diseaseKey) {
        const disease = await Disease.findOne({ key: diseaseKey }).select('key');
        if (!disease) throw unprocessable('Unknown disease', { diseaseKey: [`"${diseaseKey}" is not in the library.`] });
      }
      consultation.expert ??= req.auth.userId;
      consultation.status = 'completed';
      consultation.outcome = { diseaseKey: diseaseKey ?? null, advice: advice ?? null, completedAt: new Date() };

      // Carry the verdict back to the scan, so the farmer's result page and their progression
      // history show what the expert said rather than what the model guessed. An entry already
      // settled through the review queue wins, so the two routes cannot overwrite each other.
      if (consultation.scan) {
        const scan = await Scan.findById(consultation.scan._id ?? consultation.scan);
        if (scan && !['confirmed', 'corrected'].includes(scan.review.status)) {
          scan.review = {
            status: diseaseKey && diseaseKey !== scan.diseaseKey ? 'corrected' : 'confirmed',
            reviewer: req.auth.userId,
            correctedDiseaseKey: diseaseKey ?? null,
            note: advice ?? null,
            reviewedAt: new Date(),
          };
          await scan.save();
        }
      }
    }
  }

  await consultation.save();
  res.json({ consultation: serialise(consultation) });
});

/**
 * A farmer can also ask for a review the app did not offer, for a scan or a treatment they are
 * worried about. Same lifecycle, same week-long window.
 */
const createBody = z
  .object({ scanId: objectId.optional(), treatmentId: objectId.optional(), question: z.string().trim().max(1000).optional() })
  .refine((b) => Boolean(b.scanId) !== Boolean(b.treatmentId), {
    error: 'Give either a scan or a treatment',
    path: ['scanId'],
  });

router.post('/', validate({ body: createBody }), async (req, res) => {
  const { scanId, treatmentId, question } = req.valid.body;
  const { offerConsultation } = await import('../services/consultationOffers.js');

  let consultation;
  if (scanId) {
    const scan = await Scan.findOne({ _id: scanId, owner: req.auth.userId });
    if (!scan) throw notFound('Scan not found');
    if (scan.status === 'rejected') throw badRequest('That photo was not recognised as a leaf.');
    const disease = scan.effectiveDiseaseKey ? await Disease.findOne({ key: scan.effectiveDiseaseKey }).select('commonName') : null;
    consultation = await offerConsultation({ trigger: 'uncertain_diagnosis', scan, disease, force: true });
  } else {
    const treatment = await Treatment.findOne({ _id: treatmentId, owner: req.auth.userId });
    if (!treatment) throw notFound('Treatment not found');
    consultation = await offerConsultation({ trigger: 'treatment_not_working', treatment, force: true });
  }

  if (question) {
    consultation.question = question;
    await consultation.save();
  }
  res.status(201).json({ consultation: serialise(consultation) });
});

export default router;
