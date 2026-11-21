import crypto from 'node:crypto';
import multer from 'multer';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { ROLES } from '../config/roles.js';
import { AppError } from '../utils/AppError.js';

export const schoolContentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
});

const PUBLIC_DETAILS_FIELDS = [
  'nameBn', 'logoUrl', 'coverUrl', 'aboutUs', 'introduction', 'history', 'educationalPhilosophy',
  'objectives', 'mission', 'vision', 'coreValues', 'principalMessage', 'academicPrograms',
  'educationLevels', 'teachingApproach', 'academicCalendar', 'examinationInfo', 'achievements',
  'specialPrograms', 'activities', 'awards',
];
const PUBLIC_GALLERY_CATEGORIES = [
  'Campus',
  'Classrooms',
  'Teachers and staff',
  'Scouts',
  'Study tours',
  'Sports',
  'Cultural programmes',
  'Events and celebrations',
  'National day celebrations',
  'Awards and ceremonies',
];

const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function isValidImage(file) {
  if (!MIME_EXT[file.mimetype]) return false;
  const b = file.buffer;
  const jpeg = b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png = b.length >= 8 && b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  const webp = b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP';
  return jpeg || png || webp;
}

function isSchoolContentPath(schoolId, imagePath) {
  const prefix = `schools/${schoolId}/`;
  if (typeof imagePath !== 'string' || !imagePath.startsWith(prefix)) return false;
  const [category, filename, ...extra] = imagePath.slice(prefix.length).split('/');
  return extra.length === 0
    && /^[a-z0-9_-]{1,40}$/i.test(category || '')
    && /^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(filename || '');
}

function storageConfig() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw AppError.serviceUnavailable('SUPABASE_NOT_CONFIGURED', 'Supabase Storage is not configured on the server');
  }
  return { url: env.SUPABASE_URL.replace(/\/$/, ''), key: env.SUPABASE_SERVICE_ROLE_KEY };
}

