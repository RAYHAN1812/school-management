import request from 'supertest';
import { createApp } from '../src/app.js';

export const app = createApp();
export const api = () => request(app);

export const DEMO_PASSWORD = 'TestOnly@12345';
export const DEMO = {
  SUPER_ADMIN: 'superadmin@edumanage.test',
  SCHOOL_ADMIN: 'admin@edumanage.test',
  TEACHER: 'teacher@edumanage.test',
  STUDENT: 'student@edumanage.test',
  PARENT: 'parent@edumanage.test',
};

/** Log in and return a Bearer token for the given demo role (or email). */
export async function tokenFor(roleOrEmail, password = DEMO_PASSWORD) {
  const identifier = DEMO[roleOrEmail] ?? roleOrEmail;
  const res = await api().post('/api/auth/login').send({ identifier, password });
  if (res.status !== 200) throw new Error(`Login failed for ${identifier}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.token;
}

export const bearer = (token) => ({ Authorization: `Bearer ${token}` });

let counter = 0;
export function uniqueEmail(prefix = 'user') {
  counter += 1;
  return `${prefix}.${Date.now()}.${counter}@edumanage.test`;
}
