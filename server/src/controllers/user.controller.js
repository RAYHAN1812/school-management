import * as userService from '../services/user.service.js';
import { clientInfo, ok } from '../utils/http.js';
import { toPublicUser } from '../utils/serializers.js';

export async function list(req, res) {
  const { items, meta } = await userService.listUsers(req.user, req.query);
  return ok(res, items.map(toPublicUser), { meta });
}

export async function get(req, res) {
  const user = await userService.getUser(req.user, req.params.id);
  return ok(res, toPublicUser(user));
}

export async function updateStatus(req, res) {
  const user = await userService.updateUserStatus(req.user, req.params.id, req.body.status, clientInfo(req));
  return ok(res, toPublicUser(user));
}

export async function roles(_req, res) {
  return ok(res, await userService.listRoles());
}

export async function auditLogs(req, res) {
  const { items, meta } = await userService.listAuditLogs(req.user, req.query);
  return ok(res, items, { meta });
}
