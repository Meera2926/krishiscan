import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Consultation, Scan, User } from '../src/models/index.js';
import {
  REMINDER_DAYS,
  RETENTION_DAYS,
  isBookableSlot,
  openingMessage,
  reminderDue,
  shouldOfferForScan,
  shouldOfferForTreatment,
} from '../src/services/consultation.js';
import { __setClassifierForTests } from '../src/services/inference/index.js';
import { createMockClassifier } from '../src/services/inference/mock.js';
import { purgeExpired, runRetentionSweep, sendDueReminders } from '../src/services/retention.js';
import { TEST_DISEASES, cleanUploads, fixedClassifier, leafJpeg, registerUser, setupTestApp, storedFileExists, teardownTestApp } from './helpers.js';

const DAY = 86_400_000;
let app;

beforeAll(async () => {
  app = await setupTestApp();
});

afterAll(async () => {
  await teardownTestApp();
  await cleanUploads();
});

beforeEach(async () => {
  __setClassifierForTests(createMockClassifier({ labels: TEST_DISEASES.map((d) => d.key) }));
  await Consultation.deleteMany({});
});

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

/**
 * A verified expert. Promoted directly rather than through the application form, which has its
 * own tests in experts.test.js, then signed in again for a token carrying the new role.
 */
async function asExpert(appInstance, name, expertProfile) {
  const { user, password } = await registerUser(appInstance, { name });
  await User.updateOne(
    { _id: user.id },
    { role: 'expert', expertVerification: { status: 'verified' }, ...(expertProfile && { expertProfile }) },
  );
  const res = await request(appInstance).post('/api/auth/login').send({ email: user.email, password }).expect(200);
  return { token: res.body.accessToken, id: user.id };
}

/** An uncertain diagnosis, which is what makes the app offer a human expert. */
async function uncertainScan(token, seed = 1) {
  __setClassifierForTests(fixedClassifier({ tomato_late_blight: 0.45, tomato_early_blight: 0.4, tomato_healthy: 0.15 }));
  const res = await request(app)
    .post('/api/scans')
    .set(bearer(token))
    .field('crop', 'tomato')
    .attach('image', await leafJpeg(seed), { filename: 'leaf.jpg', contentType: 'image/jpeg' });
  expect(res.status).toBe(201);
  expect(res.body.scan.status).toBe('uncertain');
  return res.body;
}

const nextSlot = () => {
  const at = new Date(Date.now() + 2 * DAY);
  at.setHours(10, 0, 0, 0);
  return at.toISOString();
};

describe('when to offer an expert', () => {
  it('offers only when the app is genuinely unsure', () => {
    expect(shouldOfferForScan({ status: 'uncertain', statusReason: 'low_confidence' })).toBe(true);
    expect(shouldOfferForScan({ status: 'uncertain', statusReason: 'crop_mismatch' })).toBe(true);
    expect(shouldOfferForScan({ status: 'uncertain', statusReason: 'maybe_not_leaf' })).toBe(true);
    expect(shouldOfferForScan({ status: 'confident', statusReason: 'ok' })).toBe(false);
    expect(shouldOfferForScan({ status: 'rejected', statusReason: 'not_recognised' })).toBe(false);
  });

  it('offers when a treatment did not bring severity down, but not while waiting for proof', () => {
    expect(shouldOfferForTreatment({ status: 'not_effective' })).toBe(true);
    expect(shouldOfferForTreatment({ status: 'no_change' })).toBe(true);
    expect(shouldOfferForTreatment({ status: 'effective' })).toBe(false);
    expect(shouldOfferForTreatment({ status: 'awaiting_followup' })).toBe(false);
    expect(shouldOfferForTreatment({ status: 'no_baseline' })).toBe(false);
  });

  it('only accepts a real appointment slot', () => {
    const now = new Date('2026-05-01T08:00:00');
    const good = new Date('2026-05-03T10:00:00');
    expect(isBookableSlot(good, now)).toBe(true);
    expect(isBookableSlot(new Date('2026-04-28T10:00:00'), now)).toBe(false); // in the past
    expect(isBookableSlot(new Date('2026-05-03T10:30:00'), now)).toBe(false); // not on the hour
    expect(isBookableSlot(new Date('2026-05-03T03:00:00'), now)).toBe(false); // outside working hours
    expect(isBookableSlot(new Date('2026-07-01T10:00:00'), now)).toBe(false); // too far ahead
  });
});

