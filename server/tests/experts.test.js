import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import mongoose from 'mongoose';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Consultation, ExpertDocument, ExpertRating, User } from '../src/models/index.js';
import { verifyLegacyExperts } from '../src/services/experts.js';
import { __setClassifierForTests } from '../src/services/inference/index.js';
import { cleanUploads, fixedClassifier, leafJpeg, registerUser, setupTestApp, teardownTestApp } from './helpers.js';

const run = promisify(execFile);
const SERVER_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAY = 86_400_000;
let app;
let applicants = 0;

beforeAll(async () => {
  app = await setupTestApp();
});

afterAll(async () => {
  await teardownTestApp();
  await cleanUploads();
});

beforeEach(async () => {
  await Consultation.deleteMany({});
  await ExpertRating.deleteMany({});
});

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

/** A readable photo of a certificate, large enough, with camera EXIF that must not survive storage. */
function certificateJpeg({ width = 900, height = 640 } = {}) {
  return sharp({ create: { width, height, channels: 3, background: { r: 250, g: 246, b: 232 } } })
    .composite([{ input: Buffer.from(`<svg width="${width}" height="${height}"><text x="40" y="120" font-size="48">Degree certificate</text></svg>`) }])
    .withExif({ IFD0: { Make: 'TestPhone', Model: 'Camera' } })
    .jpeg()
    .toBuffer();
}

const APPLICATION = {
  password: 'agronomy-2024',
  degree: 'msc_agriculture',
  specialisation: 'Plant Pathology',
  university: 'Tamil Nadu Agricultural University',
  graduationYear: '2015',
  organisationType: 'kvk',
  organisation: 'KVK Coimbatore',
  designation: 'Subject Matter Specialist',
  experienceYears: '8',
  crops: 'tomato,rice',
  languages: 'ta,en',
  modes: 'chat,call',
  bio: 'Vegetable and paddy diseases.',
  declaration: 'true',
};

/** Applies through the real form. Returns the response and the applicant's credentials. */
async function apply(overrides = {}, { document = certificateJpeg() } = {}) {
  const fields = {
    name: 'Applicant Expert',
    email: `applicant${(applicants += 1)}.${process.pid}@example.com`,
    ...APPLICATION,
    ...overrides,
  };
  const req = request(app).post('/api/auth/register-expert');
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) req.field(k, v);
  const doc = await document;
  if (doc) req.attach('document', doc, { filename: 'certificate.jpg', contentType: 'image/jpeg' });
  const res = await req;
  return { res, email: fields.email, password: fields.password };
}

async function signIn(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  return res.body.accessToken;
}

/** An admin, made the way make-admin does it, signed in again for a token carrying the role. */
async function asAdmin() {
  const { user, password } = await registerUser(app, { name: 'Platform Admin' });
  await User.updateOne({ _id: user.id }, { role: 'admin' });
  return { token: await signIn(user.email, password), id: user.id };
}

async function pendingExpert(overrides) {
  const { res, email, password } = await apply(overrides);
  expect(res.status).toBe(201);
  return { token: res.body.accessToken, id: res.body.user.id, email, password };
}

const decide = (adminToken, expertId, body) =>
  request(app).post(`/api/experts/${expertId}/verification`).set(bearer(adminToken)).send(body);

async function verifiedExpert(adminToken, overrides) {
  const expert = await pendingExpert(overrides);
  await decide(adminToken, expert.id, { decision: 'verify' }).expect(200);
  return expert;
}

const nextSlot = () => {
  const at = new Date(Date.now() + 2 * DAY);
  at.setHours(10, 0, 0, 0);
  return at.toISOString();
};

/** A farmer's uncertain scan, booked as a chat with nobody named: it sits in the open queue. */
async function bookedCase(farmerToken, seed) {
  __setClassifierForTests(fixedClassifier({ tomato_late_blight: 0.45, tomato_early_blight: 0.4, tomato_healthy: 0.15 }));
  const scan = await request(app)
    .post('/api/scans')
    .set(bearer(farmerToken))
    .field('crop', 'tomato')
    .attach('image', await leafJpeg(seed), { filename: 'leaf.jpg', contentType: 'image/jpeg' })
    .expect(201);
  const { consultation } = scan.body;
  await request(app)
    .post(`/api/consultations/${consultation.id}/decision`)
    .set(bearer(farmerToken))
    .send({ decision: 'scheduled', mode: 'chat', scheduledFor: nextSlot() })
    .expect(200);
  return { consultationId: consultation.id, scanId: scan.body.scan.id };
}

