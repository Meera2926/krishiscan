import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

export const REFRESH_COOKIE = 'ks_refresh';

export function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.JWT_ACCESS_SECRET, {
    expiresIn: config.ACCESS_TOKEN_TTL,
    issuer: 'krishiscan',
    audience: 'krishiscan:access',
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.JWT_ACCESS_SECRET, {
    issuer: 'krishiscan',
    audience: 'krishiscan:access',
  });
}

export function signRefreshToken(user, tokenVersion) {
  return jwt.sign({ sub: user.id, v: tokenVersion }, config.JWT_REFRESH_SECRET, {
    expiresIn: `${config.REFRESH_TOKEN_TTL_DAYS}d`,
    issuer: 'krishiscan',
    audience: 'krishiscan:refresh',
  });
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, config.JWT_REFRESH_SECRET, {
    issuer: 'krishiscan',
    audience: 'krishiscan:refresh',
  });
}

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProd,
    // The API and the React build are served from one origin, so Lax is enough and
    // avoids the cross-site cookie restrictions that break SameSite=None setups.
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}