describe('reminders', () => {
  const base = (over = {}) => ({
    decision: 'pending',
    createdAt: new Date('2026-05-01T00:00:00Z'),
    expiresAt: new Date(new Date('2026-05-01T00:00:00Z').getTime() + RETENTION_DAYS * DAY),
    remindersSent: [],
    ...over,
  });

  it('comes due on each reminder day, once', () => {
    const c = base();
    expect(reminderDue(c, new Date('2026-05-01T12:00:00Z'))).toBeNull();
    expect(reminderDue(c, new Date(`2026-05-0${1 + REMINDER_DAYS[0]}T01:00:00Z`))).toMatchObject({ index: 1 });
    expect(reminderDue(base({ remindersSent: [new Date()] }), new Date(`2026-05-0${1 + REMINDER_DAYS[0]}T01:00:00Z`))).toBeNull();
    expect(reminderDue(base({ remindersSent: [new Date()] }), new Date(`2026-05-0${1 + REMINDER_DAYS[1]}T01:00:00Z`))).toMatchObject({ index: 2 });
  });

  it('stops once the farmer has booked, or once the window has closed', () => {
    const day = new Date(`2026-05-0${1 + REMINDER_DAYS[0]}T01:00:00Z`);
    expect(reminderDue(base({ decision: 'scheduled' }), day)).toBeNull();
    expect(reminderDue(base({ expiresAt: new Date('2026-05-02T00:00:00Z') }), day)).toBeNull();
  });
});

describe('the case summary', () => {
  it('starts the conversation with the facts instead of a blank page', () => {
    const text = openingMessage(
      {
        crop: 'tomato',
        diseaseName: 'Late blight',
        confidence: 0.46,
        severityPercent: 18.2,
        severityTrend: 'worsening',
        treatmentProduct: 'Mancozeb 75 WP',
        treatmentAppliedAt: new Date('2026-05-01T00:00:00Z'),
        severityBefore: 12,
        severityAfter: 18.2,
      },
      'treatment_not_working',
    );
    expect(text).toContain('Mancozeb 75 WP');
    expect(text).toContain('12%');
    expect(text).toContain('18.2%');
    expect(text).toContain('Late blight');
    expect(text).toContain('tomato');
  });
});