async function completedCase(farmerToken, expertToken, seed) {
  const { consultationId, scanId } = await bookedCase(farmerToken, seed);
  await request(app).patch(`/api/consultations/${consultationId}`).set(bearer(expertToken)).send({ action: 'accept' }).expect(200);
  await request(app)
    .patch(`/api/consultations/${consultationId}`)
    .set(bearer(expertToken))
    .send({ action: 'complete', diseaseKey: 'tomato_late_blight', advice: 'Remove the worst leaves.' })
    .expect(200);
  return { consultationId, scanId };
}

describe('applying as an expert', () => {
  it('opens a pending expert account with the qualification built from the degree', async () => {
    const { res } = await apply();
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({
      role: 'expert',
      expertVerification: { status: 'pending' },
      expertProfile: {
        qualification: 'M.Sc. (Agri.) Plant Pathology',
        degree: 'msc_agriculture',
        university: 'Tamil Nadu Agricultural University',
        graduationYear: 2015,
        crops: ['tomato', 'rice'],
        languages: ['ta', 'en'],
        modes: ['chat', 'call'],
      },
    });
  });

  it('stores the certificate re-encoded, without the location the phone wrote into it', async () => {
    const { res } = await apply();
    const doc = await ExpertDocument.findOne({ owner: res.body.user.id }).select('+data');
    expect(doc.contentType).toBe('image/jpeg');
    const meta = await sharp(doc.data).metadata();
    expect(meta.exif).toBeUndefined();
    // And nowhere in what the account exposes.
    expect(JSON.stringify(res.body.user)).not.toMatch(/certificate|document/i);
  });

  it('refuses a degree that is not in agriculture', async () => {
    const { res, email } = await apply({ degree: 'mbbs' });
    expect(res.status).toBe(422);
    expect(res.body.error.details.degree).toBeDefined();
    expect(await User.exists({ email })).toBeNull();
  });

  it('will not take a qualification typed in by hand instead of chosen', async () => {
    const { res } = await apply({ qualification: 'Ph.D. (Agri.) Everything', specialisation: undefined });
    expect(res.status).toBe(201);
    expect(res.body.user.expertProfile.qualification).toBe('M.Sc. (Agri.)');
  });

  it('refuses an application without a certificate, and leaves no account behind', async () => {
    const { res, email } = await apply({}, { document: null });
    expect(res.status).toBe(400);
    expect(await User.exists({ email })).toBeNull();
  });

  it('refuses a certificate too small to read, and leaves no account behind', async () => {
    const { res, email } = await apply({}, { document: certificateJpeg({ width: 240, height: 180 }) });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/too small/);
    expect(await User.exists({ email })).toBeNull();
  });

  it('needs the declaration, a year that has happened, and a crop the app knows', async () => {
    expect((await apply({ declaration: 'false' })).res.status).toBe(422);
    expect((await apply({ graduationYear: String(new Date().getFullYear() + 1) })).res.status).toBe(422);
    const unknownCrop = await apply({ crops: 'tomato,dragonfruit' });
    expect(unknownCrop.res.status).toBe(422);
    expect(unknownCrop.res.body.error.details.crops[0]).toContain('dragonfruit');
  });

  it('still cannot become an expert, or anything else, through ordinary sign-up', async () => {
    const { user } = await registerUser(app, { role: 'expert', expertVerification: { status: 'verified' } });
    expect(user.role).toBe('farmer');
    expect(user.expertVerification).toBeUndefined();
  });
});

