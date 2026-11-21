import crypto from 'node:crypto';
import multer from 'multer';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { ADMIN_ROLES, ROLES } from '../config/roles.js';
import { AppError } from '../utils/AppError.js';

export const profilePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});

const ALLOWED = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

function validateImage(file) {
  if (!file) throw AppError.badRequest('PROFILE_PHOTO_REQUIRED', 'Choose an image to upload');
  const extension = ALLOWED.get(file.mimetype);
  if (!extension) throw AppError.badRequest('INVALID_IMAGE_TYPE', 'Only JPG, JPEG, PNG and WebP images are supported');
  if (file.size > 2 * 1024 * 1024) throw AppError.badRequest('PROFILE_PHOTO_TOO_LARGE', 'Profile photo must be 2 MB or smaller');

  const bytes = file.buffer;
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  const isWebp =
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!isJpeg && !isPng && !isWebp) {
    throw AppError.badRequest('INVALID_IMAGE_CONTENT', 'The selected file is not a valid image');
  }
  return extension;
}

function storageConfig() {
  if (!env.SUPABASE_URL) {
    throw AppError.serviceUnavailable('SUPABASE_NOT_CONFIGURED', 'SUPABASE_URL is missing in the server environment');
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw AppError.serviceUnavailable(
      'SUPABASE_STORAGE_KEY_MISSING',
      'Supabase Storage is not configured: add the secret service-role key to the server environment.',
    );
  }
  return {
    url: env.SUPABASE_URL.replace(/\/$/, ''),
    key: env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

async function storageFetch(path, options = {}) {
  const { url, key } = storageConfig();
  const response = await fetch(`${url}/storage/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    const text = (await response.text()).slice(0, 300);
    if (response.status === 404) {
      throw AppError.badGateway(
        'SUPABASE_BUCKET_NOT_FOUND',
        'The Supabase bucket "profile-photos" was not found. Create it in Supabase Storage.',
        { status: response.status },
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw AppError.badGateway(
        'SUPABASE_STORAGE_PERMISSION_DENIED',
        'Supabase Storage permission was denied. Verify the server service-role key and bucket configuration.',
        { status: response.status },
      );
    }
    throw AppError.badGateway(
      'SUPABASE_STORAGE_ERROR',
      'Supabase Storage could not complete the upload or deletion.',
      { status: response.status, message: text },
    );
  }
  return response;
}

export async function checkProfileStorage() {
  const { url, key } = storageConfig();
  const response = await fetch(`${url}/storage/v1/bucket/profile-photos`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const text = await response.text();
  if (response.status === 404 || text.includes('Bucket not found') || text.includes('NoSuchBucket')) {
    return { connected: true, storageConfigured: true, bucket: 'profile-photos', bucketExists: false, status: 404 };
  }
  if (response.status === 401 || response.status === 403) {
    return { connected: true, storageConfigured: true, bucket: 'profile-photos', bucketExists: null, status: response.status, permissionDenied: true };
  }
  if (!response.ok) {
    return { connected: false, storageConfigured: true, bucket: 'profile-photos', bucketExists: null, status: response.status, error: text.slice(0, 300) };
  }
  return { connected: true, storageConfigured: true, bucket: 'profile-photos', bucketExists: true, status: response.status };
}

export async function uploadProfilePhoto(actor, file) {
  const extension = validateImage(file);
  const path = `users/${actor.id}/${crypto.randomUUID()}.${extension}`;
  await storageFetch(`object/profile-photos/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': file.mimetype, 'x-upsert': 'true' },
    body: file.buffer,
  });

  const previous = await prisma.user.findUnique({ where: { id: actor.id }, select: { photoUrl: true } });
  await prisma.user.update({ where: { id: actor.id }, data: { photoUrl: path } });

  if (previous?.photoUrl?.startsWith(`users/${actor.id}/`)) {
    await storageFetch(`object/profile-photos/${previous.photoUrl}`, { method: 'DELETE' }).catch(() => {});
  }
  return { photoUrl: path };
}

export async function removeProfilePhoto(actor) {
  const user = await prisma.user.findUnique({ where: { id: actor.id }, select: { photoUrl: true } });
  if (!user?.photoUrl) return { photoUrl: null };
  if (!user.photoUrl.startsWith(`users/${actor.id}/`)) {
    throw AppError.badRequest('INVALID_PROFILE_PHOTO_PATH', 'The stored profile photo path is invalid');
  }
  await storageFetch(`object/profile-photos/${user.photoUrl}`, { method: 'DELETE' });
  await prisma.user.update({ where: { id: actor.id }, data: { photoUrl: null } });
  return { photoUrl: null };
}

export async function getProfilePhoto(actor, userId) {
  if (actor.id !== userId && !ADMIN_ROLES.includes(actor.role.key) && actor.role.key !== ROLES.TEACHER) {
    throw AppError.forbidden('PROFILE_PHOTO_FORBIDDEN', 'You cannot view this profile photo');
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { photoUrl: true } });
  if (!user?.photoUrl) throw AppError.notFound('PROFILE_PHOTO_NOT_FOUND', 'No profile photo exists');
  if (!user.photoUrl.startsWith('users/')) throw AppError.notFound('PROFILE_PHOTO_NOT_FOUND', 'No valid profile photo exists');

  const { url, key } = storageConfig();
  const response = await fetch(`${url}/storage/v1/object/profile-photos/${encodeURI(user.photoUrl)}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) throw AppError.notFound('PROFILE_PHOTO_NOT_FOUND', 'Profile photo could not be loaded');
  return { buffer: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get('content-type') || 'image/jpeg' };
}
