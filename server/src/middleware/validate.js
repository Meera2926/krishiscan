import { z } from 'zod';
import { resolveCrop } from '../services/inference/catalog.js';
import { unprocessable } from '../utils/httpError.js';

/**
 * Validates req.body / req.query / req.params against Zod schemas.
 * Express 5 makes req.query a read-only getter, so parsed values land on req.valid instead.
 */
export function validate(schemas) {
  return (req, _res, next) => {
    req.valid ??= {};
    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part] ?? {});
      if (!result.success) {
        return next(unprocessable('Validation failed', z.flattenError(result.error).fieldErrors));
      }
      req.valid[part] = result.data;
    }
    next();
  };
}

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export const idParams = z.object({ id: objectId });

/** A crop the client named, normalised to its canonical key so "Corn" reaches maize. */
export const cropKey = z.string().trim().max(40).transform(resolveCrop);