describe('an expert nobody has verified yet', () => {
  it('sees no farmer, no case and no scan, and cannot be booked', async () => {
    const farmer = await registerUser(app);
    const { consultationId, scanId } = await bookedCase(farmer.token, 31);
    const pending = await pendingExpert({ name: 'Not Yet Checked' });
    const as = bearer(pending.token);

    await request(app).get('/api/consultations?scope=queue').set(as).expect(403);
    await request(app).get('/api/consultations/summary').set(as).expect(403);
    await request(app).get(`/api/consultations/${consultationId}`).set(as).expect(403);
    await request(app).patch(`/api/consultations/${consultationId}`).set(as).send({ action: 'accept' }).expect(403);
    await request(app).post(`/api/consultations/${consultationId}/messages`).set(as).send({ body: 'Trust me.' }).expect(403);
    await request(app).get(`/api/scans/${scanId}`).set(as).expect(404);
    await request(app).get('/api/reviews/queue').set(as).expect(403);
    await request(app).post(`/api/reviews/${scanId}`).set(as).send({ action: 'confirm' }).expect(403);

    const panel = await request(app).get('/api/consultations/experts').set(bearer(farmer.token)).expect(200);
    expect(panel.body.experts.map((e) => e.name)).not.toContain('Not Yet Checked');
    await request(app).get(`/api/experts/${pending.id}`).set(bearer(farmer.token)).expect(404);

    const other = await registerUser(app);
    const { body } = await request(app)
      .post('/api/scans')
      .set(bearer(other.token))
      .field('crop', 'tomato')
      .attach('image', await leafJpeg(32), { filename: 'leaf.jpg', contentType: 'image/jpeg' })
      .expect(201);
    await request(app)
      .post(`/api/consultations/${body.consultation.id}/decision`)
      .set(bearer(other.token))
      .send({ decision: 'scheduled', mode: 'chat', scheduledFor: nextSlot(), expertId: pending.id })
      .expect(422);
  });

  it('can read its own application and send a corrected one', async () => {
    const pending = await pendingExpert();
    const mine = await request(app).get('/api/experts/me/application').set(bearer(pending.token)).expect(200);
    expect(mine.body.application).toMatchObject({ hasDocument: true, expertVerification: { status: 'pending' } });

    // No new certificate: the one on file is kept.
    const req = request(app).put('/api/experts/me/application').set(bearer(pending.token));
    for (const [k, v] of Object.entries({ ...APPLICATION, specialisation: 'Agronomy' })) {
      if (k !== 'password') req.field(k, v);
    }
    const res = await req.expect(200);
    expect(res.body.user.expertProfile.qualification).toBe('M.Sc. (Agri.) Agronomy');
    expect(res.body.user.expertVerification.status).toBe('pending');
  });
});