async function fetchSchoolContentImage(imagePath) {
  const { url, key } = storageConfig();
  const response = await fetch(`${url}/storage/v1/object/school-content/${encodeURI(imagePath)}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) throw AppError.notFound('SCHOOL_IMAGE_NOT_FOUND', 'School image not found');
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') || 'image/jpeg',
  };
}

export async function getPublicSchoolPage() {
  const school = await prisma.school.findUnique({
    where: { code: env.PUBLIC_SCHOOL_CODE },
    select: { id: true, name: true, address: true, phone: true, email: true },
  });
  if (!school) throw AppError.notFound('SCHOOL_NOT_FOUND', 'Public school is not configured');

  const details = await prisma.schoolDetails.findUnique({ where: { schoolId: school.id } });
  const [albums, galleryImages, notices] = await Promise.all([
    prisma.schoolGalleryAlbum.findMany({
      where: { schoolId: school.id, published: true },
      select: {
        id: true,
        title: true,
        description: true,
        coverUrl: true,
        images: {
          where: { published: true, category: { in: PUBLIC_GALLERY_CATEGORIES } },
          select: { id: true, title: true, caption: true, category: true, eventDate: true, imageUrl: true },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.schoolGalleryImage.findMany({
      where: { schoolId: school.id, published: true, albumId: null, category: { in: PUBLIC_GALLERY_CATEGORIES } },
      select: { id: true, title: true, caption: true, category: true, eventDate: true, imageUrl: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.notice.findMany({
      where: {
        schoolId: school.id,
        isPublic: true,
        audience: 'ALL',
        status: 'PUBLISHED',
        publishDate: { lte: new Date() },
        OR: [{ expiryDate: null }, { expiryDate: { gte: new Date() } }],
      },
      select: { id: true, title: true, description: true, publishDate: true },
      orderBy: { publishDate: 'desc' },
      take: 6,
    }),
  ]);
  const albumCoverPaths = albums.map((album) => album.coverUrl).filter(Boolean);
  const referencedAlbumCovers = albumCoverPaths.length
    ? await prisma.schoolGalleryImage.findMany({
        where: { schoolId: school.id, imageUrl: { in: albumCoverPaths } },
        select: { imageUrl: true, published: true, category: true },
      })
    : [];
  const coverRecords = new Map();
  for (const image of referencedAlbumCovers) {
    coverRecords.set(image.imageUrl, [...(coverRecords.get(image.imageUrl) ?? []), image]);
  }
  const publicAlbums = albums.map((album) => {
    const coverImages = coverRecords.get(album.coverUrl) ?? [];
    const hasSafeCover = coverImages.some((image) =>
      image.published && PUBLIC_GALLERY_CATEGORIES.includes(image.category),
    );
    return {
      ...album,
      coverUrl: coverImages.length > 0 && !hasSafeCover ? null : album.coverUrl,
    };
  });
  const publishedDetails = details?.published
    ? Object.fromEntries(PUBLIC_DETAILS_FIELDS.map((field) => [field, details[field]]))
    : null;

  return {
    school: {
      name: school.name,
      ...(details?.published ? { address: school.address, phone: school.phone, email: school.email } : {}),
    },
    details: publishedDetails,
    albums: publicAlbums,
    galleryImages,
    notices,
  };
}

export async function getPublicSchoolContentImage(imagePath) {
  const school = await prisma.school.findUnique({
    where: { code: env.PUBLIC_SCHOOL_CODE },
    select: { id: true },
  });
  if (!school || !isSchoolContentPath(school.id, imagePath)) {
    throw AppError.notFound('SCHOOL_IMAGE_NOT_FOUND', 'School image not found');
  }

  const [details, image, album, coverImage] = await Promise.all([
    prisma.schoolDetails.findFirst({
      where: { schoolId: school.id, published: true, OR: [{ logoUrl: imagePath }, { coverUrl: imagePath }] },
      select: { id: true },
    }),
    prisma.schoolGalleryImage.findFirst({
      where: { schoolId: school.id, imageUrl: imagePath, published: true, category: { in: PUBLIC_GALLERY_CATEGORIES } },
      select: { id: true, albumId: true },
    }),
    prisma.schoolGalleryAlbum.findFirst({
      where: { schoolId: school.id, coverUrl: imagePath, published: true },
      select: { id: true },
    }),
    prisma.schoolGalleryImage.findFirst({
      where: { schoolId: school.id, imageUrl: imagePath },
      select: { published: true, category: true },
    }),
  ]);
  const visibleImage = image?.albumId
    ? await prisma.schoolGalleryAlbum.findFirst({
        where: { id: image.albumId, schoolId: school.id, published: true },
        select: { id: true },
      })
    : image;
  const visibleAlbum = album
    && (!coverImage || (coverImage.published && PUBLIC_GALLERY_CATEGORIES.includes(coverImage.category)));
  if (!details && !visibleImage && !visibleAlbum) {
    throw AppError.notFound('SCHOOL_IMAGE_NOT_FOUND', 'Published school image not found');
  }
  return fetchSchoolContentImage(imagePath);
}

async function ensureBucket() {
  const { url, key } = storageConfig();
  const response = await fetch(`${url}/storage/v1/bucket/school-content`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (response.ok) return;
  const text = await response.text();
  if (response.status !== 404 && !text.includes('Bucket not found') && !text.includes('NoSuchBucket')) {
    throw AppError.badGateway('SUPABASE_STORAGE_ERROR', 'Could not access Supabase school-content bucket');
  }
  const create = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'school-content',
      name: 'school-content',
      public: false,
      file_size_limit: 5 * 1024 * 1024,
      allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'],
    }),
  });
  if (!create.ok) {
    const text = await create.text();
    throw AppError.badGateway('SUPABASE_BUCKET_ERROR', 'Could not prepare the school-content bucket', { status: create.status, message: text.slice(0, 300) });
  }
}

export async function getSchoolDetails(schoolId, actor) {
  const details = await prisma.schoolDetails.findUnique({ where: { schoolId } });
  const isSuperAdmin = actor.role.key === ROLES.SUPER_ADMIN;
  const canReadDetails = isSuperAdmin || Boolean(details?.published);
  const [school, albums, galleryImages] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, code: true } }),
    prisma.schoolGalleryAlbum.findMany({
      where: isSuperAdmin ? { schoolId } : { schoolId, published: true },
      include: {
        images: {
          where: isSuperAdmin ? {} : { published: true },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.schoolGalleryImage.findMany({
      where: {
        schoolId,
        ...(isSuperAdmin ? {} : { published: true }),
        albumId: null,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  return {
    ...(canReadDetails && details ? details : { nameBn: null, published: false }),
    albums,
    galleryImages,
    school,
  };
}

export async function updateSchoolDetails(schoolId, actor, data) {
  if (actor.role.key !== ROLES.SUPER_ADMIN) throw AppError.forbidden();
  const allowed = new Set([
    'nameBn', 'logoUrl', 'coverUrl', 'aboutUs', 'introduction', 'history', 'educationalPhilosophy',
    'objectives', 'mission', 'vision', 'coreValues', 'principalMessage', 'academicPrograms',
    'educationLevels', 'teachingApproach', 'academicCalendar', 'examinationInfo', 'achievements',
    'specialPrograms', 'activities', 'awards', 'published',
  ]);
  const update = Object.fromEntries(Object.entries(data).filter(([key]) => allowed.has(key)));
  return prisma.schoolDetails.upsert({
    where: { schoolId },
    update,
    create: { schoolId, ...update },
  });
}

export async function deleteSchoolDetails(schoolId, actor) {
  if (actor.role.key !== ROLES.SUPER_ADMIN) throw AppError.forbidden();
  await prisma.schoolDetails.deleteMany({ where: { schoolId } });
  return { deleted: true };
}

export async function uploadSchoolContent(schoolId, actor, file, category) {
  if (actor.role.key !== ROLES.SUPER_ADMIN) throw AppError.forbidden();
  if (!file) throw AppError.badRequest('SCHOOL_IMAGE_REQUIRED', 'Choose an image to upload');
  if (!isValidImage(file)) throw AppError.badRequest('INVALID_SCHOOL_IMAGE', 'Only JPG, PNG and WebP images are supported');
  if (file.size > 5 * 1024 * 1024) throw AppError.badRequest('SCHOOL_IMAGE_TOO_LARGE', 'School image must be 5 MB or smaller');
  await ensureBucket();
  const { url, key } = storageConfig();
  const safeCategory = String(category || 'general').replace(/[^a-z0-9_-]/gi, '-').slice(0, 40);
  const path = `schools/${schoolId}/${safeCategory}/${crypto.randomUUID()}.${MIME_EXT[file.mimetype]}`;
  const response = await fetch(`${url}/storage/v1/object/school-content/${path}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': file.mimetype, 'x-upsert': 'true' },
    body: file.buffer,
  });
  if (!response.ok) {
    const text = await response.text();
    throw AppError.badGateway('SCHOOL_IMAGE_UPLOAD_FAILED', 'The school image could not be uploaded', { status: response.status, message: text.slice(0, 300) });
  }
  return { imageUrl: path };
}

