import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Scan, User } from '../src/models/index.js';
import { __setClassifierForTests } from '../src/services/inference/index.js';
import { createMockClassifier } from '../src/services/inference/mock.js';
import {
  TEST_DISEASES,
  cleanUploads,
  fixedClassifier,
  leafJpeg,
  registerUser,
  setupTestApp,
  startAppWithEnv,
  teardownTestApp,
} from './helpers.js';

let app;

beforeAll(async () => {
  app = await setupTestApp();
});

afterAll(async () => {
  await teardownTestApp();
  await cleanUploads();
});

beforeEach(() => {
  __setClassifierForTests(createMockClassifier({ labels: TEST_DISEASES.map((d) => d.key) }));
});

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

async function uploadScan(token, fields = {}, image) {
  const req = request(app).post('/api/scans').set(bearer(token));
  for (const [k, v] of Object.entries(fields)) req.field(k, String(v));
  return req.attach('image', image ?? (await leafJpeg(Object.keys(fields).length)), { filename: 'leaf.jpg', contentType: 'image/jpeg' });
}

describe('health', () => {
  it('reports database and classifier status', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(res.body.database.state).toBe('connected');
    expect(res.body.classifier.status).toBe('ready');
  });

  it('returns JSON 404s for unknown API routes', async () => {
    const res = await request(app).get('/api/nope').expect(404);
    expect(res.body.error.message).toMatch(/No route/);
  });
});

describe('auth', () => {
  it('registers, returns a token, and never leaks the password hash', async () => {
    const { token, user } = await registerUser(app);
    expect(token).toBeTruthy();
    expect(user.passwordHash).toBeUndefined();
    expect(user.role).toBe('farmer');
    const me = await request(app).get('/api/auth/me').set(bearer(token)).expect(200);
    expect(me.body.user.email).toBe(user.email);
  });

  it('cannot self-register as an expert', async () => {
    const { user } = await registerUser(app, { role: 'admin' });
    expect(user.role).toBe('farmer');
  });

  it('rejects invalid input with field details', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'X', email: 'nope', password: 'short' }).expect(422);
    expect(Object.keys(res.body.error.details)).toEqual(expect.arrayContaining(['email', 'password']));
  });

  it('rejects duplicate emails regardless of case', async () => {
    const { user } = await registerUser(app);
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Again', email: user.email.toUpperCase(), password: 'another-pass' })
      .expect(409);
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    const { user } = await registerUser(app);
    const wrong = await request(app).post('/api/auth/login').send({ email: user.email, password: 'wrong-password' }).expect(401);
    const unknown = await request(app).post('/api/auth/login').send({ email: 'ghost@example.com', password: 'wrong-password' }).expect(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('refreshes with the cookie, and logout revokes the refresh token', async () => {
    const { agent } = await registerUser(app);
    const refreshed = await agent.post('/api/auth/refresh').expect(200);
    expect(refreshed.body.accessToken).toBeTruthy();

    // Capture the cookie before logout clears it, then replay it.
    const cookie = refreshed.headers['set-cookie'].find((c) => c.startsWith('ks_refresh='));
    await agent.post('/api/auth/logout').expect(204);
    await request(app).post('/api/auth/refresh').set('Cookie', cookie.split(';')[0]).expect(401);
  });

  it('rejects requests without a valid token', async () => {
    await request(app).get('/api/plots').expect(401);
    await request(app).get('/api/plots').set(bearer('garbage')).expect(401);
  });
});

describe('plots', () => {
  it('creates, lists and isolates plots per user', async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);

    const created = await request(app)
      .post('/api/plots')
      .set(bearer(a.token))
      .send({ name: 'North field', crop: 'Tomato', lat: 20.01, lng: 73.78, areaAcres: 1.5 })
      .expect(201);
    expect(created.body.plot).toMatchObject({ name: 'North field', crop: 'tomato', lat: 20.01, lng: 73.78 });

    const list = await request(app).get('/api/plots').set(bearer(a.token)).expect(200);
    expect(list.body.plots).toHaveLength(1);
    expect(list.body.plots[0].scanCount).toBe(0);

    await request(app).get(`/api/plots/${created.body.plot.id}`).set(bearer(b.token)).expect(404);
    await request(app).delete(`/api/plots/${created.body.plot.id}`).set(bearer(b.token)).expect(404);
  });

  it('rejects unknown crops and invalid coordinates', async () => {
    const { token } = await registerUser(app);
    await request(app).post('/api/plots').set(bearer(token)).send({ name: 'X', crop: 'banana', lat: 20, lng: 73 }).expect(422);
    await request(app).post('/api/plots').set(bearer(token)).send({ name: 'X', crop: 'tomato', lat: 200, lng: 73 }).expect(422);
  });
});

