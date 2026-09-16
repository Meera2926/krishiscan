import { config } from '../../config/env.js';
import { serviceUnavailable } from '../../utils/httpError.js';
import { getLabelIndex } from '../labelIndex.js';

const state = {
  status: 'idle', // idle | loading | ready | failed
  driver: config.INFERENCE_DRIVER,
  modelVersion: null,
  labelCount: 0,
  error: null,
  loadMs: null,
};

let classifier = null;
let loading = null;

/**
 * Loads the classifier once. The HTTP server starts listening before this finishes, so
 * hosts that health-check the port during boot do not kill a slow model download.
 */
export function loadClassifier() {
  loading ??= (async () => {
    state.status = 'loading';
    const started = Date.now();
    try {
      if (config.INFERENCE_DRIVER === 'mock') {
        const { createMockClassifier } = await import('./mock.js');
        const labels = [...(await getLabelIndex()).keys()];
        classifier = createMockClassifier({ labels });
      } else {
        const { createLocalClassifier } = await import('./local.js');
        classifier = await createLocalClassifier({ cacheDir: config.MODEL_CACHE_DIR, threads: config.ORT_THREADS });
      }
      Object.assign(state, {
        status: 'ready',
        modelVersion: classifier.modelVersion,
        labelCount: classifier.labels.length,
        error: null,
        loadMs: Date.now() - started,
      });
      console.log(`[inference] ${state.driver} classifier ready (${state.modelVersion}, ${state.labelCount} classes, ${state.loadMs} ms)`);
    } catch (err) {
      Object.assign(state, { status: 'failed', error: err.message });
      console.error('[inference] failed to load classifier:', err);
      // Allow a later retry (e.g. after a transient network failure downloading weights).
      loading = null;
    }
    return state;
  })();
  return loading;
}

export function classifierStatus() {
  return { ...state };
}

export function classifierLabels() {
  return classifier?.labels ?? [];
}

/** Classifies a leaf photo for the given crop. See catalog.js CROP_ROUTES for which model runs. */
export async function classify(imageBuffer, { crop }) {
  if (state.status !== 'ready') {
    if (state.status === 'failed') loadClassifier();
    throw serviceUnavailable('The disease model is still starting up. Please try again in a minute.');
  }
  const started = performance.now();
  const result = await classifier.classify(imageBuffer, { crop });
  return {
    predictions: result.predictions,
    invalidProbability: result.invalidProbability ?? 0,
    modelVersion: result.modelVersion ?? classifier.modelVersion,
    inferenceMs: Math.round(performance.now() - started),
  };
}

/** Test hook: swap in a fake classifier without touching the network or disk. */
export function __setClassifierForTests(fake) {
  classifier = fake;
  loading = Promise.resolve(state);
  Object.assign(state, {
    status: fake ? 'ready' : 'idle',
    driver: 'test',
    modelVersion: fake?.modelVersion ?? null,
    labelCount: fake?.labels.length ?? 0,
    error: null,
  });
}