describe('consultations API', () => {
  it('offers a review when the diagnosis is uncertain, and not when it is confident', async () => {
    const { token } = await registerUser(app);
    const uncertain = await uncertainScan(token);
    expect(uncertain.consultation).toBeTruthy();
    expect(uncertain.consultation.decision).toBe('pending');
    expect(uncertain.consultation.caseSummary.diseaseKey).toBe('tomato_late_blight');
    expect(new Date(uncertain.consultation.expiresAt).getTime()).toBeGreaterThan(Date.now());

    __setClassifierForTests(fixedClassifier({ tomato_late_blight: 0.95, tomato_healthy: 0.05 }));
    const confident = await request(app)
      .post('/api/scans')
      .set(bearer(token))
      .field('crop', 'tomato')
      .attach('image', await leafJpeg(9), { filename: 'leaf.jpg', contentType: 'image/jpeg' });
    expect(confident.body.scan.status).toBe('confident');
    expect(confident.body.consultation).toBeNull();
  });

  it('raises one offer per scan, however often the scan is re-opened', async () => {
    const { token } = await registerUser(app);
    const { scan } = await uncertainScan(token, 2);
    await request(app).get(`/api/scans/${scan.id}`).set(bearer(token)).expect(200);
    expect(await Consultation.countDocuments({ scan: scan.id })).toBe(1);
  });

  it('books a live chat that already contains the case', async () => {
    const { token } = await registerUser(app);
    const { consultation } = await uncertainScan(token, 3);

    const booked = await request(app)
      .post(`/api/consultations/${consultation.id}/decision`)
      .set(bearer(token))
      .send({ decision: 'scheduled', mode: 'chat', scheduledFor: nextSlot(), question: 'Lower leaves worst.' })
      .expect(200);

    expect(booked.body.consultation.decision).toBe('scheduled');
    expect(booked.body.consultation.mode).toBe('chat');
    expect(booked.body.consultation.expiresAt).toBeNull();
    // The whole point: the expert opens the thread already knowing the story.
    expect(booked.body.consultation.messages).toHaveLength(1);
    expect(booked.body.consultation.messages[0].body).toContain('Late blight');
    expect(booked.body.consultation.messages[0].body).toContain('Lower leaves worst.');
  });

  it('needs a phone number for a call and an address for a visit', async () => {
    const { token } = await registerUser(app);
    const { consultation } = await uncertainScan(token, 4);
    const send = (body) => request(app).post(`/api/consultations/${consultation.id}/decision`).set(bearer(token)).send(body);

    await send({ decision: 'scheduled', mode: 'call', scheduledFor: nextSlot() }).expect(422);
    await send({ decision: 'scheduled', mode: 'visit', scheduledFor: nextSlot() }).expect(422);
    await send({ decision: 'scheduled', mode: 'call', scheduledFor: nextSlot(), contactPhone: '9876543210' }).expect(200);
  });

  it('shows an expert their own caseload, not an empty list', async () => {
    const { token } = await registerUser(app);
    const { consultation } = await uncertainScan(token, 11);
    await request(app)
      .post(`/api/consultations/${consultation.id}/decision`)
      .set(bearer(token))
      .send({ decision: 'scheduled', mode: 'chat', scheduledFor: nextSlot() })
      .expect(200);

    const { token: expertToken } = await asExpert(app, 'Caseload');
    // Taking the case is what makes it theirs.
    await request(app)
      .post(`/api/consultations/${consultation.id}/messages`)
      .set(bearer(expertToken))
      .send({ body: 'Taking a look now.' })
      .expect(201);

    // `scope=mine` once meant `farmer: me` for everyone, so the "My own" tab on the expert desk
    // was always empty and a completed case could not be opened again from anywhere.
    const mine = await request(app).get('/api/consultations?scope=mine').set(bearer(expertToken)).expect(200);
    expect(mine.body.items.map((c) => c.id)).toContain(consultation.id);

    await request(app)
      .patch(`/api/consultations/${consultation.id}`)
      .set(bearer(expertToken))
      .send({ action: 'complete', diseaseKey: 'tomato_early_blight', advice: 'Remove the lower leaves.' })
      .expect(200);

    const completed = await request(app)
      .get('/api/consultations?scope=mine&status=completed')
      .set(bearer(expertToken))
      .expect(200);
    expect(completed.body.items.map((c) => c.id)).toContain(consultation.id);

    // A different expert's desk must not show it.
    const { token: otherExpert } = await asExpert(app, 'Someone else');
    const theirs = await request(app).get('/api/consultations?scope=mine').set(bearer(otherExpert)).expect(200);
    expect(theirs.body.items.map((c) => c.id)).not.toContain(consultation.id);

    // And a farmer's own list still means the cases they raised.
    const farmerList = await request(app).get('/api/consultations?scope=mine').set(bearer(token)).expect(200);
    expect(farmerList.body.items.map((c) => c.id)).toContain(consultation.id);
  });

  it('refuses a slot that is not on offer', async () => {
    const { token } = await registerUser(app);
    const { consultation } = await uncertainScan(token, 5);
    await request(app)
      .post(`/api/consultations/${consultation.id}/decision`)
      .set(bearer(token))
      .send({ decision: 'scheduled', mode: 'chat', scheduledFor: new Date(Date.now() - DAY).toISOString() })
      .expect(422);
  });

  it('lets an expert take a booked review, answer it and close it', async () => {
    const { token } = await registerUser(app);
    const { consultation } = await uncertainScan(token, 6);
    await request(app)
      .post(`/api/consultations/${consultation.id}/decision`)
      .set(bearer(token))
      .send({ decision: 'scheduled', mode: 'chat', scheduledFor: nextSlot() })
      .expect(200);

    const { token: expertToken } = await asExpert(app, 'Agronomist');

    const queue = await request(app).get('/api/consultations?scope=queue').set(bearer(expertToken)).expect(200);
    expect(queue.body.items.map((c) => c.id)).toContain(consultation.id);

    const replied = await request(app)
      .post(`/api/consultations/${consultation.id}/messages`)
      .set(bearer(expertToken))
      .send({ body: 'Looks like early blight. Remove the lower leaves.' })
      .expect(201);
    expect(replied.body.consultation.messages).toHaveLength(2);
    expect(replied.body.consultation.status).toBe('confirmed');

    const done = await request(app)
      .patch(`/api/consultations/${consultation.id}`)
      .set(bearer(expertToken))
      .send({ action: 'complete', diseaseKey: 'tomato_early_blight', advice: 'Spray mancozeb.' })
      .expect(200);
    expect(done.body.consultation.status).toBe('completed');
    expect(done.body.consultation.outcome.diseaseKey).toBe('tomato_early_blight');

    // The farmer's own scan has to end up showing what the expert said, not the model's guess.
    const corrected = await Scan.findById(consultation.scan.id ?? consultation.scan);
    expect(corrected.review.status).toBe('corrected');
    expect(corrected.effectiveDiseaseKey).toBe('tomato_early_blight');
  });

  it('keeps one farmer out of another farmer review', async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const { consultation } = await uncertainScan(a.token, 7);
    await request(app).get(`/api/consultations/${consultation.id}`).set(bearer(b.token)).expect(404);
    await request(app)
      .post(`/api/consultations/${consultation.id}/decision`)
      .set(bearer(b.token))
      .send({ decision: 'declined' })
      .expect(404);
  });
});