describe('scans', () => {
  it('requires a crop, and only a supported one', async () => {
    const { token } = await registerUser(app);
    const missing = await uploadScan(token);
    expect(missing.status).toBe(422);
    const unsupported = await uploadScan(token, { crop: 'cotton' });
    expect(unsupported.status).toBe(422);
  });

  it('rejects files that are not really images, even with an image mimetype', async () => {
    const { token } = await registerUser(app);
    const res = await uploadScan(token, { crop: 'tomato' }, Buffer.from('definitely not a jpeg'));
    expect(res.status).toBe(400);
    expect(await Scan.countDocuments()).toBe(0);
  });

  it('accepts a crop named the way a farmer would say it', async () => {
    __setClassifierForTests(fixedClassifier({ rice_leaf_blast: 0.92, rice_healthy: 0.08 }));
    const { token } = await registerUser(app);
    const res = await uploadScan(token, { crop: 'Paddy' });
    expect(res.status).toBe(201);
    expect(res.body.scan.declaredCrop).toBe('rice');
  });

  it('diagnoses a confident scan and returns advisory content', async () => {
    __setClassifierForTests(fixedClassifier({ tomato_late_blight: 0.9, tomato_early_blight: 0.08, rice_leaf_blast: 0.02 }));
    const { token } = await registerUser(app);
    const res = await uploadScan(token, { crop: 'tomato', lat: 20.02, lng: 73.8, shareLocation: true });
    expect(res.status).toBe(201);
    expect(res.body.scan).toMatchObject({ status: 'confident', diseaseKey: 'tomato_late_blight', shareLocation: true });
    expect(res.body.scan.review.status).toBe('none');
    expect(res.body.disease.commonName).toBe('Late blight');
    expect(res.body.scan.image.url).toMatch(/^\/uploads\//);
    expect(res.body.scan.location).toEqual({ lat: 20.02, lng: 73.8 });

    // The stored image is served back.
    await request(app).get(res.body.scan.image.url).expect(200).expect('Content-Type', /jpeg/);
  });

  it('queues uncertain scans for expert review', async () => {
    __setClassifierForTests(fixedClassifier({ tomato_late_blight: 0.5, tomato_early_blight: 0.45, rice_healthy: 0.05 }));
    const { token } = await registerUser(app);
    const res = await uploadScan(token, { crop: 'tomato' });
    expect(res.body.scan.status).toBe('uncertain');
    expect(res.body.scan.review.status).toBe('pending');
  });

  it('rejects non-leaf photos via the invalid gate and does not queue them', async () => {
    __setClassifierForTests(fixedClassifier({ tomato_late_blight: 0.6, tomato_early_blight: 0.4 }, 0.97));
    const { token } = await registerUser(app);
    const res = await uploadScan(token, { crop: 'tomato' });
    expect(res.body.scan).toMatchObject({ status: 'rejected', statusReason: 'not_recognised', diseaseKey: null });
    expect(res.body.scan.review.status).toBe('none');
    expect(res.body.disease).toBeNull();
  });

  it('does not share location unless asked, and hides scans from other farmers', async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const res = await uploadScan(a.token, { crop: 'rice', lat: 10.7, lng: 76.6 });
    expect(res.body.scan.shareLocation).toBe(false);
    await request(app).get(`/api/scans/${res.body.scan.id}`).set(bearer(b.token)).expect(404);
    await request(app).delete(`/api/scans/${res.body.scan.id}`).set(bearer(b.token)).expect(404);
  });

  it('uses the plot crop and location when a plot is given', async () => {
    __setClassifierForTests(fixedClassifier({ tomato_healthy: 0.95, tomato_late_blight: 0.05 }));
    const { token } = await registerUser(app);
    const plot = await request(app).post('/api/plots').set(bearer(token)).send({ name: 'P', crop: 'tomato', lat: 13.1, lng: 78.1 });
    const res = await uploadScan(token, { plotId: plot.body.plot.id });
    expect(res.status).toBe(201);
    expect(res.body.scan).toMatchObject({ declaredCrop: 'tomato', isHealthy: true, location: { lat: 13.1, lng: 78.1 } });
    expect(res.body.scan.plot.name).toBe('P');

    const plots = await request(app).get('/api/plots').set(bearer(token));
    expect(plots.body.plots[0]).toMatchObject({ scanCount: 1, lastIsHealthy: true });
  });

  it('lists with pagination and summarises', async () => {
    const { token } = await registerUser(app);
    for (let i = 0; i < 3; i += 1) {
      expect((await uploadScan(token, { crop: 'tomato' }, await leafJpeg(i + 10))).status).toBe(201);
    }
    const page = await request(app).get('/api/scans?limit=2').set(bearer(token)).expect(200);
    expect(page.body).toMatchObject({ total: 3, pages: 2, page: 1 });
    expect(page.body.items).toHaveLength(2);

    const summary = await request(app).get('/api/scans/summary').set(bearer(token)).expect(200);
    expect(summary.body.total).toBe(3);
  });

  it('deletes a scan and its image', async () => {
    const { token } = await registerUser(app);
    const res = await uploadScan(token, { crop: 'rice' });
    await request(app).delete(`/api/scans/${res.body.scan.id}`).set(bearer(token)).expect(204);
    await request(app).get(res.body.scan.image.url).expect(404);
  });
});

