import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadCertificate } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { LANGUAGES } from '../models/shared.js';
import { ExpertDocument, User } from '../models/index.js';
import { buildExpertProfile, credentialsBody, prepareCertificate } from '../services/experts.js';
import {
  REFRESH_COOKIE,
  refreshCookieOptions,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../services/tokens.js';
import { latitude, longitude, toPoint } from '../utils/geo.js';
import { badRequest, conflict, notFound, unauthorized } from '../utils/httpError.js';

const router = Router();

/**
 * Brute-force protection, split by what is actually being abused.
 *
 * Both endpoints used to share one counter that counted every request, successful or not. Two
 * things went wrong with that. A household behind one connection, a demo shown to a room, or a
 * developer testing the app spent the same budget as an attacker, so the twentieth correct
 * password in fifteen minutes was refused exactly like a wrong one. Worse, failed sign-ins used
 * up the budget for REGISTERING: someone whose account did not exist was told their password was
 * wrong, and then told they had tried too many times when they went to create one. There is no
 * way out of that except waiting, and nothing on screen says so.
 *
 * Guessing a password produces failures, so sign-in counts failures. Abusing registration means
 * creating accounts, so registration counts the accounts it creates, on its own budget.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.AUTH_RATE_LIMIT,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      message:
        'Too many failed sign-in attempts from this network. Please wait a few minutes, or create an account if you do not have one yet.',
    },
  },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: config.REGISTER_RATE_LIMIT,
  // Only count accounts actually created. A rejected attempt - a duplicate email, a short
  // password - is a person getting it wrong, not an attack.
  skipFailedRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: { message: 'Too many accounts created from this network. Please try again later.' },
  },
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

router.post('/register', registerLimiter, validate({ body: registerBody }), async (req, res) => {
  const { password: plain, email, ...profile } = req.valid.body;
  if (await User.exists({ email: email.toLowerCase() })) {
    throw conflict('An account with that email already exists.');
  }
  const user = new User({ ...profile, email });
  await user.setPassword(plain);
  await user.save();
  res.status(201).json(await issueSession(res, user));
});

/**
 * Applying as an expert. The account exists from here on, signed in, but as "pending": it can
 * see its own application and nothing of any farmer's until an admin has checked the
 * certificate. The degree must come from the agriculture list, and the qualification farmers
 * read is built from it, so nobody can describe themselves into the role.
 */
const registerExpertBody = z.object({ ...registerBody.shape, ...credentialsBody.shape });

router.post('/register-expert', registerLimiter, uploadCertificate, validate({ body: registerExpertBody }), async (req, res) => {
  if (!req.file) throw badRequest('Attach a photo or scan of your degree certificate in the "document" field.');
  const { password: plain, email, name, preferredLanguage, state, district, ...credentials } = req.valid.body;
  if (await User.exists({ email: email.toLowerCase() })) {
    throw conflict('An account with that email already exists.');
  }

  // Everything that can be wrong with the application is found before anything is written.
  const expertProfile = await buildExpertProfile(credentials);
  const certificate = await prepareCertificate(req.file.buffer);

  const user = new User({
    name,
    email,
    preferredLanguage,
    state,
    district,
    role: 'expert',
    expertProfile,
    expertVerification: { status: 'pending', submittedAt: new Date() },
  });
  await user.setPassword(plain);
  await user.save();
  try {
    await ExpertDocument.create({ owner: user._id, ...certificate });
  } catch (err) {
    // An application without its certificate can never be verified; do not leave one behind.
    await User.deleteOne({ _id: user._id });
    throw err;
  }
  res.status(201).json(await issueSession(res, user));
});

router.post('/login', loginLimiter, validate({ body: loginBody }), async (req, res) => {
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