describe('a case belongs to whoever took it', () => {
  async function bookedFor(seed) {
    const { token } = await registerUser(app);
    const { consultation, scan } = await uncertainScan(token, seed);
    await request(app)
      .post(`/api/consultations/${consultation.id}/decision`)
      .set(bearer(token))
      .send({ decision: 'scheduled', mode: 'chat', scheduledFor: nextSlot() })
      .expect(200);
    return { farmerToken: token, id: consultation.id, scanId: scan.id };
  }

  it('lets nobody but the expert who took a case answer it', async () => {
    const { id } = await bookedFor(51);
    const { token: first } = await asExpert(app, 'Took It');
    const { token: second } = await asExpert(app, 'Did Not');
    await request(app).patch(`/api/consultations/${id}`).set(bearer(first)).send({ action: 'accept' }).expect(200);

    // Closing it would put the second expert's advice under the first one's name, and the
    // farmer's rating with it.
    await request(app)
      .patch(`/api/consultations/${id}`)
      .set(bearer(second))
      .send({ action: 'complete', advice: 'Not my case, but here goes.' })
      .expect(409);
    await request(app).patch(`/api/consultations/${id}`).set(bearer(second)).send({ action: 'accept' }).expect(409);
    expect((await Consultation.findById(id)).status).toBe('confirmed');
  });

  it('does not let a closed case be reopened by accepting or moving it', async () => {
    const answered = await bookedFor(52);
    const { token: expertToken } = await asExpert(app, 'Closer');
    await request(app)
      .patch(`/api/consultations/${answered.id}`)
      .set(bearer(expertToken))
      .send({ action: 'complete', advice: 'Spray as discussed.' })
      .expect(200);
    await request(app).patch(`/api/consultations/${answered.id}`).set(bearer(expertToken)).send({ action: 'accept' }).expect(409);
    await request(app)
      .patch(`/api/consultations/${answered.id}`)
      .set(bearer(answered.farmerToken))
      .send({ action: 'reschedule', scheduledFor: nextSlot() })
      .expect(409);
    expect((await Consultation.findById(answered.id)).status).toBe('completed');

    const calledOff = await bookedFor(53);
    await request(app).patch(`/api/consultations/${calledOff.id}`).set(bearer(calledOff.farmerToken)).send({ action: 'cancel' }).expect(200);
    await request(app)
      .patch(`/api/consultations/${calledOff.id}`)
      .set(bearer(calledOff.farmerToken))
      .send({ action: 'reschedule', scheduledFor: nextSlot() })
      .expect(409);
  });

  it('keeps advice of any length the consultation accepts, on the scan too', async () => {
    const { id, scanId } = await bookedFor(54);
    const { token: expertToken } = await asExpert(app, 'Thorough');
    // Exactly the 2000 the route allows, with nothing at the end for it to trim.
    const advice = 'Remove the lower leaves and spray in the evening.'.padEnd(2000, '.');
    await request(app)
      .patch(`/api/consultations/${id}`)
      .set(bearer(expertToken))
      .send({ action: 'complete', advice })
      .expect(200);
    expect((await Scan.findById(scanId)).review.note).toHaveLength(2000);
  });
});

