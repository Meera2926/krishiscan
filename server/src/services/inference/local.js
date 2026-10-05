import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ort from 'onnxruntime-node';
import sharp from 'sharp';
import {
  CROP_ROUTES,
  INVALID_LABEL,
  MODELS,
  OOD_GATE_MODEL,
  SINGLE_MODEL_CROPS,
  cropProbability,
  modelVersion,
  unifiedLabel,
} from './catalog.js';

const INFERENCE_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolves a model to a file on disk: either one shipped with the app, or a pinned Hugging Face
 * download cached once. Both are verified by size before use.
 */
async function ensureModelFile(model, cacheDir) {
  if (model.localFile) {
    // Trained for this project and committed alongside it; nothing to download.
    const shipped = path.join(INFERENCE_DIR, model.localFile);
    const stat = await fs.stat(shipped).catch(() => null);
    if (!stat) throw new Error(`${model.name} is missing from the repository at ${shipped}`);
    if (stat.size !== model.bytes) {
      throw new Error(`${model.name} is ${stat.size} bytes on disk, expected ${model.bytes}`);
    }
    return shipped;
  }

  const target = path.join(cacheDir, model.repo.replace('/', '__'), model.revision, model.file);
  try {
    const stat = await fs.stat(target);
    if (stat.size === model.bytes) return target;
  } catch {
    // Not cached yet.
  }

  const url = `https://huggingface.co/${model.repo}/resolve/${model.revision}/${model.file}`;
  console.log(`[inference] downloading ${model.name} (${(model.bytes / 1e6).toFixed(1)} MB)`);
  const res = await fetch(url, { signal: AbortSignal.timeout(5 * 60_000) });
  if (!res.ok) throw new Error(`Model download failed: HTTP ${res.status} for ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length !== model.bytes) {
    throw new Error(`Model download for ${model.repo} was ${buffer.length} bytes, expected ${model.bytes}`);
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  // Write-then-rename so a crash mid-write never leaves a truncated model in the cache.
  const partial = `${target}.partial`;
  await fs.writeFile(partial, buffer);
  await fs.rename(partial, target);
  return target;
}

/** Decodes an image into a normalised NCHW float32 tensor matching the model's preprocessing. */
export async function toTensor(imageBuffer, pre) {
  let pipeline = sharp(imageBuffer).rotate().removeAlpha().toColourspace('srgb');
  let size;

  // sharp's resize() anti-aliases when downscaling, like Pillow's BILINEAR filter that these
  // models were trained with. (transformers.js uses an affine transform without anti-aliasing,
  // so its probabilities drift slightly from ours on large photos; top-1 agrees on PlantVillage.)
  if (pre.shortestEdge) {
    // Resize the short side, then centre-crop: what MobileNetV2FeatureExtractor does.
    const meta = await sharp(imageBuffer).rotate().metadata();
    const w = meta.autoOrient?.width ?? meta.width;
    const h = meta.autoOrient?.height ?? meta.height;
    const scale = pre.shortestEdge / Math.min(w, h);
    const rw = Math.max(pre.crop, Math.round(w * scale));
    const rh = Math.max(pre.crop, Math.round(h * scale));
    pipeline = pipeline
      .resize(rw, rh, { fit: 'fill', kernel: 'linear' })
      .extract({
        left: Math.floor((rw - pre.crop) / 2),
        top: Math.floor((rh - pre.crop) / 2),
        width: pre.crop,
        height: pre.crop,
      });
    size = pre.crop;
  } else {
    pipeline = pipeline.resize(pre.resize, pre.resize, { fit: 'fill', kernel: 'linear' });
    size = pre.resize;
  }

  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 3 || info.width !== size || info.height !== size) {
    throw new Error(`Unexpected preprocessed shape ${info.width}x${info.height}x${info.channels}`);
  }

  const plane = size * size;
  const tensor = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i += 1) {
    for (let c = 0; c < 3; c += 1) {
      tensor[c * plane + i] = (data[i * 3 + c] / 255 - pre.mean[c]) / pre.std[c];
    }
  }
  return new ort.Tensor('float32', tensor, [1, 3, size, size]);
}

/** Mean of several probability distributions; a label missing from one counts as 0 there. */
export function average(distributions) {
  const merged = new Map();
  for (const dist of distributions) {
    for (const { label, confidence } of dist) {
      merged.set(label, (merged.get(label) ?? 0) + confidence / distributions.length);
    }
  }
  return [...merged].map(([label, confidence]) => ({ label, confidence }));
}

export function softmax(logits) {
  const max = Math.max(...logits);
  const exps = Array.from(logits, (x) => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/**
 * Runs every pinned model locally with onnxruntime-node: no Python and no external API calls
 * once the weights are cached. Classification is routed by crop (see CROP_ROUTES).
 */
export async function createLocalClassifier({ cacheDir, threads = 0 }) {
  const sessions = {};
  for (const [key, model] of Object.entries(MODELS)) {
    const file = await ensureModelFile(model, cacheDir);
    sessions[key] = await ort.InferenceSession.create(file, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
      // The default memory arena roughly doubles resident memory, which matters on a 512 MB host.
      enableCpuMemArena: false,
      ...(threads > 0 ? { intraOpNumThreads: threads } : {}),
    });
  }

  // Sessions are not safe to run concurrently on a tiny CPU; queue requests per model.
  const queues = Object.fromEntries(Object.keys(MODELS).map((k) => [k, Promise.resolve()]));

  async function runModel(key, imageBuffer) {
    const model = MODELS[key];
    const run = async () => {
      const input = await toTensor(imageBuffer, model.preprocess);
      const outputs = await sessions[key].run({ [model.input]: input });
      const logits = outputs[model.output].data;
      if (logits.length !== model.labels.length) {
        throw new Error(`${model.name} returned ${logits.length} logits for ${model.labels.length} labels`);
      }
      return softmax(logits).map((p, i) => ({ label: unifiedLabel(key, model.labels[i]), confidence: p }));
    };
    const result = queues[key].then(run, run);
    queues[key] = result.catch(() => {});
    return result;
  }

  return {
    modelVersion: modelVersion(Object.keys(MODELS)),
    labels: [...new Set(Object.keys(MODELS).flatMap((k) => MODELS[k].labels.map((l) => unifiedLabel(k, l))))],

    async classify(imageBuffer, { crop }) {
      const route = CROP_ROUTES[crop];
      if (!route) throw new Error(`No model route for crop "${crop}"`);

      // The gate model has an explicit "not a crop leaf" class; run it even when it is not
      // routed for this crop, purely to catch photos of cars, people, walls and so on.
      const needsGate = !route.includes(OOD_GATE_MODEL);
      const [perModel, gate] = await Promise.all([
        Promise.all(route.map((k) => runModel(k, imageBuffer))),
        needsGate ? runModel(OOD_GATE_MODEL, imageBuffer) : null,
      ]);
      const gateDist = gate ?? perModel[route.indexOf(OOD_GATE_MODEL)];
      const invalidProbability = gateDist.find((p) => p.label === INVALID_LABEL)?.confidence ?? 0;

      // Average across models. Labels one model lacks count as 0 for that model, so the result
      // is still a proper probability distribution.
      const used = needsGate ? [...route, OOD_GATE_MODEL] : route;
      const predictions = average(perModel);

      /**
       * For crops served by the model that was trained on all of them, how much of the
       * probability actually lands on the crop the farmer said they photographed. Low means the
       * photo is of something else, and diagnosis.js refuses rather than naming the least
       * unlikely disease of the wrong plant.
       */
      const cropMatch = SINGLE_MODEL_CROPS.includes(crop) ? cropProbability(predictions, crop) : null;

      return {
        predictions,
        cropMatch,
        invalidProbability,
        modelVersion: modelVersion(used),
        perModel: Object.fromEntries(
          route.map((k, i) => [k, [...perModel[i]].sort((a, b) => b.confidence - a.confidence).slice(0, 3)]),
        ),
      };
    },
  };
}