describe('the admin deciding', () => {
  it('lists waiting applications with counts, and only to an admin', async () => {
    const admin = await asAdmin();
    const pending = await pendingExpert({ name: 'Waiting In Line' });

    const list = await request(app).get('/api/experts/applications').set(bearer(admin.token)).expect(200);
    const item = list.body.items.find((i) => i.id === pending.id);
    expect(item).toMatchObject({ hasDocument: true, expertVerification: { status: 'pending' } });
    expect(list.body.counts.pending).toBeGreaterThanOrEqual(1);

    const farmer = await registerUser(app);
    await request(app).get('/api/experts/applications').set(bearer(farmer.token)).expect(403);
    const expert = await verifiedExpert(admin.token);
    await request(app).get('/api/experts/applications').set(bearer(expert.token)).expect(403);
    await decide(expert.token, pending.id, { decision: 'verify' }).expect(403);
  });

  it('opens the cases to an expert as soon as they are verified, on the same sign-in', async () => {
    const admin = await asAdmin();
    const farmer = await registerUser(app);
    const { consultationId } = await bookedCase(farmer.token, 33);
    const expert = await pendingExpert({ name: 'Freshly Verified' });

    await request(app).get('/api/consultations?scope=queue').set(bearer(expert.token)).expect(403);
    const verified = await decide(admin.token, expert.id, { decision: 'verify' }).expect(200);
    expect(verified.body.expert.expertVerification).toMatchObject({ status: 'verified', decidedBy: { id: admin.id } });

    // The token was issued while pending; the database is what changed.
    const queue = await request(app).get('/api/consultations?scope=queue').set(bearer(expert.token)).expect(200);
    expect(queue.body.items.map((c) => c.id)).toContain(consultationId);

    const panel = await request(app).get('/api/consultations/experts').set(bearer(farmer.token)).expect(200);
    expect(panel.body.experts.find((e) => e.id === expert.id)).toMatchObject({
      verified: true,
      qualification: 'M.Sc. (Agri.) Plant Pathology',
      university: 'Tamil Nadu Agricultural University',
      rating: { average: null, count: 0 },
    });
  });

  it('turns an application down only with a reason, which the applicant can see and act on', async () => {
    const admin = await asAdmin();
    const expert = await pendingExpert();

    await decide(admin.token, expert.id, { decision: 'reject' }).expect(422);
    await decide(admin.token, expert.id, { decision: 'reject', note: 'The certificate photo is blurred.' }).expect(200);

    const me = await request(app).get('/api/auth/me').set(bearer(expert.token)).expect(200);
    expect(me.body.user.expertVerification).toMatchObject({ status: 'rejected', note: 'The certificate photo is blurred.' });

    const req = request(app).put('/api/experts/me/application').set(bearer(expert.token));
    for (const [k, v] of Object.entries(APPLICATION)) if (k !== 'password') req.field(k, v);
    req.attach('document', await certificateJpeg({ width: 1200, height: 860 }), { filename: 'sharper.jpg', contentType: 'image/jpeg' });
    const again = await req.expect(200);
    expect(again.body.user.expertVerification.status).toBe('pending');
    expect(again.body.user.expertVerification.note).toBeUndefined();
  });

  it('suspends at once, on the expert’s live sign-in, and hands their open cases back to the queue', async () => {
    const admin = await asAdmin();
    const farmer = await registerUser(app);
    const expert = await verifiedExpert(admin.token, { name: 'About To Be Suspended' });

    const answered = await completedCase(farmer.token, expert.token, 34);
    const { consultationId: open } = await bookedCase(farmer.token, 35);
    await request(app).patch(`/api/consultations/${open}`).set(bearer(expert.token)).send({ action: 'accept' }).expect(200);

    await decide(admin.token, expert.id, { decision: 'suspend' }).expect(422);
    const res = await decide(admin.token, expert.id, { decision: 'suspend', note: 'Advice given outside the label.' }).expect(200);
    expect(res.body.released).toBe(1);

    await request(app).get('/api/consultations?scope=queue').set(bearer(expert.token)).expect(403);
    const released = await Consultation.findById(open);
    expect(released).toMatchObject({ expert: null, status: 'open' });
    // An answered case keeps the name of who answered it.
    expect(String((await Consultation.findById(answered.consultationId)).expert)).toBe(expert.id);

    // Suspended accounts cannot rewrite the application to get back in.
    const req = request(app).put('/api/experts/me/application').set(bearer(expert.token));
    for (const [k, v] of Object.entries(APPLICATION)) if (k !== 'password') req.field(k, v);
    await req.expect(409);
  });

  it('refuses decisions that make no sense for where the application is', async () => {
    const admin = await asAdmin();
    const pending = await pendingExpert();
    await decide(admin.token, pending.id, { decision: 'suspend', note: 'Nothing to suspend yet.' }).expect(409);
    await decide(admin.token, pending.id, { decision: 'verify' }).expect(200);
    await decide(admin.token, pending.id, { decision: 'reject', note: 'Too late for that.' }).expect(409);
  });

  it('stops listening to an admin the moment the database says they are not one', async () => {
    const admin = await asAdmin();
    await User.updateOne({ _id: admin.id }, { role: 'farmer' });
    await request(app).get('/api/experts/applications').set(bearer(admin.token)).expect(403);
  });
});

describe('the certificate', () => {
  it('reaches the applicant and an admin, and nobody else', async () => {
    const admin = await asAdmin();
    const applicant = await pendingExpert();
    const url = `/api/experts/${applicant.id}/document`;

    const own = await request(app).get(url).set(bearer(applicant.token)).expect(200);
    expect(own.headers['content-type']).toBe('image/jpeg');
    expect(own.headers['cache-control']).toBe('private, no-store');
    await request(app).get(url).set(bearer(admin.token)).expect(200);

    const farmer = await registerUser(app);
    await request(app).get(url).set(bearer(farmer.token)).expect(404);
    const otherExpert = await verifiedExpert(admin.token);
    await request(app).get(url).set(bearer(otherExpert.token)).expect(404);
    await request(app).get(url).expect(401);
  });
});