describe('what cancelling a review may and may not throw away', () => {
  it('refuses an expert who has nothing to do with the case', async () => {
    const { token } = await registerUser(app);
    const { consultation } = await uncertainScan(token, 21);
    await request(app)
      .post(`/api/consultations/${consultation.id}/decision`)
      .set(bearer(token))
      .send({ decision: 'scheduled', mode: 'chat', scheduledFor: nextSlot() })
      .expect(200);

    // A passer-by expert, not the one handling it. Cancelling arms a seven-day deletion of the
    // farmer's scan and photograph, so this must not be open to any expert who can see the case.
    const { token: stranger } = await asExpert(app, 'Unrelated Expert');
    await request(app)
      .patch(`/api/consultations/${consultation.id}`)
      .set(bearer(stranger))
      .send({ action: 'cancel' })
      .expect(403);

    // The farmer whose case it is, of course, may.
    await request(app)
      .patch(`/api/consultations/${consultation.id}`)
      .set(bearer(token))
      .send({ action: 'cancel' })
      .expect(200);
  });

  it('lets the expert actually handling the case cancel it', async () => {
    const { token } = await registerUser(app);
    const { consultation } = await uncertainScan(token, 22);
    await request(app)
      .post(`/api/consultations/${consultation.id}/decision`)
      .set(bearer(token))
      .send({ decision: 'scheduled', mode: 'chat', scheduledFor: nextSlot() })
      .expect(200);
    const { token: expertToken } = await asExpert(app, 'Handling Expert');
    await request(app)
      .patch(`/api/consultations/${consultation.id}`)
      .set(bearer(expertToken))
      .send({ action: 'accept' })
      .expect(200);
    await request(app)
      .patch(`/api/consultations/${consultation.id}`)
      .set(bearer(expertToken))
      .send({ action: 'cancel' })
      .expect(200);
  });

  it('does not put an answered review on the deletion clock', async () => {
    const { token } = await registerUser(app);
    const { consultation, scan } = await uncertainScan(token, 23);
    await request(app)
      .post(`/api/consultations/${consultation.id}/decision`)
      .set(bearer(token))
      .send({ decision: 'scheduled', mode: 'chat', scheduledFor: nextSlot() })
      .expect(200);
    const { token: expertToken } = await asExpert(app, 'Answering Expert');
    await request(app)
      .patch(`/api/consultations/${consultation.id}`)
      .set(bearer(expertToken))
      .send({ action: 'complete', diseaseKey: 'tomato_early_blight', advice: 'Strip the lower leaves.' })
      .expect(200);

    // Cancelling after the fact used to set decision back to "declined" and arm expiresAt, so a
    // week later the sweep took the advice, the scan and the photograph with it.
    const cancelled = await request(app)
      .patch(`/api/consultations/${consultation.id}`)
      .set(bearer(token))
      .send({ action: 'cancel' })
      .expect(200);
    expect(cancelled.body.consultation.expiresAt ?? null).toBeNull();

    await runRetentionSweep(new Date(Date.now() + 30 * DAY));
    expect(await Scan.findById(scan.id)).not.toBeNull();
  });

  it('keeps a scan an agronomist has already ruled on, even when its review expires', async () => {
    const { token } = await registerUser(app);
    const { consultation, scan } = await uncertainScan(token, 24);

    // The label-check queue settles the scan...
    const { token: expertToken } = await asExpert(app, 'Queue Reviewer');
    await request(app)
      .post(`/api/reviews/${scan.id}`)
      .set(bearer(expertToken))
      .send({ action: 'confirm' })
      .expect(200);

    // ...while the farmer never answers the consultation offer, so it expires.
    await Consultation.updateOne({ _id: consultation.id }, { $set: { expiresAt: new Date(Date.now() - DAY) } });
    const result = await runRetentionSweep();

    expect(result.consultationsDeleted).toBeGreaterThan(0);
    // The consultation goes; the settled model-versus-expert record does not.
    expect(await Scan.findById(scan.id)).not.toBeNull();
    expect(result.scansKept).toBeGreaterThan(0);
  });
});

