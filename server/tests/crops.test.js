import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_CROPS, resolveCrop } from '../src/services/inference/catalog.js';

const CROPS_JSON = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/seed/data/crops.json');
const readCrops = async () => JSON.parse(await fs.readFile(CROPS_JSON, 'utf8'));

describe('crop names', () => {
  it('resolves the other names farmers use', () => {
    expect(resolveCrop('Corn')).toBe('maize');
    expect(resolveCrop('  PADDY ')).toBe('rice');
    expect(resolveCrop('Tomato')).toBe('tomato');
    expect(resolveCrop('banana')).toBe('banana');
    expect(resolveCrop(undefined)).toBe('');
  });

  it('offers corn as a way to reach maize', async () => {
    const maize = (await readCrops()).find((c) => c.key === 'maize');
    expect(maize.aliases).toContain('Corn');
  });

  it('accepts every alias it displays', async () => {
    // A picker that shows "Corn" while the API rejects it would send farmers to another crop's
    // classifier, which answers confidently rather than failing.
    for (const crop of await readCrops()) {
      for (const alias of crop.aliases ?? []) expect(resolveCrop(alias)).toBe(crop.key);
    }
  });

  it('only aliases crops the classifier actually covers', async () => {
    for (const crop of await readCrops()) {
      if ((crop.aliases ?? []).length) expect(SUPPORTED_CROPS).toContain(crop.key);
    }
  });
});

describe('the knowledge base', () => {
  it('passes the Disease schema it is seeded into', async () => {
    // The seed upserts with bulkWrite, which casts but does not validate, so an entry the schema
    // would refuse still lands in the database. Two tipburn entries did, with a cause of
    // "abiotic" the schema did not list.
    const { Disease } = await import('../src/models/index.js');
    const DISEASES_JSON = path.join(path.dirname(CROPS_JSON), 'diseases.json');
    const entries = JSON.parse(await fs.readFile(DISEASES_JSON, 'utf8'));
    const invalid = [];
    for (const d of entries) {
      await new Disease(d).validate().catch((err) => invalid.push(`${d.key}: ${err.message}`));
    }
    expect(invalid).toEqual([]);
  });
});