describe('rating an expert', () => {
  it('lets the farmer rate an answered case once, and change their mind', async () => {
    const admin = await asAdmin();
    const farmer = await registerUser(app);
    const expert = await verifiedExpert(admin.token, { name: 'Rated Expert' });
    const { consultationId } = await completedCase(farmer.token, expert.token, 36);
    const rate = (token, body) => request(app).post(`/api/consultations/${consultationId}/rating`).set(bearer(token)).send(body);

    const first = await rate(farmer.token, { stars: 4, comment: 'Clear and quick.' }).expect(200);
    expect(first.body.expertRating).toEqual({ average: 4, count: 1 });

    const changed = await rate(farmer.token, { stars: 5 }).expect(200);
    expect(changed.body.rating).toMatchObject({ stars: 5, comment: null });
    expect(changed.body.expertRating).toEqual({ average: 5, count: 1 });
    expect(await ExpertRating.countDocuments({ consultation: consultationId })).toBe(1);
  });

  it('only takes whole stars from 1 to 5, only after the answer, and only from that farmer', async () => {
    const admin = await asAdmin();
    const farmer = await registerUser(app);
    const expert = await verifiedExpert(admin.token);
    // Taken by an expert but not yet answered: there is nothing to rate.
    const { consultationId: open } = await bookedCase(farmer.token, 37);
    await request(app).patch(`/api/consultations/${open}`).set(bearer(expert.token)).send({ action: 'accept' }).expect(200);
    await request(app).post(`/api/consultations/${open}/rating`).set(bearer(farmer.token)).send({ stars: 5 }).expect(409);

    const { consultationId } = await completedCase(farmer.token, expert.token, 38);
    const url = `/api/consultations/${consultationId}/rating`;
    for (const stars of [0, 6, 4.5, '5']) {
      await request(app).post(url).set(bearer(farmer.token)).send({ stars }).expect(422);
    }
    await request(app).post(url).set(bearer(expert.token)).send({ stars: 5 }).expect(403);
    await request(app).post(url).set(bearer(admin.token)).send({ stars: 1 }).expect(403);
    const stranger = await registerUser(app);
    await request(app).post(url).set(bearer(stranger.token)).send({ stars: 1 }).expect(404);
  });

  it('shows farmers the average, the spread and the comments, without saying who wrote them', async () => {
    const admin = await asAdmin();
    const expert = await verifiedExpert(admin.token, { name: 'Well Reviewed' });
    const ratings = [
      [5, 'Saved my tomatoes.'],
      [4, null],
      [2, 'Late for the call.'],
    ];
    for (const [i, [stars, comment]] of ratings.entries()) {
      const farmer = await registerUser(app, { name: `Farmer ${i}` });
      const { consultationId } = await completedCase(farmer.token, expert.token, 40 + i);
      await request(app)
        .post(`/api/consultations/${consultationId}/rating`)
        .set(bearer(farmer.token))
        .send({ stars, ...(comment && { comment }) })
        .expect(200);
    }

    const viewer = await registerUser(app);
    const { body } = await request(app).get(`/api/experts/${expert.id}`).set(bearer(viewer.token)).expect(200);
    expect(body.expert).toMatchObject({
      verified: true,
      degreeLabel: 'M.Sc. (Agri.)',
      rating: { average: 3.7, count: 3, distribution: { 1: 0, 2: 1, 3: 0, 4: 1, 5: 1 } },
    });
    expect(body.expert.reviews).toHaveLength(3);
    expect(JSON.stringify(body.expert.reviews)).not.toMatch(/Farmer \d|farmer/);

    const panel = await request(app).get('/api/consultations/experts').set(bearer(viewer.token)).expect(200);
    expect(panel.body.experts.find((e) => e.id === expert.id).rating).toEqual({ average: 3.7, count: 3 });
  });

  it('shows a farmer their own rating on the case, and not the expert it is about', async () => {
    const admin = await asAdmin();
    const farmer = await registerUser(app);
    const expert = await verifiedExpert(admin.token);
    const { consultationId } = await completedCase(farmer.token, expert.token, 45);
    await request(app).post(`/api/consultations/${consultationId}/rating`).set(bearer(farmer.token)).send({ stars: 3 }).expect(200);

    const asFarmer = await request(app).get(`/api/consultations/${consultationId}`).set(bearer(farmer.token)).expect(200);
    expect(asFarmer.body.consultation.rating).toMatchObject({ stars: 3 });
    expect(asFarmer.body.consultation.expertRating).toEqual({ average: 3, count: 1 });
    expect(asFarmer.body.consultation.expert.verified).toBe(true);

    const asExpertView = await request(app).get(`/api/consultations/${consultationId}`).set(bearer(expert.token)).expect(200);
    expect(asExpertView.body.consultation.rating).toBeNull();
    expect(asExpertView.body.consultation.expertRating).toEqual({ average: 3, count: 1 });
  });
});