describe('choosing an expert', () => {
  it('shows what each expert is actually qualified in', async () => {
    const { token } = await registerUser(app);
    await asExpert(app, 'Dr Qualified', {
      qualification: 'Ph.D. Plant Pathology',
      organisation: 'State Agricultural University',
      experienceYears: 18,
      crops: ['tomato'],
      modes: ['chat'],
    });

    const res = await request(app).get('/api/consultations/experts').set(bearer(token)).expect(200);
    const found = res.body.experts.find((e) => e.name === 'Dr Qualified');
    expect(found).toMatchObject({ qualification: 'Ph.D. Plant Pathology', experienceYears: 18 });
  });

  it('filters the panel by crop and by how the farmer wants to meet', async () => {
    const { token } = await registerUser(app);
    await asExpert(app, 'Rice Only', { qualification: 'M.Sc.', crops: ['rice'], modes: ['visit'] });

    const wrongCrop = await request(app).get('/api/consultations/experts?crop=tomato').set(bearer(token)).expect(200);
    expect(wrongCrop.body.experts.map((e) => e.name)).not.toContain('Rice Only');

    const wrongMode = await request(app).get('/api/consultations/experts?crop=rice&mode=chat').set(bearer(token)).expect(200);
    expect(wrongMode.body.experts.map((e) => e.name)).not.toContain('Rice Only');

    const match = await request(app).get('/api/consultations/experts?crop=rice&mode=visit').set(bearer(token)).expect(200);
    expect(match.body.experts.map((e) => e.name)).toContain('Rice Only');
  });

  it('books the expert the farmer picked, and refuses one who does not exist', async () => {
    const { token } = await registerUser(app);
    const { consultation } = await uncertainScan(token, 20);
    const { id: expertId } = await asExpert(app, 'Chosen One', { qualification: 'M.Sc.' });

    await request(app)
      .post(`/api/consultations/${consultation.id}/decision`)
      .set(bearer(token))
      .send({ decision: 'scheduled', mode: 'chat', scheduledFor: nextSlot(), expertId: '0'.repeat(24) })
      .expect(422);

    const booked = await request(app)
      .post(`/api/consultations/${consultation.id}/decision`)
      .set(bearer(token))
      .send({ decision: 'scheduled', mode: 'chat', scheduledFor: nextSlot(), expertId })
      .expect(200);
    expect(String(booked.body.consultation.expert?.id ?? booked.body.consultation.expert)).toBe(expertId);
    // Requested is not the same as accepted: the expert still has to take it.
    expect(booked.body.consultation.status).toBe('open');
  });
});

