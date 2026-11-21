import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma.js';
import { api, bearer, DEMO, DEMO_PASSWORD, tokenFor, uniqueEmail } from './helpers.js';

afterAll(() => prisma.$disconnect());

describe('POST /api/auth/login', () => {
  it('logs in with email, sets an httpOnly cookie and hides the password hash', async () => {
    const res = await api().post('/api/auth/login').send({ identifier: DEMO.SCHOOL_ADMIN, password: DEMO_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role.key).toBe('SCHOOL_ADMIN');
    expect(res.body.data.user.passwordHash).toBeUndefined();
    const cookie = res.headers['set-cookie']?.join(';') ?? '';
    expect(cookie).toMatch(/sms_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it('logs in with username, case-insensitively', async () => {
    const res = await api().post('/api/auth/login').send({ identifier: 'TEACHER', password: DEMO_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role.key).toBe('TEACHER');
  });

  it('rejects a wrong password with 401 INVALID_CREDENTIALS', async () => {
    const res = await api().post('/api/auth/login').send({ identifier: DEMO.TEACHER, password: 'Wrong@1234' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('gives the same answer for an unknown account', async () => {
    const res = await api().post('/api/auth/login').send({ identifier: 'nobody@edumanage.test', password: 'Wrong@1234' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('validates the request body', async () => {
    const res = await api().post('/api/auth/login').send({ identifier: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('protected routes', () => {
  it('returns 401 UNAUTHORIZED without a token', async () => {
    const res = await api().get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 for a tampered token', async () => {
    const token = await tokenFor('STUDENT');
    const res = await api().get('/api/auth/me').set(bearer(`${token}x`));
    expect(res.status).toBe(401);
  });

  it('returns the current user from /auth/me (bearer and cookie)', async () => {
    const token = await tokenFor('PARENT');
    const viaBearer = await api().get('/api/auth/me').set(bearer(token));
    expect(viaBearer.status).toBe(200);
    expect(viaBearer.body.data.user.email).toBe(DEMO.PARENT);

    const viaCookie = await api().get('/api/auth/me').set('Cookie', `sms_token=${token}`);
    expect(viaCookie.status).toBe(200);
  });

  it.each(['TEACHER', 'STUDENT', 'PARENT'])('returns 403 FORBIDDEN when a %s calls an admin route', async (role) => {
    const token = await tokenFor(role);
    const res = await api().get('/api/users').set(bearer(token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 404 ROUTE_NOT_FOUND for unknown endpoints', async () => {
    const res = await api().get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});

describe('POST /api/auth/register (admin creates accounts)', () => {
  it('lets a school admin create a teacher in their own school', async () => {
    const token = await tokenFor('SCHOOL_ADMIN');
    const email = uniqueEmail('newteacher');
    const res = await api()
      .post('/api/auth/register')
      .set(bearer(token))
      .send({ fullName: 'New Teacher', email, password: 'Teach@2026', role: 'TEACHER' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role.key).toBe('TEACHER');
    expect(res.body.data.user.school.code).toBe('GIS');

    const login = await api().post('/api/auth/login').send({ identifier: email, password: 'Teach@2026' });
    expect(login.status).toBe(200);
  });

  it('rejects a duplicate email with 409 EMAIL_ALREADY_EXISTS', async () => {
    const token = await tokenFor('SCHOOL_ADMIN');
    const res = await api()
      .post('/api/auth/register')
      .set(bearer(token))
      .send({ fullName: 'Dup', email: DEMO.TEACHER, password: 'Teach@2026', role: 'TEACHER' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('rejects a duplicate username with 409 USERNAME_ALREADY_EXISTS', async () => {
    const token = await tokenFor('SCHOOL_ADMIN');
    const res = await api()
      .post('/api/auth/register')
      .set(bearer(token))
      .send({ fullName: 'Dup', email: uniqueEmail(), username: 'teacher', password: 'Teach@2026', role: 'TEACHER' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('USERNAME_ALREADY_EXISTS');
  });

  it('rejects a weak password with 400 VALIDATION_ERROR', async () => {
    const token = await tokenFor('SCHOOL_ADMIN');
    const res = await api()
      .post('/api/auth/register')
      .set(bearer(token))
      .send({ fullName: 'Weak', email: uniqueEmail(), password: 'password', role: 'STUDENT' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].field).toBe('password');
  });

  it('does not let a school admin create another admin', async () => {
    const token = await tokenFor('SCHOOL_ADMIN');
    const res = await api()
      .post('/api/auth/register')
      .set(bearer(token))
      .send({ fullName: 'Admin 2', email: uniqueEmail(), password: 'Admin@2026', role: 'SCHOOL_ADMIN' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ROLE_NOT_ALLOWED');
  });

  it('requires a school when a super admin creates a school-level account', async () => {
    const token = await tokenFor('SUPER_ADMIN');
    const res = await api()
      .post('/api/auth/register')
      .set(bearer(token))
      .send({ fullName: 'Admin 2', email: uniqueEmail(), password: 'Admin@2026', role: 'SCHOOL_ADMIN' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SCHOOL_REQUIRED');
  });

  it('is not open to the public', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ fullName: 'Anon', email: uniqueEmail(), password: 'Anon@2026', role: 'SUPER_ADMIN' });
    expect(res.status).toBe(401);
  });
});

describe('account activation / deactivation', () => {
  it('blocks login and revokes sessions for a deactivated user, then restores access', async () => {
    const adminToken = await tokenFor('SCHOOL_ADMIN');
    const email = uniqueEmail('student');
    const created = await api()
      .post('/api/auth/register')
      .set(bearer(adminToken))
      .send({ fullName: 'Temp Student', email, password: 'Study@2026', role: 'STUDENT' });
    const userId = created.body.data.user.id;
    const studentToken = await tokenFor(email, 'Study@2026');

    const off = await api().patch(`/api/users/${userId}/status`).set(bearer(adminToken)).send({ status: 'INACTIVE' });
    expect(off.status).toBe(200);
    expect(off.body.data.status).toBe('INACTIVE');

    // Existing session no longer works…
    expect((await api().get('/api/auth/me').set(bearer(studentToken))).status).toBe(401);
    // …and a correct password gets 403 ACCOUNT_INACTIVE.
    const login = await api().post('/api/auth/login').send({ identifier: email, password: 'Study@2026' });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('ACCOUNT_INACTIVE');

    const on = await api().patch(`/api/users/${userId}/status`).set(bearer(adminToken)).send({ status: 'ACTIVE' });
    expect(on.status).toBe(200);
    expect((await api().post('/api/auth/login').send({ identifier: email, password: 'Study@2026' })).status).toBe(200);
  });

  it('does not let an admin deactivate themselves', async () => {
    const token = await tokenFor('SCHOOL_ADMIN');
    const me = await api().get('/api/auth/me').set(bearer(token));
    const res = await api().patch(`/api/users/${me.body.data.user.id}/status`).set(bearer(token)).send({ status: 'INACTIVE' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CANNOT_CHANGE_OWN_STATUS');
  });

  it('hides super admins from school admins', async () => {
    const token = await tokenFor('SCHOOL_ADMIN');
    const res = await api().get('/api/users?role=SUPER_ADMIN').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

describe('password change and reset', () => {
  async function freshUser(password = 'First@2026') {
    const adminToken = await tokenFor('SCHOOL_ADMIN');
    const email = uniqueEmail('pw');
    await api()
      .post('/api/auth/register')
      .set(bearer(adminToken))
      .send({ fullName: 'Password Tester', email, password, role: 'PARENT' });
    return email;
  }

  it('changes the password, keeps this session and revokes older ones', async () => {
    const email = await freshUser();
    const oldToken = await tokenFor(email, 'First@2026');

    const wrong = await api()
      .post('/api/auth/change-password')
      .set(bearer(oldToken))
      .send({ currentPassword: 'Nope@2026', newPassword: 'Second@2026' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('INVALID_CURRENT_PASSWORD');

    const res = await api()
      .post('/api/auth/change-password')
      .set(bearer(oldToken))
      .send({ currentPassword: 'First@2026', newPassword: 'Second@2026' });
    expect(res.status).toBe(200);
    const newCookie = res.headers['set-cookie'].join(';').match(/sms_token=([^;]+)/)[1];

    expect((await api().get('/api/auth/me').set(bearer(oldToken))).status).toBe(401);
    expect((await api().get('/api/auth/me').set('Cookie', `sms_token=${newCookie}`)).status).toBe(200);
    expect((await api().post('/api/auth/login').send({ identifier: email, password: 'Second@2026' })).status).toBe(200);
  });

  it('resets a forgotten password with a single-use link', async () => {
    const email = await freshUser();
    const forgot = await api().post('/api/auth/forgot-password').send({ email });
    expect(forgot.status).toBe(200);
    const token = new URL(forgot.body.data.devResetUrl).searchParams.get('token');

    const reset = await api().post('/api/auth/reset-password').send({ token, password: 'Reset@2026' });
    expect(reset.status).toBe(200);
    expect((await api().post('/api/auth/login').send({ identifier: email, password: 'Reset@2026' })).status).toBe(200);
    expect((await api().post('/api/auth/login').send({ identifier: email, password: 'First@2026' })).status).toBe(401);

    const reuse = await api().post('/api/auth/reset-password').send({ token, password: 'Again@2026' });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error.code).toBe('INVALID_RESET_TOKEN');
  });

  it('does not reveal whether an email is registered', async () => {
    const res = await api().post('/api/auth/forgot-password').send({ email: 'ghost@edumanage.test' });
    expect(res.status).toBe(200);
    expect(res.body.data.devResetUrl).toBeUndefined();
  });
});

describe('logout', () => {
  it('clears the auth cookie', async () => {
    const token = await tokenFor('TEACHER');
    const res = await api().post('/api/auth/logout').set('Cookie', `sms_token=${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie'].join(';')).toMatch(/sms_token=;/);
  });
});
