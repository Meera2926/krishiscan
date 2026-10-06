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
import { Consultation, Crop, Disease, Plot, Scan, Treatment, User } from '../models/index.js';
import { openingMessage } from '../services/consultation.js';
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
  // Demo accounts only. The qualifications below are invented for the demo; a real deployment
  // fills these in from the actual advisers it has on its panel.
  const demoUsers = [
    { name: 'Demo Farmer', email: 'farmer@demo.in', role: 'farmer', state: 'Maharashtra', district: 'Nashik' },
    {
      name: 'Demo Expert',
      email: 'expert@demo.in',
      role: 'expert',
      state: 'Karnataka',
      district: 'Bengaluru Rural',
      expertProfile: {
        qualification: 'M.Sc. (Agri.) Plant Pathology',
        designation: 'Subject Matter Specialist, Plant Protection',
        organisation: 'Krishi Vigyan Kendra, Bengaluru Rural',
        experienceYears: 11,
        crops: ['tomato', 'potato', 'grape'],
        languages: ['en', 'hi'],
        modes: ['chat', 'call', 'visit'],
        bio: 'Works on blight and wilt management in vegetables, and on vineyard disease rounds through the monsoon.',
      },
    },
    {
      name: 'Dr Anjali Rao',
      email: 'anjali.expert@demo.in',
      role: 'expert',
      state: 'Telangana',
      district: 'Warangal',
      expertProfile: {
        qualification: 'Ph.D. Plant Pathology',
        designation: 'Principal Scientist',
        organisation: 'State Agricultural University, Warangal',
        experienceYears: 18,
        crops: ['rice', 'maize'],
        languages: ['en', 'hi'],
        modes: ['chat', 'call'],
        bio: 'Rice blast and sheath blight; runs the district paddy advisory during kharif.',
      },
    },
    {
      name: 'Harpreet Singh',
      email: 'harpreet.expert@demo.in',
      role: 'expert',
      state: 'Punjab',
      district: 'Ludhiana',
      expertProfile: {
        qualification: 'M.Sc. Agronomy',
        designation: 'Agriculture Development Officer',
        organisation: 'Department of Agriculture, Punjab',
        experienceYears: 7,
        crops: ['wheat', 'maize', 'potato'],
        languages: ['en', 'hi'],
        modes: ['chat', 'visit'],
        bio: 'Wheat rust scouting and field visits across Ludhiana block.',
      },
    },
    { name: 'Neighbour Farmer', email: 'neighbour@demo.in', role: 'farmer', state: 'Maharashtra', district: 'Nashik' },
  ];
  const users = {};
  for (const u of demoUsers) {
    let user = await User.findOne({ email: u.email });
    if (!user) {
      user = new User(u);
      await user.setPassword('demo1234');
      await user.save();
    } else if (u.expertProfile && !user.expertProfile?.qualification) {
      user.expertProfile = u.expertProfile;
      await user.save();
    }
    if (u.email === 'expert@demo.in') users.expert = user;
    else users[u.email.split('@')[0]] = user;
  }

  if (await Scan.exists({ modelVersion: 'demo-seed' })) {
    return { skipped: 'demo scans already present' };
  }
  // Scoped to the demo farmer, not just to text. A deleteMany matched only on the wording of a
  // free-text note would take a real farmer's record with it if they happened to start one the
  // same way, and every other destructive query in this app is scoped by owner.
  await Treatment.deleteMany({ owner: users.farmer._id, notes: /^Demo record/ });

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

  const inserted = await Scan.insertMany(docs, { timestamps: false });

  // Expert consultations, so both desks have something on them the moment the demo starts:
  // one request nobody has taken, one happening today with a conversation already going, and
  // one already answered.
  const uncertain = inserted.filter((d) => d.status === 'uncertain').slice(0, 3);
  const consultations = await seedConsultations({ farmer, expert: users.expert, uncertain, diseases });

  return { users: Object.keys(users).length, plots: plots.length, scans: docs.length, consultations };
}

