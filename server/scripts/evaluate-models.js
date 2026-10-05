/**
 * Evaluates the local classifiers and the diagnosis triage on a folder of labelled photos.
 *
 *   node scripts/evaluate-models.js <dataset-dir> [--json results.json]
 *
 * Folder layout:  <dataset-dir>/<crop>/<disease_key>/*.jpg
 *   e.g. eval/tomato/tomato_late_blight/IMG_001.jpg
 * Use the folder name "not_a_leaf" for photos that should be rejected (cars, people, soil...).
 *
 * Report the numbers from YOUR OWN field photos, not PlantVillage: the models were trained on
 * PlantVillage-style images, so scores there say little about real-world accuracy.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { diagnose } from '../src/services/diagnosis.js';
import { GATE_MODEL_CROPS, MODELS, SUPPORTED_CROPS } from '../src/services/inference/catalog.js';
import { createLocalClassifier } from '../src/services/inference/local.js';

const [dir, ...rest] = process.argv.slice(2);
if (!dir) {
  console.error('Usage: node scripts/evaluate-models.js <dataset-dir> [--json out.json]');
  process.exit(1);
}
const jsonIndex = rest.indexOf('--json');
const jsonOut = jsonIndex >= 0 ? rest[jsonIndex + 1] : null;

const HIGH = Number(process.env.CONFIDENCE_HIGH ?? 0.7);
const IMAGE = /\.(jpe?g|png|webp)$/i;

const labelIndex = new Map();
for (const model of Object.values(MODELS)) {
  for (const key of Object.values(model.labelToKey)) {
    labelIndex.set(key, { diseaseKey: key, crop: key.split('_')[0], isHealthy: key.endsWith('_healthy') });
  }
}

const samples = [];
for (const crop of await fs.readdir(dir)) {
  if (!SUPPORTED_CROPS.includes(crop)) {
    console.warn(`Skipping folder "${crop}": not one of ${SUPPORTED_CROPS.join(', ')}`);
    continue;
  }
  for (const truth of await fs.readdir(path.join(dir, crop))) {
    const classDir = path.join(dir, crop, truth);
    if (!(await fs.stat(classDir)).isDirectory()) continue;
    for (const file of await fs.readdir(classDir)) {
      if (IMAGE.test(file)) samples.push({ crop, truth, file: path.join(classDir, file) });
    }
  }
}
if (!samples.length) {
  console.error('No images found. Expected <dir>/<crop>/<disease_key>/*.jpg');
  process.exit(1);
}

const mb = () => Math.round(process.memoryUsage().rss / 1e6);
let started = performance.now();
const classifier = await createLocalClassifier({ cacheDir: path.resolve('models-cache') });
console.log(`Loaded models in ${Math.round(performance.now() - started)} ms, RSS ${mb()} MB. Evaluating ${samples.length} photos…\n`);

const rows = [];
for (const s of samples) {
  started = performance.now();
  const out = await classifier.classify(await fs.readFile(s.file), { crop: s.crop });
  const ms = performance.now() - started;
  const d = diagnose(out.predictions, {
    labelIndex,
    declaredCrop: s.crop,
    invalidProbability: out.invalidProbability,
    gateKnowsCrop: GATE_MODEL_CROPS.includes(s.crop),
    high: HIGH,
  });
  rows.push({ ...s, ms, status: d.status, reason: d.statusReason, predicted: d.diseaseKey, confidence: d.top.confidence, invalidProbability: out.invalidProbability });
}

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : 'n/a');
const leaves = rows.filter((r) => r.truth !== 'not_a_leaf');
const nonLeaves = rows.filter((r) => r.truth === 'not_a_leaf');
const answered = leaves.filter((r) => r.status !== 'rejected');
const confident = leaves.filter((r) => r.status === 'confident');
const correct = (r) => r.predicted === r.truth;

console.log('Overall');
console.log(`  Leaf photos:                    ${leaves.length}`);
console.log(`  Answered (not rejected):        ${pct(answered.length, leaves.length)}`);
console.log(`  Top-1 accuracy when answered:   ${pct(answered.filter(correct).length, answered.length)}`);
console.log(`  Share marked confident:         ${pct(confident.length, leaves.length)}`);
console.log(`  Accuracy when confident:        ${pct(confident.filter(correct).length, confident.length)}   <- what farmers act on`);
console.log(`  Wrongly rejected leaves:        ${leaves.length - answered.length}`);
console.log(`  Non-leaf photos rejected:       ${pct(nonLeaves.filter((r) => r.status === 'rejected').length, nonLeaves.length)} of ${nonLeaves.length}`);

console.log('\nPer class (answered accuracy · confident accuracy · n)');
const classes = [...new Set(leaves.map((r) => r.truth))].sort();
for (const c of classes) {
  const all = leaves.filter((r) => r.truth === c);
  const a = all.filter((r) => r.status !== 'rejected');
  const k = all.filter((r) => r.status === 'confident');
  console.log(`  ${c.padEnd(32)} ${pct(a.filter(correct).length, a.length).padStart(7)} · ${pct(k.filter(correct).length, k.length).padStart(7)} · ${all.length}`);
}

const confusions = new Map();
for (const r of answered.filter((x) => !correct(x))) {
  const key = `${r.truth} -> ${r.predicted}`;
  confusions.set(key, (confusions.get(key) ?? 0) + 1);
}
if (confusions.size) {
  console.log('\nMost common mistakes');
  [...confusions].sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([k, n]) => console.log(`  ${n} × ${k}`));
}

const times = rows.map((r) => r.ms).sort((a, b) => a - b);
console.log(`\nLatency: median ${Math.round(times[Math.floor(times.length / 2)])} ms, p95 ${Math.round(times[Math.floor(times.length * 0.95)])} ms. Peak RSS ${mb()} MB.`);

if (jsonOut) {
  await fs.writeFile(jsonOut, JSON.stringify({ thresholds: { high: HIGH }, rows }, null, 2));
  console.log(`Per-image results written to ${jsonOut}`);
}
