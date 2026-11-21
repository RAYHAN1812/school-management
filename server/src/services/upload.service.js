import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/AppError.js';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// Allowed types: extension → accepted MIME types and the file's leading "magic" bytes.
const TYPES = {
  pdf: { mimes: ['application/pdf'], magic: [[0x25, 0x50, 0x44, 0x46]] },
  png: { mimes: ['image/png'], magic: [[0x89, 0x50, 0x4e, 0x47]] },
  jpg: { mimes: ['image/jpeg'], magic: [[0xff, 0xd8, 0xff]] },
  jpeg: { mimes: ['image/jpeg'], magic: [[0xff, 0xd8, 0xff]] },
  webp: { mimes: ['image/webp'], magic: [[0x52, 0x49, 0x46, 0x46]] },
  // Office files are ZIP containers.
  docx: { mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], magic: [[0x50, 0x4b, 0x03, 0x04]] },
  xlsx: { mimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], magic: [[0x50, 0x4b, 0x03, 0x04]] },
};

export const uploadDir = () => path.resolve(env.UPLOAD_DIR);
export const FILE_NAME = /^[a-f0-9]{32}\.(pdf|png|jpe?g|webp|docx|xlsx)$/;

/** Attachments may only reference files uploaded here — never arbitrary URLs. */
export const attachmentUrl = z
  .string()
  .trim()
  .regex(/^\/api\/files\/[a-f0-9]{32}\.(pdf|png|jpe?g|webp|docx|xlsx)$/, 'Attach a file using the upload button')
  .nullish()
  .transform((v) => (v === '' ? null : v));

const extOf = (name) => path.extname(name).slice(1).toLowerCase();

export const uploader = multer({
  storage: multer.diskStorage({
    destination(_req, _file, cb) {
      fs.mkdirSync(uploadDir(), { recursive: true });
      cb(null, uploadDir());
    },
    filename(_req, file, cb) {
      // Random name: never trust or reuse the client's filename on disk.
      cb(null, `${crypto.randomBytes(16).toString('hex')}.${extOf(file.originalname)}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 },
  fileFilter(_req, file, cb) {
    const type = TYPES[extOf(file.originalname)];
    if (!type || !type.mimes.includes(file.mimetype)) {
      return cb(AppError.badRequest('INVALID_FILE_TYPE', 'Only PDF, JPG, PNG, WEBP, DOCX and XLSX files are allowed'));
    }
    cb(null, true);
  },
});

/** After saving, confirm the content really is the declared type; delete it if not. */
export async function verifyUpload(file, schoolId, actor) {
  if (!file) throw AppError.badRequest('FILE_REQUIRED', 'Choose a file to upload');
  if (!schoolId || !actor?.id) throw AppError.badRequest('SCHOOL_REQUIRED', 'Select a school first');
  const type = TYPES[extOf(file.filename)];
  const handle = await fs.promises.open(file.path, 'r');
  const head = Buffer.alloc(8);
  try {
    await handle.read(head, 0, 8, 0);
  } finally {
    await handle.close();
  }
  const ok = type.magic.some((sig) => sig.every((b, i) => head[i] === b));
  if (!ok) {
    await fs.promises.unlink(file.path).catch(() => {});
    throw AppError.badRequest('INVALID_FILE_TYPE', 'The file content does not match its type');
  }
  try {
    await prisma.$executeRaw`
      INSERT INTO "uploaded_files" ("filename", "schoolId", "uploaderId")
      VALUES (${file.filename}, ${schoolId}, ${actor.id})
    `;
  } catch (error) {
    await fs.promises.unlink(file.path).catch(() => {});
    throw error;
  }
  return {
    url: `/api/files/${file.filename}`,
    name: file.originalname.slice(0, 200),
    size: file.size,
    mimeType: file.mimetype,
  };
}

export async function assertUploadOwned(schoolId, attachmentUrl, actor) {
  if (!attachmentUrl) return;
  const filename = attachmentUrl.split('/').pop();
  const [upload] = await prisma.$queryRaw`
    SELECT "uploaderId" FROM "uploaded_files" WHERE "filename" = ${filename} AND "schoolId" = ${schoolId} LIMIT 1
  `;
  if (!upload || upload.uploaderId !== actor.id) {
    throw AppError.forbidden('FILE_ATTACHMENT_FORBIDDEN', 'Only the uploader can attach this file');
  }
}

export function resolveFile(name) {
  if (!FILE_NAME.test(name)) throw AppError.notFound('FILE_NOT_FOUND', 'File not found');
  const full = path.join(uploadDir(), name);
  if (!fs.existsSync(full)) throw AppError.notFound('FILE_NOT_FOUND', 'File not found');
  return { full, isImage: /\.(png|jpe?g|webp)$/.test(name) };
}