describe('expert review', () => {
  async function makeExpert() {
    const expert = await registerUser(app);
    await User.updateOne({ _id: expert.user.id }, { role: 'expert', expertVerification: { status: 'verified' } });
    // Role lives in the access token, so log in again to get one with the new role.
    const login = await request(app).post('/api/auth/login').send({ email: expert.user.email, password: expert.password });
    return login.body.accessToken;
  }

  it('lets experts confirm or correct, blocks farmers, and reports agreement', async () => {
    __setClassifierForTests(fixedClassifier({ tomato_late_blight: 0.5, tomato_early_blight: 0.45, rice_healthy: 0.05 }));
    const farmer = await registerUser(app);
    const s1 = (await uploadScan(farmer.token, { crop: 'tomato' }, await leafJpeg(1))).body.scan;
    const s2 = (await uploadScan(farmer.token, { crop: 'tomato' }, await leafJpeg(2))).body.scan;

    await request(app).get('/api/reviews/queue').set(bearer(farmer.token)).expect(403);

    const expertToken = await makeExpert();
    const queue = await request(app).get('/api/reviews/queue').set(bearer(expertToken)).expect(200);
    expect(queue.body.items.map((i) => i.id)).toEqual(expect.arrayContaining([s1.id, s2.id]));

    await request(app).post(`/api/reviews/${s1.id}`).set(bearer(expertToken)).send({ action: 'confirm' }).expect(200);
    await request(app)
      .post(`/api/reviews/${s2.id}`)
      .set(bearer(expertToken))
      .send({ action: 'correct', diseaseKey: 'tomato_early_blight', note: 'Concentric rings visible' })
      .expect(200);
    await request(app).post(`/api/reviews/${s1.id}`).set(bearer(expertToken)).send({ action: 'confirm' }).expect(409);
    await request(app).post(`/api/reviews/${s2.id}`).set(bearer(expertToken)).send({ action: 'correct', diseaseKey: 'made_up' }).expect(409);

    // Experts can open any scan; the farmer sees the correction.
    const seen = await request(app).get(`/api/scans/${s2.id}`).set(bearer(farmer.token)).expect(200);
    expect(seen.body.scan.review).toMatchObject({ status: 'corrected', correctedDiseaseKey: 'tomato_early_blight' });
    expect(seen.body.disease.key).toBe('tomato_early_blight');
    // The model's original answer is preserved for accuracy measurement.
    expect(seen.body.scan.diseaseKey).toBe('tomato_late_blight');

    const metrics = await request(app).get('/api/reviews/metrics').set(bearer(expertToken)).expect(200);
    expect(metrics.body.reviewed).toBeGreaterThanOrEqual(2);
    expect(metrics.body.confusions).toEqual(
      expect.arrayContaining([expect.objectContaining({ predicted: 'tomato_late_blight', actual: 'tomato_early_blight' })]),
    );
  });
});

