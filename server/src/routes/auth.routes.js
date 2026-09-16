import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { LANGUAGES } from '../models/shared.js';
import { User } from '../models/index.js';
import {
  REFRESH_COOKIE,
  refreshCookieOptions,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../services/tokens.js';
import { latitude, longitude, toPoint } from '../utils/geo.js';
import { conflict, notFound, unauthorized } from '../utils/httpError.js';

const router = Router();

// Brute-force protection on credential endpoints only.
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.NODE_ENV === 'test' ? 1000 : 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { message: 'Too many attempts. Please wait a few minutes and try again.' } },
});

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

const registerBody = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().max(254),
  password,
  preferredLanguage: z.enum(LANGUAGES).optional(),
  state: z.string().trim().max(60).optional(),
  district: z.string().trim().max(60).optional(),
});

const loginBody = z.object({
  email: z.email(),
  password: z.string().min(1).max(128),
});

const updateMeBody = z
  .object({
    name: z.string().trim().min(2).max(80),
    preferredLanguage: z.enum(LANGUAGES),
    state: z.string().trim().max(60),
    district: z.string().trim().max(60),
    lat: latitude,
    lng: longitude,
  })
  .partial()
  .refine((b) => (b.lat === undefined) === (b.lng === undefined), {
    error: 'lat and lng must be provided together',
    path: ['lat'],
  });

async function issueSession(res, user) {
  // tokenVersion is select:false, so read it explicitly rather than trusting the doc in hand.
  const { tokenVersion } = await User.findById(user.id).select('tokenVersion').lean();
  res.cookie(REFRESH_COOKIE, signRefreshToken(user, tokenVersion), refreshCookieOptions());
  return { user, accessToken: signAccessToken(user) };
}

router.post('/register', credentialLimiter, validate({ body: registerBody }), async (req, res) => {
  const { password: plain, email, ...profile } = req.valid.body;
  if (await User.exists({ email: email.toLowerCase() })) {
    throw conflict('An account with that email already exists.');
  }
  const user = new User({ ...profile, email });
  await user.setPassword(plain);
  await user.save();
  res.status(201).json(await issueSession(res, user));
});

router.post('/login', credentialLimiter, validate({ body: loginBody }), async (req, res) => {
  const { email, password: plain } = req.valid.body;
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  // Same message either way so the endpoint does not reveal which emails are registered.
  if (!user || !(await user.verifyPassword(plain))) {
    throw unauthorized('Incorrect email or password.');
  }
  res.json(await issueSession(res, user));
});

router.post('/refresh', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw unauthorized('No session');

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
    throw unauthorized('Session expired. Please log in again.');
  }

  const user = await User.findById(payload.sub).select('+tokenVersion');
  if (!user || user.tokenVersion !== payload.v) {
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
    throw unauthorized('Session revoked. Please log in again.');
  }

  res.json(await issueSession(res, user));
});

router.post('/logout', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) {
    try {
      const { sub } = verifyRefreshToken(token);
      // Revokes this and every other outstanding refresh token for the user.
      await User.updateOne({ _id: sub }, { $inc: { tokenVersion: 1 } });
    } catch {
      // Already invalid; nothing to revoke.
    }
  }
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
  res.status(204).end();
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.auth.userId);
  if (!user) throw notFound('User not found');
  res.json({ user });
});

router.patch('/me', requireAuth, validate({ body: updateMeBody }), async (req, res) => {
  const { lat, lng, ...rest } = req.valid.body;
  const update = { ...rest };
  if (lat !== undefined) update.location = toPoint(lat, lng);
  const user = await User.findByIdAndUpdate(req.auth.userId, update, {
    returnDocument: 'after',
    runValidators: true,
  });
  if (!user) throw notFound('User not found');
  res.json({ user });
});

export default router;