export async function getSchoolContentImage(schoolId, actor, imagePath) {
  if (!isSchoolContentPath(schoolId, imagePath)) {
    throw AppError.notFound('SCHOOL_IMAGE_NOT_FOUND', 'School image not found');
  }
  if (actor.role.key !== ROLES.SUPER_ADMIN) {
    const [details, image, album] = await Promise.all([
      prisma.schoolDetails.findFirst({
        where: { schoolId, published: true, OR: [{ logoUrl: imagePath }, { coverUrl: imagePath }] },
        select: { id: true },
      }),
      prisma.schoolGalleryImage.findFirst({
        where: { schoolId, imageUrl: imagePath, published: true },
        select: { id: true, albumId: true },
      }),
      prisma.schoolGalleryAlbum.findFirst({
        where: { schoolId, coverUrl: imagePath, published: true },
        select: { id: true },
      }),
    ]);
    const visibleImage = image?.albumId
      ? await prisma.schoolGalleryAlbum.findFirst({
          where: { id: image.albumId, schoolId, published: true },
          select: { id: true },
        })
      : image;
    if (!details && !visibleImage && !album) {
      throw AppError.notFound('SCHOOL_IMAGE_NOT_FOUND', 'Published school image not found');
    }
  }
  return fetchSchoolContentImage(imagePath);
}

