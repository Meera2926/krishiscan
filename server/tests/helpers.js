import fs from 'node:fs/promises';
import sharp from 'sharp';
import request from 'supertest';
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

export async function teardownTestApp() {
  __setClassifierForTests(null);
  await disconnectDatabase();
}

/** Registers a user and returns an agent that carries the refresh cookie, plus the access token. */
export async function registerUser(app, overrides = {}) {
  const agent = request.agent(app);
  const body = {
    name: 'Test Farmer',
    email: `farmer${Math.floor(performance.now() * 1000)}@example.com`,
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

export async function cleanUploads() {
  await fs.rm(process.env.UPLOAD_DIR, { recursive: true, force: true });
}
