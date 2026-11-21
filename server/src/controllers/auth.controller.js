import * as authService from '../services/auth.service.js';
import { audit } from '../utils/audit.js';
import { clientInfo, created, ok } from '../utils/http.js';
import { toPublicUser } from '../utils/serializers.js';
import { AUTH_COOKIE, authCookieOptions } from '../utils/tokens.js';

const { maxAge: _ignored, ...clearCookieOptions } = authCookieOptions();

export async function login(req, res) {
  const { user, token } = await authService.login(req.body, clientInfo(req));
  res.cookie(AUTH_COOKIE, token, authCookieOptions());
  // Token is also returned for API clients (Postman, mobile). The web app relies on the httpOnly cookie.
  return ok(res, { user: toPublicUser(user), token });
}

export async function logout(req, res) {
  if (req.user) {
    await audit({ action: 'AUTH_LOGOUT', entity: 'User', entityId: req.user.id, actor: req.user, ...clientInfo(req) });
  }
  res.clearCookie(AUTH_COOKIE, clearCookieOptions);
  return ok(res, { message: 'Logged out' });
}

export async function me(req, res) {
  return ok(res, { user: toPublicUser(req.user) });
}

export async function register(req, res) {
  const user = await authService.register(req.body, req.user, clientInfo(req));
  return created(res, { user: toPublicUser(user) });
}

export async function forgotPassword(req, res) {
  const { resetUrl } = await authService.forgotPassword(req.body, clientInfo(req));
  return ok(res, {
    message: 'If an active account exists for that email, a password reset link has been sent.',
    ...(resetUrl ? { devResetUrl: resetUrl } : {}),
  });
}

export async function resetPassword(req, res) {
  await authService.resetPassword(req.body, clientInfo(req));
  res.clearCookie(AUTH_COOKIE, clearCookieOptions);
  return ok(res, { message: 'Password has been reset. Please sign in with your new password.' });
}

export async function changePassword(req, res) {
  const { user, token } = await authService.changePassword(req.user, req.body, clientInfo(req));
  res.cookie(AUTH_COOKIE, token, authCookieOptions());
  return ok(res, { user: toPublicUser(user), message: 'Password changed. Other sessions have been signed out.' });
}