describe('outbreak map', () => {
  it('shows shared, confident, diseased scans on a coarse grid, and nothing else', async () => {
    const { token } = await registerUser(app);
    const near = { lat: 22.9012, lng: 88.3921 };

    __setClassifierForTests(fixedClassifier({ tomato_late_blight: 0.92, tomato_healthy: 0.08 }));
    expect((await uploadScan(token, { crop: 'tomato', ...near, shareLocation: true }, await leafJpeg(31))).status).toBe(201);
    // Not shared: must not appear.
    expect((await uploadScan(token, { crop: 'tomato', ...near, shareLocation: false }, await leafJpeg(32))).status).toBe(201);
    // Shared but healthy: must not appear.
    __setClassifierForTests(fixedClassifier({ tomato_healthy: 0.95, tomato_late_blight: 0.05 }));
    expect((await uploadScan(token, { crop: 'tomato', ...near, shareLocation: true }, await leafJpeg(33))).status).toBe(201);

    // Public endpoint: no token needed.
    const res = await request(app).get(`/api/outbreaks/map?lat=${near.lat}&lng=${near.lng}&radiusKm=20`).expect(200);
    expect(res.body.cells).toHaveLength(1);
    const [cell] = res.body.cells;
    expect(cell).toMatchObject({ diseaseKey: 'tomato_late_blight', count: 1 });
    // Snapped to the grid centre, not the farmer's coordinates.
    expect(cell.lat).not.toBe(near.lat);
    expect(Math.abs(cell.lat - near.lat)).toBeLessThan(0.05);
  });

  it('validates the query', async () => {
    await request(app).get('/api/outbreaks/map?lat=999&lng=1').expect(422);
  });
});

describe('progression and treatments', () => {
  /** Green leaf filling the frame with one brown lesion of the given radius (px) in a 320px image. */
  const lesionLeaf = (radius, seed = 0) =>
    import('sharp').then(({ default: sharp }) =>
      sharp({ create: { width: 320, height: 320, channels: 3, background: { r: 50 + seed, g: 140, b: 60 } } })
        .composite([{ input: Buffer.from(`<svg width="320" height="320"><circle cx="160" cy="160" r="${radius}" fill="#7a4a1c"/></svg>`) }])
        .jpeg()
        .toBuffer(),
    );
  const daysAgo = (n) => new Date(Date.now() - n * 864e5);
  // Mongoose treats createdAt as immutable, so go straight to the collection.
  const backdate = (id, date) => Scan.collection.updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { createdAt: date } });

  it('tracks severity over repeat scans and evaluates a logged treatment', async () => {
    __setClassifierForTests(fixedClassifier({ tomato_late_blight: 0.9, tomato_early_blight: 0.1 }));
    const { token } = await registerUser(app);
    const other = await registerUser(app);
    const plot = (await request(app).post('/api/plots').set(bearer(token)).send({ name: 'Progress', crop: 'tomato', lat: 13.1, lng: 78.1 })).body.plot;

    const small = (await uploadScan(token, { plotId: plot.id }, await lesionLeaf(40, 1))).body.scan;
    const large = await uploadScan(token, { plotId: plot.id }, await lesionLeaf(100, 2));
    expect(small.severity.reliable).toBe(true);
    expect(large.body.scan.severity.percent).toBeGreaterThan(small.severity.percent + 10);

    // Spread the two scans 8 days apart.
    await backdate(small.id, daysAgo(20));
    await backdate(large.body.scan.id, daysAgo(12));

    const treatment = await request(app)
      .post(`/api/plots/${plot.id}/treatments`)
      .set(bearer(token))
      .send({ type: 'chemical', product: 'Test fungicide', activeIngredient: 'Mancozeb', diseaseKey: 'tomato_late_blight', appliedAt: daysAgo(11).toISOString(), phiDays: 30 })
      .expect(201);
    expect(treatment.body.treatment.product).toBe('Test fungicide');

    const recovered = (await uploadScan(token, { plotId: plot.id }, await lesionLeaf(30, 3))).body;
    await backdate(recovered.scan.id, daysAgo(2));

    const progression = await request(app).get(`/api/plots/${plot.id}/progression`).set(bearer(token)).expect(200);
    expect(progression.body.overall.points).toHaveLength(3);
    expect(progression.body.overall.summary.count).toBe(3);
    expect(progression.body.overall.summary.audpc).toBeGreaterThan(0);
    expect(progression.body.byDisease.map((d) => d.diseaseKey)).toEqual(['tomato_late_blight']);

    const [logged] = progression.body.treatments.items;
    expect(logged.efficacy.status).toBe('effective');
    expect(logged.efficacy.change).toBeLessThan(0);
    // 30-day pre-harvest interval from 11 days ago: not yet safe.
    expect(progression.body.treatments.safeToHarvestNow).toBe(false);

    // The latest scan is compared with the previous one on the same plot.
    const detail = await request(app).get(`/api/scans/${recovered.scan.id}`).set(bearer(token)).expect(200);
    expect(detail.body.comparison.direction).toBe('better');

    // Other farmers cannot see or add to this plot's records.
    await request(app).get(`/api/plots/${plot.id}/progression`).set(bearer(other.token)).expect(404);
    await request(app).post(`/api/plots/${plot.id}/treatments`).set(bearer(other.token)).send({ type: 'organic', product: 'Neem', appliedAt: daysAgo(1).toISOString() }).expect(404);
  });

  it('validates treatments and deletes them', async () => {
    const { token } = await registerUser(app);
    const plot = (await request(app).post('/api/plots').set(bearer(token)).send({ name: 'T', crop: 'tomato', lat: 13, lng: 78 })).body.plot;
    await request(app).post(`/api/plots/${plot.id}/treatments`).set(bearer(token)).send({ type: 'magic', product: 'X', appliedAt: daysAgo(1) }).expect(422);
    await request(app).post(`/api/plots/${plot.id}/treatments`).set(bearer(token)).send({ type: 'organic', product: 'X', appliedAt: new Date(Date.now() + 5 * 864e5) }).expect(422);
    await request(app).post(`/api/plots/${plot.id}/treatments`).set(bearer(token)).send({ type: 'chemical', product: 'X', diseaseKey: 'rice_leaf_blast', appliedAt: daysAgo(1) }).expect(422);
    const created = await request(app).post(`/api/plots/${plot.id}/treatments`).set(bearer(token)).send({ type: 'organic', product: 'Neem oil', appliedAt: daysAgo(1) }).expect(201);
    await request(app).delete(`/api/plots/${plot.id}/treatments/${created.body.treatment.id}`).set(bearer(token)).expect(204);
    const list = await request(app).get(`/api/plots/${plot.id}/treatments`).set(bearer(token)).expect(200);
    expect(list.body.items).toHaveLength(0);
    expect(list.body.safeToHarvestNow).toBe(true);
  });

  it('stores no severity for rejected photos', async () => {
    __setClassifierForTests(fixedClassifier({ tomato_late_blight: 0.6, tomato_early_blight: 0.4 }, 0.99));
    const { token } = await registerUser(app);
    const res = await uploadScan(token, { crop: 'tomato' });
    expect(res.body.scan.status).toBe('rejected');
    expect(res.body.scan.severity?.percent ?? null).toBeNull();
  });
});

