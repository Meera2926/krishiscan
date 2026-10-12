import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
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

/**
 * Whether this request comes from an expert whose certificate an admin has checked.
 *
 * Asked of the database every time, not read from the token. The token says what kind of account
 * signed in; it cannot say whether that expert is still trusted, and it stays valid for minutes
 * after a suspension. Cached on the request, so a route that asks twice pays once.
 */
export async function isVerifiedExpert(req) {
  if (req.auth?.role !== 'expert') return false;
  if (req.auth.verifiedExpert === undefined) {
    const user = await User.findById(req.auth.userId).select('role expertVerification.status').lean();
    req.auth.verifiedExpert = user?.role === 'expert' && user.expertVerification?.status === 'verified';
  }
  return req.auth.verifiedExpert;
}

/**
 * Admin-only routes that decide who is trusted. The token's role is checked first, then the
 * database, because a demoted admin's token keeps saying "admin" until it expires.
 */
export async function requireAdmin(req, _res, next) {
  if (!req.auth) return next(unauthorized());
  if (req.auth.role !== 'admin' || !(await User.exists({ _id: req.auth.userId, role: 'admin' }))) {
    return next(forbidden());
  }
  next();
}

export const UNVERIFIED_EXPERT_MESSAGE =
  'Your expert account has not been verified yet. You can see farmers’ cases once an admin has checked your certificate.';

/**
 * For routes that show or act on farmers' cases. Farmers and admins pass straight through; an
 * expert passes only once verified, so applying as an expert opens nothing until a person has
 * looked at the certificate.
 */
export async function blockUnverifiedExperts(req, _res, next) {
  if (req.auth?.role === 'expert' && !(await isVerifiedExpert(req))) {
    return next(forbidden(UNVERIFIED_EXPERT_MESSAGE));
  }
  next();
}
