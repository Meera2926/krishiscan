/**
 * Seeds crops and the disease knowledge base, and optionally demo users, plots and scans.
 *
 *   npm run seed            crops + diseases only (safe to re-run; upserts by key)
 *   npm run seed -- --demo  also demo accounts and synthetic outbreak reports
 *
 * Demo scans are clearly marked with modelVersion "demo-seed" and use generated placeholder
 * images. Never run --demo against a production database.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { Crop, Disease, Plot, Scan, Treatment, User } from '../models/index.js';
import { SUPPORTED_CROPS, resolveCrop } from '../services/inference/catalog.js';
import { invalidateLabelIndex } from '../services/labelIndex.js';
import { storage } from '../services/storage/index.js';
import { toPoint } from '../utils/geo.js';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');

async function readJson(name) {
  return JSON.parse(await fs.readFile(path.join(DATA_DIR, name), 'utf8'));
}

export async function seedLibrary() {
  const [crops, diseases] = await Promise.all([readJson('crops.json'), readJson('diseases.json')]);

  const unknownCrop = diseases.find((d) => !crops.some((c) => c.key === d.crop));
  if (unknownCrop) throw new Error(`Disease ${unknownCrop.key} references unknown crop ${unknownCrop.crop}`);

  // A displayed alias the API would not accept sends farmers to the wrong classifier.
  for (const c of crops) {
    for (const alias of c.aliases ?? []) {
      if (resolveCrop(alias) !== c.key) {
        throw new Error(`Crop "${c.key}" lists alias "${alias}", but CROP_ALIASES maps it to "${resolveCrop(alias)}"`);
      }
    }
  }

  await Crop.bulkWrite(
    crops.map((c) => ({
      updateOne: {
        filter: { key: c.key },
        update: { $set: { ...c, supportedByModel: SUPPORTED_CROPS.includes(c.key) } },
        upsert: true,
      },
    })),
  );
  await Disease.bulkWrite(
    diseases.map((d) => ({ updateOne: { filter: { key: d.key }, update: { $set: d }, upsert: true } })),
  );
  invalidateLabelIndex();
  return { crops: crops.length, diseases: diseases.length };
}

// Real agricultural districts growing each crop, so the demo map looks plausible.
const DEMO_REGIONS = [
  { crop: 'grape', district: 'Nashik', state: 'Maharashtra', lat: 20.0, lng: 73.79 },
  { crop: 'tomato', district: 'Kolar', state: 'Karnataka', lat: 13.14, lng: 78.13 },
  { crop: 'potato', district: 'Hooghly', state: 'West Bengal', lat: 22.9, lng: 88.39 },
  { crop: 'wheat', district: 'Ludhiana', state: 'Punjab', lat: 30.9, lng: 75.85 },
  { crop: 'rice', district: 'Palakkad', state: 'Kerala', lat: 10.78, lng: 76.65 },
  { crop: 'maize', district: 'Davanagere', state: 'Karnataka', lat: 14.46, lng: 75.92 },
];

/** Tiny deterministic PRNG so demo data is identical on every run. */
function prng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

async function placeholderImage(label, hue) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480">
    <rect width="100%" height="100%" fill="hsl(${hue},45%,38%)"/>
    <text x="50%" y="46%" font-family="sans-serif" font-size="30" fill="#fff" text-anchor="middle">DEMO DATA</text>
    <text x="50%" y="58%" font-family="sans-serif" font-size="20" fill="#fff" text-anchor="middle">${label.replace(/[<&>]/g, '')}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 70 }).toBuffer();
}