describe('experts from before verification existed', () => {
  it('are trusted once, and nobody else is touched', async () => {
    const legacy = await registerUser(app, { name: 'Seeded Long Ago' });
    await User.collection.updateOne({ _id: new mongoose.Types.ObjectId(legacy.user.id) }, { $set: { role: 'expert' } });
    const pending = await pendingExpert();
    const farmer = await registerUser(app);

    expect(await verifyLegacyExperts()).toBeGreaterThanOrEqual(1);
    expect((await User.findById(legacy.user.id)).expertVerification.status).toBe('verified');
    expect((await User.findById(pending.id)).expertVerification.status).toBe('pending');
    expect((await User.findById(farmer.user.id)).expertVerification?.status).toBeUndefined();
    // Running it again changes nothing.
    expect(await verifyLegacyExperts()).toBe(0);
  });
});

describe('make-admin', () => {
  it('promotes an existing account and signs its old sessions out', async () => {
    const { user, agent } = await registerUser(app, { name: 'Becomes Admin' });
    const { host, port, name } = mongoose.connection;
    const { stdout } = await run(process.execPath, ['scripts/make-admin.js', user.email], {
      cwd: SERVER_ROOT,
      env: { ...process.env, NODE_ENV: 'test', MONGO_URI: `mongodb://${host}:${port}/${name}` },
      timeout: 60_000,
    });
    expect(stdout).toContain('is now an admin (was farmer)');
    expect((await User.findById(user.id)).role).toBe('admin');
    // The refresh cookie from before the promotion no longer works, so the next sign-in carries the role.
    await agent.post('/api/auth/refresh').expect(401);
  }, 90_000);

  it('hands a promoted expert’s unfinished cases back to the queue, since admins do not answer', async () => {
    const admin = await asAdmin();
    const farmer = await registerUser(app);
    const expert = await verifiedExpert(admin.token, { name: 'Promoted Away' });
    const { consultationId } = await bookedCase(farmer.token, 70);
    await request(app).patch(`/api/consultations/${consultationId}`).set(bearer(expert.token)).send({ action: 'accept' }).expect(200);

    const { host, port, name } = mongoose.connection;
    const { stdout } = await run(process.execPath, ['scripts/make-admin.js', expert.email], {
      cwd: SERVER_ROOT,
      env: { ...process.env, NODE_ENV: 'test', MONGO_URI: `mongodb://${host}:${port}/${name}` },
      timeout: 60_000,
    });
    expect(stdout).toContain('1 unfinished case(s) went back to the open queue');
    expect(await Consultation.findById(consultationId)).toMatchObject({ expert: null, status: 'open' });
  }, 90_000);
});

