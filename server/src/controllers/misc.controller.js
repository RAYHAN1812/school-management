import { getSummary } from '../services/dashboard.service.js';
import * as schoolService from '../services/school.service.js';
import { clientInfo, created, ok } from '../utils/http.js';

export async function dashboardSummary(req, res) {
  return ok(res, await getSummary(req.user, { query: req.query, headerSchoolId: req.get('x-school-id') || null }));
}

export async function listSchools(_req, res) {
  return ok(res, await schoolService.listSchools());
}

export async function createSchool(req, res) {
  return created(res, await schoolService.createSchool(req.body, req.user, clientInfo(req)));
}
