import mongoose from 'mongoose';
import multer from 'multer';
import { config } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { message: `No route for ${req.method} ${req.originalUrl}` } });
}

function normalise(err) {
  if (err instanceof HttpError) return err;

  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `Photo is too large. The limit is ${config.MAX_UPLOAD_MB} MB.`
        : `Upload error: ${err.message}`;
    return new HttpError(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400, message);
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, [v.message]]));
    return new HttpError(422, 'Validation failed', details);
  }

  if (err instanceof mongoose.Error.CastError) {
    return new HttpError(400, `Invalid value for ${err.path}`);
  }

  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern ?? {})[0] ?? 'field';
    return new HttpError(409, `That ${field} is already in use.`);
  }

  if (err?.type === 'entity.parse.failed') return new HttpError(400, 'Malformed JSON body');
  if (err?.type === 'entity.too.large') return new HttpError(413, 'Request body too large');

  return null;
}

// Express identifies error handlers by arity, so all four parameters must stay.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  const known = normalise(err);
  const status = known?.status ?? 500;

  if (status >= 500) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  }

  const body = {
    error: {
      message: known?.message ?? 'Something went wrong on our side. Please try again.',
      ...(known?.details ? { details: known.details } : {}),
      ...(!config.isProd && !known ? { debug: String(err?.stack ?? err) } : {}),
    },
  };
  res.status(status).json(body);
}
