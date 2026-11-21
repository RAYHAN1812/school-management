import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const AUTH_COOKIE = 'sms_token';

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role.key, schoolId: user.schoolId, tv: user.tokenVersion },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN, issuer: 'edumanage-pro' },
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET, { issuer: 'edumanage-pro' });
}

function expiresInMs(value) {
  const match = /^(\d+)([smhd])$/.exec(String(value));
  if (!match) return 24 * 60 * 60 * 1000;
  const unit = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[match[2]];
  return Number(match[1]) * unit;
}

export function authCookieOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE || env.COOKIE_SAMESITE === 'none',
    sameSite: env.COOKIE_SAMESITE,
    path: '/',
    maxAge: expiresInMs(env.JWT_EXPIRES_IN),
  };
}

// Password-reset tokens: the raw value goes to the user, only its hash is stored.
export function createResetToken() {
  const raw = crypto.randomBytes(32).toString('hex');
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}