export async function seedDemo() {
  const demoUsers = [
    { name: 'Demo Farmer', email: 'farmer@demo.in', role: 'farmer', state: 'Maharashtra', district: 'Nashik' },
    { name: 'Demo Expert', email: 'expert@demo.in', role: 'expert', state: 'Karnataka', district: 'Bengaluru Rural' },
    { name: 'Neighbour Farmer', email: 'neighbour@demo.in', role: 'farmer', state: 'Maharashtra', district: 'Nashik' },
  ];
  const users = {};
  for (const u of demoUsers) {
    let user = await User.findOne({ email: u.email });
    if (!user) {
      user = new User(u);
      await user.setPassword('demo1234');
      await user.save();
    }
    users[u.role === 'expert' ? 'expert' : u.email.split('@')[0]] = user;
  }

  if (await Scan.exists({ modelVersion: 'demo-seed' })) {
    return { skipped: 'demo scans already present' };
  }
  await Treatment.deleteMany({ notes: /^Demo record/ });

  const farmer = users.farmer;
  const neighbour = users.neighbour;
  const plots = await Plot.insertMany([
    { owner: farmer._id, name: 'Vineyard block A', crop: 'grape', variety: 'Thompson Seedless', sowingDate: daysAgo(400), areaAcres: 2.5, location: toPoint(20.012, 73.781), state: 'Maharashtra', district: 'Nashik' },
    { owner: farmer._id, name: 'Tomato field', crop: 'tomato', variety: 'Arka Rakshak', sowingDate: daysAgo(55), areaAcres: 1, location: toPoint(20.021, 73.802), state: 'Maharashtra', district: 'Nashik' },
  ]);

  const diseases = await Disease.find({ isHealthy: false }).lean();
  const byCrop = Object.groupBy(diseases, (d) => d.crop);
  const rand = prng(20260916);
  const docs = [];

  // A visible cluster near the demo farmer's tomato plot, so plot alerts have something to show.
  const tomatoLateBlight = diseases.find((d) => d.key === 'tomato_late_blight');
  const clusters = [
    ...DEMO_REGIONS.map((r) => ({ ...r, count: 8 })),
    ...(tomatoLateBlight ? [{ crop: 'tomato', lat: 20.035, lng: 73.83, count: 6, only: 'tomato_late_blight' }] : []),
  ];

  const imageCache = new Map();
  for (const region of clusters) {
    const options = region.only ? diseases.filter((d) => d.key === region.only) : (byCrop[region.crop] ?? []);
    if (!options.length) continue;
    for (let i = 0; i < region.count; i += 1) {
      const disease = options[Math.floor(rand() * options.length)];
      if (!imageCache.has(disease.key)) {
        const buffer = await placeholderImage(disease.commonName, Math.floor(rand() * 60) + 60);
        imageCache.set(disease.key, { ...(await storage.put(buffer, { extension: 'jpg' })), bytes: buffer.length });
      }
      const image = imageCache.get(disease.key);
      const confidence = 0.72 + rand() * 0.26;
      docs.push({
        owner: neighbour._id,
        declaredCrop: disease.crop,
        image: { url: image.url, storageKey: image.storageKey, width: 480, height: 480, bytes: image.bytes, format: 'jpeg' },
        quality: { ok: true, brightness: 120, sharpness: 8, warnings: [] },
        predictions: [{ label: disease.key, confidence, diseaseKey: disease.key }],
        top: { label: disease.key, confidence, diseaseKey: disease.key },
        crop: disease.crop,
        diseaseKey: disease.key,
        isHealthy: false,
        status: 'confident',
        statusReason: 'ok',
        cropProbability: 0.95,
        invalidProbability: 0.01,
        modelVersion: 'demo-seed',
        inferenceMs: 0,
        // Scatter within ~15 km of the region centre.
        location: toPoint(region.lat + (rand() - 0.5) * 0.25, region.lng + (rand() - 0.5) * 0.25),
        shareLocation: true,
        review: { status: 'none' },
        createdAt: daysAgo(Math.floor(rand() * 28)),
      });
    }
  }

  // A progression story on the tomato plot: disease climbs, a spray is logged, severity falls.
  const storyDisease = diseases.find((d) => d.key === 'tomato_late_blight') ?? byCrop.tomato?.[0];
  if (storyDisease) {
    const course = [
      [24, 4.2],
      [19, 9.1],
      [14, 15.8],
      [9, 22.4],
      [4, 12.3],
      [1, 6.1],
    ];
    for (const [daysBack, percent] of course) {
      const buffer = await placeholderImage(`${storyDisease.commonName} ${percent}%`, 95 - percent);
      const saved = await storage.put(buffer, { extension: 'jpg' });
      const confidence = 0.78 + rand() * 0.18;
      docs.push({
        owner: farmer._id,
        plot: plots[1]._id,
        declaredCrop: 'tomato',
        image: { url: saved.url, storageKey: saved.storageKey, width: 480, height: 480, bytes: buffer.length, format: 'jpeg' },
        quality: { ok: true, brightness: 118, sharpness: 7, warnings: [] },
        severity: { percent, grade: percent <= 1 ? 0 : percent <= 5 ? 1 : percent <= 10 ? 2 : percent <= 25 ? 3 : 4, leafFraction: 0.55, reliable: true, method: 'demo-seed' },
        predictions: [{ label: storyDisease.key, confidence, diseaseKey: storyDisease.key }],
        top: { label: storyDisease.key, confidence, diseaseKey: storyDisease.key },
        crop: 'tomato',
        diseaseKey: storyDisease.key,
        isHealthy: false,
        status: 'confident',
        statusReason: 'ok',
        cropProbability: 0.93,
        invalidProbability: 0.01,
        modelVersion: 'demo-seed',
        inferenceMs: 0,
        location: plots[1].location,
        shareLocation: true,
        review: { status: 'none' },
        createdAt: daysAgo(daysBack),
      });
    }

    await Treatment.create({
      owner: farmer._id,
      plot: plots[1]._id,
      diseaseKey: storyDisease.key,
      type: 'chemical',
      product: 'Mancozeb 75% WP',
      activeIngredient: 'Mancozeb',
      dose: 'As per label; confirm with local KVK',
      appliedAt: daysAgo(8),
      phiDays: 7,
      notes: 'Demo record: sprayed after severity crossed 20%.',
    });
  }

  // A few uncertain scans from the demo farmer so the expert queue is not empty.
  const tomatoOptions = byCrop.tomato ?? [];
  for (let i = 0; i < Math.min(3, tomatoOptions.length); i += 1) {
    const disease = tomatoOptions[i];
    const alt = tomatoOptions[(i + 1) % tomatoOptions.length];
    const buffer = await placeholderImage(`Uncertain: ${disease.commonName}`, 30);
    const saved = await storage.put(buffer, { extension: 'jpg' });
    docs.push({
      owner: farmer._id,
      plot: plots[1]._id,
      declaredCrop: 'tomato',
      image: { url: saved.url, storageKey: saved.storageKey, width: 480, height: 480, bytes: buffer.length, format: 'jpeg' },
      quality: { ok: true, brightness: 110, sharpness: 6, warnings: [] },
      predictions: [
        { label: disease.key, confidence: 0.52, diseaseKey: disease.key },
        { label: alt.key, confidence: 0.41, diseaseKey: alt.key },
      ],
      top: { label: disease.key, confidence: 0.52, diseaseKey: disease.key },
      crop: 'tomato',
      diseaseKey: disease.key,
      isHealthy: false,
      status: 'uncertain',
      statusReason: 'low_confidence',
      cropProbability: 0.9,
      invalidProbability: 0.02,
      modelVersion: 'demo-seed',
      inferenceMs: 0,
      location: plots[1].location,
      shareLocation: true,
      review: { status: 'pending' },
      createdAt: daysAgo(i + 1),
    });
  }

  await Scan.insertMany(docs, { timestamps: false });
  return { users: Object.keys(users).length, plots: plots.length, scans: docs.length };
}

export async function seedDatabase({ withDemoData = false } = {}) {
  const library = await seedLibrary();
  const demo = withDemoData ? await seedDemo() : null;
  console.log('[seed] library', library, demo ? `demo ${JSON.stringify(demo)}` : '');
  return { library, demo };
}

function daysAgo(n) {
  return new Date(Date.now() - n * 864e5 - Math.floor(n * 3.7) * 3600e3);
}

// Run directly: `node src/seed/seed.js [--demo]`
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { connectDatabase, disconnectDatabase } = await import('../config/db.js');
  const { config } = await import('../config/env.js');
  const withDemoData = process.argv.includes('--demo');
  if (withDemoData && config.isProd) {
    console.error('Refusing to seed demo data into a production database.');
    process.exit(1);
  }
  await connectDatabase();
  try {
    await seedDatabase({ withDemoData });
  } finally {
    await disconnectDatabase();
  }
}