describe('photos in the conversation', () => {
  /** Books a chat so there is somewhere to post. */
  async function bookedChat(token, seed) {
    const { consultation } = await uncertainScan(token, seed);
    await request(app)
      .post(`/api/consultations/${consultation.id}/decision`)
      .set(bearer(token))
      .send({ decision: 'scheduled', mode: 'chat', scheduledFor: nextSlot() })
      .expect(200);
    return consultation;
  }

  it('lets the farmer answer "send me another photo" with one', async () => {
    const { token } = await registerUser(app);
    const consultation = await bookedChat(token, 40);

    const res = await request(app)
      .post(`/api/consultations/${consultation.id}/messages`)
      .set(bearer(token))
      .field('body', 'Underside of a middle leaf.')
      .attach('image', await leafJpeg(41), { filename: 'underside.jpg', contentType: 'image/jpeg' })
      .expect(201);

    const last = res.body.consultation.messages.at(-1);
    expect(last.body).toBe('Underside of a middle leaf.');
    expect(last.image.url).toMatch(/\.jpg$/);
    // Stored through the same pipeline as a scan, so it is re-encoded rather than kept as sent.
    expect(last.image.format).toBe('jpeg');
    expect(last.image.bytes).toBeGreaterThan(0);
  });

  it('accepts a photo with no caption, and rejects a message with neither', async () => {
    const { token } = await registerUser(app);
    const consultation = await bookedChat(token, 42);

    const photoOnly = await request(app)
      .post(`/api/consultations/${consultation.id}/messages`)
      .set(bearer(token))
      .attach('image', await leafJpeg(43), { filename: 'leaf.jpg', contentType: 'image/jpeg' })
      .expect(201);
    expect(photoOnly.body.consultation.messages.at(-1).image.url).toBeTruthy();

    await request(app).post(`/api/consultations/${consultation.id}/messages`).set(bearer(token)).send({}).expect(400);
  });

  it('refuses a file that is not really an image', async () => {
    const { token } = await registerUser(app);
    const consultation = await bookedChat(token, 44);
    await request(app)
      .post(`/api/consultations/${consultation.id}/messages`)
      .set(bearer(token))
      .attach('image', Buffer.from('not a jpeg'), { filename: 'x.jpg', contentType: 'image/jpeg' })
      .expect(400);
  });

  it('deletes chat photos when the case is swept away', async () => {
    const { token } = await registerUser(app);
    const { consultation } = await uncertainScan(token, 45);
    await request(app)
      .post(`/api/consultations/${consultation.id}/decision`)
      .set(bearer(token))
      .send({ decision: 'scheduled', mode: 'chat', scheduledFor: nextSlot() })
      .expect(200);
    const withPhoto = await request(app)
      .post(`/api/consultations/${consultation.id}/messages`)
      .set(bearer(token))
      .attach('image', await leafJpeg(46), { filename: 'leaf.jpg', contentType: 'image/jpeg' })
      .expect(201);
    const key = withPhoto.body.consultation.messages.at(-1).image.storageKey;
    expect(await storedFileExists(key)).toBe(true);

    // The farmer cancels the appointment, which puts the case back on the retention clock.
    await request(app).patch(`/api/consultations/${consultation.id}`).set(bearer(token)).send({ action: 'cancel' }).expect(200);
    await Consultation.collection.updateOne(
      { _id: new Consultation.base.Types.ObjectId(String(consultation.id)) },
      { $set: { expiresAt: new Date(Date.now() - DAY) } },
    );
    await runRetentionSweep();
    expect(await storedFileExists(key)).toBe(false);
  });
});

