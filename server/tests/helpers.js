import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import { vi } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import { Crop, Disease } from '../src/models/index.js';
import { __setClassifierForTests } from '../src/services/inference/index.js';
import { createMockClassifier } from '../src/services/inference/mock.js';
import { invalidateLabelIndex } from '../src/services/labelIndex.js';

export const TEST_DISEASES = [
  { key: 'tomato_late_blight', crop: 'tomato', commonName: 'Late blight', causalAgentType: 'oomycete', severity: 'severe', preventive: ['Avoid overhead irrigation'] },
  { key: 'tomato_early_blight', crop: 'tomato', commonName: 'Early blight', causalAgentType: 'fungal', severity: 'moderate' },
  { key: 'tomato_healthy', crop: 'tomato', commonName: 'Healthy', isHealthy: true, severity: 'none' },
  { key: 'rice_leaf_blast', crop: 'rice', commonName: 'Leaf blast', causalAgentType: 'fungal', severity: 'severe' },
  { key: 'rice_healthy', crop: 'rice', commonName: 'Healthy', isHealthy: true, severity: 'none' },
];

export async function setupTestApp() {
  await connectDatabase();
  await Crop.create([
    { key: 'tomato', name: 'Tomato', supportedByModel: true },
    { key: 'rice', name: 'Rice', supportedByModel: true },
  ]);
  await Disease.create(TEST_DISEASES);
  invalidateLabelIndex();
  __setClassifierForTests(createMockClassifier({ labels: TEST_DISEASES.map((d) => d.key) }));
  return createApp();
}

/**
 * Builds an app whose auth routes were constructed under different environment values.
 *
 * config is read once at import and frozen, so changing process.env after the fact does nothing.
 * Resetting the module registry and re-importing is the only way to exercise the real routes at
 * a limit low enough to reach in a test, rather than testing a copy of them.
 */
export async function startAppWithEnv(env) {
  const previous = {};
  for (const [k, v] of Object.entries(env)) {
    previous[k] = process.env[k];
    process.env[k] = v;
  }
  vi.resetModules();
  const { createApp: freshCreateApp } = await import('../src/app.js');
  const app = freshCreateApp();
  return {
    app,
    async teardown() {
      for (const [k, v] of Object.entries(previous)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      vi.resetModules();
    },
  };
}

export async function teardownTestApp() {
  __setClassifierForTests(null);
  await disconnectDatabase();
}

/** Registers a user and returns an agent that carries the refresh cookie, plus the access token. */
/**
 * A counter, not a clock. `Math.floor(performance.now() * 1000)` returned the same value for two
 * consecutive calls 88% of the time on Windows, where the timer resolution is clamped, so two
 * users registered in quick succession could ask for the same email and the second got a 409
 * instead of a 201. That surfaced as a test that failed roughly one run in four for no reason
 * anyone could see.
 */
let nextUser = 0;

export async function registerUser(app, overrides = {}) {
  const agent = request.agent(app);
  const body = {
    name: 'Test Farmer',
    email: `farmer${(nextUser += 1)}.${process.pid}@example.com`,
    password: 'correct-horse',
    ...overrides,
  };
  const res = await agent.post('/api/auth/register').send(body).expect(201);
  return { agent, token: res.body.accessToken, user: res.body.user, password: body.password };
}

/** A real, decodable JPEG with some green in it. `seed` varies the pixels, so the mock varies its output. */
export function leafJpeg(seed = 0) {
  return sharp({
    create: { width: 320, height: 320, channels: 3, background: { r: 40 + (seed % 50), g: 140, b: 60 } },
  })
    .composite([
      {
        input: Buffer.from(`<svg width="320" height="320"><circle cx="${100 + seed}" cy="160" r="40" fill="#6b4a1f"/></svg>`),
      },
    ])
    .jpeg()
    .toBuffer();
}

/** Classifier that always returns the given distribution, for exact triage assertions. */
export function fixedClassifier(distribution, invalidProbability = 0) {
  return {
    modelVersion: 'fixed-test',
    labels: Object.keys(distribution),
    async classify() {
      return {
        predictions: Object.entries(distribution).map(([label, confidence]) => ({ label, confidence })),
        invalidProbability,
        modelVersion: 'fixed-test',
      };
    },
  };
}

/** Whether a stored upload still exists on disk, for retention tests. */
export async function storedFileExists(storageKey) {
  if (!storageKey) return false;
  try {
    await fs.access(path.join(process.env.UPLOAD_DIR, storageKey));
    return true;
  } catch {
    return false;
  }
}

export async function cleanUploads() {
  await fs.rm(process.env.UPLOAD_DIR, { recursive: true, force: true });
}