describe('closing the gaps the first review found', () => {
  it('does not let an expert book, answer or rate their own case', async () => {
    const admin = await asAdmin();
    const expert = await verifiedExpert(admin.token, { name: 'Marks Own Homework' });
    // Nothing stops an expert account uploading a scan, so it can raise a case of its own.
    __setClassifierForTests(fixedClassifier({ tomato_late_blight: 0.45, tomato_early_blight: 0.4, tomato_healthy: 0.15 }));
    const scan = await request(app)
      .post('/api/scans')
      .set(bearer(expert.token))
      .field('crop', 'tomato')
      .attach('image', await leafJpeg(71), { filename: 'leaf.jpg', contentType: 'image/jpeg' })
      .expect(201);
    const id = scan.body.consultation.id;
    const book = (extra) =>
      request(app)
        .post(`/api/consultations/${id}/decision`)
        .set(bearer(expert.token))
        .send({ decision: 'scheduled', mode: 'chat', scheduledFor: nextSlot(), ...extra });

    await book({ expertId: expert.id }).expect(422);
    await book({}).expect(200);
    await request(app).patch(`/api/consultations/${id}`).set(bearer(expert.token)).send({ action: 'accept' }).expect(403);
    await request(app).patch(`/api/consultations/${id}`).set(bearer(expert.token)).send({ action: 'complete', advice: 'Looks fine to me.' }).expect(403);
    await Consultation.updateOne({ _id: id }, { expert: expert.id, status: 'completed', outcome: { advice: 'x', completedAt: new Date() } });
    await request(app).post(`/api/consultations/${id}/rating`).set(bearer(expert.token)).send({ stars: 5 }).expect(403);
    expect(await ExpertRating.countDocuments({ expert: expert.id })).toBe(0);
  });

  it('still lets the farmer rate advice that was given, even if the case was cancelled after', async () => {
    const admin = await asAdmin();
    const farmer = await registerUser(app);
    const expert = await verifiedExpert(admin.token);
    const { consultationId } = await completedCase(farmer.token, expert.token, 72);
    await request(app).patch(`/api/consultations/${consultationId}`).set(bearer(expert.token)).send({ action: 'cancel' }).expect(200);
    await request(app).post(`/api/consultations/${consultationId}/rating`).set(bearer(farmer.token)).send({ stars: 4 }).expect(200);
    // And an answered case cannot be booked again for someone else to answer.
    await request(app)
      .post(`/api/consultations/${consultationId}/decision`)
      .set(bearer(farmer.token))
      .send({ decision: 'scheduled', mode: 'chat', scheduledFor: nextSlot() })
      .expect(409);
  });

  it('does not hand a re-booked case back to whoever held it before', async () => {
    const admin = await asAdmin();
    const farmer = await registerUser(app);
    const expert = await verifiedExpert(admin.token, { name: 'Held It Once' });
    const { consultationId } = await bookedCase(farmer.token, 73);
    await request(app).patch(`/api/consultations/${consultationId}`).set(bearer(expert.token)).send({ action: 'accept' }).expect(200);
    await request(app).patch(`/api/consultations/${consultationId}`).set(bearer(farmer.token)).send({ action: 'cancel' }).expect(200);
    await decide(admin.token, expert.id, { decision: 'suspend', note: 'Suspended in the meantime.' }).expect(200);

    const again = await request(app)
      .post(`/api/consultations/${consultationId}/decision`)
      .set(bearer(farmer.token))
      .send({ decision: 'scheduled', mode: 'chat', scheduledFor: nextSlot() })
      .expect(200);
    expect(again.body.consultation.expert).toBeNull();
  });

  it('refuses a decision about an application the admin has not seen', async () => {
    const admin = await asAdmin();
    const expert = await pendingExpert();
    const seen = (await User.findById(expert.id)).expertVerification.submittedAt;

    const req = request(app).put('/api/experts/me/application').set(bearer(expert.token));
    for (const [k, v] of Object.entries({ ...APPLICATION, degree: 'phd_agriculture' })) if (k !== 'password') req.field(k, v);
    await req.expect(200);

    await decide(admin.token, expert.id, { decision: 'verify', submittedAt: seen.toISOString() }).expect(409);
    const now = (await User.findById(expert.id)).expertVerification.submittedAt;
    await decide(admin.token, expert.id, { decision: 'verify', submittedAt: now.toISOString() }).expect(200);
  });

  it('keeps the name a certificate was checked against', async () => {
    const admin = await asAdmin();
    const expert = await verifiedExpert(admin.token, { name: 'Checked Name' });
    const rename = (token, name) => request(app).patch('/api/auth/me').set(bearer(token)).send({ name });
    await rename(expert.token, 'Dr Famous Scientist').expect(409);
    await rename(expert.token, 'Checked Name').expect(200);

    const pending = await pendingExpert({ name: 'Not Yet Checked' });
    await rename(pending.token, 'Fixed A Typo').expect(200);
    const farmer = await registerUser(app);
    await rename(farmer.token, 'Any Farmer Name').expect(200);
  });

  it('turns away HEIC before upload rather than failing to read it after', async () => {
    const { token } = await registerUser(app);
    const res = await request(app)
      .post('/api/scans')
      .set(bearer(token))
      .field('crop', 'tomato')
      .attach('image', await leafJpeg(74), { filename: 'leaf.heic', contentType: 'image/heic' })
      .expect(400);
    expect(res.body.error.message).toBe('Please upload a JPEG, PNG or WebP photo.');
  });
});
