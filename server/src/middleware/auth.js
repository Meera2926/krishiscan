import jwt from 'jsonwebtoken';
import { verifyAccessToken } from '../services/tokens.js';
import { forbidden, unauthorized } from '../utils/httpError.js';

function readBearer(req) {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

function decode(token) {
  try {
    return verifyAccessToken(token);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw unauthorized('Access token expired');
    throw unauthorized('Invalid access token');
  }
}

export function requireAuth(req, _res, next) {
  const token = readBearer(req);
  if (!token) return next(unauthorized());
  const payload = decode(token);
  req.auth = { userId: payload.sub, role: payload.role };
  next();
}

/** Attaches req.auth when a valid token is present, but never rejects the request. */
export function optionalAuth(req, _res, next) {
  const token = readBearer(req);
  if (token) {
    try {
      const payload = verifyAccessToken(token);
      req.auth = { userId: payload.sub, role: payload.role };
    } catch {
      // An expired token on a public route is not an error.
    }
  }
  next();
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.auth) return next(unauthorized());
    if (!roles.includes(req.auth.role)) return next(forbidden());
    next();
  };
}