describe('the two dashboards', () => {
  it('shows a farmer and an expert opposite ends of the same case', async () => {
    const { token } = await registerUser(app);
    const { consultation } = await uncertainScan(token, 30);
    const { token: expertToken } = await asExpert(app, 'Desk Expert', { qualification: 'M.Sc.' });

    // Before booking: nothing is waiting for anyone.
    const idle = await request(app).get('/api/consultations/summary').set(bearer(expertToken)).expect(200);
    expect(idle.body).toMatchObject({ role: 'expert', waiting: 0, mine: 0 });

    await request(app)
      .post(`/api/consultations/${consultation.id}/decision`)
      .set(bearer(token))
      .send({ decision: 'scheduled', mode: 'chat', scheduledFor: nextSlot() })
      .expect(200);

    // The farmer's booking lands on the expert's desk without anyone being told.
    const booked = await request(app).get('/api/consultations/summary').set(bearer(expertToken)).expect(200);
    expect(booked.body).toMatchObject({ waiting: 1, mine: 0 });
    const farmerBooked = await request(app).get('/api/consultations/summary').set(bearer(token)).expect(200);
    expect(farmerBooked.body).toMatchObject({ role: 'farmer', booked: 1, answered: 0 });
    expect(farmerBooked.body.upcoming).toHaveLength(1);

    // Taking it moves it off the open queue and onto that expert's own list.
    await request(app).patch(`/api/consultations/${consultation.id}`).set(bearer(expertToken)).send({ action: 'accept' }).expect(200);
    const taken = await request(app).get('/api/consultations/summary').set(bearer(expertToken)).expect(200);
    expect(taken.body).toMatchObject({ waiting: 0, mine: 1, completed: 0 });
    expect(taken.body.upcoming[0].farmer.name).toBeTruthy();

    // Completing it updates both sides.
    await request(app)
      .patch(`/api/consultations/${consultation.id}`)
      .set(bearer(expertToken))
      .send({ action: 'complete', advice: 'Remove the lower leaves.' })
      .expect(200);
    expect((await request(app).get('/api/consultations/summary').set(bearer(expertToken))).body).toMatchObject({ mine: 0, completed: 1 });
    expect((await request(app).get('/api/consultations/summary').set(bearer(token))).body).toMatchObject({ booked: 0, answered: 1 });
  });

  it('does not show one expert another expert claimed case', async () => {
    const { token } = await registerUser(app);
    const { consultation } = await uncertainScan(token, 31);
    const { token: firstToken } = await asExpert(app, 'First Expert', { qualification: 'M.Sc.' });
    const { token: secondToken } = await asExpert(app, 'Second Expert', { qualification: 'M.Sc.' });

    await request(app)
      .post(`/api/consultations/${consultation.id}/decision`)
      .set(bearer(token))
      .send({ decision: 'scheduled', mode: 'chat', scheduledFor: nextSlot() })
      .expect(200);
    await request(app).patch(`/api/consultations/${consultation.id}`).set(bearer(firstToken)).send({ action: 'accept' }).expect(200);

    const queue = await request(app).get('/api/consultations?scope=queue').set(bearer(secondToken)).expect(200);
    expect(queue.body.items.map((c) => c.id)).not.toContain(consultation.id);
    await request(app)
      .post(`/api/consultations/${consultation.id}/messages`)
      .set(bearer(secondToken))
      .send({ body: 'Butting in' })
      .expect(403);
  });
});

describe('retention', () => {
  const backdate = (id, days) =>
    Consultation.collection.updateOne(
      { _id: new Consultation.base.Types.ObjectId(String(id)) },
      { $set: { createdAt: new Date(Date.now() - days * DAY), expiresAt: new Date(Date.now() - (days - RETENTION_DAYS) * DAY) } },
    );

  it('keeps the photo and the case for a week, then deletes both', async () => {
    const { token } = await registerUser(app);
    const { scan, consultation } = await uncertainScan(token, 11);

    // Six days in: still there, and the farmer has had reminders.
    await backdate(consultation.id, 6);
    expect(await purgeExpired()).toMatchObject({ consultationsDeleted: 0, scansDeleted: 0 });
    expect(await Scan.countDocuments({ _id: scan.id })).toBe(1);
    expect((await sendDueReminders()).length).toBe(1);

    // A day past the deadline: the case and its photo go.
    await backdate(consultation.id, RETENTION_DAYS + 1);
    expect(await runRetentionSweep()).toMatchObject({ consultationsDeleted: 1, scansDeleted: 1 });
    expect(await Scan.countDocuments({ _id: scan.id })).toBe(0);
    expect(await Consultation.countDocuments({ _id: consultation.id })).toBe(0);
  });

  it('deletes a case the farmer declined, and never one they booked', async () => {
    const { token } = await registerUser(app);

    const declined = await uncertainScan(token, 12);
    await request(app)
      .post(`/api/consultations/${declined.consultation.id}/decision`)
      .set(bearer(token))
      .send({ decision: 'declined' })
      .expect(200);

    const booked = await uncertainScan(token, 13);
    await request(app)
      .post(`/api/consultations/${booked.consultation.id}/decision`)
      .set(bearer(token))
      .send({ decision: 'scheduled', mode: 'chat', scheduledFor: nextSlot() })
      .expect(200);

    await backdate(declined.consultation.id, RETENTION_DAYS + 1);
    await backdate(booked.consultation.id, RETENTION_DAYS + 1);

    expect(await runRetentionSweep()).toMatchObject({ consultationsDeleted: 1, scansDeleted: 1 });
    expect(await Scan.countDocuments({ _id: booked.scan.id })).toBe(1);
    expect(await Consultation.countDocuments({ _id: booked.consultation.id })).toBe(1);
    expect(await Scan.countDocuments({ _id: declined.scan.id })).toBe(0);
  });
});