describe('the sign-in rate limiter', () => {
  /**
   * Reported as "login not working", then "I cannot register either". One shared counter counted
   * every credential request, so a handful of failed sign-ins locked the same person out of
   * creating the account that would have fixed it. The suite raises both limits, so these drive
   * the real routes through a server started with low ones.
   */
  const lowLimits = { AUTH_RATE_LIMIT: '3', REGISTER_RATE_LIMIT: '50' };

  it('does not spend the budget on correct passwords', async () => {
    const { app: strict, teardown } = await startAppWithEnv(lowLimits);
    try {
      const email = `limiter.ok.${process.pid}@example.com`;
      await request(strict)
        .post('/api/auth/register')
        .send({ name: 'Limiter Ok', email, password: 'correct-horse' })
        .expect(201);
      // Far more than the limit of 3, all correct: none of them should count.
      for (let i = 0; i < 12; i += 1) {
        await request(strict).post('/api/auth/login').send({ email, password: 'correct-horse' }).expect(200);
      }
    } finally {
      await teardown();
    }
  });

  it('still locks out repeated wrong passwords', async () => {
    const { app: strict, teardown } = await startAppWithEnv(lowLimits);
    try {
      const email = `limiter.bad.${process.pid}@example.com`;
      await request(strict)
        .post('/api/auth/register')
        .send({ name: 'Limiter Bad', email, password: 'correct-horse' })
        .expect(201);
      for (let i = 0; i < 3; i += 1) {
        await request(strict).post('/api/auth/login').send({ email, password: 'wrong-pass' }).expect(401);
      }
      await request(strict).post('/api/auth/login').send({ email, password: 'wrong-pass' }).expect(429);
    } finally {
      await teardown();
    }
  });

  it('lets someone register even after their sign-ins have been locked out', async () => {
    // This is the trap the user fell into: their account was gone, so every sign-in failed, and
    // the failures then blocked the registration that would have got them back in.
    const { app: strict, teardown } = await startAppWithEnv(lowLimits);
    try {
      for (let i = 0; i < 6; i += 1) {
        await request(strict)
          .post('/api/auth/login')
          .send({ email: `ghost.${process.pid}@example.com`, password: 'nope-nope' });
      }
      await request(strict).post('/api/auth/login').send({ email: 'x@y.z', password: 'nope-nope' }).expect(429);

      // Registration must still be open.
      await request(strict)
        .post('/api/auth/register')
        .send({ name: 'Locked Out', email: `rescued.${process.pid}@example.com`, password: 'correct-horse' })
        .expect(201);
    } finally {
      await teardown();
    }
  });
});