/** Times today and tomorrow that line up with the bookable slot grid (see services/consultation.js). */
function atHour(dayOffset, hour) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function seedConsultations({ farmer, expert, uncertain, diseases }) {
  if (!uncertain.length || !expert) return 0;
  const nameOf = (key) => diseases.find((d) => d.key === key)?.commonName ?? null;
  const summaryFor = (scan) => ({
    crop: scan.declaredCrop,
    diseaseKey: scan.diseaseKey,
    diseaseName: nameOf(scan.diseaseKey),
    confidence: scan.top?.confidence ?? null,
    statusReason: scan.statusReason,
    severityPercent: scan.severity?.percent ?? null,
    imageUrl: scan.image.url,
  });

  const made = [];

  /**
   * Booking a review writes the case into the thread (see the decision route), so every demo
   * case starts the same way a real one does. Calling the app's own builder rather than
   * repeating its wording here means the demo cannot drift from the real thing.
   */
  const opening = (summary, extra, sentAt) => ({
    sender: farmer._id,
    senderRole: 'farmer',
    body: [openingMessage(summary, 'uncertain_diagnosis'), extra].filter(Boolean).join('\n\n'),
    sentAt,
  });

  // 1. Waiting for any expert to take it.
  if (uncertain[0]) {
    made.push({
      farmer: farmer._id,
      scan: uncertain[0]._id,
      plot: uncertain[0].plot,
      trigger: 'uncertain_diagnosis',
      decision: 'scheduled',
      decidedAt: new Date(),
      mode: 'call',
      scheduledFor: atHour(1, 10),
      contactPhone: '9876543210',
      status: 'open',
      caseSummary: summaryFor(uncertain[0]),
      question: 'Spots are spreading to the upper leaves. Should I spray today?',
      messages: [
        opening(
          summaryFor(uncertain[0]),
          'Spots are spreading to the upper leaves. Should I spray today?',
          new Date(Date.now() - 72e5),
        ),
      ],
    });
  }

  // 2. Today, with the expert already on it and the thread started.
  if (uncertain[1]) {
    const summary = summaryFor(uncertain[1]);
    made.push({
      farmer: farmer._id,
      expert: expert._id,
      scan: uncertain[1]._id,
      plot: uncertain[1].plot,
      trigger: 'uncertain_diagnosis',
      decision: 'scheduled',
      decidedAt: new Date(),
      mode: 'chat',
      scheduledFor: atHour(0, new Date().getHours()),
      status: 'confirmed',
      caseSummary: summary,
      messages: [
        opening(summary, 'Lower leaves are worst. I have not sprayed anything yet.', new Date(Date.now() - 36e5)),
        {
          sender: expert._id,
          senderRole: 'expert',
          body: 'Thanks. Can you send one more photo of a leaf from the middle of the plant, with the underside visible?',
          sentAt: new Date(Date.now() - 18e5),
        },
      ],
    });
  }

  // 3. Already answered, so the farmer has advice to read and the expert a record.
  if (uncertain[2]) {
    made.push({
      farmer: farmer._id,
      expert: expert._id,
      scan: uncertain[2]._id,
      plot: uncertain[2].plot,
      trigger: 'uncertain_diagnosis',
      decision: 'scheduled',
      decidedAt: daysAgo(3),
      mode: 'chat',
      scheduledFor: atHour(-2, 11),
      status: 'completed',
      caseSummary: summaryFor(uncertain[2]),
      messages: [
        opening(summaryFor(uncertain[2]), 'It started after four days of rain.', daysAgo(3)),
        {
          sender: expert._id,
          senderRole: 'expert',
          body: 'Confirmed from the photo. Strip the worst lower leaves and keep water off the foliage.',
          sentAt: daysAgo(2),
        },
      ],
      outcome: {
        diseaseKey: uncertain[2].diseaseKey,
        advice:
          'Confirmed from the photo. Remove and destroy the worst lower leaves, avoid overhead irrigation, and scan again in a week so we can see whether it is still spreading.',
        completedAt: daysAgo(2),
      },
    });
  }

  await Consultation.insertMany(made);
  return made.length;
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

  /**
   * Without MONGO_URI, connectDatabase() starts a throwaway in-memory MongoDB that
   * disconnectDatabase() stops again a moment later. Seeding it writes 33 documents into a server
   * that no longer exists by the time the command prints its success line — the worst kind of
   * no-op, because it looks like it worked.
   */
  if (!config.MONGO_URI) {
    console.error('Nothing was seeded: MONGO_URI is not set.');
    console.error('');
    console.error('Without it this command starts a temporary in-memory MongoDB, writes to it, and');
    console.error('throws it away on exit. Set MONGO_URI in server/.env to seed a real database:');
    console.error('');
    console.error('    cp server/.env.example server/.env   # then fill in MONGO_URI');
    console.error('');
    console.error('For local development you do not need this command at all. `npm run dev` starts an');
    console.error('in-memory database and seeds it, demo accounts included, every time it boots.');
    process.exit(1);
  }

  await connectDatabase();
  try {
    await seedDatabase({ withDemoData });
  } finally {
    await disconnectDatabase();
  }
}