export async function saveGalleryAlbum(schoolId, actor, data) {
  if (actor.role.key !== ROLES.SUPER_ADMIN) throw AppError.forbidden();
  if (!String(data.title ?? '').trim()) throw AppError.badRequest('ALBUM_TITLE_REQUIRED', 'Enter an album title');
  if (data.id) {
    const existing = await prisma.schoolGalleryAlbum.findFirst({ where: { id: data.id, schoolId } });
    if (!existing) throw AppError.notFound('ALBUM_NOT_FOUND', 'Album not found');
    return prisma.schoolGalleryAlbum.update({ where: { id: existing.id }, data: { title: data.title.trim(), description: data.description ?? null, coverUrl: data.coverUrl ?? null, published: Boolean(data.published) } });
  }
  return prisma.schoolGalleryAlbum.create({ data: { schoolId, title: data.title.trim(), description: data.description ?? null, coverUrl: data.coverUrl ?? null, published: Boolean(data.published) } });
}

export async function deleteGalleryAlbum(schoolId, actor, id) {
  if (actor.role.key !== ROLES.SUPER_ADMIN) throw AppError.forbidden();
  await prisma.schoolGalleryAlbum.deleteMany({ where: { id, schoolId } });
  return { deleted: true };
}

export async function saveGalleryImage(schoolId, actor, data) {
  if (actor.role.key !== ROLES.SUPER_ADMIN) throw AppError.forbidden();
  if (!data.title?.trim() || !data.imageUrl || !data.category) throw AppError.badRequest('GALLERY_IMAGE_REQUIRED', 'Title, category and image are required');
  const payload = {
    title: data.title.trim(),
    caption: data.caption ?? null,
    category: data.category,
    eventDate: data.eventDate ? new Date(data.eventDate) : null,
    imageUrl: data.imageUrl,
    published: Boolean(data.published),
    albumId: data.albumId || null,
  };
  if (data.id) {
    const existing = await prisma.schoolGalleryImage.findFirst({ where: { id: data.id, schoolId } });
    if (!existing) throw AppError.notFound('GALLERY_IMAGE_NOT_FOUND', 'Gallery image not found');
    return prisma.schoolGalleryImage.update({ where: { id: existing.id }, data: payload });
  }
  return prisma.schoolGalleryImage.create({ data: { schoolId, ...payload } });
}

export async function deleteGalleryImage(schoolId, actor, id) {
  if (actor.role.key !== ROLES.SUPER_ADMIN) throw AppError.forbidden();
  const image = await prisma.schoolGalleryImage.findFirst({ where: { id, schoolId } });
  if (!image) throw AppError.notFound('GALLERY_IMAGE_NOT_FOUND', 'Gallery image not found');
  if (isSchoolContentPath(schoolId, image.imageUrl)) {
    const { url, key } = storageConfig();
    const response = await fetch(`${url}/storage/v1/object/school-content/${encodeURI(image.imageUrl)}`, {
      method: 'DELETE',
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!response.ok && response.status !== 404) {
      const text = await response.text();
      throw AppError.badGateway('SCHOOL_IMAGE_DELETE_FAILED', 'The school image could not be deleted', { status: response.status, message: text.slice(0, 300) });
    }
  }
  await prisma.schoolGalleryImage.delete({ where: { id: image.id } });
  return { deleted: true };
}
